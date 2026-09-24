# Multimodal — Vision (VL) and Image Generation

> Data verified 2026-09-24. Vision = the model can "see" and answer questions about image content; image generation = drawing from a text description.

## Supported Models

| Model | Capability | Endpoint |
|---|---|---|
| **Qwen3-VL-30B-A3B-Instruct** | Image understanding: description, Q&A, OCR, chart reading, screenshot-to-text | `/v1/chat/completions` |
| **FLUX.2-klein-4B** | Image generation: text-to-image | `/v1/images/generations` |

## Usage Example (tested working)

```bash
# Prepare the image base64 (encode a local file)
B64=$(base64 -i your_image.png)

curl https://ai-platform.sptc.edu.cn/v1/chat/completions -k \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "Qwen3-VL-30B-A3B-Instruct",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "What color is this image?"},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,'"$B64"'"}}
      ]
    }],
    "max_tokens": 200
  }'
```

Tested: asked "what color" about a red image → answered "red" ✅

## Python Example

```python
import base64
from openai import OpenAI

client = OpenAI(api_key="YOUR_API_KEY", base_url="https://ai-platform.sptc.edu.cn/v1")

with open("your_image.png", "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

resp = client.chat.completions.create(
    model="Qwen3-VL-30B-A3B-Instruct",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "Describe this image"},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
        ],
    }],
    max_tokens=500,
)
print(resp.choices[0].message.content)
```

## Classroom Suggestions

- **OCR / screenshot-to-text**: photograph whiteboards, homework, or exam papers and ask directly
- **Chart reading**: screenshot an experiment data chart and ask "what is the peak value"
- **Code screenshots**: paste a screenshot of an error and ask how to fix it
- Compress oversized images first (recommend < 2MB) — otherwise base64 inflates the request body and 413 becomes likely

## Known Limitations (vision)

- 1–3 images per request recommended; more images slow things down noticeably
- 128K context (images consume tokens, roughly 0.1–1K+ tokens per image depending on resolution)

---

# Image Generation (FLUX.2-klein-4B)

> Text description → image. Available to the default group.

## Usage Example (tested working)

```bash
curl https://ai-platform.sptc.edu.cn/v1/images/generations -k \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "FLUX.2-klein-4B",
    "prompt": "a red circle on white background",
    "size": "768x768"
  }'
```

Response structure (returns a **download URL**, not base64):

```json
{
  "data": [{
    "url": "https://ai-platform.sptc.edu.cn/v1/images/<id>/content?access=...",
    "revised_prompt": "a red circle on white background"
  }],
  "inference_time_s": 3.4
}
```

Download the image:

```bash
# Mac/Linux
curl -k -o result.jpg "the returned url"

# Windows plaintext port (no certificate needed)
curl -o result.jpg "http://ai-platform.sptc.edu.cn:3080/v1/images/<id>/content?access=..."
```

Tested: `a red circle` → 512x512 JPEG returned in 3.4 seconds ✅ (both 443 with certificate and 3080 plaintext download verified)

## Parameters and Limits (tested boundaries)

| Parameter | Tested conclusion |
|---|---|
| `size` | Only `512x512` / `768x768` supported; `1024x1024` and above return 500 |
| `n` (images per call) | `n>1` unsupported — always 1 image per call |
| Generation speed | 3–5 seconds per image |
| Billing | Per image; see [Models & Pricing](/docs/models) |

## Classroom Suggestions (image generation)

- **Courseware assets**: quickly generate diagrams, illustrations, icon sketches
- **Art/design classes**: prompt engineering practice — same theme, different descriptions, compare the outputs
- **Creative writing aid**: generate illustration inspiration for writing classes
