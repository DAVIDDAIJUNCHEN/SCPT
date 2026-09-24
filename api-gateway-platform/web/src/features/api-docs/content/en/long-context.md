# 1M Long Context

> Data verified 2026-09-23. 1M = 1 million tokens ≈ 1 million Chinese characters (1 token ≈ 1 character).

## Supported Models

| Model | Max single input | Notes |
|---|---|---|
| **DeepSeek-V4.1-Flash** | **1M** | Long-document workhorse; runs 27 full-length documents simultaneously |
| **Qwen3.8-Flash-Next** | **1M** | Optimized for Chinese long documents |
| **GLM-5.3-Flash** | **1M** | Lightweight long documents |
| DeepSeek-V4-Flash-0731 | 1M | Previous generation |
| GLM-5.3 (vip group) | 128K | The full model does not support 1M (architectural limit, not a config issue) |

## Waiting Time (the model must finish "reading" before answering)

Long-document requests complete prefill ("reading") before the first token appears. **Longer input, longer wait**:

| Input length | Waiting time [tested] |
|---|---|
| 80K characters | ~10 seconds |
| 970K characters | ~6.5 minutes |

> **Repeated questions** about the same long document (e.g. asking the same document from different angles) hit the cache — noticeably faster from the second question on.

## Concurrency Capacity [tested]

| Scenario | DeepSeek-V4.1-Flash |
|---|---|
| Full 1M (1M-character) documents in flight simultaneously | **27** |
| ~500K-character level | ~54 |
| 10 long documents + ordinary short chats | Ordinary chats still have ~38 lanes; users barely notice |

## Usage Example

```bash
curl https://ai-platform.sptc.edu.cn/v1/chat/completions -k \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "DeepSeek-V4.1-Flash",
    "messages": [
      {"role": "user", "content": "<paste the entire long document here>\n\nPlease summarize the key points"}
    ],
    "max_tokens": 2000
  }'
```

Just put the long text directly in `content` — no chunked upload needed; set `max_tokens` as needed (the default is small and may truncate long answers).

## Usage Advice

1. **Feed the full document, not a summary** — the model is markedly more accurate reading the original text than reading a summary.
2. Beyond ~1 million characters, split the work (e.g. ask chapter by chapter, or retrieve first then read closely).
3. Both the web app (XingYu Chat) and the API support 1M — no special parameters needed.
