# Embedding · Rerank 与 RAG 检索管线

> 数据：2026-09-23 / 09-28 实测。**本页三件套同属 RAG 检索管线**：bge-m3 负责向量化（① 召回），Qwen3-Reranker-4B 负责精排（② 重排序），DS-V4.1-Flash 负责生成（③ 答案）。
>
> ```
> 文档切块 → [bge-m3 向量化] → 向量库 ──top-50──> [Reranker 精排] ──top-5──> [LLM 生成答案]
>              ① 召回（快、粗）              ② 精排（准、慢）        ③ 生成
> ```

## 模型

| 模型 | 角色 | 参数/维度 | 上下文 | 输入价格 |
|---|---|---|---|---|
| **bge-m3** | ① 向量召回 | 1024 维【实测】 | 8K | 0.5 元/百万 token |
| **Qwen3-Reranker-4B** | ② 精排 | 4B | 32K | 0.6 元/百万 token（对齐阿里云百炼 qwen3-rerank 官方价） |

端点：`POST /v1/embeddings`（bge-m3）· `POST /v1/rerank`（Qwen3-Reranker-4B）

---

## 一、bge-m3：把文本变成向量（Embedding）

### 调用样例（实测通过）

```bash
curl https://ai-platform.sptc.edu.cn/v1/embeddings -k \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "bge-m3",
    "input": "四川邮电职业技术学院"
  }'
```

实测返回：1024 维向量，usage 按输入 token 计费（9 token → 9 prompt_tokens）。

```python
from openai import OpenAI

client = OpenAI(api_key="YOUR_API_KEY", base_url="https://ai-platform.sptc.edu.cn/v1")

vec = client.embeddings.create(
    model="bge-m3",
    input="要向量化的文本",
).data[0].embedding  # 1024 维 list[float]
```

### 使用要点

1. **bge-m3 单条上限 8K**——超长文档先切块（建议 500~1000 字/块，重叠 100 字）
2. 问题与文档要用**同一个模型**向量化（bge-m3 ↔ bge-m3），跨模型向量不可比
3. bge-m3 同时支持稠密+稀疏检索与多语种，校园中英文混合语料可直接用
4. 相似度用余弦距离；建库时建议存原始文本+向量两列，便于回显
5. 计费按输入 token，0.5 元/百万 token，建库成本极低（百万字文档约 0.5 元）

---

## 二、Qwen3-Reranker-4B：候选精排（Rerank）

Rerank = 用模型对「问题 + 一批候选文档」逐对打相关性分并排序，精度远高于向量余弦相似度，是 RAG 二阶段精排的标准做法，可显著提升答案命中率。

### 调用样例（实测通过）

```bash
curl https://ai-platform.sptc.edu.cn/v1/rerank -k \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "Qwen3-Reranker-4B",
    "query": "四川邮电职业技术学院的地址在哪里？",
    "documents": [
      "四川邮电职业技术学院位于成都市锦江区静康路 77 号。",
      "四川大学位于成都市一环路南一段 24 号。",
      "学校的人工智能专业 2026 年开始招生。",
      "四川邮电职业技术学院前身是 1956 年创建的四川省邮电学校。"
    ],
    "top_n": 3
  }'
```

实测返回（Jina 兼容格式，按相关性降序）：

```json
{
  "results": [
    { "index": 0, "relevance_score": 0.93, "document": "四川邮电职业技术学院位于成都市锦江区静康路 77 号。" },
    { "index": 3, "relevance_score": 0.71, "document": "四川邮电职业技术学院前身是 1956 年创建的四川省邮电学校。" },
    { "index": 2, "relevance_score": 0.04, "document": "学校的人工智能专业 2026 年开始招生。" }
  ],
  "usage": { "prompt_tokens": 120, "total_tokens": 120 }
}
```

### 参数说明

| 参数 | 必填 | 说明 |
|---|---|---|
| `model` | 是 | 固定填 `Qwen3-Reranker-4B` |
| `query` | 是 | 用户问题 / 检索式 |
| `documents` | 是 | 候选文档数组（字符串），建议 ≤100 条 |
| `top_n` | 否 | 只返回前 N 个结果，默认全部返回（实测截断生效） |
| `return_documents` | 否 | 默认 true，结果内联原文；填 false 只返回 index+score，省流量 |

### 使用要点

1. **计费按输入 token**（query + 全部 documents 之和），0.6 元/百万 token——一次 50 条×200 字的重排约 1 万 token ≈ **0.006 元**，成本可忽略
2. rerank 是**逐对交叉编码**（cross-encoder），精度远高于向量余弦相似度，但延迟随候选数线性增长——建议先向量召回粗筛到 20~100 条再精排
3. 与检索管线用**哪个 embedding 模型无关**——rerank 直接吃原文，不需要向量库配合
4. 实测 8 篇中文文档重排延迟约 0.5s；候选文档较多时建议控制 top_n 与文档条数
5. 分数解读：`relevance_score` 越高越相关，跨查询间不可直接比较（非概率校准），用于排序而非阈值过滤

---

## 三、两阶段 RAG 完整实战（召回 → 精排 → 生成）

```
① 召回：bge-m3 向量检索 top-50 候选块（快、粗排）
② 精排：Qwen3-Reranker-4B 对 50 个候选逐对精细打分，取 top-5（准、慢）
③ 生成：top-5 块 + 问题拼 prompt → DS-V4.1-Flash 生成答案
```

```python
# ① 建库（一次性）：文档切块 → bge-m3 向量化 → 存 FAISS / Chroma / pgvector
question = "学校奖学金评定标准是什么？"
q_vec = client.embeddings.create(model="bge-m3", input=question).data[0].embedding

# ① 召回：向量库检索 top-50（以 FAISS 为例）
import numpy as np
D, I = index.search(np.array([q_vec], dtype="float32"), 50)
candidates = [chunks[i] for i in I[0]]

# ② 精排：Reranker 对 50 个候选逐对打分，取 top-5
import requests
rerank_resp = requests.post(
    "https://ai-platform.sptc.edu.cn/v1/rerank",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={"model": "Qwen3-Reranker-4B", "query": question,
          "documents": candidates, "top_n": 5},
    verify=False,  # 校园自签证书
).json()
top5 = [r["document"] for r in rerank_resp["results"]]

# ③ 生成：top-5 块 + 问题拼 prompt → LLM 作答
context = "\n---\n".join(top5)
answer = client.chat.completions.create(
    model="DeepSeek-V4.1-Flash",
    messages=[{
        "role": "user",
        "content": f"根据以下资料回答问题，资料：\n{context}\n\n问题：{question}"
    }],
).choices[0].message.content
```

**成本感**：一次完整两阶段 RAG 问答（1 万字文档库 + 50 候选精排 + 生成）约 **0.01~0.02 元**，教学场景成本可忽略。
