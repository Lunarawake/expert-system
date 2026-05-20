"""
多轮对话模块 + 会话持久化
会话数据保存在 sessions.json，重启后自动恢复
"""
import json
import os
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

import httpx

from config import settings, get_model_by_id, get_default_model
from retriever import retrieve, format_context, get_source_files

SESSIONS_FILE = "./sessions.json"
MAX_SESSIONS = 50

# { session_id: { title, created_at, updated_at, messages: [...] } }
sessions_data: Dict[str, Dict] = {}


# ==================== 持久化 ====================

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _save():
    try:
        with open(SESSIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(sessions_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"⚠️ 保存会话失败: {e}")


def _load():
    if not os.path.exists(SESSIONS_FILE):
        return
    try:
        with open(SESSIONS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        sessions_data.update(data)
        print(f"✅ 已加载 {len(sessions_data)} 条历史会话")
    except Exception as e:
        print(f"⚠️ 加载会话失败: {e}")


_load()


def _prune():
    if len(sessions_data) <= MAX_SESSIONS:
        return
    oldest = sorted(sessions_data, key=lambda s: sessions_data[s].get("updated_at", ""))
    for sid in oldest[: len(sessions_data) - MAX_SESSIONS]:
        del sessions_data[sid]


# ==================== 公开查询 API ====================

def get_all_sessions() -> List[Dict]:
    result = [
        {
            "session_id": sid,
            "title": d.get("title", "新对话"),
            "created_at": d.get("created_at", ""),
            "updated_at": d.get("updated_at", ""),
            "message_count": len(d.get("messages", [])),
        }
        for sid, d in sessions_data.items()
    ]
    result.sort(key=lambda x: x["updated_at"], reverse=True)
    return result


def get_session(session_id: str) -> Optional[Dict]:
    d = sessions_data.get(session_id)
    if not d:
        return None
    return {
        "session_id": session_id,
        "title": d.get("title", "新对话"),
        "messages": d.get("messages", []),
    }


def get_session_history(session_id: str) -> List[Dict[str, str]]:
    return sessions_data.get(session_id, {}).get("messages", [])


def clear_session(session_id: str):
    if session_id in sessions_data:
        del sessions_data[session_id]
        _save()


# ==================== 内部写入 ====================

def _ensure(session_id: str, first_user_msg: str):
    if session_id not in sessions_data:
        now = _now_iso()
        sessions_data[session_id] = {
            "title": first_user_msg[:20],
            "created_at": now,
            "updated_at": now,
            "messages": [],
        }


def _append(session_id: str, role: str, content: str):
    sessions_data[session_id]["messages"].append({"role": role, "content": content})
    sessions_data[session_id]["updated_at"] = _now_iso()
    max_msgs = settings.MAX_HISTORY_TURNS * 2
    msgs = sessions_data[session_id]["messages"]
    if len(msgs) > max_msgs:
        sessions_data[session_id]["messages"] = msgs[-max_msgs:]


# ==================== LLM 调用 ====================

async def chat(
    session_id: str,
    user_message: str,
    model_id: Optional[str] = None,
) -> Dict[str, Any]:
    # 1. 选定模型
    if model_id:
        model = get_model_by_id(model_id)
        if model is None:
            return {"answer": f"❌ 找不到 ID 为 {model_id} 的模型，请检查模型配置。",
                    "sources": [], "session_id": session_id, "model_used": None}
    else:
        model = get_default_model()

    if model is None:
        return {"answer": "⚠️ 尚未配置任何模型，请前往「模型配置」页面添加模型后再使用。",
                "sources": [], "session_id": session_id, "model_used": None}

    # 2. 知识库检索
    chunks = retrieve(user_message)
    context = format_context(chunks)
    sources = get_source_files(chunks)

    # 3. System Prompt
    system_prompt = (
        "你是一位专业的新材料研发专家助手，专注于碳化硅、金刚石等超硬材料领域。"
        "请严格根据知识库内容回答问题，只回答与材料研发、生产工艺、产品性能相关的专业问题。"
        "如果问题超出专业范围，请礼貌提示用户聚焦到专业问题上。"
        "回答使用中文，语言专业严谨。\n\n"
        "回答要求：\n"
        "- 优先使用参考资料中的信息，不要编造内容\n"
        "- 回答简洁、准确、专业\n"
        "- 如果参考资料中没有相关信息，请直接说明"
    )
    if context:
        system_prompt += f"\n\n以下是相关参考资料：\n\n{context}"

    # 4. 确保会话存在，获取历史
    _ensure(session_id, user_message)
    history = get_session_history(session_id)

    # 5. 组装消息
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    # 6. 检查 Key
    if not model.api_key:
        return {"answer": f"⚠️ 模型「{model.name}」未配置 API Key，请在模型配置页面填写后再使用。",
                "sources": [], "session_id": session_id, "model_used": model.name}

    # 7. 调用 LLM
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                f"{model.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {model.api_key}",
                         "Content-Type": "application/json"},
                json={"model": model.model_name, "messages": messages,
                      "temperature": 0.7, "max_tokens": 2000},
            )
            resp.raise_for_status()
            answer = resp.json()["choices"][0]["message"]["content"]
    except httpx.HTTPStatusError as e:
        answer = f"❌ 调用「{model.name}」失败（{e.response.status_code}）：{e.response.text[:200]}"
    except httpx.TimeoutException:
        answer = f"❌「{model.name}」请求超时，请稍后重试。"
    except Exception as e:
        answer = f"❌ 发生错误：{str(e)}"

    # 8. 来源标注
    is_error = answer.startswith("❌") or answer.startswith("⚠️")
    if sources and not is_error:
        answer += f"\n\n---\n📚 **参考来源：** {', '.join(sources)}"

    # 9. 持久化
    _append(session_id, "user", user_message)
    _append(session_id, "assistant", answer)
    _prune()
    _save()

    return {"answer": answer, "sources": sources,
            "session_id": session_id, "model_used": model.name}
