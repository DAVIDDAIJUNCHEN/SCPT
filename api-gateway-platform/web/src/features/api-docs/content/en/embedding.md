# Embedding · Rerank & the RAG Pipeline

> Data verified 2026-09-23 / 09-28. **The three components on this page belong to one RAG pipeline**: bge-m3 does vectorization (① recall), Qwen3-Reranker-4B does refinement (② rerank), and DS-V4.1-Flash does generation (③ the answer).
>
> ```
> chunk docs → [bge-m3 embed] → vector DB ──top-50──> [Reranker] ──top-5──> [LLM answers]
>               ① recall (fast, coarse)                ② refine (accurate, slower)   ③ generate
> ```

## Models

| Model | Role | Params / dims | Context | Input price |
|---|---|---|---|---|
| **bge-m3** | ① Vector recall | 1024-dim [tested] | 8K | 0.5 CNY / million tokens |
| **Qwen3-Reranker-4B** | ② Refinement | 4B | 32K | 0.6 CNY / million tokens (aligned with the official Alibaba Cloud Bailian qwen3-rerank price) |

Endpoints: `POST /v1/embeddings` (bge-m3) · `POST /v1/rerank` (Qwen3-Reranker-4B)

---

## 1. bge-m3: Turning Text into Vectors (Embedding)

### Usage Example (tested working)

```bash
curl https://ai-platform.sptc.edu.cn/v1/embeddings -k \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "bge-m3",
    "input": "Sichuan Post and Telecommunication College"
  }'
```

Verified: 1024-dim vector returned; usage is billed on input tokens (9 tokens → 9 prompt_tokens).

```python
from openai import OpenAI

client = OpenAI(api_key="YOUR_API_KEY", base_url="https://ai-platform.sptc.edu.cn/v1")

vec = client.embeddings.create(
    model="bge-m3",
    input="The text to embed",
).data[0].embedding  # 1024-dim list[float]
```

### Usage Tips

1. **bge-m3 caps a single input at 8K** — chunk longer documents first (recommend 500–1000 characters per chunk with 100-character overlap)
2. Questions and documents must be embedded with **the same model** (bge-m3 ↔ bge-m3); vectors from different models are not comparable
3. bge-m3 supports dense + sparse retrieval and multilingual text — mixed Chinese/English campus corpora work out of the box
4. Use cosine distance for similarity; when building the index, store both the original text and the vector for easy display
5. Billing is on input tokens at 0.5 CNY / million tokens — indexing is extremely cheap (a million-character document costs about 0.5 CNY)

---

## 2. Qwen3-Reranker-4B: Candidate Refinement (Rerank)

Rerank = a model scores the relevance of each (query, document) pair and sorts them — far more accurate than vector cosine similarity, and the standard second-stage refinement for RAG, significantly improving answer hit rate.

### Usage Example (tested working)

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

### Parameters

| Parameter | Required | Description |
|---|---|---|
| `model` | Yes | Must be `Qwen3-Reranker-4B` |
| `query` | Yes | The user question / search query |
| `documents` | Yes | Candidate document array (strings); recommend ≤100 items |
| `top_n` | No | Return only the top N results; defaults to all (truncation verified working) |
| `return_documents` | No | Defaults to true (inline original text in results); set false to return only index+score and save bandwidth |

### Usage Tips

1. **Billing is on input tokens** (query + all documents combined) at 0.6 CNY / million tokens — reranking 50×200-character documents ≈ 10K tokens ≈ **0.006 CNY**, negligible cost
2. Rerank is **pairwise cross-encoding** — far more accurate than vector cosine similarity, but latency grows linearly with the number of candidates; recall to 20–100 candidates first, then refine
3. Rerank works **independently of the embedding model** — it takes raw text directly and needs no vector store
4. Verified latency: ~0.5s for 8 Chinese documents; keep top_n and candidate count in check for large batches
5. Score interpretation: higher `relevance_score` = more relevant; scores are not comparable across queries (not probability-calibrated) — use for ranking, not threshold filtering

---

## 3. Full Two-Stage RAG Walkthrough (recall → refine → generate)

```
① Recall: bge-m3 vector search for top-50 candidate chunks (fast, coarse)
② Refine: Qwen3-Reranker-4B scores all 50 candidates pairwise, keep top-5 (accurate, slower)
③ Generate: top-5 chunks + question assembled into a prompt → DS-V4.1-Flash generates the answer
```

```python
# ① Build the index (one-off): chunk documents → embed with bge-m3 → store in FAISS / Chroma / pgvector
question = "What are the scholarship evaluation criteria?"
q_vec = client.embeddings.create(model="bge-m3", input=question).data[0].embedding

# ① Recall: top-50 from the vector DB (FAISS example)
import numpy as np
D, I = index.search(np.array([q_vec], dtype="float32"), 50)
candidates = [chunks[i] for i in I[0]]

# ② Refine: Reranker scores all 50 candidates pairwise, keep top-5
import requests
rerank_resp = requests.post(
    "https://ai-platform.sptc.edu.cn/v1/rerank",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={"model": "Qwen3-Reranker-4B", "query": question,
          "documents": candidates, "top_n": 5},
    verify=False,  # campus self-signed certificate
).json()
top5 = [r["document"] for r in rerank_resp["results"]]

# ③ Generate: top-5 chunks + question assembled into a prompt → the LLM answers
context = "\n---\n".join(top5)
answer = client.chat.completions.create(
    model="DeepSeek-V4.1-Flash",
    messages=[{
        "role": "user",
        "content": f"Answer the question based on the following material:\n{context}\n\nQuestion: {question}"
    }],
).choices[0].message.content
```

**Cost feel**: one full two-stage RAG Q&A round (10K-character corpus + 50-candidate refinement + generation) costs about **0.01–0.02 CNY** — negligible for teaching scenarios.
