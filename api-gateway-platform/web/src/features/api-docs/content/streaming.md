# 流式输出（Streaming）

> 数据：2026-09-23 实测。流式 = 回复一边生成一边推送，无需等全文生成完。

## 支持范围

全部文本模型（4 款 LLM + vip 分组 GLM-5.3）均支持 `"stream": true`。

## 调用样例（实测通过）

```bash
curl -N https://ai-platform.sptc.edu.cn/v1/chat/completions -k \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "DeepSeek-V4.1-Flash",
    "messages": [{"role": "user", "content": "数到5"}],
    "stream": true
  }'
```

响应为 SSE（Server-Sent Events）流，格式（实测截取）：

```
data: {"id":"...","object":"chat.completion.chunk","model":"DeepSeek-V4.1-Flash","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"...","choices":[{"index":0,"delta":{"content":"1"},"finish_reason":null}]}

data: {"id":"...","choices":[{"index":0,"delta":{"content":"\n2\n3\n4"},"finish_reason":null}]}

data: [DONE]
```

**要点**：
- 逐块内容在 `choices[0].delta.content`，拼接即为完整回复
- `delta.reasoning_content` 字段为思考过程（思考型模型才有，见下）
- 流以 `data: [DONE]` 结束，需要自行拼接与终止判断
- `-N` 参数（curl 关闭缓冲）必加，否则感知不到流式效果

## Python SDK 流式

```python
# pip install openai httpx
import httpx
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://ai-platform.sptc.edu.cn/v1",
    http_client=httpx.Client(verify=False),  # 校园自签证书
)

stream = client.chat.completions.create(
    model="DeepSeek-V4.1-Flash",
    messages=[{"role": "user", "content": "写一首短诗"}],
    stream=True,
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

> 证书挂法详情见 [02-0 首次调用](02-0-首次调用API.md) 第二步。

## 与思考模式的配合

- **DeepSeek-V4.1-Flash**：默认非思考模式，`delta.reasoning_content` 为 null【实测】
- **Qwen3.8-Flash-Next**：always-thinking，思考过程通过 `delta.reasoning_content` 先于正文流出
- GLM-5.3（vip）：思考型，行为同上
