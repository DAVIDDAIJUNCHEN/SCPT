# WorkBuddy Client Setup Guide

> For: users who want to use StarWhisper LLMs in a desktop client (instead of the web app).
> After reading you can: chat with all 5 StarWhisper models in WorkBuddy, including million-character document processing.
> Data and UI verified: 2026-09-24 (Windows zero-certificate path and full macOS path both tested).

---

## Quick Entry (pick your platform)

| Your computer | Jump to | Configuration | Time |
|---|---|---|---|
| <img src="/brands/microsoft.svg" alt="Windows" width="16" height="16" style="vertical-align:-2px" /> **Windows** | → [Section 3 · Windows Setup](#3.-windows-zero-certificate-setup) | **Zero certificate**, 3 steps | ~5 minutes |
| <img src="/brands/apple.svg" alt="macOS" width="16" height="16" style="vertical-align:-2px" /> **macOS** | → [Section 4 · macOS Setup](#4.-macos-full-setup) | One-time certificate setup, 4 steps | ~10 minutes |

> Both platforms end up with identical capabilities; the only difference is network access (Windows uses the plaintext port 3080 with no certificate; macOS uses HTTPS and needs a one-time certificate install).

## 1. What Is WorkBuddy, and How It Differs from the Web App

| | StarWhisper Chat web (ai-chat.sptc.edu.cn) | WorkBuddy client |
|---|---|---|
| Barrier to entry | Browser, zero setup | Client install; zero config on Windows, one-time certificate setup on macOS (~10 min) |
| Model capability | All platform models | Same, all models |
| Distinctive features | Simple, works out of the box | **Direct reference to local workspace files**, long-running tasks, engineering-grade code/document operations |
| Best for | Occasional Q&A, phones/public computers | Daily heavy use, processing local documents |

**Bottom line**: occasional use → the web app is enough (see [Quick Start](/docs/quickstart)); daily use with local files → worth setting up WorkBuddy once.

## 2. Prerequisites (all required)

1. **Campus network**: WorkBuddy talks to `ai-platform.sptc.edu.cn`, currently reachable on campus only (off-campus access not yet available; will be announced when it opens).
2. **WorkBuddy installed**: both Windows and macOS flows are covered (UI details may vary by version).
3. **StarWhisper account + API token**: log in at `https://ai-platform.sptc.edu.cn` → console → "API Tokens" → create a token, **copy and save it** (looks like `sk-xxxxxxxx`, shown only once).

## 3. Windows Zero-Certificate Setup

> **Windows does not need a certificate.** The platform opens a dedicated plaintext port 3080 for the API — zero certificate configuration throughout. This is the biggest difference from the macOS path.

### Step 1: Get a token

Follow item 3 of Section 2: log in at `https://ai-platform.sptc.edu.cn` → console → "API Tokens" → create and save the token.

### Step 2: Configure models (URLs use the plaintext port 3080)

Add them in WorkBuddy **Settings → Model Configuration** (custom models), or edit `%USERPROFILE%\.workbuddy\models.json` directly and restart the client.

**Copy-paste template** (replace every `sk-xxxxxxxx` with your token, save as `%USERPROFILE%\.workbuddy\models.json`):

```json
[
  {
    "id": "DeepSeek-V4.1-Flash",
    "name": "DeepSeek-V4.1-Flash",
    "vendor": "Custom",
    "url": "http://ai-platform.sptc.edu.cn:3080/v1/chat/completions",
    "apiKey": "sk-xxxxxxxx",
    "supportsToolCall": true,
    "supportsImages": true,
    "supportsReasoning": true,
    "useCustomProtocol": false,
    "maxInputTokens": 1048576,
    "maxOutputTokens": 65536
  },
  {
    "id": "GLM-5.3-Flash",
    "name": "GLM-5.3-Flash",
    "vendor": "Custom",
    "url": "http://ai-platform.sptc.edu.cn:3080/v1/chat/completions",
    "apiKey": "sk-xxxxxxxx",
    "supportsToolCall": true,
    "supportsImages": true,
    "supportsReasoning": true,
    "useCustomProtocol": false,
    "onlyReasoning": false,
    "maxInputTokens": 1048576,
    "maxOutputTokens": 65536,
    "reasoning": {
      "defaultEffort": "low",
      "supportedEfforts": ["low", "medium", "high"],
      "canDisableThinking": true
    }
  },
  {
    "id": "Qwen3.8-Flash-Next",
    "name": "Qwen3.8-Flash-Next",
    "vendor": "Custom",
    "url": "http://ai-platform.sptc.edu.cn:3080/v1/chat/completions",
    "apiKey": "sk-xxxxxxxx",
    "supportsToolCall": true,
    "supportsImages": true,
    "supportsReasoning": true,
    "useCustomProtocol": false,
    "onlyReasoning": false,
    "maxInputTokens": 1048576,
    "maxOutputTokens": 65536,
    "reasoning": {
      "defaultEffort": "low",
      "supportedEfforts": ["low", "medium", "high"],
      "canDisableThinking": true
    }
  },
  {
    "id": "DeepSeek-V4-Flash-0731",
    "name": "DeepSeek-V4-Flash-0731",
    "vendor": "Custom",
    "url": "http://ai-platform.sptc.edu.cn:3080/v1/chat/completions",
    "apiKey": "sk-xxxxxxxx",
    "supportsToolCall": true,
    "supportsImages": false,
    "supportsReasoning": false,
    "useCustomProtocol": false,
    "maxInputTokens": 1048576,
    "maxOutputTokens": 65536
  },
  {
    "id": "GLM-5.3",
    "name": "GLM-5.3",
    "vendor": "Custom",
    "url": "http://ai-platform.sptc.edu.cn:3080/v1/chat/completions",
    "apiKey": "sk-xxxxxxxx",
    "supportsToolCall": true,
    "supportsImages": false,
    "supportsReasoning": true,
    "useCustomProtocol": false,
    "onlyReasoning": false,
    "maxInputTokens": 131072,
    "maxOutputTokens": 32768,
    "reasoning": {
      "defaultEffort": "high",
      "supportedEfforts": ["low", "high", "max"],
      "canDisableThinking": false
    }
  }
]
```

**Template notes (verified on real hardware 2026-09-24)**:

| Model | Context | Highlights | Visible to |
|---|---|---|---|
| DeepSeek-V4.1-Flash | 1M | Default workhorse — fast, best all-round | default (on registration) |
| GLM-5.3-Flash | 1M | Lightweight and fast, currently **50% off** | default (on registration) |
| Qwen3.8-Flash-Next | 1M | Long-document alternative, largest output cap (64K) | default (on registration) |
| DeepSeek-V4-Flash-0731 | 1M | Previous DeepSeek generation, backup (also 64K output) | default (on registration) |
| GLM-5.3 | 128K | **Deep-thinking specialist** (vip exclusive; default tokens get 503) | vip group required |

**GLM-5.3 note**: registered accounts belong to the **default group** by default and have no access to this model — configuring it won't work (503; group policy, not a malfunction). If you truly need deep thinking, contact the **AI Computing Center** for the **vip group**.

### Step 3: Restart WorkBuddy and verify

Fully quit and reopen → new conversation → pick DeepSeek-V4.1-Flash → send "hello" → a normal reply means success.

### Why Windows needs no certificate (one-sentence rationale)

WorkBuddy's network stack doesn't read the Windows certificate store, and self-signed HTTPS certificates are even more awkward on Windows than on Mac (paths change between versions, upgrades wipe them). The platform's answer: a dedicated plaintext port 3080 for the API — the browser still uses encrypted 443, API calls use 3080, and the client needs zero configuration.

### Windows FAQ

| Symptom | Cause | Fix |
|---|---|---|
| Can't connect / timeout | Not on campus network, or URL mistakenly written as `https://` | Confirm campus network; verify the URL is `http://...:3080/...` |
| 401 | Wrong token | Verify the token in the console |
| 503 | Model queue full or unauthorized (e.g. GLM-5.3) | See the GLM-5.3 note in Section 3 |
| 404 on `http://...:3080/` root path | Normal — 3080 serves the API only, no web pages | Call the API under `/v1` |

## 4. macOS Full Setup

> One-sentence rationale: StarWhisper uses a college self-signed certificate; the macOS browser trusting it ≠ WorkBuddy trusting it — WorkBuddy's network stack doesn't read the system keychain, so the certificate must be placed into its own directory. **Configure once, effective forever** (after client upgrades, redo Step 2 — it's a single command).

### Step 1: Download the gateway certificate

Certificate file `scpt-gateway.crt`: **[download here](/scpt-gateway.crt)** (right-click → save as; valid until December 2028), then put it somewhere like `~/Downloads/`.

Optionally verify the certificate (recommended):

```bash
openssl x509 -in ~/Downloads/scpt-gateway.crt -noout -subject -enddate
# You should see subject=CN=ai.sptc.edu.cn, valid until December 2028
```

### Step 2: Install the certificate into WorkBuddy (the decisive step)

Open Terminal and run:

```bash
cp ~/Downloads/scpt-gateway.crt \
   "/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/ca.pem"
```

(If WorkBuddy is installed elsewhere, replace `/Applications/` with the actual path.)

### Step 3: Configure custom models (all 5)

The model template is **identical to Windows Step 2 in Section 3** (copy all 5 models as-is); the **only difference** is every URL field switches to the HTTPS encrypted entrance (no port 3080):

```json
"url": "https://ai-platform.sptc.edu.cn/v1/chat/completions"
```

That is, replace `http://ai-platform.sptc.edu.cn:3080/v1/...` in the Windows template with `https://ai-platform.sptc.edu.cn/v1/...` — all 5. Model notes and the GLM-5.3 vip-group caveats are in Section 3's template table.

How to configure: add them one by one in the client's **Settings → Model Configuration** (custom models), or edit `~/.workbuddy/models.json` directly and restart.

### Step 4: Restart WorkBuddy and verify

**Must fully quit and reopen** (the certificate is read at startup; editing the file without restarting does nothing). Verify: new conversation → pick DeepSeek-V4.1-Flash → send "hello" → a normal reply means success.

## 5. Troubleshooting Table (ordered by hit rate)

| Symptom | Cause | Fix |
|---|---|---|
| **502 / "secure connection failed"** (Mac only) | Certificate not installed properly — **the most frequent issue**. Note: curl/browser working while the client fails is precisely a certificate-trust problem (the client ignores the system keychain) | Redo the cp command in Section 4 Step 2 → fully restart the client; **Windows users: just use the Section 3 port-3080 zero-certificate path — no such issue** |
| **502 again after upgrading WorkBuddy** (Mac only) | The upgrade wiped ca.pem | Rerun the cp command from Section 4 Step 2 (fixed action, 10 seconds) |
| **503 (payload contains `no available channel` / `model_not_found`)** | ① The model's queue is full, retry later; ② An unauthorized model was used (e.g. default token calling GLM-5.3) | ① Wait 1–2 minutes or switch models; ② Contact the AI Computing Center for vip group access |
| **429** | Requests too frequent (e.g. a script looping) | Lower the call rate; add backoff retries |
| **401 / 403** | Wrong or disabled token | Verify token status in the console; recreate if needed |
| Web works, WorkBuddy doesn't | Mac: certificate trust issue (same as 502); Windows: URL typo (extra `s` or missing `:3080`) | Mac → see the 502 row; Windows → verify the Section 3 URL |
| Broken on a different computer | The new machine lacks the platform-specific setup | Redo Section 3 (Windows) or Section 4 (macOS) |

**Three-command self-diagnosis** (for technical users):

```bash
# ① Is the domain itself reachable (via the system trust chain)
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://ai-platform.sptc.edu.cn/v1/models
# ② The client's real error (not shown in the GUI, only in logs)
grep -a "ACP Agent" ~/.workbuddy/logs/$(date +%F)/*.log | tail -5
# ③ Does the certificate file exist (Mac only)
ls -la "/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/ca.pem"
```

① 200 + ② `self signed certificate` in the logs + ③ file missing = classic unconfigured certificate — redo Section 4 Step 2.

Still stuck? Contact the **AI Computing Center** with the log snippet from ②.

## 6. Advanced Tips

- **Feed local long documents**: put files into the workspace and just ask it to "read this file and summarize" — the 1M-context models can take a whole textbook (waiting time reference: ~10 s to first token for 80K characters, ~6.5 minutes for a million characters; see [1M Long Context](/docs/long-context)).
- **Depth vs length**: for "thinking deep" pick GLM-5.3 (128K, forced thinking, vip group); for "reading long" pick a 1M model. They complement each other — don't conflate expectations.
- Token leak risk: models.json is plaintext — **never share the whole file**; mask the token when sharing conversation screenshots.

---

Related docs: [Quick Start](/docs/quickstart) · [First API Call](/docs/first-call) · [Error Codes](/docs/errors) · [Billing & FAQ](/docs/faq)
