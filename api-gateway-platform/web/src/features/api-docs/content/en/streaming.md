# Streaming

> Data verified 2026-09-23. Streaming = the reply is pushed as it is generated, no need to wait for the full text.

## Supported Scope

All text models (4 LLMs + vip-group GLM-5.3) support `"stream": true`.

## Usage Example (tested working)

```bash
curl -N https://ai-platform.sptc.edu.cn/v1/chat/completions -k \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "DeepSeek-V4.1-Flash",
    "messages": [{"role": "user", "content": "Count to 5"}],
    "stream": true
  }'
```

The response is an SSE (Server-Sent Events) stream, format (actual excerpt):

```
data: {"id":"...","object":"chat.completion.chunk","model":"DeepSeek-V4.1-Flash","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"...","choices":[{"index":0,"delta":{"content":"1"},"finish_reason":null}]}

data: {"id":"...","choices":[{"index":0,"delta":{"content":"\n2\n3\n4"},"finish_reason":null}]}

data: [DONE]
```

**Key points**:
- Incremental content lives in `choices[0].delta.content`; concatenating yields the full reply
- `delta.reasoning_content` carries the reasoning process (thinking models only, see below)
- The stream ends with `data: [DONE]` — you handle concatenation and termination yourself
- The `-N` flag (disable curl buffering) is mandatory, otherwise you won't see streaming behavior

## Python SDK Streaming

```python
# pip install openai httpx
import httpx
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://ai-platform.sptc.edu.cn/v1",
    http_client=httpx.Client(verify=False),  # campus self-signed certificate
)

stream = client.chat.completions.create(
    model="DeepSeek-V4.1-Flash",
    messages=[{"role": "user", "content": "Write a short poem"}],
    stream=True,
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

> For certificate setup details see Step 2 of [First API Call](/docs/first-call).

## Working with Thinking Mode

- **DeepSeek-V4.1-Flash**: non-thinking by default; `delta.reasoning_content` is null [tested]
- **Qwen3.8-Flash-Next**: always-thinking — the reasoning streams out via `delta.reasoning_content` before the main text
- GLM-5.3 (vip): thinking model, behaves the same as above
