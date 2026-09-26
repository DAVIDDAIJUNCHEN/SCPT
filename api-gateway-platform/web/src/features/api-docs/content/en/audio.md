# Audio (TTS / ASR / Audio Understanding)

> Data verified and compiled 2026-09-26. The audio trio: synthesis (TTS), recognition (ASR), and audio understanding.

## Models and Endpoints

| Capability | Model | Endpoint | Notes |
|---|---|---|---|
| Speech synthesis | **cosyvoice-v3** | `POST /v1/audio/speech` | Text → speech (wav) |
| Speech recognition | **Qwen3-ASR-1.7B** | `POST /v1/audio/transcriptions` | Audio → text |
| Audio understanding | **Qwen2-Audio-7B-Instruct** | `POST /v1/chat/completions` | Q&A over audio content |
| Document parsing | **MinerU2.5-2509-1.2B** | `POST /v1/chat/completions` | Integration in progress, currently unstable (see below) |

## TTS Speech Synthesis (cosyvoice-v3)

```bash
curl https://ai-platform.sptc.edu.cn/v1/audio/speech -k \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "cosyvoice-v3",
    "input": "Hello, welcome to StarWhisper",
    "voice": "5a4ff23e588f"
  }' \
  --output output.wav
```

**Key point**: `voice` must be a voice ID (a voice identifier), not a name.

### Public Voice Library (launched 2026-09-26, 8 voices)

The voice list can be fetched directly from the API (no token required):

```bash
curl -k https://ai-platform.sptc.edu.cn/v1/audio/voices
```

| voice ID | Voice |
|---|---|
| `9c3ca98d75b2` | Daijun (calm male) |
| `5a4ff23e588f` | Tingting (standard female) |
| `8a5c746b6944` | Sunny Boy |
| `ef71ecb5bc9e` | Gentle Lady |
| `064af56f6a74` | Lively Boy |
| `a28b196a096a` | Calm Male |
| `59f513d7a264` | Sweet Female |
| `4ef11cc62e48` | Steady Elder |

On the web chat (ai-chat.sptc.edu.cn), these voices can be selected directly from the voice dropdown in audio settings. **Personal voice cloning** is under construction; usage instructions will be added here once it launches.

```python
from openai import OpenAI

client = OpenAI(api_key="YOUR_API_KEY", base_url="https://ai-platform.sptc.edu.cn/v1")

resp = client.audio.speech.create(
    model="cosyvoice-v3",
    voice="5a4ff23e588f",  # voice ID, e.g. Tingting (standard female); full list above
    input="Hello, welcome to StarWhisper",
)
resp.write_to_file("output.wav")
```

## ASR Speech Recognition (Qwen3-ASR-1.7B)

```bash
curl https://ai-platform.sptc.edu.cn/v1/audio/transcriptions -k \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -F "model=Qwen3-ASR-1.7B" \
  -F "file=@audio.wav"
```

Multipart file upload — the audio file attaches directly to the `file` field. Great for lecture-recording transcription and voice homework review.

## Audio Understanding (Qwen2-Audio-7B-Instruct)

Mixed audio + text questions (e.g. "what are the people in this audio discussing"); the `content` array format is the same as [VL vision](/docs/vision), with `type` set to `input_audio`. Suited to Q&A about audio content rather than pure transcription.

## Document Parsing (MinerU2.5)

> **Status disclosure** [verified 2026-09-24]: MinerU integration is still in progress; calling image/document parsing through the gateway currently **returns unstable results** — not yet recommended for course scenarios.

Current alternatives:

| Need | Recommended alternative |
|---|---|
| Text extraction from images (whiteboard/homework photos) | **Qwen3-VL** ([vision](/docs/vision); OCR verified stable) |
| Long PDF reading | Copy the text out and use **DS-V4.1-Flash** (1M long context) |

Complete usage examples will be added here once MinerU integration is finalized; contact the AI Computing Center for progress.

## Scenario Pairing Suggestions

| Scenario | Recommended combo |
|---|---|
| Courseware narration | TTS (cosyvoice-v3) |
| Lecture recording minutes | ASR (Qwen3-ASR) → LLM summary (DS-V4.1-Flash 1M long context) |
| English listening/speaking practice | ASR on student speech + LLM scoring feedback + TTS model reading |
| Batch exam/homework photo processing | VL (Qwen3-VL, OCR verified stable) |
