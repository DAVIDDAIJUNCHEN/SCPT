# 多模态：视觉理解（VL）与图像生成

> 数据：2026-09-24 实测。视觉理解 = 模型能"看懂"图片内容并回答问题；图像生成 = 按文字描述画图。

## 支持模型

| 模型 | 能力 | 端点 |
|---|---|---|
| **Qwen3-VL-30B-A3B-Instruct** | 图像理解：描述、问答、OCR、图表读数、截图转文字 | `/v1/chat/completions` |
| **Qwen-Image-2.1** | 图像生成：文生图，质量最佳，支持中英文提示词 | `/v1/images/generations` |
| **FLUX.2-klein-4B** | 图像生成：文生图，速度最快 | `/v1/images/generations` |

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

---

# 图像生成（Qwen-Image-2.1）

> 文字描述 → 图片。default 分组可用。2026-09-25 上线，提示词支持中英文。

## 调用样例（实测通过）

```bash
curl https://ai-platform.sptc.edu.cn/v1/images/generations -k \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "qwen-image-2.1",
    "prompt": "一只水豚在烛光下读书",
    "generator_device": "cpu",
    "output_format": "png",
    "response_format": "b64_json"
  }'
```

返回结构（返回的是 **base64 编码的图片**，非 URL）：

```json
{
  "created": 1790327419,
  "data": [{
    "b64_json": "iVBORw0KGgo...",
    "prompt_filter_results": []
  }]
}
```

解码保存为图片：

```bash
# Mac/Linux：把返回 JSON 里的 b64_json 字段存为图片
python3 -c "import json,base64; open('out.png','wb').write(base64.b64decode(json.load(open('resp.json'))['data'][0]['b64_json']))"
```

实测：`a cute capybara reading a book by candlelight` → 23 秒返回 1024×1024 PNG ✅（2026-09-25 经星语网关验证）

## 参数与限制（实测边界）

| 参数 | 实测结论 |
|---|---|
| `size` | 支持 `512x512` / `1024x1024` / `1664x928`（宽幅）等，未发现 FLUX 那种 1024 上限 |
| `generator_device` | **必须传 `"cpu"`**（噪声生成器放 CPU），缺省会报错 |
| `output_format` | 🔴 **必须显式传 `"png"` 或 `"webp"`**：缺省值按 `jpeg` 处理，当前服务端 jpeg 编码路径异常，不传此参数会返回 500 Internal Server Error（2026-09-25 实测定位） |
| `response_format` | `b64_json`（返回 base64）；不传时默认 url 模式 |
| `n`（每次张数） | 固定每次 1 张 |
| 生成速度 | 512: ~6 秒；1024: ~21 秒；1664 宽幅: ~33 秒（H20 实测） |
| 计费 | 按张计费（与 FLUX 同价），价格见[模型与价格](02-1-模型与价格.md) |

> ⚠️ **常见报错排查**：调用返回 `500 Internal Server Error`（约 5 秒后失败）→ 九成是漏传 `output_format`。补上 `"output_format": "png"` 即可。`generator_device` 传 `"cuda"` 也可用（2026-09-25 实测 png+cuda 正常），但推荐按官方 cookbook 用 `cpu`。

## 与 FLUX.2 怎么选

| 维度 | Qwen-Image-2.1 | FLUX.2-klein-4B |
|---|---|---|
| 中文提示词 | ✅ 原生优化 | 一般 |
| 图像质量/构图 | 更强（DiT 7B + Qwen3-VL 8B 编码器） | 轻量级 |
| 最大分辨率 | 1664 宽幅实测通过 | 上限 768 |
| 速度 | 6~33 秒/张 | 3~5 秒/张 |
| 返回格式 | base64 | URL 下载 |

## 教学场景建议（Qwen-Image-2.1）

- **中文提示词课程**：直接用中文描述生成，门槛低于 FLUX
- **设计基础**：更高分辨率 + 更好构图，适合海报/插画类作业
- **AIGC 通识课**：与 FLUX 对比讲「模型规模 vs 速度」的取舍
