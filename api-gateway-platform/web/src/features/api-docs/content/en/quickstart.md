# StarWhisper AI Platform · Quick Start

> For: all registered users (no technical background required)
> Updated: 2026-09-23 (model names follow what the platform actually displays)

---

## 1. Two Entrances, That's All You Need

| What you want to do | Open this URL |
|---|---|
| **Chat with AI directly** (most common) | https://ai-chat.sptc.edu.cn |
| **Manage your account / create API tokens** | https://ai-platform.sptc.edu.cn |

Both URLs share **the same account** (registered phone number + password/verification code); log in once and they work everywhere.

> 📱 **Mobile note**: the URLs above work in mobile browsers too. The first-time certificate trust step is the same as on desktop (see below). A dedicated mobile tutorial is not available yet; if you hit usability issues, please report them to the AI Computing Center.

---

## 2. First Use: 3 Steps

**Step 1 · Dismiss the "Your connection is not private" warning (once only)**

When you open the URL on the campus network, the browser may warn "Your connection is not private" — the platform uses a security certificate self-issued by the college (data never leaves campus). Click:

- **Chrome**: Advanced → Proceed to ai-chat.sptc.edu.cn (unsafe)
- **Edge**: Details → Go on to the webpage (not recommended)

This is needed **once per device, per browser**.

**Step 2 · Register an account**

Open https://ai-platform.sptc.edu.cn → Register → enter your phone number → type the SMS verification code → set a password → done.

**Step 3 · Start chatting**

Open https://ai-chat.sptc.edu.cn → log in → pick a model at the top → type in the input box and send. It's that simple.

---

## 3. Choosing a Model (Beginner's Edition)

| What you want to do | Pick this model |
|---|---|
| Everyday Q&A, writing, translation (default) | DeepSeek-V4.1-Flash |
| Stronger reasoning, coding, deep analysis | GLM-5.3 (requires the vip group — contact the AI Computing Center; Qwen3.8-Flash-Next also handles everyday reasoning well) |
| Image understanding (photo Q&A, reading charts) | Qwen3-VL |
| Voice-related features | Use the platform's feature entrances |

> Want to read a super-long document in one go (up to ~1 million characters)? Pick DeepSeek-V4.1-Flash and upload the document — the first reply to a very long document takes a few minutes, which is normal.

---

## 4. Running into Problems?

| Symptom | Cause | What to do |
|---|---|---|
| "Your connection is not private" | Certificate not trusted yet on first use | See Step 1 in "2. First Use" above |
| "Try again later" / queuing | Many users at peak hours | Wait 1–2 minutes and retry; **no data is lost** |
| A model shows as unavailable | Some high-performance models are limited to specific user groups | Switch to DeepSeek-V4.1-Flash |
| Page won't open | You are not on the campus network | Off-campus users need the college VPN |

**Feedback channel**: School of Information Engineering (AI Computing Center).

---

## 5. Want to Go Further?

Full documentation lives on the platform docs site: **https://ai-platform.sptc.edu.cn/docs** (or via "Docs" in the platform footer), covering:

- A more powerful AI workbench on your computer → "Client Integration · WorkBuddy"
- Calling AI from code (Python/curl) → "Developer Guide · First API Call"
- Building your own course agents → "Client Integration · Dify"
