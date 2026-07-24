"""
多轮对话模块 + 会话持久化
会话数据保存在 sessions.json，重启后自动恢复
"""
import json
import os
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

import httpx
import anthropic

from config import settings, get_model_by_id, get_default_model
from retriever import retrieve, format_context, get_source_files

SESSIONS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sessions.json")
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

def get_all_sessions(username: Optional[str] = None) -> List[Dict]:
    """username=None 时返回所有（管理员用），否则只返回该用户的会话"""
    result = [
        {
            "session_id": sid,
            "title": d.get("title", "新对话"),
            "created_at": d.get("created_at", ""),
            "updated_at": d.get("updated_at", ""),
            "message_count": len(d.get("messages", [])),
        }
        for sid, d in sessions_data.items()
        if username is None or d.get("username", "") == username
    ]
    result.sort(key=lambda x: x["updated_at"], reverse=True)
    return result


def get_session(session_id: str, username: Optional[str] = None) -> Optional[Dict]:
    """username=None 时跳过归属检查（管理员用）"""
    d = sessions_data.get(session_id)
    if not d:
        return None
    if username is not None and d.get("username", "") != username:
        return None
    return {
        "session_id": session_id,
        "title": d.get("title", "新对话"),
        "messages": d.get("messages", []),
    }


def session_belongs_to(session_id: str, username: str) -> bool:
    d = sessions_data.get(session_id)
    if not d:
        return False
    return d.get("username", "") == username


def get_session_history(session_id: str) -> List[Dict[str, str]]:
    return sessions_data.get(session_id, {}).get("messages", [])


def clear_session(session_id: str):
    if session_id in sessions_data:
        del sessions_data[session_id]
        _save()


# ==================== 内部写入 ====================

def _ensure(session_id: str, first_user_msg: str, username: str = ""):
    if session_id not in sessions_data:
        now = _now_iso()
        sessions_data[session_id] = {
            "title": first_user_msg[:20],
            "created_at": now,
            "updated_at": now,
            "messages": [],
            "username": username,
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
    kb_group: Optional[str] = None,
    username: str = "",
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

    # 2. 知识库检索（kb_group=None/'all' 时搜全库）
    chunks = retrieve(user_message, kb_group=kb_group)
    context = format_context(chunks)
    sources = get_source_files(chunks)

    # 3. System Prompt
    system_prompt = (
        "你是晶品众（CRISTAR）的数字专家助手，专注于以下专业领域：\n\n"
        "1. 聚晶金刚石（PCD）材料：\n"
        "   - 内部缺陷检测（气孔、包裹物、裂纹）\n"
        "   - 石墨化温度与热稳定性\n"
        "   - 热导率检测（激光闪射法）\n"
        "   - 密度与致密性\n"
        "   - 电学性能（电导率与介电常数）\n\n"
        "2. 碳化硅（SiC）材料：\n"
        "   - 热场相关\n"
        "   - 压力相关\n"
        "   - 功率器件相关\n\n"
        "3. 金刚石-SiC（Diamond-SiC）复合材料：\n"
        "   - 高温高压烧结工艺（温度1400~1800℃，压力3~8GPa）\n"
        "   - 工艺参数优化（烧结温度、保温时间、压力、升降温速率、原料配比）\n"
        "   - 性能指标（致密度、孔隙率、维氏硬度、热导率）\n"
        "   - 六面顶压机操作与设备调整\n\n"
        "4. 检测与质量管控：\n"
        "   - 原材料检测数据分析\n"
        "   - 成品性能检测\n"
        "   - 质量规律挖掘\n\n"
        "请严格遵守以下规则：\n"
        "- 只回答与上述材料研发、生产工艺、检测分析相关的专业问题\n"
        "- 回答基于知识库内容，并注明参考来源\n"
        "- 如问题超出专业范围，礼貌提示用户聚焦专业问题\n"
        "- 使用专业、严谨的中文回答\n"
        "- 涉及工艺参数时，给出具体数值范围\n\n"
        "## Diamond-SiC复合材料性能评价体系\n\n"
        "回答涉及Diamond-SiC复合材料性能问题时，严格按以下优先级分析：\n\n"
        "### 第一优先级：热学核心性能（必须优先分析）\n"
        "- 室温热导率（κRT）：绝对核心，散热基板选材首要参数\n"
        "- 高温热导率（κHT）：更具工程指导意义，反映实际工况散热\n"
        "- 热扩散系数（α）：反映温度响应速度，对脉冲功率器件关键\n"
        "- 界面热阻（TBR）：决定热导率上限的微观关键变量\n"
        "- 热膨胀系数（CTE）：硬约束，需与Si芯片匹配（2.5~4.5 ppm/K）\n\n"
        "### 第二优先级：微观结构与物理约束\n"
        "- 物相比例：理想为\"金刚石+SiC\"；惩罚项为残留Si和石墨相\n"
        "- 致密度/孔隙率：辅助监督信号，高致密度是高热导率前提\n"
        "- 界面结合度：关联TBR和力学可靠性的关键微观指标\n\n"
        "### 第三优先级：力学与电学性能\n"
        "- 包括硬度、电阻率、介电常数、介电损耗、击穿场强等\n"
        "- 在特定应用场景下作为约束条件\n\n"
        "### 工艺风险提示\n"
        "回答烧结工艺问题时，必须主动提示以下两大风险：\n"
        "1. 石墨化风险：温度超过上限（T上限 ≈ 370P - 530）会导致金刚石石墨化\n"
        "2. Si反应不充分风险：温度低于下限（T下限 ≈ -82P + 1645）会导致Si与C反应不完全\n\n"
        "### HPHT烧结核心工艺参数范围\n"
        "- 烧结温度：1400~1800℃\n"
        "- 保温时间：10~30min\n"
        "- 烧结压力：5~8GPa\n"
        "- 升温速率：5~50℃/min\n"
        "- 降温速率：2~30℃/min\n"
        "- 金刚石重量占比：70~90wt%"
    )
    if context:
        system_prompt += f"\n\n以下是相关参考资料：\n\n{context}"

    # 4. 确保会话存在，获取历史
    _ensure(session_id, user_message, username)
    history = get_session_history(session_id)

    # 5. 组装消息（不含 system：Anthropic 原生接口的 system 是独立参数，不放进 messages）
    conversation_messages = history + [{"role": "user", "content": user_message}]

    # 6. 检查 Key
    if not model.api_key:
        return {"answer": f"⚠️ 模型「{model.name}」未配置 API Key，请在模型配置页面填写后再使用。",
                "sources": [], "session_id": session_id, "model_used": model.name}

    is_anthropic = "anthropic.com" in (model.base_url or "")

    # 7. 调用 LLM
    try:
        if is_anthropic:
            # Anthropic SDK 自带同步/异步两种客户端，异步接口下必须用 AsyncAnthropic，
            # 否则同步调用会阻塞事件循环，拖慢其他并发请求。
            client = anthropic.AsyncAnthropic(api_key=model.api_key, timeout=90.0)
            resp = await client.messages.create(
                model=model.model_name,
                max_tokens=2000,
                system=system_prompt,
                messages=conversation_messages,
            )
            answer = "".join(block.text for block in resp.content if block.type == "text")
        else:
            messages = [{"role": "system", "content": system_prompt}] + conversation_messages
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
    except anthropic.APIStatusError as e:
        answer = f"❌ 调用「{model.name}」失败（{e.status_code}）：{str(e.message)[:200]}"
    except anthropic.APITimeoutError:
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
