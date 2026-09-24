# Error Codes

> SCPT XingYu API Developer Guide · Last verified 2026-09-23
> Errors you may encounter when calling the XingYu API. Each entry lists the **cause** and the **fix**; payloads marked [tested] are real platform responses.

## 400 — Bad Request

**Cause**: malformed JSON in the request body (missing quotes/brackets, wrong field types, etc.).
**Fix**: correct the request body following the returned error message. Validate locally first with `python -m json.tool` or `jq`.

## 401 — Authentication Failed

**Cause**: wrong token, deleted token, or missing `Authorization: Bearer` header.
**Fix**: check on the "Tokens" page at https://ai-platform.sptc.edu.cn — confirm the token exists, is not disabled, and was copied without extra spaces.

## 402 — Insufficient Quota

**Cause**: your account quota is exhausted.
**Fix**: contact the AI Computing Center for more quota (campus platform has no online top-up; quota is granted per semester/course).

## 404 — Model Not Found

**Cause**: the `model` parameter is wrong (typo, or a retired old lowercase name such as `glm-5.3-flash`).
**Fix**: verify the official model name in [Models & Pricing](/docs/models) and copy it character by character.

## 422 — Invalid Parameter

**Cause**: a request-body parameter is out of range (e.g. `max_tokens` over the cap, `temperature` out of range).
**Fix**: adjust the parameter per the error message. Note per-model `max_tokens` caps are listed in the "Max output" columns of the Models page.

## 429 — Rate Limit Reached

**Cause**: too many requests in a short window triggered rate limiting.
**Fix**: retry after 30–60 seconds; add exponential backoff in code (retry intervals 2s → 4s → 8s). The platform currently has no global token RPM cap [verified 2026-09-23]; normal individual usage almost never triggers it — if it fires frequently, contact the AI Computing Center for a check.

## 500 — Server Error

**Cause**: internal platform fault.
**Fix**: retry after 1–2 minutes; if it persists, contact the AI Computing Center (attach the request id from the response payload for precise tracing).

## 502 — Gateway Error

**Cause**: **campus self-signed certificate validation failed** (the most frequent error on XingYu) [tested]. Your tool didn't attach the certificate, the TLS handshake was rejected, and the request never reached the model.
**Fix**: attach the certificate as described in [First API Call — Step 2](/docs/first-call#step-2-handle-the-campus-self-signed-certificate-xingyu-specific-the-most-important-step) — add `-k` for curl, `verify=False` for Python, set `NODE_EXTRA_CA_CERTS` for Node. WorkBuddy users: see the ca.pem procedure in the WorkBuddy guide.

## 503 — Service Busy (two distinct cases — read the payload first)

**Case A: queue full**
**Cause**: the model's concurrency queue is full (e.g. a whole class submitting long documents at once); the platform **actively rejects new requests** to protect in-flight work — a protection mechanism, not a crash; in-flight requests are not lost.
**Fix**: retry after 1–2 minutes. Recovery took 15 seconds after load removal in testing [load-test acceptance 2026-09-23].

**Case B: no available channel**
**Cause**: you called a vip-exclusive model with a default-group token (e.g. calling `GLM-5.3` with a regular token). Sample payload [verified 2026-09-23]:
```json
{"error":{"code":"model_not_found","message":"分组 default 下模型 GLM-5.3 无可用渠道（distributor）","type":"new_api_error"}}
```
**Fix**: switch to a default-group model (see Models & Pricing), or contact the AI Computing Center for vip group access.

## Quick Triage Order (recommended for beginners)

```
Error → does it mention SSL/certificate or is it a 502?
     ├─ Yes → attach the certificate (First API Call, Step 2) — 90% of errors end here
     └─ No → check the error code:
          401 → verify your token
          404 → verify the model name
          503 → read the payload: queue full → wait and retry / model_not_found → switch model
          other → contact the AI Computing Center with the request id
```

---
*SCPT XingYu Platform · maintained by the AI Computing Center · 2026-09-24*
