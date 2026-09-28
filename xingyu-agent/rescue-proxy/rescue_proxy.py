#!/usr/bin/env python3
"""
rescue-proxy: 星语网关侧的特殊 token 泄漏修复 sidecar。

背景：DeepSeek 系模型偶发把工具调用的特殊 token（如 <｜tool▁sep｜>）当成正文
吐出来，消费方（星语 Chat / 星语 Agent）会在界面上看到乱码，且工具调用丢失。

原理：本代理位于消费方与星语网关之间（消费方 → :3081 → 网关 :3080），
- 非流式：响应 JSON 里 tool_calls 为空而 content 含泄漏标记时，把调用还原进
  tool_calls 字段，content 只留标记前的正常叙述；
- 流式：正文一旦出现泄漏标记开头就停止向下游吐字，把泄漏负载攒起来，
  流结束时解析还原，合成 tool_calls 增量块下发。

原则：还原不了的一律安全丢弃（半截参数拿去执行等于替用户瞎编），
零乱码进正文。

依赖：仅 Python 标准库。部署：systemd 常驻，见文末注释。

实现为星语 Agent 项目自研（思路参考对 WorkBuddy 泄漏问题的调研结论，
代码独立编写，不包含任何 WorkBuddy 源码）。
"""

import http.client
import json
import os
import re
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ---------------------------------------------------------------------------
# 核心：泄漏检测与还原
# ---------------------------------------------------------------------------

# 泄漏信号：正文里出现 "<｜tool" / "<|tool"（含全角竖线变体）。
# 正常中文/代码正文几乎不可能出现该序列，误报率可忽略。
LEAK_PROBE = re.compile(r"[<＜][|｜]tool")

# 调用头：tool_calls_begin / tool_call_begin / tool_sep 标记后跟函数名。
# 兼容两种真实泄漏形态：
#   ① vLLM 解析失败直透型：<｜tool▁sep｜>func_name{...}
#   ② DeepSeek 原生模板型：<｜tool▁call▁begin｜>function<｜tool▁sep｜>name<｜tool▁sep｜>{...}
CALL_HEAD = re.compile(
    r"[<＜][|｜]tool(?:[_▁]?(?:call|calls))?[_▁]?(?:begin|sep)[|｜][>＞]"
    r"\s*(?:function\b\s*)?"
    r"(?:[<＜][|｜]tool[_▁]?sep[|｜][>＞]\s*)?"
    r"([A-Za-z_][\w.-]*)"
)

# 流式闸门用：标记可能被切在多个 chunk 之间，这些前缀需要暂扣不发。
_MARKER_PREFIXES = ("<|tool", "＜|tool", "<｜tool", "＜｜tool")

# 参数可以裹在 ```json 围栏里
_FENCE = re.compile(r"^\s*```(?:json)?\s*([\s\S]*?)```")


def _partial_marker_tail(s: str) -> int:
    """返回 s 结尾处可能是泄漏标记前缀的长度（0 = 无需暂扣）。"""
    for k in range(min(len(s), 6), 0, -1):
        tail = s[-k:]
        if any(p.startswith(tail) for p in _MARKER_PREFIXES):
            return k
    return 0


def _slice_first_object(s: str):
    """从字符串开头切出第一个按深度配平的 {...}（跳过字符串字面量）。
    配不平（被截断）返回 None。"""
    start = s.find("{")
    if start < 0:
        return None
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(s)):
        c = s[i]
        if esc:
            esc = False
            continue
        if c == "\\":
            esc = True
            continue
        if c == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if c == "{":
            depth += 1
        elif c == "}" and depth > 0:
            depth -= 1
            if depth == 0:
                return s[start:i + 1]
    return None


