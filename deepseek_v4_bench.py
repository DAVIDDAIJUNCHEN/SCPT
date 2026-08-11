#!/usr/bin/env python3
"""
DeepSeek V4 Flash 性能测试方案
测试指标：吞吐率、首字符响应时间(TTFT)、上下文长度、并发数、显存消耗
"""

import os
import time
import json
import asyncio
import statistics
from dataclasses import dataclass, field
from typing import Optional
from collections import defaultdict
from urllib.parse import urlparse

# 按需安装: pip install httpx aiohttp
import httpx

# 配置区
#ENDPOINT = "http://10.255.12.38:13206/member1/deepseek/v1"        # OpenAI 兼容接口
#ENDPOINT = "http://10.32.1.3:30466/v1"        # TGI 本地部署接口
ENDPOINT = os.getenv("DEEPSEEK_ENDPOINT", "https://api.deepseek.com").rstrip("/")

# 官方接口常用模型名：deepseek-chat / deepseek-reasoner
MODEL_NAME = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

# 优先从环境变量读取密钥，避免把密钥直接写入脚本
API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()

# 本地部署版本如果也使用 Bearer token，可通过此变量单独传入
BEARER_TOKEN = os.getenv("DEEPSEEK_BEARER_TOKEN", "").strip()

# 模式：auto / official / local
MODE = os.getenv("DEEPSEEK_MODE", "auto").strip().lower()
if MODE not in {"auto", "official", "local"}:
    MODE = "auto"


def detect_mode() -> str:
    if MODE != "auto":
        return MODE
    parsed = urlparse(ENDPOINT)
    host = (parsed.netloc or parsed.path).lower()
    if "deepseek.com" in host:
        return "official"
    return "local"


MODE = detect_mode()


MAX_CONCURRENT = [1, 2, 4, 8, 16, 32, 64]
TEST_PROMPTS = {
    "short":   "用一句话解释什么是机器学习。",
    "medium":  "请用200字介绍深度学习在自然语言处理中的应用。",
    "long":    "请写一篇关于人工智能发展史的综述，涵盖符号主义、连接主义和行为主义三大流派，不少于800字。",
}
WARMUP_ROUNDS = 3
TEST_ROUNDS = 5

@dataclass
class RequestResult:
    prompt_len: int = 0
    completion_len: int = 0
    ttft_ms: float = 0.0        # Time To First Token
    total_ms: float = 0.0
    tokens_per_sec: float = 0.0
    tokens: list = field(default_factory=list)
    error: Optional[str] = None


def token_count_approx(text: str) -> int:
    """粗略 Token 估算（中文 ~1.5 char/token，英文 ~4 char/token，DeepSeek tokenizer 约略于此）"""
    chinese = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
    other = len(text) - chinese
    return int(chinese / 1.3 + other / 3.5)


def build_headers() -> dict:
    headers = {"Content-Type": "application/json"}
    token = BEARER_TOKEN or API_KEY
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["api-key"] = token
    return headers


def build_request_urls() -> list[str]:
    """为本地/官方接口生成一组候选请求地址，兼容常见路径差异。"""
    base = ENDPOINT.rstrip("/")
    candidates = [f"{base}/chat/completions"]

    if base.endswith("/v1"):
        candidates.append(f"{base[:-3]}/chat/completions")
        alt = base.replace("/v1", "/member1/deepseek/v1", 1)
        if alt != base:
            candidates.append(f"{alt}/chat/completions")

    if "/member1/deepseek" not in base:
        candidates.append(f"{base}/member1/deepseek/v1/chat/completions")

    seen = set()
    ordered = []
    for item in candidates:
        if item not in seen:
            ordered.append(item)
            seen.add(item)
    return ordered


