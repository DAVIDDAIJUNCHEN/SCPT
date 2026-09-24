# Models & Pricing

> StarWhisper API Developer Guide · Last verified 2026-09-24
> Unit: **per million tokens**. A token is the smallest unit of text a model processes; for Chinese, **1 token ≈ 1 character** (a rule of thumb for estimation — exact counts come from the `usage` field in API responses).

## Model Overview

Platform models are exposed by **group**: registration puts you in the **default group** (4 LLMs + multimodal feature models); the **vip group** additionally includes the flagship model (see the group notes below).

### default group (default on registration, 4 LLMs + feature models)

| Model (the API `model` value) | Context | Max output | Input price<br>CNY/M tokens | Cache price<br>CNY/M tokens | Output price<br>CNY/M tokens | Positioning |
|---|---|---|---|---|---|---|
| **DeepSeek-V4.1-Flash** | **1M** | 64K | **1** | **0.02** | **4** | Default pick. Fast; the 1M long-context workhorse. [Long-context usage](/docs/long-context#usage-example) |
| **Qwen3.8-Flash-Next** | **1M** | 64K | 0.8 | 0.1 | 2.7 | Chinese-optimized, reasoning-enhanced. [Thinking/streaming](/docs/streaming#working-with-thinking-mode) |
| **GLM-5.3-Flash** | **1M** | 64K | 0.4<sup>†</sup> | 0.115 | 1.4<sup>†</sup> | Lightweight and fast for casual use. [Streaming example](/docs/streaming#usage-example-tested-working) |
| **DeepSeek-V4-Flash-0731** | 1M | 64K | 1 | 0.02 | 4 | Previous generation of DeepSeek-V4.1-Flash |
| bge-m3 (Embedding) | 8K | — | 0.5 | — | — | Text embedding for retrieval/RAG. [Example](/docs/embedding#usage-example-tested-working) |
| Qwen3-VL-30B-A3B-Instruct | 128K | 8K | 0.75 | 0.75 | 3 | Multimodal image understanding. [Example](/docs/vision) |
| FLUX.2-klein-4B | — | — | Per image | — | — | Image generation. [Example](/docs/vision) |
| Qwen2-Audio-7B-Instruct / Qwen3-ASR-1.7B / cosyvoice-v3 | — | — | 1 | — | 1 | Audio understanding/ASR/TTS. [Audio examples](/docs/audio#models-and-endpoints) |

> Prices above are **live values verified against the platform billing config** [2026-09-24]. In classroom terms: one ordinary Q&A round costs about 0.001–0.01 CNY.
> † GLM-5.3-Flash is currently at a **50%-off promotional price** (regular price 0.8 / 2.8 CNY); it will return to regular pricing after the promotion ends.
> **Cache price**: for long documents and multi-turn conversations, the platform automatically caches repeated prefixes (system prompts, conversation history); cached portions are billed at the cache price (e.g. DS-V4.1 input is 1 CNY but only 0.02 CNY when cached — saving up to 98% of input cost in long-document scenarios). Cache hits are reported in `usage.prompt_tokens_details.cached_tokens`.
> **"Max output"**: the recommended `max_tokens` value. Larger values (e.g. 128K in testing) **do not error** — the server silently truncates to the model's output capability [verified 2026-09-24: all four 1M Flash models returned normally with `max_tokens=131072`]; for GLM-5.3 (vip) it is a hard deployment-side cap.

### vip group exclusive

| Model | Context | Max output | Input price | Cache price | Output price | Notes |
|---|---|---|---|---|---|---|
| **GLM-5.3** (flagship) | 128K | 32K | 8 | 2 | 28 | Full 74.4B parameters, strongest deep reasoning; scarce whole-machine resources, visible to the vip group only |

> **Group notes**: registered accounts belong to the **default group** by default; for the **vip group** (flagship GLM-5.3), contact the **AI Computing Center**. Calling `GLM-5.3` with a default-group token returns 503 "no available channel" — that's group policy, not a malfunction [verified 2026-09-23].

## Thinking Mode

- **DeepSeek-V4.1-Flash**: non-thinking by default (answers directly, fast) [verified 2026-09-23]; for deep reasoning prefer Qwen3.8-Flash-Next (always-thinking, reasoning included by default).
- **GLM-5.3**: thinking mode — output contains both `reasoning_content` (reasoning) and `content` (answer).
- For detailed toggles and examples see [Streaming](/docs/streaming).

## Feature Matrix

| Feature | DS-V4.1-Flash | Qwen3.8-Flash-Next | GLM-5.3-Flash | DS-V4-Flash-0731 | GLM-5.3 (vip) |
|---|---|---|---|---|---|
| 1M long context (max single input) | ✅ | ✅ | ✅ | ✅ | ❌ (128K) |
| Streaming | ✅ | ✅ | always-thinking: streams `reasoning_content` segments [tested] | ✅ | ✅ |
| Tool Calls | ✅ | ✅ | ✅ | ✅ | ✅ |
| JSON Output | ✅ | ✅ | ✅ | ✅ | ✅ |
| Embedding | — | — | — | — | — (use bge-m3) |
| Image understanding | — | — | — | — | — (use Qwen3-VL) |

> Tool Calls / JSON Output follow the OpenAI format. Detailed examples for each feature are in the "Developer Guide" volumes in the sidebar (Streaming / Long Context / Vision & Image Generation / Audio / Embedding & RAG); data marked [tested] was verified on 2026-09-23.

---
*StarWhisper Platform · maintained by the AI Computing Center · 2026-09-23*
