"""
知识库模块
负责文档解析（PDF/Word）、文本分块、向量化、存入 ChromaDB

Embedding 加载策略：
  - 优先从本地缓存加载，30 秒内未完成则超时
  - 加载失败自动切换为 jieba 关键词召回（JIEBA_MODE=True）
"""
import os
import uuid
import time
import shutil
import threading
from pathlib import Path
from typing import List, Dict, Any

from pypdf import PdfReader
from docx import Document as DocxDocument
import chromadb

from config import settings


# ==================== Embedding 初始化 ====================

JIEBA_MODE: bool = False   # True = 使用 jieba 关键词召回，无需向量模型
embedding_model = None     # SentenceTransformer 实例，jieba 模式下为 None
EMBED_DIM: int = 768       # text2vec-base-chinese 输出维度；jieba 模式下用零向量占位

_LOAD_TIMEOUT = 30  # 秒


def _check_model_cached(model_name: str) -> bool:
    cache_root = Path.home() / ".cache" / "huggingface" / "hub"
    folder = "models--" + model_name.replace("/", "--")
    return (cache_root / folder).exists()


def _init_embedding():
    global JIEBA_MODE, embedding_model

    model_name = settings.EMBEDDING_MODEL_NAME
    is_cached = _check_model_cached(model_name)

    if is_cached:
        print(f"⏳ 正在加载 Embedding 模型（本地缓存）: {model_name}", flush=True)
    else:
        print(f"⏳ 尝试下载 Embedding 模型: {model_name}", flush=True)
        print(f"   超时限制 {_LOAD_TIMEOUT}s，超时后自动切换为关键词召回模式", flush=True)

    result_box: list = []
    error_box: list = []

    def _load():
        try:
            from sentence_transformers import SentenceTransformer
            result_box.append(SentenceTransformer(model_name))
        except Exception as exc:
            error_box.append(exc)

    t = threading.Thread(target=_load, daemon=True)
    t.start()

    start = time.time()
    dot_count = 0
    while t.is_alive():
        t.join(timeout=2)
        if not t.is_alive():
            break
        elapsed = time.time() - start
        if elapsed >= _LOAD_TIMEOUT:
            break
        dot_count += 1
        print(f"\r   {'.' * (dot_count % 20 + 1):<20} {elapsed:.0f}s / {_LOAD_TIMEOUT}s",
              end="", flush=True)

    print(flush=True)  # 换行

    if t.is_alive():
        # 超时
        JIEBA_MODE = True
        print(f"⚠️  模型加载超时（>{_LOAD_TIMEOUT}s），已切换为 jieba 关键词召回模式", flush=True)
        return

    if error_box:
        JIEBA_MODE = True
        print(f"⚠️  模型加载失败：{error_box[0]}", flush=True)
        print("🔀 已切换为 jieba 关键词召回模式（无需网络，功能完整可用）", flush=True)
        return

    if result_box:
        embedding_model = result_box[0]
        print("✅ Embedding 模型加载完成（语义检索模式）", flush=True)
    else:
        JIEBA_MODE = True
        print("⚠️  未知错误，已切换为 jieba 关键词召回模式", flush=True)


_init_embedding()


# ==================== ChromaDB ====================

# 云端部署时清理旧版本数据库（本地开发不影响）
if os.environ.get("RENDER") and os.path.exists("./chroma_db"):
    shutil.rmtree("./chroma_db")

chroma_client = chromadb.PersistentClient(path=settings.CHROMA_DB_PATH)
collection = chroma_client.get_or_create_collection(
    name="knowledge_base",
    metadata={"hnsw:space": "cosine"},
)


# ==================== 文档解析 ====================

def parse_pdf(file_path: str) -> str:
    reader = PdfReader(file_path)
    return "\n".join(
        page.extract_text() or "" for page in reader.pages
    )


def parse_docx(file_path: str) -> str:
    doc = DocxDocument(file_path)
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


# ==================== 文本分块 ====================

def chunk_text(text: str, chunk_size: int = None, overlap: int = None) -> List[str]:
    chunk_size = chunk_size or settings.CHUNK_SIZE
    overlap = overlap or settings.CHUNK_OVERLAP

    chunks = []
    start = 0
    text_len = len(text)

    while start < text_len:
        end = min(start + chunk_size, text_len)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end == text_len:
            break
        start = end - overlap

    return chunks


# ==================== 向量化 ====================

def embed_texts(texts: List[str]) -> List[List[float]]:
    if JIEBA_MODE:
        # jieba 模式：返回零向量占位，实际检索不依赖 ChromaDB 向量查询
        return [[0.0] * EMBED_DIM for _ in texts]
    return embedding_model.encode(texts, show_progress_bar=False, batch_size=32).tolist()


# ==================== 文档入库 ====================

def add_document(filename: str, file_path: str, file_type: str) -> Dict[str, Any]:
    if file_type == "pdf":
        text = parse_pdf(file_path)
    elif file_type == "docx":
        text = parse_docx(file_path)
    else:
        raise ValueError(f"不支持的文件类型: {file_type}")

    if not text.strip():
        raise ValueError("文档内容为空，无法入库")

    chunks = chunk_text(text)
    if not chunks:
        raise ValueError("文档分块结果为空")

    embeddings = embed_texts(chunks)

    doc_id = str(uuid.uuid4())
    ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
    metadatas = [
        {"filename": filename, "doc_id": doc_id, "chunk_index": i}
        for i in range(len(chunks))
    ]

    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=chunks,
        metadatas=metadatas,
    )

    return {
        "doc_id": doc_id,
        "filename": filename,
        "chunk_count": len(chunks),
        "char_count": len(text),
    }


# ==================== 文档查询 ====================

def get_all_documents() -> List[Dict[str, Any]]:
    result = collection.get(include=["metadatas"])
    if not result["ids"]:
        return []

    docs: Dict[str, Dict] = {}
    for meta in result["metadatas"]:
        doc_id = meta["doc_id"]
        if doc_id not in docs:
            docs[doc_id] = {
                "doc_id": doc_id,
                "filename": meta["filename"],
                "chunk_count": 0,
            }
        docs[doc_id]["chunk_count"] += 1

    return list(docs.values())


def delete_document(doc_id: str) -> bool:
    result = collection.get(where={"doc_id": doc_id})
    if not result["ids"]:
        return False
    collection.delete(ids=result["ids"])
    return True
