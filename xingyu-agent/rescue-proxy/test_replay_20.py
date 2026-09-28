#!/usr/bin/env python3
"""
#0.7 验收回放：20 条构造样本验证 rescue-proxy 的还原/丢弃逻辑。

覆盖维度（施工单 0.7 要求：流式 / 非流式 / 截断 / 多调用）：
  - 非流式：正常、单调用泄漏、多调用泄漏、参数截断（丢弃）、围栏参数、
            DeepSeek 原生模板、无参工具、全角变体、非对象参数、仅乱码
  - 流式  ：正常流、标记跨 chunk 切断、泄漏流、截断泄漏流（丢弃）、
            多调用泄漏流、流末暂扣释放、tool_calls 与正文混合

运行：python3 test_replay_20.py  （或 rescue_proxy.py --selftest）
输出：逐条 PASS/FAIL + 汇总，全部通过返回 0。
"""

import json

from rescue_proxy import (
    LEAK_PROBE,
    StreamLeakGate,
    _StreamState,
    finish_stream,
    fix_completion,
    rescue_from_text,
    transform_stream_chunk,
)

RESULTS = []


def check(no, desc, ok, detail=""):
    RESULTS.append((no, desc, ok))
    print(f"{'PASS' if ok else 'FAIL'}  #{no:<2} {desc}" + (f"  | {detail}" if detail and not ok else ""))


# ===========================================================================
# A. 非流式（rescue_from_text + fix_completion）—— 10 条
# ===========================================================================

def sample_nonstream():
    # A1 正常正文：不碰
    text, calls = rescue_from_text("北京人口约 2189 万，比上海多。")
    check(1, "非流式-正常正文不动", text == "北京人口约 2189 万，比上海多。" and calls == [])

    # A2 vLLM 直透型单调用
    raw = "我来查一下。<｜tool▁sep｜>get_weather{\"city\": \"成都\"}"
    text, calls = rescue_from_text(raw)
    check(2, "非流式-单调用还原",
          text == "我来查一下。" and len(calls) == 1
          and calls[0]["name"] == "get_weather" and calls[0]["input"] == {"city": "成都"},
          f"text={text!r} calls={calls}")

    # A3 多调用（两连发）
    raw = "<｜tool▁sep｜>pop{\"city\": \"北京\"}<｜tool▁sep｜>pop{\"city\": \"上海\"}"
    text, calls = rescue_from_text(raw)
    check(3, "非流式-多调用还原",
          len(calls) == 2 and calls[0]["input"] == {"city": "北京"}
          and calls[1]["input"] == {"city": "上海"},
          f"calls={calls}")

    # A4 参数截断：配不平 → 安全丢弃
    raw = "<|tool_sep|>write_file{\"path\": \"a.txt\", \"content\": \"abc"   # 缺右括号
    text, calls = rescue_from_text(raw)
    check(4, "非流式-参数截断安全丢弃", calls == [] and text == "",
          f"calls={calls} text={text!r}")

    # A5 参数裹 ```json 围栏
    raw = "<｜tool▁sep｜>run_sql\n```json\n{\"sql\": \"SELECT 1\"}\n```"
    text, calls = rescue_from_text(raw)
    check(5, "非流式-围栏参数还原",
          len(calls) == 1 and calls[0]["input"] == {"sql": "SELECT 1"},
          f"calls={calls}")

    # A6 DeepSeek 原生模板：<｜tool▁call▁begin｜>function<｜tool▁sep｜>name<｜tool▁sep｜>{...}
    raw = ("<｜tool▁call▁begin｜>function<｜tool▁sep｜>get_pop<｜tool▁sep｜>"
           "{\"city\": \"北京\"}<｜tool▁call▁end｜>")
    text, calls = rescue_from_text(raw)
    check(6, "非流式-DeepSeek原生模板",
          len(calls) == 1 and calls[0]["name"] == "get_pop"
          and calls[0]["input"] == {"city": "北京"},
          f"calls={calls}")

    # A7 无参工具：rest 无 { → 按 {} 放行
    raw = "<|tool_sep|>list_tables"
    text, calls = rescue_from_text(raw)
    check(7, "非流式-无参工具放行",
          len(calls) == 1 and calls[0]["name"] == "list_tables" and calls[0]["input"] == {},
          f"calls={calls}")

    # A8 全角变体标记 ＜｜tool▁sep｜＞
    raw = "查一下。＜｜tool▁sep｜＞search{\"q\": \"天气\"}"
    text, calls = rescue_from_text(raw)
    check(8, "非流式-全角变体标记",
          len(calls) == 1 and calls[0]["name"] == "search"
          and calls[0]["input"] == {"q": "天气"},
          f"calls={calls}")

    # A9 参数是合法 JSON 但不是对象（数组）→ 按无参处理
    raw = '<|tool_sep|>batch_run[1, 2, 3]'
    text, calls = rescue_from_text(raw)
    check(9, "非流式-数组参数按无参",
          len(calls) == 1 and calls[0]["input"] == {},
          f"calls={calls}")

    # A10 fix_completion 整体：乱码不留在 content，tool_calls 进字段
    body = {
        "choices": [{
            "message": {"role": "assistant",
                        "content": "先查北京。<｜tool▁sep｜>pop{\"city\": \"北京\"}"},
            "finish_reason": "stop",
        }]
    }
    fixed, rescued = fix_completion(body)
    msg = fixed["choices"][0]["message"]
    check(10, "非流式-响应级修复",
          msg["content"] == "先查北京。"
          and len(msg.get("tool_calls") or []) == 1
          and msg["tool_calls"][0]["function"]["name"] == "pop"
          and fixed["choices"][0]["finish_reason"] == "tool_calls"
          and rescued == ["pop"],
          f"msg={msg}")


