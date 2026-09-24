# Embedding 与 RAG

> 数据：2026-09-23 实测。Embedding = 把文本变成向量，是检索 / RAG / 相似度计算的基础。

## 模型

| 模型 | 向量维度 | 上下文 | 输入价格 |
|---|---|---|---|
| **bge-m3** | **1024 维**【实测】 | 8K | 0.5 元/百万 token |

端点：`POST /v1/embeddings`

## 调用样例（实测通过）

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

resp = client.embeddings.create(
    model="bge-m3",
    input="要向量化的文本",
)
vec = resp.data[0].embedding  # 1024 维 list[float]
```

## RAG 最小实现（检索增强问答）

校园场景的 RAG 三步：

```
① 建库：文档切块 → bge-m3 向量化 → 存向量库（FAISS / Chroma / pgvector）
② 检索：用户问题向量化 → 相似度 top-k 块
③ 生成：top-k 块 + 问题拼 prompt → DS-V4.1-Flash 生成答案
```

```python
# ②③ 步核心代码示意
question = "学校奖学金评定标准是什么？"
q_vec = client.embeddings.create(model="bge-m3", input=question).data[0].embedding

# 在向量库中检索 top-5 相似块（以 FAISS 为例）
import numpy as np
D, I = index.search(np.array([q_vec], dtype="float32"), 5)
context = "\n---\n".join(chunks[i] for i in I[0])

# 拼入 LLM 生成
answer = client.chat.completions.create(
    model="DeepSeek-V4.1-Flash",
    messages=[{
        "role": "user",
        "content": f"根据以下资料回答问题，资料：\n{context}\n\n问题：{question}"
    }],
).choices[0].message.content
```

## 使用要点

1. **bge-m3 单条上限 8K**——超长文档先切块（建议 500~1000 字/块，重叠 100 字）
2. 问题与文档要用**同一个模型**向量化（bge-m3 ↔ bge-m3），跨模型向量不可比
3. bge-m3 同时支持稠密+稀疏检索与多语种，校园中英文混合语料可直接用
4. 相似度用余弦距离；建库时建议存原始文本+向量两列，便于回显
5. 计费按输入 token，0.5 元/百万 token，建库成本极低（百万字文档约 0.5 元）

---

上一页：[02-7 语音能力](02-7-语音能力.md) ｜ 返回：[02-1 模型与价格](02-1-模型与价格.md)
