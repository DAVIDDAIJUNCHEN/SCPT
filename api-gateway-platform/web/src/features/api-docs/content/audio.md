# 语音能力（TTS / ASR / 音频理解）

> 数据：2026-09-23 实测整理。语音三件套：合成（TTS）、识别（ASR）、音频理解（Audio）。

## 模型与端点

| 能力 | 模型 | 端点 | 说明 |
|---|---|---|---|
| 语音合成 | **cosyvoice-v3** | `POST /v1/audio/speech` | 文本→语音（wav） |
| 语音识别 | **Qwen3-ASR-1.7B** | `POST /v1/audio/transcriptions` | 音频→文本 |
| 音频理解 | **Qwen2-Audio-7B-Instruct** | `POST /v1/chat/completions` | 可对音频内容问答 |
| 文档解析 | **MinerU2.5-2509-1.2B** | `POST /v1/chat/completions` | PDF/图片→结构化 Markdown |

## TTS 语音合成（cosyvoice-v3）

```bash
curl https://ai-platform.sptc.edu.cn/v1/audio/speech -k \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "cosyvoice-v3",
    "input": "你好，欢迎使用川邮星语",
    "voice": "VOICE_ID"
  }' \
  --output output.wav
```

**要点**：`voice` 必须用 voice ID（音色编号），不能用名称。平台音色库正在建设中（将提供公共音色与声音克隆能力），当前可用 voice ID 请联系**智算中心**获取。

```python
from openai import OpenAI

client = OpenAI(api_key="YOUR_API_KEY", base_url="https://ai-platform.sptc.edu.cn/v1")

resp = client.audio.speech.create(
    model="cosyvoice-v3",
    voice="VOICE_ID",  # voice ID，向智算中心获取
    input="你好，欢迎使用川邮星语",
)
resp.write_to_file("output.wav")
```

## ASR 语音识别（Qwen3-ASR-1.7B）

```bash
curl https://ai-platform.sptc.edu.cn/v1/audio/transcriptions -k \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -F "model=Qwen3-ASR-1.7B" \
  -F "file=@audio.wav"
```

multipart 文件上传，音频文件直接附在 `file` 字段。适合课堂录音转文字、语音作业批改。

## 音频理解（Qwen2-Audio-7B-Instruct）

音频+文字混合提问（如"这段音频里的人在讨论什么"），content 数组格式同 [VL 视觉理解](02-6-多模态视觉理解.md)，`type` 用 `input_audio`。适合音频内容问答而非纯转写。

## 文档解析（MinerU2.5）

PDF / 扫描件 → 结构化 Markdown，返回字段 `md_content`。适合课件 PDF 转可检索文本。注意：MinerU 与 LLM 协议不同，调用方式以平台文档页为准（本页仅列清单，不做详细样例）。

## 场景搭配建议

| 场景 | 推荐组合 |
|---|---|
| 课件配音 | TTS（cosyvoice-v3） |
| 课堂录音纪要 | ASR（Qwen3-ASR）→ LLM 总结（DS-V4.1-Flash 1M 长文） |
| 英语听说训练 | ASR 识别学生语音 + LLM 评分反馈 + TTS 示范朗读 |
| 试卷/作业照片批量处理 | VL（Qwen3-VL）或 MinerU 文档解析 |

---

上一页：[02-6 多模态视觉理解](02-6-多模态视觉理解.md) ｜ 下一页：[02-8 Embedding 与 RAG](02-8-Embedding与RAG.md)
