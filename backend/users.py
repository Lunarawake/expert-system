"""
用户管理模块：SQLite users 表 + bcrypt 密码哈希
"""
import os
import sqlite3
from datetime import datetime, timezone
from typing import Optional, List, Dict

from passlib.context import CryptContext

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "knowledge.db")

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_users_db():
    """建表并初始化默认管理员账号（admin / admin123）"""
    with _get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                username     TEXT    UNIQUE NOT NULL,
                password_hash TEXT   NOT NULL,
                role         TEXT    NOT NULL DEFAULT 'operator',
                created_at   TEXT    NOT NULL,
                last_login   TEXT
            )
        """)
        conn.commit()
        row = conn.execute(
            "SELECT id FROM users WHERE username = 'admin'"
        ).fetchone()
        if not row:
            hashed = pwd_ctx.hash("admin123")
            conn.execute(
                "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
                ("admin", hashed, "admin", _now()),
            )
            conn.commit()


def hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


def get_user_by_username(username: str) -> Optional[Dict]:
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()
        return dict(row) if row else None


def get_user_by_id(user_id: int) -> Optional[Dict]:
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT id, username, role, created_at, last_login FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        return dict(row) if row else None


def update_last_login(username: str):
    with _get_conn() as conn:
        conn.execute(
            "UPDATE users SET last_login = ? WHERE username = ?", (_now(), username)
        )
        conn.commit()


def list_users() -> List[Dict]:
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT id, username, role, created_at, last_login FROM users ORDER BY created_at"
        ).fetchall()
        return [dict(r) for r in rows]


def create_user(username: str, password: str, role: str) -> Dict:
    if role not in ("admin", "operator"):
        role = "operator"
    hashed = hash_password(password)
    with _get_conn() as conn:
        try:
            conn.execute(
                "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
                (username, hashed, role, _now()),
            )
            conn.commit()
            uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            return {"id": uid, "username": username, "role": role}
        except sqlite3.IntegrityError:
            raise ValueError(f"用户名「{username}」已存在")


def delete_user(user_id: int) -> bool:
    with _get_conn() as conn:
        cur = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        return cur.rowcount > 0


def change_password(user_id: int, new_password: str) -> bool:
    hashed = hash_password(new_password)
    with _get_conn() as conn:
        cur = conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?", (hashed, user_id)
        )
        conn.commit()
        return cur.rowcount > 0