# ===========================================================================
# B. 流式（StreamLeakGate / transform_stream_chunk / finish_stream）—— 10 条
# ===========================================================================

def mk_chunk(content=None, finish=None, tool_calls=None):
    d = {}
    if content is not None:
        d["content"] = content
    if tool_calls:
        d["tool_calls"] = tool_calls
    c = {"index": 0, "delta": d, "finish_reason": finish}
    return {"id": "x", "object": "chat.completion.chunk", "model": "m", "choices": [c]}


def run_stream(chunks):
    """把一组 chunk 喂进流式管线，返回 (下游收到的块列表, 补发尾部)。"""
    state = _StreamState()
    out = []
    for ch in chunks:
        r = transform_stream_chunk(ch, state)
        if r is not None:
            out.append(r)
    return out, finish_stream(state)


def sample_stream():
    # B1 正常流：content 原样透传
    out, tail = run_stream([mk_chunk("你好"), mk_chunk("，世界"), mk_chunk(finish="stop")])
    texts = "".join(c["choices"][0]["delta"].get("content", "")
                    for c in out if c.get("choices"))
    check(11, "流式-正常流透传",
          texts == "你好，世界" and not tail
          and any(c["choices"][0]["finish_reason"] == "stop" for c in out))

    # B2 泄漏流：冒出标记后正文停止下发，尾部还原调用
    chunks = [mk_chunk("我来查。"),
              mk_chunk("<｜tool▁sep｜>pop{\"city\": \"北京\"}"),
              mk_chunk(finish="stop")]
    out, tail = run_stream(chunks)
    texts = "".join(c["choices"][0]["delta"].get("content", "")
                    for c in out if c.get("choices"))
    tc = [t for t in tail if "tool_call" in t]
    fin = [t for t in tail if t.get("finish_reason")]
    check(12, "流式-泄漏流还原",
          texts == "我来查。" and len(tc) == 1
          and tc[0]["tool_call"]["function"]["name"] == "pop"
          and fin and fin[0]["finish_reason"] == "tool_calls",
          f"texts={texts!r} tail={tail}")

    # B3 标记跨 chunk 切断："<｜tool" 与 "▁sep｜>pop{...}" 分两片
    chunks = [mk_chunk("正在查"), mk_chunk("<｜tool"),
              mk_chunk("▁sep｜>pop{\"city\": \"成都\"}"), mk_chunk(finish="stop")]
    out, tail = run_stream(chunks)
    texts = "".join(c["choices"][0]["delta"].get("content", "")
                    for c in out if c.get("choices"))
    tc = [t for t in tail if "tool_call" in t]
    check(13, "流式-标记跨chunk切断",
          texts == "正在查" and len(tc) == 1
          and tc[0]["tool_call"]["function"]["name"] == "pop",
          f"texts={texts!r} tail={tail}")

    # B4 单字符 "<" 恰好在 chunk 末尾，下一片是正常文字（不是标记）
    chunks = [mk_chunk("3 <"), mk_chunk("5 大于 2"), mk_chunk(finish="stop")]
    out, tail = run_stream(chunks)
    texts = "".join(c["choices"][0]["delta"].get("content", "")
                    for c in out if c.get("choices"))
    check(14, "流式-伪标记正常释放",
          texts == "3 <5 大于 2",
          f"texts={texts!r} tail={tail}")

    # B5 泄漏流+参数截断：还原不出调用 → 按上游原因安全收尾，零乱码
    chunks = [mk_chunk("写文件。<｜tool▁sep｜>write_file{\"path\": \"a\", \"data\": \"xx"),
              mk_chunk(finish="length")]
    out, tail = run_stream(chunks)
    texts = "".join(c["choices"][0]["delta"].get("content", "")
                    for c in out if c.get("choices"))
    tc = [t for t in tail if "tool_call" in t]
    fin = [t for t in tail if t.get("finish_reason")]
    check(15, "流式-截断泄漏安全丢弃",
          texts == "写文件。" and not tc
          and fin and fin[0]["finish_reason"] == "length",
          f"texts={texts!r} tail={tail}")

    # B6 流式多调用泄漏：两个调用都还原
    payload = "<｜tool▁sep｜>pop{\"city\": \"北京\"}<｜tool▁sep｜>pop{\"city\": \"上海\"}"
    chunks = [mk_chunk(payload), mk_chunk(finish="tool_calls")]
    out, tail = run_stream(chunks)
    tc = [t for t in tail if "tool_call" in t]
    check(16, "流式-多调用还原", len(tc) == 2,
          f"tail={tail}")

    # B7 流中已有正常 tool_calls 增量：不受闸门影响，原样透传
    tc_delta = [{"index": 0, "id": "call_1", "type": "function",
                 "function": {"name": "pop", "arguments": "{\"city\""}}]
    chunks = [mk_chunk(tool_calls=tc_delta), mk_chunk(finish="tool_calls")]
    out, tail = run_stream(chunks)
    got_tc = any("tool_calls" in (c["choices"][0]["delta"] or {}) for c in out)
    check(17, "流式-正常tool_calls透传", got_tc and not tail,
          f"out={out}")

    # B8 流末暂扣释放：chunk 末尾 "<" 后流直接结束（没凑成标记）
    chunks = [mk_chunk("结束于 3 <"), mk_chunk(finish="stop")]
    out, tail = run_stream(chunks)
    flush = [t for t in tail if "delta_flush" in t]
    check(18, "流式-流末暂扣字符释放",
          flush and flush[0]["delta_flush"] == "<",
          f"tail={tail}")

    # B9 正文与泄漏混合：标记前正文保留，标记后负载全吞
    chunks = [mk_chunk("对比两城市。"), mk_chunk("<|tool_sep|>cmp"),
              mk_chunk("{\"a\": \"北京\", \"b\": \"上海\"}"), mk_chunk(finish="stop")]
    out, tail = run_stream(chunks)
    texts = "".join(c["choices"][0]["delta"].get("content", "")
                    for c in out if c.get("choices"))
    tc = [t for t in tail if "tool_call" in t]
    check(19, "流式-正文泄漏混合",
          texts == "对比两城市。" and len(tc) == 1
          and tc[0]["tool_call"]["function"]["name"] == "cmp",
          f"texts={texts!r} tail={tail}")

    # B10 泄漏闸门（StreamLeakGate 单元）：hold 状态机多次 feed
    g = StreamLeakGate()
    emit1, lk1 = g.feed("前文")
    emit2, lk2 = g.feed("<｜tool")          # 前缀本身即命中 LEAK_PROBE，立即转泄漏态
    emit3, lk3 = g.feed("▁sep｜>f{}")
    emit4, lk4 = g.feed("后续负载全部吞掉")
    check(20, "流式-闸门状态机",
          emit1 == "前文" and emit2 == "" and emit3 == "" and emit4 == ""
          and lk1 == "" and lk2 == "<｜tool"
          and lk3 == "▁sep｜>f{}" and lk4 == "后续负载全部吞掉"
          and (lk2 + lk3 + lk4) == "<｜tool▁sep｜>f{}后续负载全部吞掉"
          and g.flush_hold() == "",
          f"e={emit1!r},{emit2!r},{emit3!r},{emit4!r} lk={lk1!r},{lk2!r},{lk3!r},{lk4!r}")


def run_all():
    print("=" * 62)
    print("rescue-proxy #0.7 验收回放：20 条构造样本")
    print("=" * 62)
    sample_nonstream()
    sample_stream()
    failed = [r for r in RESULTS if not r[2]]
    print("-" * 62)
    print(f"总计 {len(RESULTS)} 条：通过 {len(RESULTS) - len(failed)}，失败 {len(failed)}")
    if failed:
        for no, desc, _ in failed:
            print(f"  FAIL #{no} {desc}")
    return not failed


if __name__ == "__main__":
    import sys
    sys.exit(0 if run_all() else 1)