async def extract_error_detail(response: httpx.Response) -> str:
    """尝试从 HTTP 响应中提取可读的错误信息。"""
    try:
        data = response.json()
    except Exception:
        try:
            text = response.text
            return text.strip() or "无响应内容"
        except Exception:
            return "无响应内容"

    if isinstance(data, dict):
        error = data.get("error")
        if isinstance(error, dict):
            message = error.get("message") or error.get("code")
            if message:
                return str(message)
        for key in ("message", "detail", "error"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value
            if isinstance(value, list) and value:
                return str(value[0])
    return str(data)


async def check_connectivity(client: httpx.AsyncClient) -> bool:
    """用一个最小请求检查模型接口是否可用。"""
    urls = build_request_urls()
    last_error = None

    for idx, url in enumerate(urls, 1):
        try:
            response = await client.post(
                url,
                headers=build_headers(),
                json={
                    "model": MODEL_NAME,
                    "messages": [{"role": "user", "content": "ping"}],
                    "stream": False,
                    "max_tokens": 16,
                },
                timeout=30,
            )
        except Exception as e:
            last_error = str(e)
            continue

        print(f"服务状态: {response.status_code} -> {url}")
        if response.status_code == 404 and idx < len(urls):
            continue

        if response.status_code >= 400:
            detail = await extract_error_detail(response)
            print(f"连接失败: {detail}")
            if MODE == "local" and (BEARER_TOKEN or API_KEY):
                print("[提示] 本地接口已配置 token，若仍失败请检查 token 是否有效或是否需要不同的 header 名称。")
            return False

        try:
            payload = response.json()
        except Exception as e:
            print(f"响应解析失败: {e}")
            return False

        choices = payload.get("choices", [])
        if choices:
            message = choices[0].get("message", {}).get("content", "")
            print(f"连接成功，示例回复: {message[:80]}")
        else:
            print("连接成功，已收到有效响应")
        return True

    if last_error:
        print(f"服务不可达: {last_error}")
    else:
        print("服务不可达: 未找到可用的接口地址")
    return False


async def send_completion_request(
    client: httpx.AsyncClient,
    prompt: str,
    timeout: float = 300,
    stream: bool = True,
) -> RequestResult:
    result = RequestResult()
    result.prompt_len = token_count_approx(prompt)
    tokens = []
    start_time = time.perf_counter()
    ttft_recorded = False

    try:
        urls = build_request_urls()
        if stream:
            for url in urls:
                try:
                    async with client.stream(
                        "POST",
                        url,
                        json={
                            "model": MODEL_NAME,
                            "messages": [{"role": "user", "content": prompt}],
                            "stream": True,
                            "max_tokens": 4096,
                        },
                        headers=build_headers(),
                        timeout=httpx.Timeout(timeout),
                    ) as response:
                        if response.status_code == 404:
                            continue
                        if response.status_code >= 400:
                            raise RuntimeError(await extract_error_detail(response))

                        async for line in response.aiter_lines():
                            if line.startswith("data: "):
                                data = line[6:]
                                if data == "[DONE]":
                                    break
                                chunk = json.loads(data)
                                choices = chunk.get("choices", [])
                                if choices:
                                    delta = choices[0].get("delta", {})
                                    content = delta.get("content", "")
                                    if content:
                                        if not ttft_recorded:
                                            result.ttft_ms = (time.perf_counter() - start_time) * 1000
                                            ttft_recorded = True
                                        tokens.append(content)
                        break
                except Exception as e:
                    if url == urls[-1]:
                        raise
                    continue

            if not tokens and not result.error:
                result.error = "未收到任何流式输出"
        else:
            for url in urls:
                try:
                    response = await client.post(
                        url,
                        json={
                            "model": MODEL_NAME,
                            "messages": [{"role": "user", "content": prompt}],
                            "stream": False,
                            "max_tokens": 4096,
                        },
                        headers=build_headers(),
                        timeout=httpx.Timeout(timeout),
                    )
                    if response.status_code == 404:
                        continue
                    if response.status_code >= 400:
                        raise RuntimeError(await extract_error_detail(response))

                    payload = response.json()
                    choices = payload.get("choices", [])
                    if choices:
                        content = choices[0].get("message", {}).get("content", "") or ""
                        if content:
                            tokens.append(content)
                            result.ttft_ms = 0.0
                            ttft_recorded = True
                    break
                except Exception as e:
                    if url == urls[-1]:
                        raise
                    continue

            if not tokens and not result.error:
                result.error = "未收到任何非流式输出"

        result.total_ms = (time.perf_counter() - start_time) * 1000
        result.tokens = tokens
        result.completion_len = token_count_approx("".join(tokens))
        if result.total_ms > 0:
            result.tokens_per_sec = result.completion_len / (result.total_ms / 1000)
        if not ttft_recorded and result.completion_len > 0:
            result.ttft_ms = result.total_ms
    except Exception as e:
        result.error = str(e)

    return result


async def send_stream_request(
    client: httpx.AsyncClient, prompt: str, timeout: float = 300
) -> RequestResult:
    result = await send_completion_request(client, prompt, timeout=timeout, stream=True)
    if result.error and "stream" not in result.error.lower():
        fallback = await send_completion_request(client, prompt, timeout=timeout, stream=False)
        if not fallback.error:
            return fallback
        result.error = f"{result.error}; fallback: {fallback.error}"
    return result


async def test_throughput_latency():
    """测试一：吞吐率 & 首字符响应时间"""
    print("\n" + "=" * 70)
    print("测试一：吞吐率 & 首字符响应时间 (TTFT)")
    print("=" * 70)

    async with httpx.AsyncClient() as client:
        for name, prompt in TEST_PROMPTS.items():
            print(f"\n> 提示词类型: {name} (约{token_count_approx(prompt)} tokens)")

            # 预热
            for _ in range(WARMUP_ROUNDS):
                await send_stream_request(client, prompt)

            # 正式测试
            results = []
            for i in range(TEST_ROUNDS):
                r = await send_stream_request(client, prompt)
                results.append(r)
                if r.error:
                    print(f"  第 {i+1} 次错误: {r.error}")
                else:
                    print(f"  第 {i+1} 次: TTFT={r.ttft_ms:.0f}ms, "
                          f"总耗时={r.total_ms:.0f}ms, "
                          f"输出={r.completion_len} tokens, "
                          f"吞吐={r.tokens_per_sec:.1f} tok/s")

            valid = [r for r in results if not r.error]
            if valid:
                ttfts = [r.ttft_ms for r in valid]
                tpss = [r.tokens_per_sec for r in valid]
                print(f"  >> 平均: TTFT={statistics.mean(ttfts):.0f}ms "
                      f"(P99={sorted(ttfts)[int(len(ttfts)*0.99)] if len(ttfts)>=10 else max(ttfts):.0f}ms), "
                      f"吞吐={statistics.mean(tpss):.1f} tok/s")
            else:
                print("  >> 全部失败，请检查服务状态")


async def test_concurrency():
    """测试二：并发数 & 吞吐上限"""
    print("\n" + "=" * 70)
    print("测试二：并发数测试")
    print("=" * 70)

    prompt = TEST_PROMPTS["medium"]

    async with httpx.AsyncClient() as client:
        for n in MAX_CONCURRENT:
            print(f"\n> 并发数: {n}")
            tasks = [send_stream_request(client, prompt) for _ in range(n)]
            start = time.perf_counter()
            results = await asyncio.gather(*tasks)
            wall_time = time.perf_counter() - start

            errors = [r for r in results if r.error]
            valid = [r for r in results if not r.error]

            if errors:
                print(f"  失败 {len(errors)}/{n}: {errors[0].error[:80]}")

            if valid:
                total_tokens = sum(r.completion_len for r in valid)
                avg_ttft = statistics.mean([r.ttft_ms for r in valid])
                throughput = total_tokens / wall_time if wall_time > 0 else 0
                print(f"  有效请求: {len(valid)}/{n}")
                print(f"  总耗时(墙钟): {wall_time:.1f}s")
                print(f"  总输出: {total_tokens} tokens")
                print(f"  系统吞吐: {throughput:.1f} tok/s")
                print(f"  平均 TTFT: {avg_ttft:.0f}ms")
                print(f"  并发效率: {throughput / (statistics.mean([r.tokens_per_sec for r in valid]) if valid else 1):.0%}")
            else:
                print(f"  全部失败——可能已达到并发上限")


async def test_context_length():
    """测试三：上下文长度边界"""
    print("\n" + "=" * 70)
    print("测试三：上下文长度测试")
    print("=" * 70)

    lengths = [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 1000000]
    #lengths = [1000000]
    # 构造足量文本：~20000 字节能覆盖 131K tokens（中文约 1.3 char/token）
    base_unit = "人工智能是计算机科学的一个重要分支。"
    base_text = (base_unit * 75000)

    def _build_prompt(target_tokens: int) -> str:
        """逐步构造接近 target_tokens 的文本"""
        low, high = 0, len(base_text)
        while low < high:
            mid = (low + high) // 2
            if token_count_approx(base_text[:mid]) < target_tokens:
                low = mid + 1
            else:
                high = mid
        return base_text[:low]

    async with httpx.AsyncClient() as client:
        for target_len in lengths:
            # 二分查找构造指定 token 长度的输入
            prompt = _build_prompt(target_len)
            actual_len = token_count_approx(prompt)
            print(f"\n> 目标上下文: {target_len} tokens (实际约 {actual_len} tokens)")

            try:
                r = await send_stream_request(client, prompt, timeout=600)
                if r.error:
                    print(f"  失败: {r.error[:100]}")
                    if "context" in r.error.lower() or "length" in r.error.lower():
                        print(f"  >> 推测上下文窗口上限约在 {target_len} tokens 附近")
                        break
                else:
                    print(f"  成功: TTFT={r.ttft_ms:.0f}ms, 输出={r.completion_len} tokens")
            except Exception as e:
                print(f"  异常: {e}")
                break


async def test_memory_estimation():
    """测试四：显存消耗"""
    print("\n" + "=" * 70)
    print("测试四：显存消耗")
    print("=" * 70)

    # 尝试 pynvml 直接读数
    gpu_info_available = False
    try:
        import pynvml
        pynvml.nvmlInit()
        gpu_count = pynvml.nvmlDeviceGetCount()
        print(f"\n[pynvml] 检测到 {gpu_count} 张 GPU")

        for i in range(gpu_count):
            handle = pynvml.nvmlDeviceGetHandleByIndex(i)
            name = pynvml.nvmlDeviceGetName(handle)
            mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
            total_gb = mem.total / 1024**3
            used_gb = mem.used / 1024**3
            free_gb = mem.free / 1024**3
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            print(f"  GPU {i}: {name}")
            print(f"    显存: {used_gb:.1f} / {total_gb:.1f} GB (空闲 {free_gb:.1f} GB)")
            print(f"    利用率: GPU {util.gpu}% 显存 {util.memory}%")
        pynvml.nvmlShutdown()
        gpu_info_available = True
    except ImportError:
        print("  [提示] 未安装 pynvml，使用理论公式估算。安装: pip install nvidia-ml-py")
    except Exception as e:
        print(f"  [警告] pynvml 初始化失败: {e}")

    print("""
理论估算公式：
  模型权重: 参数量 × 精度字节数
    例如 DeepSeek V4 Flash (假设 ~70B, BF16): 70 × 2 = ~140 GB (需多卡)
    若为 MoE 架构(~20B 激活参数): ~40 GB (单卡可承载)
  KV Cache (per token): 2 × n_layers × n_kv_heads × d_head × dtype_size
  KV Cache (total): kv_per_token × batch_size × sequence_length""")

    if not gpu_info_available:
        print("\n  建议：运行并发测试时，另开终端 watch nvidia-smi，记录显存变化")


async def main():
    print(f"DeepSeek V4 Flash 性能测试方案")
    print(f"目标地址: {ENDPOINT}")
    print(f"模型名称: {MODEL_NAME}")
    print(f"测试时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")

    # 1. 连通性检查
    print("\n--- 连通性检查 ---")
    if ENDPOINT.startswith("https://api.deepseek.com") and not API_KEY:
        print("[提示] 未设置 DEEPSEEK_API_KEY，官方接口通常会返回 401。")

    async with httpx.AsyncClient() as client:
        if not await check_connectivity(client):
            print("请确认 ENDPOINT、MODEL_NAME 和 API_KEY 配置正确。")
            return

    await test_throughput_latency()
    await test_concurrency()
    await test_context_length()
    await test_memory_estimation()

    print("\n" + "=" * 70)
    print("测试完成。请根据以上数据填写经验分析表。")


if __name__ == "__main__":
    asyncio.run(main())
