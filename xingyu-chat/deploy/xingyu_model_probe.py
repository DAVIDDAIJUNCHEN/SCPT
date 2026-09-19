#!/usr/bin/env python3
"""
川邮·星语 · 模型能力实测脚本（命名前必跑）

为什么需要它
-----------
2026-09-18 事故：白名单把 glm-5.3-flash 命名为「极速」、DeepSeek-V4.1-Flash 命名为
「深度思考」，**与实测完全相反**（前者 2.98s 强制思考 868ch，后者 0.48s 不思考），
直接导致用户投诉「极速很慢、思考的不思考」。

结论：**模型角色不能凭名字猜，必须实测**。本脚本给出三项硬指标供分配角色：

  1. 首字/总耗时  → 决定能否叫「极速」
  2. reasoning_content 长度 → 决定能否叫「思考」（>0 = 强制思考）
  3. 视觉能力     → 用真实图片请求验证，不靠模型名里的 "VL" 字样

用法
----
    # 默认探测网关全部模型
    python3 xingyu_model_probe.py

    # 指定模型与网关地址
    GW=https://10.255.12.210/v1 KEY=sk-xxx python3 xingyu_model_probe.py \
        --models DeepSeek-V4.1-Flash glm-5.3-flash

输出：Markdown 表格，可直接贴进 docs。
"""

import argparse
import json
import os
import ssl
import time
import urllib.request

GW = os.environ.get('GW', 'https://10.255.12.210/v1')
KEY = os.environ.get('KEY', '')
TIMEOUT = 120

# 不参与对话探测的非文本模型（ASR/TTS/向量/OCR/文生图）
SKIP_PATTERNS = ('asr', 'tts', 'cosyvoice', 'flux', 'bge', 'mineru', 'embed', 'whisper')

_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE


def post(path, payload, timeout=TIMEOUT):
    """向网关发 JSON POST，返回 (http_code, parsed_json_or_text, elapsed_seconds)。"""
    url = f'{GW}{path}'
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            'Authorization': f'Bearer {KEY}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, context=_CTX, timeout=timeout) as r:
            body = r.read().decode('utf-8', 'replace')
            code = r.status
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'replace')
        code = e.code
    except Exception as e:
        return 0, {'error': str(e)}, time.time() - t0
    elapsed = time.time() - t0
    try:
        return code, json.loads(body), elapsed
    except json.JSONDecodeError:
        return code, {'raw': body[:300]}, elapsed


def get(path, timeout=30):
    url = f'{GW}{path}'
    req = urllib.request.Request(
        url, headers={'Authorization': f'Bearer {KEY}'}, method='GET'
    )
    with urllib.request.urlopen(req, context=_CTX, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8', 'replace'))


# 一个没有唯一答案、必须动脑的题，用来逼出强制思考模型的 reasoning
PROBE_PROMPT = '一个农夫有 17 只羊，除了 9 只之外全都跑了，还剩几只？请只回答数字。'


def probe_text(model):
    """探测文本模型：耗时 + reasoning 长度 + 是否答对。"""
    code, resp, elapsed = post(
        '/chat/completions',
        {
            'model': model,
            'messages': [{'role': 'user', 'content': PROBE_PROMPT}],
            # 给足空间：强制思考模型会把额度烧在 reasoning 上
            'max_tokens': 4096,
            'temperature': 0,
        },
    )
    if code != 200:
        err = resp.get('error') if isinstance(resp, dict) else resp
        msg = err.get('message') if isinstance(err, dict) else str(err)
        return {
            'ok': False,
            'code': code,
            'elapsed': elapsed,
            'error': (msg or '')[:80],
        }

    try:
        choice = resp['choices'][0]['message']
    except (KeyError, IndexError):
        return {'ok': False, 'code': code, 'elapsed': elapsed, 'error': '响应结构异常'}

    content = (choice.get('content') or '').strip()
    reasoning = choice.get('reasoning_content') or choice.get('reasoning') or ''
    usage = resp.get('usage') or {}

    # 期望答案 8（除 9 只外都跑了 = 剩 9 只）——本题设计为易被误算成 17-9=8
    correct = '9' in content

    return {
        'ok': True,
        'code': code,
        'elapsed': elapsed,
        'content_len': len(content),
        'reasoning_len': len(reasoning),
        'completion_tokens': usage.get('completion_tokens'),
        'correct': correct,
        'snippet': content[:40].replace('\n', ' '),
    }


def _make_solid_png(w, h, rgb):
    """内存里生成纯色 PNG，免外部依赖。"""
    import zlib
    import struct

    raw = b''
    for _ in range(h):
        raw += b'\x00' + bytes(rgb) * w

    def chunk(tag, data):
        body = tag + data
        return (
            struct.pack('>I', len(data))
            + body
            + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)
        )

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )


# 三色轮测：必须三色全对才算真支持视觉。
# 为什么不用 1x1 图：太小，模型可能靠猜也能蒙对，会误判（2026-09-18 踩过）。
import base64 as _b64

_VISION_CASES = [
    ('red', (220, 30, 30), '红'),
    ('blue', (30, 60, 220), '蓝'),
    ('green', (30, 180, 60), '绿'),
]
_VISION_IMGS = {n: _b64.b64encode(_make_solid_png(64, 64, rgb)).decode() for n, rgb, _ in _VISION_CASES}


