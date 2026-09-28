# Rerank

> Data verified 2026-09-28. Rerank = a model scores the relevance of each (query, document) pair and sorts them — the standard second-stage refinement for RAG (vector recall top-50 → rerank top-5), which significantly improves answer hit rate.

## Model

| Model | Parameters | Input price |
|---|---|---|
| **Qwen3-Reranker-4B** | 4B | **0.6 CNY / million tokens** (aligned with the official Alibaba Cloud Bailian qwen3-rerank price) |

Endpoint: `POST /v1/rerank`

## Usage Example (tested working)

```bash
curl https://ai-platform.sptc.edu.cn/v1/rerank -k \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "Qwen3-Reranker-4B",
    "query": "Where is Sichuan Post and Telecommunication College located?",
    "documents": [
      "Sichuan Post and Telecommunication College is located at No. 77 Jingkang Road, Jinjiang District, Chengdu.",
      "Sichuan University is located at No. 24 South Section 1, Yihuan Road, Chengdu.",
      "The college's AI major started enrolling students in 2026.",
      "The college originated from Sichuan Postal School, founded in 1956."
    ],
    "top_n": 3
  }'
```

Verified response (Jina-compatible format, sorted by relevance descending):

```json
{
  "results": [
    { "index": 0, "relevance_score": 0.93, "document": "Sichuan Post and Telecommunication College is located at No. 77 Jingkang Road, Jinjiang District, Chengdu." },
    { "index": 3, "relevance_score": 0.71, "document": "The college originated from Sichuan Postal School, founded in 1956." },
    { "index": 2, "relevance_score": 0.04, "document": "The college's AI major started enrolling students in 2026." }
  ],
  "usage": { "prompt_tokens": 120, "total_tokens": 120 }
}
```

## Python Example (requests)

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
    verify=False,  # campus self-signed certificate
)
for r in resp.json()["results"]:
    print(r["index"], r["relevance_score"], r["document"])
```

## Two-Stage RAG with bge-m3

```
① Recall: bge-m3 vector search for top-50 candidate chunks (fast, coarse)
② Refine: Qwen3-Reranker-4B scores all 50 candidates pairwise, keep top-5 (accurate, slower)
③ Generate: top-5 chunks + question assembled into a prompt → DS-V4.1-Flash generates the answer
```

```python
# Core code sketch for step ②
rerank_resp = requests.post(
    "https://ai-platform.sptc.edu.cn/v1/rerank",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "model": "Qwen3-Reranker-4B",
        "query": question,
        "documents": [chunks[i] for i in I[0]],  # top-50 recalled by bge-m3
        "top_n": 5,
    },
    verify=False,
).json()
top5 = [r["document"] for r in rerank_resp["results"]]
```

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `model` | Yes | Must be `Qwen3-Reranker-4B` |
| `query` | Yes | The user question / search query |
| `documents` | Yes | Candidate document array (strings); recommend ≤100 items |
| `top_n` | No | Return only the top N results; defaults to all (truncation verified working) |
| `return_documents` | No | Defaults to true (inline original text in results); set false to return only index+score and save bandwidth |

## Usage Tips

1. **Billing is on input tokens** (query + all documents combined) at 0.6 CNY / million tokens — reranking 50×200-character documents ≈ 10K tokens ≈ **0.006 CNY**, negligible cost
2. Rerank is **pairwise cross-encoding** — far more accurate than vector cosine similarity, but latency grows linearly with the number of candidates; recall to 20–100 candidates first, then refine
3. Rerank works **independently of the embedding model** — it takes raw text directly and needs no vector store
4. Verified latency: ~0.5s for 8 Chinese documents; keep top_n and candidate count in check for large batches
5. Score interpretation: higher `relevance_score` = more relevant; scores are not comparable across queries (not probability-calibrated) — use for ranking, not threshold filtering
