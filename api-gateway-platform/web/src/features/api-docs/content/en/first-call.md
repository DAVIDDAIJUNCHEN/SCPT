# First API Call

> StarWhisper API Developer Guide · Last verified 2026-09-23
> The StarWhisper API is **fully OpenAI-API compatible** — use the OpenAI SDK or any OpenAI-compatible software directly.

| Parameter | Value |
|---|---|
| base_url | `https://ai-platform.sptc.edu.cn/v1` |
| api_key | A token created in the StarWhisper console (see Step 1) |
| model (beginner pick) | `DeepSeek-V4.1-Flash` |

---

## Step 1: Get a Token

1. Open **https://ai-platform.sptc.edu.cn** in a browser (campus network access)
2. On first visit you'll see "Your connection is not private" — click **Advanced → Proceed** (campus self-signed certificate; this is normal, not an attack)
3. Register / log in → the "**Tokens**" page on the left → create a token → copy the string starting with `sk-`

> A token is equivalent to your account password — never commit it to a public code repository.
>
> **Expiry and quota**: when creating a token you may optionally set an "expiry time" (leave blank for **no expiry**; 1-day / 1-month quick options are available for short-term scenarios such as course labs) and a quota limit. Once expired or exhausted, calls return 401 / 402 — just create a new token on the "Tokens" page.

## Step 2: Handle the Campus Self-Signed Certificate (StarWhisper-specific, the most important step)

The platform uses a campus self-signed HTTPS certificate. **Code and CLI tools validate certificates by default and will fail**, manifesting as SSL errors or 502. Attach the certificate (or bypass validation) per your environment:

| Environment | How |
|---|---|
| curl | Add `-k` to the command (production projects can use `--cacert <cert file>`) |
| Python (openai SDK) | Pass `http_client=httpx.Client(verify=False)` |
| Node.js | Set `NODE_EXTRA_CA_CERTS=<path to cert file>` before launch (for quick tests only, `NODE_TLS_REJECT_UNAUTHORIZED=0` works — never use it in production) |
| Browser | Click "Proceed" on first visit; the prompt won't appear again |

> Certificate download: **[Download scpt-gateway.crt](/scpt-gateway.crt)** (right-click → save as; valid until 2028-12). For certificate or access issues, contact the AI Computing Center.

## Step 3: Send Your First Request

Pick any of the three languages (all tested working, 2026-09-23):

### curl

```bash
curl -k https://ai-platform.sptc.edu.cn/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${YOUR_TOKEN}" \
  -d '{
        "model": "DeepSeek-V4.1-Flash",
        "messages": [
          {"role": "user", "content": "Hello, introduce yourself in one sentence"}
        ]
      }'
```

### Python

```python
# pip install openai httpx
import httpx
from openai import OpenAI

client = OpenAI(
    base_url="https://ai-platform.sptc.edu.cn/v1",
    api_key="sk-your-token",
    http_client=httpx.Client(verify=False),  # campus self-signed certificate
)

resp = client.chat.completions.create(
    model="DeepSeek-V4.1-Flash",
    messages=[{"role": "user", "content": "Hello, introduce yourself in one sentence"}],
)
print(resp.choices[0].message.content)
```

### Node.js

```js
// npm install openai
// Before launching: export NODE_EXTRA_CA_CERTS=/path/to/scpt-gateway.crt
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://ai-platform.sptc.edu.cn/v1",
  apiKey: "sk-your-token",
});

const resp = await client.chat.completions.create({
  model: "DeepSeek-V4.1-Flash",
  messages: [{ role: "user", content: "Hello, introduce yourself in one sentence" }],
});
console.log(resp.choices[0].message.content);
```

**Streaming**: add `"stream": true` to the request (pass `stream=True` in the Python SDK) and the reply arrives incrementally. See [Streaming](/docs/streaming) for details.

---

## Notes

- **Network boundary**: the platform is reachable **on the campus network only** [verified 2026-09-23]; off-campus access is not yet available — this page will be updated once it opens.
- **Model names**: always use official names (see [Models & Pricing](/docs/models)). The old lowercase aliases (e.g. `glm-5.3-flash`) were retired on 2026-09-23; calling them returns "no available channel".
- **On errors**: check [Error Codes](/docs/errors) — for 502/SSL errors check certificate handling first; for 503 distinguish "queue full" from "no available channel". If still unresolved, contact the AI Computing Center (attach the error message and request id).

## Next Steps

- [Models & Pricing](/docs/models) — which model to pick and how much quota it costs
- [Error Codes](/docs/errors) — error causes and fixes
- [Rate Limits & Capacity](/docs/rate-limits) — concurrency limits and retry advice

---

*StarWhisper Platform · maintained by the AI Computing Center · 2026-09-23*