def probe_vision(model):
    """探测视觉能力：三色轮测，全对才算支持。

    实测发现 DeepSeek-V4.1-Flash / glm-5.3-flash 其实都能识图（3/3），
    仅靠模型名里的 "VL" 字样判断会**低估**自家能力。
    """
    hits = 0
    detail = []
    elapsed_total = 0.0

    for name, _rgb, cn in _VISION_CASES:
        code, resp, elapsed = post(
            '/chat/completions',
            {
                'model': model,
                'messages': [
                    {
                        'role': 'user',
                        'content': [
                            {
                                'type': 'image_url',
                                'image_url': {'url': f'data:image/png;base64,{_VISION_IMGS[name]}'},
                            },
                            {'type': 'text', 'text': '这张图是什么颜色？只回答一个颜色词。'},
                        ],
                    }
                ],
                'max_tokens': 1024,
            },
        )
        elapsed_total += elapsed
        if code != 200:
            detail.append(f'{name}:HTTP{code}')
            continue
        try:
            choice = resp['choices'][0]['message']
        except (KeyError, IndexError):
            detail.append(f'{name}:结构异常')
            continue
        text = (choice.get('content') or '') + (choice.get('reasoning_content') or '')
        ok = cn in text
        hits += ok
        detail.append(f'{name}={"✓" if ok else "✗"}')

    return {
        'ok': True,
        # 三色全对才算支持 —— 只对 1~2 个大概率是蒙的
        'vision': hits == len(_VISION_CASES),
        'vision_hits': hits,
        'vision_elapsed': elapsed_total,
        'vision_detail': ' '.join(detail),
    }


def classify(r):
    """把实测结果翻译成角色建议。"""
    if not r.get('ok'):
        return '不可用', ''

    elapsed = r['elapsed']
    thinking = r.get('reasoning_len', 0) > 0

    if thinking:
        speed = '慢（思考型）'
        role = '深度思考'
    else:
        if elapsed < 1.0:
            speed = '很快'
            role = '极速'
        elif elapsed < 3.0:
            speed = '中等'
            role = '通用'
        else:
            speed = '偏慢'
            role = '通用'

    if r.get('vision'):
        role = f'{role} + 视觉' if role != '不可用' else '视觉'
    return speed, role


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', nargs='*', help='指定模型 id；缺省探测网关全部')
    ap.add_argument('--no-vision', action='store_true', help='跳过视觉探测')
    args = ap.parse_args()

    if not KEY:
        print('❌ 请通过环境变量提供网关 key：KEY=sk-xxx python3 xingyu_model_probe.py')
        return 1

    if args.models:
        models = args.models
    else:
        try:
            models = [m['id'] for m in get('/models').get('data', [])]
        except Exception as e:
            print(f'❌ 拉取模型列表失败：{e}')
            return 1

    chat_models = [m for m in models if not any(p in m.lower() for p in SKIP_PATTERNS)]

    print(f'网关: {GW}')
    print(f'待测: {len(chat_models)} 个对话模型（已跳过 ASR/TTS/向量/文生图类）\n')

    rows = []
    for m in chat_models:
        print(f'  探测 {m} ...', flush=True)
        r = probe_text(m)
        if r.get('ok') and not args.no_vision:
            v = probe_vision(m)
            # 视觉脚本返回慢的话会拉长耗时，只取 vision 标志，耗时以文本探测为准
            r['vision'] = v.get('vision', False)
        rows.append((m, r))

    print('\n## 模型能力实测台账\n')
    print(f'探测时间：{time.strftime("%Y-%m-%d %H:%M:%S")}')
    print(f'网关：`{GW}`　prompt：「{PROBE_PROMPT}」\n')
    print('| 模型 | 耗时 | 状态 | 思考 | 视觉 | 答对 | 角色建议 | 首句 |')
    print('|---|---|---|---|---|---|---|---|')

    for m, r in rows:
        if not r.get('ok'):
            print(f'| `{m}` | {r["elapsed"]:.2f}s | ❌ HTTP {r["code"]} | - | - | - | 不可用 | {r.get("error","")[:30]} |')
            continue
        speed, role = classify(r)
        thinking = '✅ 强制思考' if r.get('reasoning_len', 0) > 0 else '—'
        vision = '✅' if r.get('vision') else '—'
        correct = '✅' if r.get('correct') else '❌'
        rlen = r.get('reasoning_len', 0)
        think_txt = f'✅ {rlen}ch' if rlen else '—'
        print(
            f'| `{m}` | {r["elapsed"]:.2f}s | {speed} | {think_txt} | {vision} | '
            f'{correct} | **{role}** | {r.get("snippet","")} |'
        )

    print('\n> 角色建议规则：reasoning>0 → 深度思考；否则耗时<1s → 极速，<3s → 通用。')
    print('> ⚠️ 命名必须与此表一致。改名后请把本表贴进 docs/stage2-chat/README.md 存档。')

    # 附：中文问答质量快照（同一题看回答风格差异）
    print('\n### 回答风格快照\n')
    for m, r in rows:
        if r.get('ok'):
            print(f'- **{m}**（{r["elapsed"]:.2f}s）：{r.get("snippet","")}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())