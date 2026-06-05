"""
工作流管理模块
三个预设工作流模板，状态持久化到 SQLite
"""
import sqlite3
from datetime import datetime, timezone
from typing import List, Dict, Any

DB_PATH = "./knowledge.db"

_conn = sqlite3.connect(DB_PATH, check_same_thread=False)
_conn.execute("PRAGMA journal_mode=WAL")
_conn.execute("""
    CREATE TABLE IF NOT EXISTS workflows (
        id        TEXT PRIMARY KEY,
        enabled   INTEGER NOT NULL DEFAULT 0,
        run_count INTEGER NOT NULL DEFAULT 0,
        last_run  TEXT
    )
""")
_conn.commit()

WORKFLOW_TEMPLATES: List[Dict] = [
    {
        "id": "doc_auto_import",
        "name": "文档自动入库",
        "description": "上传文档后自动解析、分块并入库，支持 PDF / Word(.docx) 格式，处理完成后立即生效用于检索。",
        "icon": "📁",
        "type_label": "触发式",
    },
    {
        "id": "kb_update_reminder",
        "name": "定时知识库更新提醒",
        "description": "每周检测知识库更新情况，距上次上传超过 7 天时在界面显示提醒，保持知识库时效性。",
        "icon": "🔔",
        "type_label": "定时式",
    },
    {
        "id": "answer_feedback",
        "name": "问答质量反馈",
        "description": "在每条 AI 回答下方显示点赞 / 踩按钮，收集用户反馈，统计结果可在「使用统计」页查看。",
        "icon": "👍",
        "type_label": "交互式",
    },
]


def _ensure_defaults():
    for wf in WORKFLOW_TEMPLATES:
        if not _conn.execute("SELECT id FROM workflows WHERE id = ?", (wf["id"],)).fetchone():
            enabled = 1 if wf["id"] in ("doc_auto_import", "answer_feedback") else 0
            _conn.execute(
                "INSERT INTO workflows (id, enabled) VALUES (?, ?)",
                (wf["id"], enabled),
            )
    _conn.commit()


_ensure_defaults()
print("✅ 工作流模块初始化完成", flush=True)


def get_all_workflows() -> List[Dict[str, Any]]:
    cur = _conn.execute("SELECT id, enabled, run_count, last_run FROM workflows")
    db = {r[0]: {"enabled": bool(r[1]), "run_count": r[2], "last_run": r[3]}
          for r in cur.fetchall()}
    return [
        {**tpl, **db.get(tpl["id"], {"enabled": False, "run_count": 0, "last_run": None})}
        for tpl in WORKFLOW_TEMPLATES
    ]


def toggle_workflow(workflow_id: str, enabled: bool) -> bool:
    if not _conn.execute("SELECT id FROM workflows WHERE id = ?", (workflow_id,)).fetchone():
        return False
    _conn.execute(
        "UPDATE workflows SET enabled = ? WHERE id = ?",
        (1 if enabled else 0, workflow_id),
    )
    _conn.commit()
    return True


def increment_run_count(workflow_id: str):
    now = datetime.now(timezone.utc).isoformat()
    _conn.execute(
        "UPDATE workflows SET run_count = run_count + 1, last_run = ? WHERE id = ?",
        (now, workflow_id),
    )
    _conn.commit()
