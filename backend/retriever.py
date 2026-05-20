"""
检索模块
语义模式：query → embedding → ChromaDB 向量查询
jieba 模式：query → jieba 分词 → 全量扫描 + 关键词重叠打分
"""
from typing import List, Dict, Any

from knowledge_base import collection, embedding_model, JIEBA_MODE
from config import settings


# ==================== 语义检索 ====================

def _semantic_retrieve(query: str, top_k: int) -> List[Dict[str, Any]]:
    total = collection.count()
    if total == 0:
        return []

    query_embedding = embedding_model.encode([query])[0].tolist()

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, total),
        include=["documents", "metadatas", "distances"],
    )

    if not results["ids"][0]:
        return []

    chunks = []
    for chunk_id, document, metadata, distance in zip(
        results["ids"][0],
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        chunks.append({
            "id": chunk_id,
            "content": document,
            "filename": metadata["filename"],
            "chunk_index": metadata["chunk_index"],
            "similarity": round(1 - distance, 4),
        })
    return chunks


# ==================== jieba 关键词召回 ====================

def _jieba_retrieve(query: str, top_k: int) -> List[Dict[str, Any]]:
    import jieba

    total = collection.count()
    if total == 0:
        return []

    all_data = collection.get(include=["documents", "metadatas"])
    if not all_data["ids"]:
        return []

    # 分词：过滤单字，保留有效词
    query_tokens = {t for t in jieba.cut(query) if len(t) > 1}
    if not query_tokens:
        return []

    scored = []
    for chunk_id, document, metadata in zip(
        all_data["ids"],
        all_data["documents"],
        all_data["metadatas"],
    ):
        chunk_tokens = {t for t in jieba.cut(document) if len(t) > 1}
        overlap = len(query_tokens & chunk_tokens)
        if overlap == 0:
            continue
        # 命中词数 / 查询词数，范围 (0, 1]
        score = round(overlap / len(query_tokens), 4)
        scored.append({
            "id": chunk_id,
            "content": document,
            "filename": metadata["filename"],
            "chunk_index": metadata["chunk_index"],
            "similarity": score,
        })

    scored.sort(key=lambda x: x["similarity"], reverse=True)
    return scored[:top_k]


# ==================== 统一入口 ====================

def retrieve(query: str, top_k: int = None) -> List[Dict[str, Any]]:
    top_k = top_k or settings.TOP_K
    if JIEBA_MODE:
        return _jieba_retrieve(query, top_k)
    return _semantic_retrieve(query, top_k)


def format_context(chunks: List[Dict[str, Any]]) -> str:
    if not chunks:
        return ""
    parts = []
    for i, chunk in enumerate(chunks, 1):
        parts.append(
            f"【参考片段{i}】（来源：{chunk['filename']}，相似度：{chunk['similarity']}）\n"
            f"{chunk['content']}"
        )
    return "\n\n".join(parts)


def get_source_files(chunks: List[Dict[str, Any]]) -> List[str]:
    seen = set()
    filenames = []
    for chunk in chunks:
        fn = chunk["filename"]
        if fn not in seen:
            filenames.append(fn)
            seen.add(fn)
    return filenames
