# Appendix · Model Billing and FAQ

> StarWhisper API Platform · Last verified 2026-09-23
> For all registered users. Unit: **per million tokens**; in Chinese **1 token ≈ 1 character** (a colloquial approximation — the exact count is whatever the API's `usage` field reports).

---

## 1. Model Quick Reference

### default group (default for every registration)

| Model (the `model` value in API calls) | Context | Input | Cache† | Output | One-line positioning |
|---|---|---|---|---|---|
| **DeepSeek-V4.1-Flash** | **1M** | 1 | 0.02 | 4 | **Default recommendation**: fast + the workhorse for million-token documents |
| **Qwen3.8-Flash-Next** | **1M** | 0.8 | 0.1 | 2.7 | Chinese-optimized, thinking process on by default (reasoning-enhanced) |
| **GLM-5.3-Flash** | **1M** | 0.4‡ | 0.115‡ | 1.4‡ | Cheapest, for everyday light usage |
| **DeepSeek-V4-Flash-0731** | 1M | 1 | 0.02 | 4 | Previous generation — prefer the newer one |
| bge-m3 (Embedding) | 8K | 0.5 | — | — | Text embedding, for retrieval / RAG |
| Qwen3-VL-30B-A3B-Instruct | 128K | 0.75 | — | 3 | Image understanding (captioning, chart reading) |
| Qwen2-Audio-7B / Qwen3-ASR-1.7B / cosyvoice-v3 | — | 1 | — | 1 | Speech understanding / recognition / synthesis |

### vip group exclusive

| Model | Context | Input | Cache | Output | Notes |
|---|---|---|---|---|---|
| **GLM-5.3** | 128K | 8 | 2 | 28 | Full-strength 74.4B parameters, strongest deep reasoning; vip group — contact the AI Computing Center to enable |

> † **Cache price**: when you resend an identical prefix (e.g. repeated follow-ups on a long document), the cached portion is billed at this rate, far below the input price — a big saving for multi-turn long-document scenarios.
> ‡ GLM-5.3-Flash is currently at a **50%-off promotional price** (original 0.8 / 0.23 / 2.8 CNY); it reverts when the promotion ends.
> A regular token calling `GLM-5.3` gets 503 "no available channel" — that's **group policy, not a fault** [verified 2026-09-23].

---

## 2. How Billing Works (three sentences)

1. **Cost = input tokens × input price + output tokens × output price** (identical-prefix cache hits are billed at the cache price).
2. **No top-ups**: campus quota system — check your quota in the platform console (ai-platform.sptc.edu.cn).
3. **Ballpark**: an ordinary Q&A round (~500-character question + 300-character answer) ≈ **0.002 CNY**; one million-character document analysis ≈ 1–2 CNY.

**Classroom estimate** [theoretical]: a class of 50 students × 20 Q&A rounds each ≈ 2 CNY; a whole course using it for a semester ≈ tens of CNY — teaching cost is negligible.

---

## 3. FAQ

### Usage

| Question | Answer |
|---|---|
| How do I get started? | On the campus network open https://ai-platform.sptc.edu.cn and register with a phone number; chat directly at https://ai-chat.sptc.edu.cn |
| How do I pick a model? | Everyday Q&A: DeepSeek-V4.1-Flash (default); deep reasoning / code: GLM-5.3 (vip required); image understanding: Qwen3-VL; see the [model table](#1-model-quick-reference) |
| Do million-character documents really work? How long is the wait? | Yes — a 974K-character document was tested end-to-end [verified]; ~80K characters returns in ~10 s, a full million characters starts answering in ~6.5 min. This is normal |
| Why doesn't GLM-5.3 support 1M context? | The model architecture (DSA attention) has heavy VRAM overhead — an industry-wide ceiling, not a platform defect; use the three 1M models for long documents |
| "Try again later" / queuing? | Concurrency is full at peak hours — retry after 1–2 minutes; **no data loss, no crashes** [load-test verified] |
| Will the platform crash under heavy load? | **No** — overload requests are auto-queued or politely rejected; the baseline recovers 15 s after load removal; zero downtime under 200-way concurrent load testing [load-test verified] |
| Is my data safe? | The entire chain stays on campus — conversation content never passes through any external vendor |

### Developer

| Question | Answer |
|---|---|
| Getting 502? | Nine times out of ten the **self-signed certificate isn't set up** (add `-k` to curl, `verify=False` in Python); see [Error Codes](/docs/errors) |
| What's the difference between 429 and 503? | 429 = too many requests too fast, slow down; 503 = queue full or no available channel, wait 1–2 minutes. Both: retry with exponential backoff |
| Calling GLM-5.3 returns 503? | A default-group token has no vip permission (`model_not_found`) — contact the AI Computing Center to enable the vip group; not a fault |
| The response has an extra "thinking process"? | Qwen3.8-Flash-Next / GLM-5.3 have thinking mode on by default: the thinking process is in `reasoning_content`, the answer in `content` — just read the latter in your code |
| Multi-turn follow-ups on long documents too expensive? | Identical prefixes automatically hit the cache and are billed at the cache price (e.g. DS-V4.1-Flash cache price is only 0.02) — put the long document at the beginning of the message to benefit |
| Can I use it off campus? | Currently campus-network only; off campus, connect to the school VPN first |

## 4. Known Issues and Workarounds (continuously updated · 2026-09-24)

| Issue | Status | Workaround |
|---|---|---|
| Document parsing (MinerU2.5) via the gateway returns empty content | In integration testing; not recommended for production yet | Use Qwen3-VL for image OCR, or DeepSeek-V4.1-Flash for long documents |
| After a WorkBuddy client upgrade the Mac version needs the gateway certificate reinstalled | Known client behavior (upgrade wipes ca.pem) | Redo Step 2 of the macOS flow in the [WorkBuddy guide](/docs/workbuddy) |
| The platform occasionally fails to open from off campus | Jitter on the campus-network ↔ cloud-datacenter mapping link; unrelated to the platform itself | Refresh and retry; if it stays down, connect the school VPN and report |
| No dedicated mobile tutorial yet | Will be added based on feedback | Mobile browsers work fine; the operations are identical to desktop |

> For more error codes and triage steps see [Error Codes](/docs/errors).

### Feedback Channels

Usage questions → School of Information Engineering (AI Computing Center); API integration questions → check [Error Codes](/docs/errors) first, then report.

---

*StarWhisper Platform · maintained by the AI Computing Center · 2026-09-23*