def rescue_from_text(raw: str):
    """从泄漏负载里抠出工具调用。返回 (干净正文, [ {name, input} ])。
    干净正文 = 泄漏标记之前的部分；还原失败的调用安全丢弃。"""
    if not isinstance(raw, str) or not LEAK_PROBE.search(raw):
        return raw, []
    calls = []
    for m in CALL_HEAD.finditer(raw):
        name = m.group(1)
        if name == "function":
            continue  # 只匹配到关键字，没跟到真名
        rest = raw[m.end():]
        # DeepSeek 原生格式：name 后还有一个 tool_sep 才是参数
        rest = re.sub(r"^[<＜][|｜]tool[_▁]?sep[|｜][>＞]\s*", "", rest)
        fence = _FENCE.match(rest)
        body = fence.group(1) if fence else _slice_first_object(rest)
        if body is None:
            # 有 { 但配不平 = 参数被截断，宁可丢弃也不能拿半截参数执行
            if "{" in rest:
                continue
            args = {}  # 真不带参数的工具
        else:
            try:
                args = json.loads(body.strip() or "{}")
            except (ValueError, TypeError):
                continue  # 参数不是合法 JSON，丢弃
            if not isinstance(args, dict):
                args = {}  # 数组/标量/null 一律按无参处理，防下游炸
        calls.append({"name": name, "input": args})
    # 正文只留标记之前的部分，尾巴上的孤立 "function" 字样一并清掉
    cut = LEAK_PROBE.search(raw)
    text = raw[:cut.start()] if cut else ""
    text = re.sub(r"\bfunction\s*$", "", text).rstrip()
    return text, calls


class StreamLeakGate:
    """流式闸门：泄漏标记一旦冒头就停止向下游吐字，负载单独攒起来。"""

    def __init__(self):
        self.leaking = False
        self.leak_payload = ""
        self._hold = ""

    def feed(self, delta: str):
        """吃进一个 content 增量，返回 (可下发的正文, 进入泄漏态的部分)。"""
        if not delta:
            return "", ""
        if self.leaking:
            self.leak_payload += delta
            return "", delta
        s = self._hold + delta
        self._hold = ""
        m = LEAK_PROBE.search(s)
        if m:
            self.leaking = True
            self.leak_payload = s[m.start():]
            return s[:m.start()], self.leak_payload
        k = _partial_marker_tail(s)
        if k:
            # 结尾可能是标记前缀（如恰好收到 "<"），先扣住等下一片
            self._hold = s[-k:]
            return s[:-k], ""
        return s, ""

    def flush_hold(self) -> str:
        """流结束时释放暂扣字符（始终没凑成标记说明是正常正文）。"""
        out, self._hold = self._hold, ""
        return out


# ---------------------------------------------------------------------------
# 响应改写
# ---------------------------------------------------------------------------

def fix_completion(data: dict):
    """非流式响应修复（原地改）。返回 (data, rescued_tool_names)。"""
    rescued = []
    for choice in data.get("choices") or []:
        msg = choice.get("message")
        if not isinstance(msg, dict):
            continue
        content = msg.get("content")
        if not isinstance(content, str) or not LEAK_PROBE.search(content):
            continue
        clean, calls = rescue_from_text(content)
        if calls and not msg.get("tool_calls"):
            msg["tool_calls"] = [
                {
                    "id": f"rescued_{i}",
                    "type": "function",
                    "function": {
                        "name": c["name"],
                        "arguments": json.dumps(c["input"], ensure_ascii=False),
                    },
                }
                for i, c in enumerate(calls)
            ]
            choice["finish_reason"] = "tool_calls"
            rescued += [c["name"] for c in calls]
        # 无论是否还原出调用，泄漏乱码都不能留在正文里
        msg["content"] = clean if clean else None
    return data, rescued


class _StreamState:
    def __init__(self):
        self.gate = StreamLeakGate()
        self.leak_payload = ""
        self.pending_finish = None
        self.done_seen = False


def transform_stream_chunk(chunk: dict, state: _StreamState):
    """流式增量块改写（原地改）。返回改写后的 chunk 或 None（整块丢弃）。
    finish_reason 在泄漏场景下被扣住，由 finish_stream 统一补发。"""
    choices = chunk.get("choices") or []
    if not choices:
        return chunk  # usage 等元数据块，原样放行
    keep = False
    for choice in choices:
        delta = choice.get("delta")
        if isinstance(delta, dict):
            content = delta.get("content")
            if isinstance(content, str) and content:
                emit, leaked = state.gate.feed(content)
                if leaked:
                    state.leak_payload += leaked
                if emit:
                    delta["content"] = emit
                    keep = True
                else:
                    delta.pop("content", None)
            elif content == "":
                delta.pop("content", None)
            if delta:
                keep = True
        fr = choice.get("finish_reason")
        if fr:
            if state.leak_payload:
                state.pending_finish = fr
                choice["finish_reason"] = None
            else:
                keep = True
    return chunk if keep else None


