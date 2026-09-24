# Embedding & RAG

> Data verified 2026-09-23. Embedding = turning text into vectors — the foundation of retrieval / RAG / similarity computation.

## Model

| Model | Vector dimension | Context | Input price |
|---|---|---|---|
| **bge-m3** | **1024-dim** [tested] | 8K | 0.5 CNY / million tokens |

Endpoint: `POST /v1/embeddings`

## Usage Example (tested working)

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

resp = client.embeddings.create(
    model="bge-m3",
    input="The text to embed",
)
vec = resp.data[0].embedding  # 1024-dim list[float]
```

## Minimal RAG (Retrieval-Augmented Generation)

Three steps for campus RAG:

```
① Build the index: chunk documents → embed with bge-m3 → store in a vector DB (FAISS / Chroma / pgvector)
② Retrieve: embed the user's question → top-k similar chunks
③ Generate: top-k chunks + question assembled into a prompt → DS-V4.1-Flash generates the answer
```

```python
# Core code sketch for steps ②③
question = "What are the scholarship evaluation criteria?"
q_vec = client.embeddings.create(model="bge-m3", input=question).data[0].embedding

# Retrieve top-5 similar chunks from the vector DB (FAISS example)
import numpy as np
D, I = index.search(np.array([q_vec], dtype="float32"), 5)
context = "\n---\n".join(chunks[i] for i in I[0])

# Assemble into the LLM call
answer = client.chat.completions.create(
    model="DeepSeek-V4.1-Flash",
    messages=[{
        "role": "user",
        "content": f"Answer the question based on the following material:\n{context}\n\nQuestion: {question}"
    }],
).choices[0].message.content
```

## Usage Tips

1. **bge-m3 caps a single input at 8K** — chunk longer documents first (recommend 500–1000 characters per chunk with 100-character overlap)
2. Questions and documents must be embedded with **the same model** (bge-m3 ↔ bge-m3); vectors from different models are not comparable
3. bge-m3 supports dense + sparse retrieval and multilingual text — mixed Chinese/English campus corpora work out of the box
4. Use cosine distance for similarity; when building the index, store both the original text and the vector for easy display
5. Billing is on input tokens at 0.5 CNY / million tokens — indexing is extremely cheap (a million-character document costs about 0.5 CNY)
