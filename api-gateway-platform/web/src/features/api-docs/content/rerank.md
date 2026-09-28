# Rerank 重排序

> 数据：2026-09-28 实测。Rerank = 用模型对「问题 + 一批候选文档」逐对打相关性分并排序，是 RAG 二阶段精排的标准做法（向量召回 top-50 → rerank 精排 top-5），可显著提升答案命中率。

## 模型

| 模型 | 参数量 | 输入价格 |
|---|---|---|
| **Qwen3-Reranker-4B** | 4B | **0.6 元/百万 token**（对齐阿里云百炼 qwen3-rerank 官方价） |

端点：`POST /v1/rerank`

## 调用样例（实测通过）

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

## Python 调用（requests）

```python
import requests

resp = requests.post(
    "https://ai-platform.sptc.edu.cn/v1/rerank",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "model": "Qwen3-Reranker-4B",
        "query": "What are the scholarship evaluation criteria?",
        "documents": [
            "Scholarships are evaluated by GPA and comprehensive quality scores.",
            "The library opens at 8:00 AM.",
            "Scholarship applications open every September.",
        ],
        "top_n": 2,
    },
    verify=False,  # 校园自签证书
)
for r in resp.json()["results"]:
    print(r["index"], r["relevance_score"], r["document"])
```

## 与 bge-m3 检索管线配合（两阶段 RAG）

```
① 召回：bge-m3 向量检索 top-50 候选块（快、粗排）
② 精排：Qwen3-Reranker-4B 对 50 个候选逐对精细打分，取 top-5（准、慢）
③ 生成：top-5 块 + 问题拼 prompt → DS-V4.1-Flash 生成答案
```

```python
# ② 步核心代码示意
rerank_resp = requests.post(
    "https://ai-platform.sptc.edu.cn/v1/rerank",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "model": "Qwen3-Reranker-4B",
        "query": question,
        "documents": [chunks[i] for i in I[0]],  # bge-m3 召回的 top-50
        "top_n": 5,
    },
    verify=False,
).json()
top5 = [r["document"] for r in rerank_resp["results"]]
```

## 参数说明

| 参数 | 必填 | 说明 |
|---|---|---|
| `model` | 是 | 固定填 `Qwen3-Reranker-4B` |
| `query` | 是 | 用户问题 / 检索式 |
| `documents` | 是 | 候选文档数组（字符串），建议 ≤100 条 |
| `top_n` | 否 | 只返回前 N 个结果，默认全部返回（实测截断生效） |
| `return_documents` | 否 | 默认 true，结果内联原文；填 false 只返回 index+score，省流量 |

## 使用要点

1. **计费按输入 token**（query + 全部 documents 之和），0.6 元/百万 token——一次 50 条×200 字的重排约 1 万 token ≈ **0.006 元**，成本可忽略
2. rerank 是**逐对交叉编码**（cross-encoder），精度远高于向量余弦相似度，但延迟随候选数线性增长——建议先向量召回粗筛到 20~100 条再精排
3. 与检索管线用**同一个 embedding 模型无关**——rerank 直接吃原文，不需要向量库配合
4. 实测 8 篇中文文档重排延迟约 0.5s；候选文档较多时建议控制 top_n 与文档条数
5. 分数解读：`relevance_score` 越高越相关，跨查询间不可直接比较（非概率校准），用于排序而非阈值过滤