def finish_stream(state: _StreamState):
    """流收尾：泄漏负载解析还原，合成 tool_calls 增量块与 finish 块。
    返回需要补发的 chunk 列表。"""
    tail = state.gate.flush_hold()
    out = []
    if tail:
        # 暂扣字符始终没凑成标记且流已结束 —— 是正常正文，补发
        out.append({"delta_flush": tail})
    if not state.leak_payload:
        return out
    _, calls = rescue_from_text(state.leak_payload)
    if calls:
        for i, c in enumerate(calls):
            out.append({
                "tool_call": {
                    "index": i,
                    "id": f"rescued_{i}",
                    "type": "function",
                    "function": {
                        "name": c["name"],
                        "arguments": json.dumps(c["input"], ensure_ascii=False),
                    },
                }
            })
        out.append({"finish_reason": "tool_calls"})
    else:
        # 泄漏了但还原不出完整调用：安全丢弃，按上游原始原因收尾
        out.append({"finish_reason": state.pending_finish or "stop"})
    return out


# ---------------------------------------------------------------------------
# HTTP 反向代理
# ---------------------------------------------------------------------------

UPSTREAM_BASE = os.environ.get("UPSTREAM_BASE", "http://127.0.0.1:3080")
BIND_HOST = os.environ.get("RESCUE_BIND", "0.0.0.0")
PORT = int(os.environ.get("RESCUE_PORT", "3081"))

_u = re.match(r"http://([^:/]+):(\d+)", UPSTREAM_BASE)
UP_HOST, UP_PORT = (_u.group(1), int(_u.group(2))) if _u else ("127.0.0.1", 3080)

# 转发时剔除的请求头（Hop-by-hop / 会干扰流式解析的）
_HOP_HEADERS = {"host", "content-length", "connection", "accept-encoding",
                "transfer-encoding", "keep-alive"}


class RescueProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "xingyu-rescue-proxy/0.1"

    # ---- 基础工具 -------------------------------------------------------
    def log_message(self, fmt, *args):
        sys.stdout.write("[proxy] %s %s\n" % (self.address_string(), fmt % args))
        sys.stdout.flush()

    def _read_body(self) -> bytes:
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def _fwd_headers(self):
        return {k: v for k, v in self.headers.items()
                if k.lower() not in _HOP_HEADERS}

    def _upstream_conn(self):
        return http.client.HTTPConnection(UP_HOST, UP_PORT, timeout=600)

    # ---- 路由 -----------------------------------------------------------
    def do_GET(self):
        self._passthrough("GET")

    def do_DELETE(self):
        self._passthrough("DELETE")

    def do_PUT(self):
        self._passthrough("PUT")

    def do_POST(self):
        if self.path.split("?")[0].rstrip("/").endswith("/chat/completions"):
            self._handle_chat()
        else:
            self._passthrough("POST")

    # ---- 透传（非对话端点：/v1/models 等）-------------------------------
    def _passthrough(self, method):
        body = self._read_body() if method in ("POST", "PUT", "DELETE") else None
        headers = self._fwd_headers()
        if body is not None:
            headers["Content-Length"] = str(len(body))
        try:
            conn = self._upstream_conn()
            conn.request(method, self.path, body=body, headers=headers)
            resp = conn.getresponse()
            data = resp.read()
        except Exception as e:
            self._send_json(502, {"error": {"message": f"rescue-proxy upstream error: {e}"}})
            return
        self.send_response(resp.status)
        for k, v in resp.getheaders():
            if k.lower() not in ("transfer-encoding", "content-length", "connection"):
                self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
        conn.close()

    # ---- 对话端点 -------------------------------------------------------
    def _handle_chat(self):
        body = self._read_body()
        try:
            req = json.loads(body)
        except ValueError:
            req = {}
        stream = bool(req.get("stream"))
        headers = self._fwd_headers()
        headers["Content-Length"] = str(len(body))
        if stream:
            headers.setdefault("Accept", "text/event-stream")
        try:
            conn = self._upstream_conn()
            conn.request("POST", self.path, body=body, headers=headers)
            resp = conn.getresponse()
        except Exception as e:
            self._send_json(502, {"error": {"message": f"rescue-proxy upstream error: {e}"}})
            return
        if resp.status != 200:
            data = resp.read()
            self.send_response(resp.status)
            for k, v in resp.getheaders():
                if k.lower() not in ("transfer-encoding", "content-length", "connection"):
                    self.send_header(k, v)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            conn.close()
            return
        if stream:
            self._relay_stream(resp, req)
        else:
            self._relay_buffered(resp, req)
        conn.close()

    def _send_json(self, status, obj):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    # 非流式：整体读出 → 修复 → 回发
    def _relay_buffered(self, resp, req):
        try:
            data = json.loads(resp.read())
        except ValueError:
            self._send_json(502, {"error": {"message": "rescue-proxy: upstream returned non-JSON"}})
            return
        _, rescued = fix_completion(data)
        if rescued:
            self.log_message("rescued(non-stream) model=%s tools=%s",
                             req.get("model"), ",".join(rescued))
        self._send_json(200, data)

    # 流式：逐行转发 SSE，content 走闸门，收尾补发还原结果
    def _relay_stream(self, resp, req):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        state = _StreamState()
        model = req.get("model")

        def write_line(s):
            self.wfile.write((s + "\n").encode())

        def emit_chunk(payload):
            write_line("data: " + json.dumps(payload, ensure_ascii=False))
            self.wfile.write(b"\n")

        rescued_names = []
        done_emitted = False
        try:
            for raw in resp:
                line = raw.decode("utf-8", "replace").rstrip("\n")
                if not line.strip():
                    self.wfile.write(b"\n")
                    continue
                if not line.startswith("data:"):
                    write_line(line)
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    done_emitted = True
                    self._emit_stream_tail(state, model, emit_chunk, write_line,
                                           rescued_names)
                    write_line("data: [DONE]")
                    break
                try:
                    chunk = json.loads(payload)
                except ValueError:
                    write_line(line)
                    continue
                out = transform_stream_chunk(chunk, state)
                if out is not None:
                    emit_chunk(out)
                self.wfile.flush()
            if not done_emitted:
                # 上游异常断流，把扣住的东西补发出去，别让下游悬着
                self._emit_stream_tail(state, model, emit_chunk, write_line,
                                       rescued_names)
        except (BrokenPipeError, ConnectionResetError):
            pass
        if rescued_names:
            self.log_message("rescued(stream) model=%s tools=%s",
                             model, ",".join(rescued_names))

    def _emit_stream_tail(self, state, model, emit_chunk, write_line, rescued_names):
        base = {"id": "rescue", "object": "chat.completion.chunk", "model": model}
        for item in finish_stream(state):
            if "delta_flush" in item:
                c = dict(base)
                c["choices"] = [{"index": 0, "delta": {"content": item["delta_flush"]},
                                 "finish_reason": None}]
                emit_chunk(c)
            elif "tool_call" in item:
                c = dict(base)
                c["choices"] = [{"index": 0, "delta": {"tool_calls": [item["tool_call"]]},
                                 "finish_reason": None}]
                emit_chunk(c)
                rescued_names.append(item["tool_call"]["function"]["name"])
            elif "finish_reason" in item:
                c = dict(base)
                c["choices"] = [{"index": 0, "delta": {}, "finish_reason": item["finish_reason"]}]
                emit_chunk(c)


def main():
    if "--selftest" in sys.argv:
        from test_replay_20 import run_all
        sys.exit(0 if run_all() else 1)
    srv = ThreadingHTTPServer((BIND_HOST, PORT), RescueProxyHandler)
    print(f"[rescue-proxy] listening on {BIND_HOST}:{PORT} -> {UPSTREAM_BASE}", flush=True)
    srv.serve_forever()


# 部署（VPS）：
#   1. 放到 /data/xingyu-agent/rescue-proxy/rescue_proxy.py
#   2. systemd unit /etc/systemd/system/xingyu-rescue-proxy.service：
#      [Service]
#      ExecStart=/usr/bin/python3 /data/xingyu-agent/rescue-proxy/rescue_proxy.py
#      Environment=UPSTREAM_BASE=http://127.0.0.1:3080
#      Environment=RESCUE_PORT=3081
#      Restart=always
#   3. 消费方 base_url 从 :3080/v1 改指 :3081/v1
if __name__ == "__main__":
    main()
