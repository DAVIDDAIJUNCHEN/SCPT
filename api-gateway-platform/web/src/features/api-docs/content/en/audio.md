# Audio (TTS / ASR / Audio Understanding)

> Data verified and compiled 2026-09-23. The audio trio: synthesis (TTS), recognition (ASR), and audio understanding.

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
    "input": "Hello, welcome to SCPT XingYu",
    "voice": "VOICE_ID"
  }' \
  --output output.wav
```

**Key point**: `voice` must be a voice ID (a voice identifier), not a name. The platform voice library is under construction (public voices and voice cloning will be provided); for currently available voice IDs, contact the **AI Computing Center**.

```python
from openai import OpenAI

client = OpenAI(api_key="YOUR_API_KEY", base_url="https://ai-platform.sptc.edu.cn/v1")

resp = client.audio.speech.create(
    model="cosyvoice-v3",
    voice="VOICE_ID",  # voice ID, obtain from the AI Computing Center
    input="Hello, welcome to SCPT XingYu",
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
