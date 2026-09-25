# Multimodal — Vision (VL) and Image Generation

> Data verified 2026-09-24. Vision = the model can "see" and answer questions about image content; image generation = drawing from a text description.

## Supported Models

| Model | Capability | Endpoint |
|---|---|---|
| **Qwen3-VL-30B-A3B-Instruct** | Image understanding: description, Q&A, OCR, chart reading, screenshot-to-text | `/v1/chat/completions` |
| **Qwen-Image-2.1** | Image generation: text-to-image, best quality, bilingual (CN/EN) prompts | `/v1/images/generations` |
| **FLUX.2-klein-4B** | Image generation: text-to-image, fastest | `/v1/images/generations` |

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

---

# Image Generation (Qwen-Image-2.1)

> Text description → image. Available to the default group. Launched 2026-09-25; prompts support both Chinese and English.

## Usage Example (tested working)

```bash
curl https://ai-platform.sptc.edu.cn/v1/images/generations -k \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "qwen-image-2.1",
    "prompt": "a cute capybara reading a book by candlelight",
    "generator_device": "cpu",
    "output_format": "png",
    "response_format": "b64_json"
  }'
```

Response structure (returns a **base64-encoded image**, not a URL):

```json
{
  "created": 1790327419,
  "data": [{
    "b64_json": "iVBORw0KGgo...",
    "prompt_filter_results": []
  }]
}
```

Decode and save the image:

```bash
python3 -c "import json,base64; open('out.png','wb').write(base64.b64decode(json.load(open('resp.json'))['data'][0]['b64_json']))"
```

Tested: `a cute capybara reading a book by candlelight` → 1024×1024 PNG returned in 23 seconds ✅ (verified through the StarWhisper gateway, 2026-09-25)

## Parameters and Limits (tested boundaries)

| Parameter | Tested conclusion |
|---|---|
| `size` | Supports `512x512` / `1024x1024` / `1664x928` (wide) and more — no FLUX-style 1024 cap observed |
| `generator_device` | **Must be `"cpu"`** (noise generator runs on CPU); omitting it causes an error |
| `output_format` | 🔴 **Must be explicitly `"png"` or `"webp"`**: the default is treated as `jpeg`, whose server-side encoding path is currently broken — omitting this parameter returns 500 Internal Server Error (isolated and verified 2026-09-25) |
| `response_format` | `b64_json` (returns base64); defaults to url mode when omitted |
| `n` (images per call) | Always 1 image per call |
| Generation speed | 512: ~6 s; 1024: ~21 s; 1664 wide: ~33 s (H20 measured) |
| Billing | Per image (same price as FLUX); see [Models & Pricing](/docs/models) |

> ⚠️ **Troubleshooting**: a `500 Internal Server Error` (failing after ~5 s) is almost always a missing `output_format`. Add `"output_format": "png"` and retry. `generator_device: "cuda"` also works with png (verified 2026-09-25), but `cpu` is recommended per the official cookbook.

## Choosing Between Qwen-Image-2.1 and FLUX.2

| Dimension | Qwen-Image-2.1 | FLUX.2-klein-4B |
|---|---|---|
| Chinese prompts | ✅ natively optimized | mediocre |
| Image quality / composition | Stronger (DiT 7B + Qwen3-VL 8B encoder) | lightweight |
| Max resolution | 1664 wide verified | capped at 768 |
| Speed | 6–33 s per image | 3–5 s per image |
| Response format | base64 | download URL |

## Classroom Suggestions (Qwen-Image-2.1)

- **Chinese prompt courses**: generate directly from Chinese descriptions — lower barrier than FLUX
- **Design fundamentals**: higher resolution + better composition, suitable for poster/illustration assignments
- **AIGC intro courses**: compare with FLUX to teach the "model scale vs. speed" trade-off
