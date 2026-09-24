# 多模态：视觉理解（VL）与图像生成

> 数据：2026-09-24 实测。视觉理解 = 模型能"看懂"图片内容并回答问题；图像生成 = 按文字描述画图。

## 支持模型

| 模型 | 能力 | 端点 |
|---|---|---|
| **Qwen3-VL-30B-A3B-Instruct** | 图像理解：描述、问答、OCR、图表读数、截图转文字 | `/v1/chat/completions` |
| **FLUX.2-klein-4B** | 图像生成：文生图 | `/v1/images/generations` |

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

## 已知限制（视觉理解）

- 每次请求建议 1~3 张图，图片过多会明显变慢
- 上下文 128K（图片会消耗 token，约每张 0.1~1K+ token 视分辨率而定）

---

# 图像生成（FLUX.2-klein-4B）

> 文字描述 → 图片。default 分组可用。

## 调用样例（实测通过）

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

返回结构（返回的是**图片下载 URL**，非 base64）：

```json
{
  "data": [{
    "url": "https://ai-platform.sptc.edu.cn/v1/images/<id>/content?access=...",
    "revised_prompt": "a red circle on white background"
  }],
  "inference_time_s": 3.4
}
```

下载图片：

```bash
# Mac/Linux
curl -k -o result.jpg "返回的url"

# Windows 明文端口（免证书）
curl -o result.jpg "http://ai-platform.sptc.edu.cn:3080/v1/images/<id>/content?access=..."
```

实测：`a red circle` → 3.4 秒返回 512x512 JPEG ✅（443 带证书 / 3080 明文端口下载均验证通过）

## 参数与限制（实测边界）

| 参数 | 实测结论 |
|---|---|
| `size` | 仅支持 `512x512` / `768x768`；`1024x1024` 及以上返回 500 |
| `n`（每次张数） | 不支持 `n>1`，固定每次 1 张 |
| 生成速度 | 3~5 秒/张 |
| 计费 | 按张计费，价格见[模型与价格](02-1-模型与价格.md) |

## 教学场景建议（图像生成）

- **课件素材**：快速生成示意图、配图、图标草图
- **美术/设计课**：prompt 工程练习——同一主题不同描述对比生成效果
- **辅助创作**：给写作课生成插图灵感
