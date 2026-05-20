"""
检索模块
jieba 关键词分词 → 全量扫描 + 重叠打分 → 返回 top_k 片段
"""
import jieba
from typing import List, Dict, Any

from knowledge_base import get_all_chunks
from config import settings


def retrieve(query: str, top_k: int = None) -> List[Dict[str, Any]]:
    top_k = top_k or settings.TOP_K
    all_chunks = get_all_chunks()
    if not all_chunks:
        return []

    query_tokens = {t for t in jieba.cut(query) if len(t) > 1}
    if not query_tokens:
        return []

    scored = []
    for chunk in all_chunks:
        chunk_tokens = {t for t in jieba.cut(chunk["content"]) if len(t) > 1}
        overlap = len(query_tokens & chunk_tokens)
        if overlap == 0:
            continue
        scored.append({
            **chunk,
            "similarity": round(overlap / len(query_tokens), 4),
        })

    scored.sort(key=lambda x: x["similarity"], reverse=True)
    return scored[:top_k]


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
