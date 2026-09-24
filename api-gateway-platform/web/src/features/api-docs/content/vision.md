# 多模态视觉理解（VL）

> 数据：2026-09-23 实测。视觉理解 = 模型能"看懂"图片内容并回答问题。

## 支持模型

| 模型 | 能力 |
|---|---|
| **Qwen3-VL-30B-A3B-Instruct** | 图像理解：描述、问答、OCR、图表读数、截图转文字 |

调用端点仍为 `/v1/chat/completions`，`messages` 的 content 从字符串改为数组，图片以 base64 或 URL 传入。

## 调用样例（实测通过）

```bash
# 准备图片 base64（本地文件转）
B64=$(base64 -i your_image.png)

curl https://ai-platform.sptc.edu.cn/v1/chat/completions -k \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "Qwen3-VL-30B-A3B-Instruct",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "这张图片是什么颜色？"},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,'"$B64"'"}}
      ]
    }],
    "max_tokens": 200
  }'
```

实测：红色图片提问"什么颜色"→ 回复「红色」✅

## Python 样例

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
            {"type": "text", "text": "描述这张图片"},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
        ],
    }],
    max_tokens=500,
)
print(resp.choices[0].message.content)
```

## 教学场景建议

- **OCR / 截图转文字**：板书、作业照片、试卷图片直接提问
- **图表读数**：实验数据图表截图问"峰值是多少"
- **代码截图**：报错截图直接问怎么修
- 图片过大时先压缩（建议 < 2MB），否则 base64 编码后请求体膨胀，容易触发 413

## 已知限制

- 每次请求建议 1~3 张图，图片过多会明显变慢
- 上下文 128K（图片会消耗 token，约每张 0.1~1K+ token 视分辨率而定）
- 图像**生成**是另一个模型（FLUX.2-klein-4B），见附录模型总览

---

上一页：[02-5 流式输出](02-5-流式输出.md) ｜ 下一页：[02-7 语音能力](02-7-语音能力.md)
