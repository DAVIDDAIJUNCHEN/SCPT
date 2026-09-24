# Rate Limits & Capacity

> StarWhisper API Developer Guide · Last verified 2026-09-23
> The platform sets **no global token RPM/TPM limits** [verified 2026-09-23]; capacity protection happens at the model-service layer. This page explains per-model concurrency caps, behavior under full load, and how your code should handle it.

## Per-Model Concurrency Capacity [verified 2026-09-23 via get_server_info]

| Model | Concurrent (lanes) | Queue (waiting) | Long-document capacity notes |
|---|---|---|---|
| **DeepSeek-V4.1-Flash** | 48 | 128 | Up to **27** full 1M long documents simultaneously; ordinary chats are not squeezed when mixed |
| **Qwen3.8-Flash-Next** | 64 | 128 | 1 full 1M document at a time (more with shorter contexts) |
| **GLM-5.3-Flash** | 32 | 96 | 1–2 full 1M documents at a time |
| **DeepSeek-V4-Flash-0731** | — (vLLM adaptive) | — | 1M recipe template |
| GLM-5.3 (vip) | 16 | — | 16 lanes for light chats; 3–5 lanes for deep long sessions (KV-pool limited) |

> "Lane" = requests the model is actually generating in parallel; extras wait in the queue, and a full queue returns 503 queue full (see [Error Codes](/docs/errors)).

## Long-Document Users Must Read: Waiting Time Is Measured in Minutes

The 1M context capacity is a "**simultaneously in-flight**" cap, not a promise of instant replies:

- 80K-character input starts answering within **10 seconds** [verified 2026-09-23]
- 1M-character input starts answering only after **~6.5 minutes** [verified, prefill at 2.5K tokens/s]
- Multiple long documents submitted together share read bandwidth, extending the wait

**Advice**: when demoing million-character documents to a whole class, stagger submissions (1–2 minutes between groups) so the whole class doesn't hit the 6-minute wait simultaneously.

## What Happens Under Full Load (load-test acceptance data)

Measured 2026-09-23, blasting DS-V4.1-Flash's full chain with 200 concurrent requests:

| Metric | Measured |
|---|---|
| Successful responses | 176 / 200 (88%) |
| The 24 rejected | All 503 "queue full" — **graceful rejection, zero data loss, zero downtime** |
| 502 gateway errors | **0** |
| Recovery after load removal | Back to baseline latency 0.21s in **15 seconds** |

Conclusion: **under overload the platform "slows down / queues / politely rejects" — it does not crash and does not lose in-flight requests**. Your code only needs to handle 503 retries correctly.

## Retry Advice for Developers

```python
import time

def call_with_retry(fn, max_retries=3):
    for i in range(max_retries):
        try:
            return fn()
        except Exception as e:
            # 503 queue full / 429: retry with exponential backoff
            # 401/404: do not retry — fix the configuration instead
            if "503" in str(e) or "429" in str(e):
                time.sleep(2 ** (i + 1))  # 2s → 4s → 8s
                continue
            raise
    raise RuntimeError("Retries exhausted — try again later or contact the AI Computing Center")
```

**Retry strategy by error class**:

- **Retryable**: 503 queue full, 429, 500 — exponential backoff, up to 3 times
- **Not retryable**: 401, 404, 422 — fix the configuration (token/model name/parameters)
- **No point retrying**: 502/SSL — just attach the certificate; retrying a thousand times won't help

## Classroom Capacity Reference

At roughly 1 concurrent lane ≈ 10–20 light-usage students/teachers [theoretical estimate, based on: 1–2 requests per person per minute × 10–20 s inference per request]:

- One class in session (50 people): any single model handles it easily
- Multiple classes simultaneously (200–300 people): spread across different models first; DS-V4.1-Flash alone can serve ~500–1000 people [theoretical estimate]
- Campus-wide daily use: no compute bottleneck; registration capacity scales on demand

---

*StarWhisper Platform · maintained by the AI Computing Center · 2026-09-23*
