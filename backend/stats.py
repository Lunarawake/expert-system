"""
使用统计 + 问答反馈模块
query_log / feedback_log 表存储在 knowledge.db
"""
import os
import sqlite3
from datetime import datetime, timezone, date
from typing import List, Dict, Any, Optional

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "knowledge.db")

_conn = sqlite3.connect(DB_PATH, check_same_thread=False)
_conn.execute("PRAGMA journal_mode=WAL")
_conn.execute("""
    CREATE TABLE IF NOT EXISTS query_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        message    TEXT NOT NULL,
        model_used TEXT,
        kb_group   TEXT DEFAULT 'all',
        created_at TEXT NOT NULL
    )
""")
_conn.execute("""
    CREATE TABLE IF NOT EXISTS feedback_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        msg_index  INTEGER NOT NULL,
        feedback   TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
""")
_conn.commit()
print("✅ 统计模块初始化完成", flush=True)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def record_query(session_id: str, message: str,
                 model_used: Optional[str] = None,
                 kb_group: Optional[str] = None):
    _conn.execute(
        "INSERT INTO query_log (session_id, message, model_used, kb_group, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (session_id, message[:500], model_used, kb_group or "all", _now_iso()),
    )
    _conn.commit()


def record_feedback(session_id: str, msg_index: int, feedback: str):
    """同一条消息只保留最新反馈"""
    existing = _conn.execute(
        "SELECT id FROM feedback_log WHERE session_id = ? AND msg_index = ?",
        (session_id, msg_index),
    ).fetchone()
    if existing:
        _conn.execute(
            "UPDATE feedback_log SET feedback = ?, created_at = ? WHERE id = ?",
            (feedback, _now_iso(), existing[0]),
        )
    else:
        _conn.execute(
            "INSERT INTO feedback_log (session_id, msg_index, feedback, created_at) "
            "VALUES (?, ?, ?, ?)",
            (session_id, msg_index, feedback, _now_iso()),
        )
    _conn.commit()


def get_summary() -> Dict[str, Any]:
    total = _conn.execute("SELECT COUNT(*) FROM query_log").fetchone()[0]
    today_prefix = date.today().isoformat()
    today_count = _conn.execute(
        "SELECT COUNT(*) FROM query_log WHERE created_at LIKE ?",
        (f"{today_prefix}%",),
    ).fetchone()[0]

    try:
        doc_count = _conn.execute(
            "SELECT COUNT(DISTINCT doc_id) FROM chunks"
        ).fetchone()[0]
        total_chars = _conn.execute(
            "SELECT COALESCE(SUM(LENGTH(content)), 0) FROM chunks"
        ).fetchone()[0]
    except Exception:
        doc_count, total_chars = 0, 0

    fb_up = _conn.execute(
        "SELECT COUNT(*) FROM feedback_log WHERE feedback = 'up'"
    ).fetchone()[0]
    fb_down = _conn.execute(
        "SELECT COUNT(*) FROM feedback_log WHERE feedback = 'down'"
    ).fetchone()[0]

    return {
        "total_queries": total,
        "today_queries": today_count,
        "doc_count": doc_count,
        "total_chars": total_chars,
        "feedback_up": fb_up,
        "feedback_down": fb_down,
    }


def get_recent_queries(limit: int = 10) -> List[Dict[str, Any]]:
    cur = _conn.execute(
        "SELECT id, session_id, message, model_used, kb_group, created_at "
        "FROM query_log ORDER BY id DESC LIMIT ?",
        (limit,),
    )
    return [
        {
            "id": r[0], "session_id": r[1], "message": r[2],
            "model_used": r[3], "kb_group": r[4], "created_at": r[5],
        }
        for r in cur.fetchall()
    ]


def get_top_questions(limit: int = 5) -> List[Dict[str, Any]]:
    """按消息文本精确分组，返回出现频次最高的问题"""
    cur = _conn.execute(
        "SELECT message, COUNT(*) AS cnt, MAX(created_at) AS last_asked "
        "FROM query_log GROUP BY message ORDER BY cnt DESC, last_asked DESC LIMIT ?",
        (limit,),
    )
    return [
        {"message": r[0], "count": r[1], "last_asked": r[2]}
        for r in cur.fetchall()
    ]
