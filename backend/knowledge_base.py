"""
知识库模块
文档解析（PDF/Word）→ 文本分块 → SQLite 持久化
搜索由 retriever.py 的 jieba 关键词匹配完成，无需向量模型
"""
import uuid
import sqlite3
from typing import List, Dict, Any, Optional

from pypdf import PdfReader
from docx import Document as DocxDocument

from config import settings


# ==================== SQLite 初始化 ====================

DB_PATH = "./knowledge.db"

_conn = sqlite3.connect(DB_PATH, check_same_thread=False)
_conn.execute("PRAGMA journal_mode=WAL")
_conn.execute("""
    CREATE TABLE IF NOT EXISTS chunks (
        id          TEXT PRIMARY KEY,
        doc_id      TEXT NOT NULL,
        filename    TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content     TEXT NOT NULL,
        kb_group    TEXT NOT NULL DEFAULT 'general'
    )
""")
# 迁移：为已有数据库补充 kb_group 列
try:
    _conn.execute("ALTER TABLE chunks ADD COLUMN kb_group TEXT NOT NULL DEFAULT 'general'")
    _conn.commit()
    print("✅ 已迁移：chunks 表新增 kb_group 列", flush=True)
except Exception:
    pass  # 列已存在，忽略
_conn.commit()
print("✅ SQLite 知识库初始化完成", flush=True)


# ==================== 文档解析 ====================

def parse_pdf(file_path: str) -> str:
    reader = PdfReader(file_path)
    return "\n".join(page.extract_text() or "" for page in reader.pages)


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


# ==================== 文档入库 ====================

def add_document(filename: str, file_path: str, file_type: str,
                 kb_group: str = "general") -> Dict[str, Any]:
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

    doc_id = str(uuid.uuid4())
    _conn.executemany(
        "INSERT INTO chunks (id, doc_id, filename, chunk_index, content, kb_group) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        [(f"{doc_id}_{i}", doc_id, filename, i, chunk, kb_group)
         for i, chunk in enumerate(chunks)],
    )
    _conn.commit()

    return {
        "doc_id": doc_id,
        "filename": filename,
        "kb_group": kb_group,
        "chunk_count": len(chunks),
        "char_count": len(text),
    }


# ==================== 文档查询 ====================

def get_all_documents() -> List[Dict[str, Any]]:
    cur = _conn.execute(
        "SELECT doc_id, filename, kb_group, COUNT(*) "
        "FROM chunks GROUP BY doc_id, filename, kb_group"
    )
    return [
        {"doc_id": r[0], "filename": r[1], "kb_group": r[2], "chunk_count": r[3]}
        for r in cur.fetchall()
    ]


def delete_document(doc_id: str) -> bool:
    cur = _conn.execute("SELECT COUNT(*) FROM chunks WHERE doc_id = ?", (doc_id,))
    if cur.fetchone()[0] == 0:
        return False
    _conn.execute("DELETE FROM chunks WHERE doc_id = ?", (doc_id,))
    _conn.commit()
    return True


def get_all_chunks(kb_group: Optional[str] = None) -> List[Dict[str, Any]]:
    """供 retriever.py 调用；kb_group=None 或 'all' 时返回全部分块"""
    if kb_group and kb_group != "all":
        cur = _conn.execute(
            "SELECT id, doc_id, filename, chunk_index, content "
            "FROM chunks WHERE kb_group = ?",
            (kb_group,),
        )
    else:
        cur = _conn.execute(
            "SELECT id, doc_id, filename, chunk_index, content FROM chunks"
        )
    return [
        {"id": r[0], "doc_id": r[1], "filename": r[2], "chunk_index": r[3], "content": r[4]}
        for r in cur.fetchall()
    ]
