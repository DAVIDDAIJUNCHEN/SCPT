#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
川邮·星语 API 平台 - 初始化配置脚本

用途：在新环境部署后一键配置「渠道 / 模型定价 / 货币显示」，
避免手动在后台重复创建 10 个渠道、设定价等繁琐操作。

用法：
    python3 deploy/init_config.py \
        --base http://localhost:3000 \
        --user admin \
        --password 'Admin123456'

说明：
- 渠道创建为幂等操作（已存在同名模型渠道则跳过）
- 定价/货币通过 PUT /api/option 设置
- 请通过 --password 传入真实管理员密码（或环境变量 INIT_PASSWORD）
"""

import argparse
import json
import sys
import urllib.request

# ---------------------------------------------------------------------------
# 待初始化的数据
# ---------------------------------------------------------------------------

# 渠道定义: (name, base_url, models, group)
CHANNELS = [
    ("Campus-DeepSeek-Flash-V4-0731", "http://10.32.1.3:30551", "DeepSeek-V4-Flash-0731", "default"),
    ("deepseek-v4-flash-0731 (DGX)", "http://10.254.1.25:18000", "deepseek-v4-flash-0731", "default,vip"),
    ("qwen3.8-flash-next", "http://10.32.1.3:30577", "qwen3.8-flash-next", "default"),
    ("glm-5.3-flash", "http://10.32.1.3:30569", "glm-5.3-flash", "default"),
    ("Qwen3-VL-30B", "http://10.32.1.3:30473", "Qwen3-VL-30B-A3B-Instruct", "default"),
    ("Qwen2-Audio-7B", "http://10.32.1.3:30474", "Qwen2-Audio-7B-Instruct", "default"),
    ("FLUX.2-klein-4B", "http://10.32.1.3:30475", "FLUX.2-klein-4B", "default"),
    ("MinerU2.5-Pro", "http://10.32.1.3:30556", "MinerU2.5-Pro-2605-1.2B", "default"),
    ("Qwen3-ASR-1.7B", "http://10.32.1.3:30555", "Qwen3-ASR-1.7B", "default"),
    ("cosyvoice-v3", "http://10.32.1.3:30492", "cosyvoice-v3", "default"),
]

# 渠道 key（内网模型源通常无独立鉴权，用统一占位 key）
CHANNEL_KEY = "sk-internal"

# 模型定价（对齐官网「缓存未命中 / 非高峰」人民币价）
# model_ratio = 官网输入¥/1M ÷ (2 × 7.3)；completion_ratio = 输出¥/输入¥
MODEL_PRICES = {
    # 模型名: (model_ratio 输入, completion_ratio 输出系数)
    "DeepSeek-V4-Flash-0731": (0.068493, 2.0),
    "deepseek-v4-flash-0731": (0.068493, 2.0),
    "qwen3.8-flash-next": (0.075342, 3.0),
    "glm-5.3-flash": (0.054795, 3.5),
    "Qwen3-VL-30B-A3B-Instruct": (0.061644, 4.0),
    "Qwen2-Audio-7B-Instruct": (0.034247, 1.0),
    # 按次/按量模型：用低 token 价（图像/TTS/ASR/文档）
    "FLUX.2-klein-4B": (0.068493, 1.0),
    "MinerU2.5-Pro-2605-1.2B": (0.068493, 1.0),
    "Qwen3-ASR-1.7B": (0.068493, 1.0),
    "cosyvoice-v3": (0.068493, 1.0),
}

# 货币：人民币显示
USD_EXCHANGE_RATE = "7.3"
QUOTA_DISPLAY_TYPE = "CNY"


# ---------------------------------------------------------------------------
# HTTP 辅助
# ---------------------------------------------------------------------------

def req(method, url, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    if token:
        r.add_header("Authorization", "Bearer " + token)
    r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode())
        except Exception:
            return {"success": False, "message": f"HTTP {e.code}"}
    except Exception as e:
        return {"success": False, "message": str(e)}


def login(base, user, password):
    return req("POST", f"{base}/api/user/login",
               body={"username": user, "password": password})


def ensure_channels(base, token):
    """创建渠道（幂等）"""
    ok, existing = 0, 0
    for name, url, models, group in CHANNELS:
        # 查是否已存在该模型渠道
        ch = req("GET", f"{base}/api/channel/?p=1&size=100", token)
        exists = False
        items = ch.get("data", {}).get("items", [])
        for c in items:
            if c.get("name") == name or name.split(" (")[0].lower() in str(c.get("name", "")).lower():
                exists = True
                break
        if exists:
            existing += 1
            continue
        body = {
            "mode": "single",
            "channel": {
                "name": name,
                "type": 1,
                "key": CHANNEL_KEY,
                "base_url": url,
                "models": models,
                "group": group,
                "status": 1,
            },
        }
        res = req("POST", f"{base}/api/channel/", token, body)
        if res.get("success"):
            ok += 1
            print(f"  ✅ 创建渠道 {name}")
        else:
            print(f"  ⚠️  渠道 {name}: {res.get('message')}")
    return ok, existing


def set_option(base, token, key, value):
    res = req("PUT", f"{base}/api/option/", token,
              {"key": key, "value": json.dumps(value)})
    return res.get("success"), res.get("message", "")


def main():
    parser = argparse.ArgumentParser(description="川邮·星语 API 初始化配置")
    parser.add_argument("--base", default="http://localhost:8088", help="平台地址")
    parser.add_argument("--user", default="admin", help="管理员用户名")
    parser.add_argument("--password", default=None, help="管理员密码（或环境变量 INIT_PASSWORD）")
    args = parser.parse_args()

    password = args.password
    if not password:
        import os
        password = os.environ.get("INIT_PASSWORD", "")
    if not password:
        print("❌ 请通过 --password 或环境变量 INIT_PASSWORD 提供管理员密码")
        sys.exit(1)

    print(f"🔑 登录 {args.base} ...")
    login_res = login(args.base, args.user, password)
    if not login_res.get("success") or "access_token" not in login_res.get("data", {}):
        print(f"❌ 登录失败: {login_res.get('message')}")
        sys.exit(1)
    token = login_res["data"]["access_token"]
    print("✅ 登录成功\n")

    print("1) 创建渠道 ...")
    ok, existing = ensure_channels(args.base, token)
    print(f"   新建 {ok} 个，已有 {existing} 个（跳过）\n")

    print("2) 设置模型定价 ...")
    model_ratio = {m: r for m, (r, _) in MODEL_PRICES.items()}
    completion_ratio = {m: c for m, (_, c) in MODEL_PRICES.items()}
    for key, val in [("ModelRatio", model_ratio), ("CompletionRatio", completion_ratio)]:
        s, msg = set_option(args.base, token, key, val)
        print(f"   {key}: {'✅' if s else '❌ ' + msg}")
    s, msg = set_option(args.base, token, "ImageRatio", {"FLUX.2-klein-4B": 1})
    print(f"   ImageRatio: {'✅' if s else '❌ ' + msg}")

    print("\n3) 设置货币显示（人民币）...")
    s, msg = set_option(args.base, token, "general_setting.quota_display_type", QUOTA_DISPLAY_TYPE)
    print(f"   quota_display_type=CNY: {'✅' if s else '❌ ' + msg}")
    s, msg = set_option(args.base, token, "general_setting.usd_exchange_rate", USD_EXCHANGE_RATE)
    print(f"   usd_exchange_rate=7.3: {'✅' if s else '❌ ' + msg}")

    print("\n🎉 初始化完成！请到「模型广场」和「渠道」页面核对。")


if __name__ == "__main__":
    main()
