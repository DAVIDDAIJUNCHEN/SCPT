# Dify Integration Guide

> Audience: teachers who want to build course Agents / workflow apps with Dify and have those Agents call StarWhisper models.
> After reading you can: configure StarWhisper as a model provider in Dify and get your first course Agent running.
> Last verified: 2026-09-24 (Dify configuration follows the official docs + community testing; Dify iterates fast, so menu locations may differ slightly across versions).

---

## 1. How Dify and StarWhisper Relate

```
Your course Agent (built in Dify)
        │ calls
        ▼
StarWhisper platform (https://ai-platform.sptc.edu.cn/v1) ── auth token ──> model pool (DS-V4.1-Flash, etc.)
```

Dify handles **application orchestration** (prompts, knowledge bases, workflows); StarWhisper handles **model inference**. The two connect through the OpenAI-compatible API — Dify treats StarWhisper as a "custom model provider".

**Who it's for**: course teachers who need to give students fixed-flow exercises (e.g. an "English email polisher" or a "code-debugging Bot"). If you only need chatting without orchestration, the StarWhisper Chat web app is enough.

## 2. Prerequisites

1. A working Dify deployment (self-hosted or the school's shared instance), version **1.x plugin architecture** (0.x has a different menu structure; this guide follows 1.x).
2. The Dify server can reach `ai-platform.sptc.edu.cn` **from within the campus network**.
3. One StarWhisper token (see [Quickstart](/docs/quickstart) for how to get it; it looks like `sk-xxxxxxxx`).

## 3. Full Configuration (Five Steps)

### Step 1. Install the OpenAI-API-compatible plugin

In Dify, click your avatar (top right) → **Settings → Model Providers** → in the "install model providers" area search for **OpenAI-API-compatible** (a langgenius officially certified plugin) → Install.

### Step 2. Configure the provider credentials

Click the plugin card → **Settings** (or "Authorize"), and fill in:

| Field | Value |
|---|---|
| API Key | Your StarWhisper token `sk-xxxxxxxx` |
| API endpoint URL | `https://ai-platform.sptc.edu.cn/v1` (**must end with /v1**) |

Dify validates the credentials immediately when you save. **If you get an SSL / certificate error here, don't blame the token yet** — jump to Section 4 to handle the self-signed certificate issue (the #1 pitfall when connecting Dify to StarWhisper), then come back.

### Step 3. Add Models

Once credentials pass validation, **add models** in the plugin (auto-discovery or manual). Start with the main model:

| Field | Value |
|---|---|
| Model type | LLM |
| Model name | `DeepSeek-V4.1-Flash` (must exactly match the StarWhisper model name, case-sensitive) |
| Context length | 1048576 |
| Max output | 65536 |
| Capabilities | Tool call ✅ / Vision ✅ (supported by this model, see [Models & Pricing](/docs/models)) |

Repeat for other models as needed (GLM-5.3-Flash / Qwen3.8-Flash-Next / DeepSeek-V4-Flash-0731; GLM-5.3 is exclusive to the vip group — default-group tokens cannot use it; contact the AI Computing Center to enable it).

> 🔴 **Naming red line**: model names must match character-for-character (e.g. `DeepSeek-V4.1-Flash`, not `deepseek-v4.1-flash`). A typo returns 503 `model_not_found` on invocation.

### Step 4. Handle the Self-Signed Certificate (🔴 Dify-specific, must-read)

**Background**: StarWhisper uses a campus self-signed certificate. Dify's model requests are issued by **Python (requests/certifi) inside the plugin container (plugin-daemon)**, which does not trust the system certificate store and has no official "skip verification" checkbox [confirmed by community issue #27789; the vendor provides no toggle]. Without handling this, the Step 2 credential validation always fails with `certificate verify failed`.

**Two solutions — pick either one**:

**Option A (recommended: import the certificate into the container, works long-term)**:

```bash
# Run on the Dify host; confirm the container name with docker ps
# ① Download the StarWhisper gateway certificate (-k is needed only for this download, before the cert is trusted)
curl -k -O https://ai-platform.sptc.edu.cn/scpt-gateway.crt

# ② Append it to the certifi trust chain inside the plugin-daemon container, then restart
docker cp ./scpt-gateway.crt <plugin-daemon-container>:/usr/local/share/ca-certificates/
docker exec <plugin-daemon-container> bash -c \
  "cat /usr/local/share/ca-certificates/scpt-gateway.crt >> \$(python3 -c 'import certifi;print(certifi.where())')"
docker restart <plugin-daemon-container>
```

**Option B (emergency: patch the plugin source to skip verification; lost on plugin upgrade, must redo)**:

```bash
# Locate the plugin file (path contains a version number; confirm with ls)
docker exec <plugin-daemon-container> ls /app/cwd/langgenius/
# Append verify=False to the openai_api_compatible plugin's llm.py
docker exec <plugin-daemon-container> bash -c "sed -i 's/requests\.post(endpoint_url, headers=headers, json=data, timeout=(10, 300)/requests.post(endpoint_url, headers=headers, json=data, timeout=(10, 300), verify=False)/g' <plugin-path>/llm.py"
docker restart <plugin-daemon-container>
```

> Security note: Option B globally disables certificate verification for that plugin (theoretically vulnerable to man-in-the-middle attacks). The risk is acceptable on the campus intranet, but **Option A is strongly preferred**.

### Step 5. Run Your First Course Agent (minimal example)

1. Dify home → **Create blank app** → choose "Chatbot" → name it e.g. *Python Q&A Assistant*.
2. In the orchestration page, select the model you just added: `DeepSeek-V4.1-Flash`.
3. System prompt (copy as-is):

```
You are the teaching assistant for the "Python Programming" course.
Students paste error messages or code snippets; you should:
1. First identify the type of error in one sentence;
2. Give the corrected code (only the minimal necessary changes);
3. Explain why in one sentence.
Answer in Chinese; mark code blocks as python.
```

4. Send `print(hello)` in the preview panel on the right → a normal reply means the integration works.
5. **Publish** → get the access link → embed it in your course page or share it with students.

## 4. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Credential validation fails with `certificate verify failed` | 🔴 Self-signed certificate not handled (most frequent) | Section 4, Option A |
| Calls return 503 `model_not_found` | Model name typo (case/version digits) or an unauthorized model (GLM-5.3) | Make the model name match character-for-character; contact the AI Computing Center to enable vip models |
| Calls return 503 `no available channel` | Queue full at peak | Wait 1–2 minutes; add a retry node in the Dify workflow |
| Credential validation fails with 401 | Token wrong or disabled | Check the token in the StarWhisper console |
| Dify container cannot curl the ai-platform domain | Dify server not on the campus network / DNS fails | First verify the network inside the Dify container: `curl https://ai-platform.sptc.edu.cn/v1/models` — only then look at configuration |
| Certificate error returns after a plugin upgrade | Option B patch overwritten by the upgrade | Redo Option B, or switch to Option A |

## 5. Advanced Tips

- **Knowledge base (RAG) pairing**: when uploading course materials to a Dify knowledge base, the embedding model for retrieval can also point to StarWhisper's `bge-m3` (same configuration flow; set model type to "Text embedding", see [Embedding & RAG](/docs/embedding)).
- **Billing**: usage generated by Dify apps is charged to your StarWhisper token. With many users the quota drains fast — keep an eye on the usage stats in the console (billing details in the [Appendix](/docs/faq)).
- **When giving it to students**: the published app link is hosted by Dify, and students never need a StarWhisper token — the token is used only once when you configure the provider. Do not leak it.

---

Related docs: [Quickstart](/docs/quickstart) · [WorkBuddy Integration](/docs/workbuddy) · [First API Call](/docs/first-call) · [Billing & FAQ](/docs/faq)
