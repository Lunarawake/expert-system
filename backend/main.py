"""
FastAPI 主入口
定义所有 HTTP 接口，包含多模型管理 + 会话历史 + JWT 鉴权
"""
import os
import uuid
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

import config as cfg
from knowledge_base import add_document, get_all_documents, delete_document
from chat import (
    chat as do_chat,
    clear_session,
    get_all_sessions,
    get_session,
    session_belongs_to,
)
from stats import (
    record_query,
    record_feedback,
    get_summary,
    get_recent_queries,
    get_top_questions,
)
from workflow import get_all_workflows, toggle_workflow, increment_run_count
from users import (
    init_users_db,
    get_user_by_username,
    verify_password,
    update_last_login,
    list_users,
    create_user,
    delete_user,
    change_password,
    get_user_by_id,
)
from auth import create_access_token, get_current_user, require_admin
from wechat import router as wechat_router

# ==================== 应用初始化 ====================

app = FastAPI(
    title="数字专家系统",
    description="基于 RAG 技术的中文知识库问答系统（多模型版）",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "./uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# 启动时建用户表并初始化默认管理员
init_users_db()

# 企业微信回调路由（GET验证 + POST接收消息）
app.include_router(wechat_router, prefix="/wechat", tags=["企业微信"])


# ==================== Pydantic 请求体 ====================

class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
    model_id: Optional[str] = None
    kb_group: Optional[str] = None


class FeedbackRequest(BaseModel):
    session_id: str
    msg_index: int
    feedback: str  # 'up' | 'down'


class WorkflowToggleRequest(BaseModel):
    enabled: bool


class ModelCreate(BaseModel):
    name: str
    api_key: str
    base_url: str
    model_name: str
    is_default: bool = False


class ModelUpdate(BaseModel):
    name: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    is_default: Optional[bool] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "operator"  # 'admin' | 'operator'


class ChangePasswordRequest(BaseModel):
    new_password: str


# ==================== 鉴权接口（公开） ====================

@app.post("/auth/login", summary="用户登录")
async def login(body: LoginRequest):
    user = get_user_by_username(body.username)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "用户名或密码错误")
    update_last_login(body.username)
    token = create_access_token(user["username"], user["role"])
    return {
        "success": True,
        "data": {
            "token": token,
            "username": user["username"],
            "role": user["role"],
        },
    }


@app.post("/auth/logout", summary="退出登录")
async def logout():
    # Token 无状态，客户端删除即可
    return {"success": True, "message": "已退出登录"}


@app.get("/auth/me", summary="获取当前用户信息")
async def me(current_user: dict = Depends(get_current_user)):
    return {"success": True, "data": current_user}


# ==================== 用户管理（仅管理员） ====================

@app.get("/users", summary="用户列表")
async def get_users(_: dict = Depends(require_admin)):
    return {"success": True, "data": list_users()}


@app.post("/users", summary="创建用户")
async def add_user(body: CreateUserRequest, _: dict = Depends(require_admin)):
    if not body.username.strip():
        raise HTTPException(400, "用户名不能为空")
    if len(body.password) < 6:
        raise HTTPException(400, "密码不能少于6位")
    try:
        user = create_user(body.username.strip(), body.password, body.role)
    except ValueError as e:
        raise HTTPException(409, str(e))
    return {"success": True, "message": f"用户「{user['username']}」创建成功", "data": user}


@app.delete("/users/{user_id}", summary="删除用户")
async def remove_user(user_id: int, current_user: dict = Depends(require_admin)):
    target = get_user_by_id(user_id)
    if not target:
        raise HTTPException(404, "用户不存在")
    if target["username"] == current_user["username"]:
        raise HTTPException(400, "不能删除自己的账号")
    delete_user(user_id)
    return {"success": True, "message": f"用户「{target['username']}」已删除"}


@app.put("/users/{user_id}/password", summary="修改密码")
async def update_password(
    user_id: int,
    body: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    target = get_user_by_id(user_id)
    if not target:
        raise HTTPException(404, "用户不存在")
    # 非管理员只能改自己的密码
    if current_user["role"] != "admin" and target["username"] != current_user["username"]:
        raise HTTPException(403, "权限不足")
    if len(body.new_password) < 6:
        raise HTTPException(400, "密码不能少于6位")
    change_password(user_id, body.new_password)
    return {"success": True, "message": "密码修改成功"}


# ==================== 文档管理 ====================

@app.post("/upload", summary="上传文档入库")
async def upload_document(
    file: UploadFile = File(...),
    kb_group: str = Form("general"),
    _: dict = Depends(get_current_user),
):
    filename = file.filename or "unknown"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("pdf", "docx"):
        raise HTTPException(400, "仅支持 PDF 和 Word(.docx) 格式")
    if kb_group not in ("general", "sic", "diamond"):
        kb_group = "general"

    temp_path = os.path.join(UPLOAD_DIR, f"{uuid.uuid4()}.{ext}")
    try:
        content = await file.read()
        with open(temp_path, "wb") as f:
            f.write(content)
        result = add_document(filename, temp_path, ext, kb_group)
        increment_run_count("doc_auto_import")
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(500, f"文档处理失败：{str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

    return {
        "success": True,
        "message": f"《{filename}》入库成功，共 {result['chunk_count']} 个文本块",
        "data": result,
    }


@app.get("/documents", summary="文档列表")
async def list_documents(_: dict = Depends(get_current_user)):
    return {"success": True, "data": get_all_documents()}


@app.delete("/documents/{doc_id}", summary="删除文档")
async def remove_document(doc_id: str, _: dict = Depends(get_current_user)):
    if not delete_document(doc_id):
        raise HTTPException(404, "文档不存在")
    return {"success": True, "message": "文档已删除"}


# ==================== 多轮对话 ====================

@app.post("/chat", summary="问答（支持指定模型）")
async def chat_endpoint(
    request: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    if not request.message.strip():
        raise HTTPException(400, "消息不能为空")
    session_id = request.session_id or str(uuid.uuid4())
    result = await do_chat(
        session_id, request.message, request.model_id, request.kb_group,
        current_user["username"],
    )
    record_query(session_id, request.message, result.get("model_used"), request.kb_group)
    return {"success": True, "data": result}


@app.delete("/chat/{session_id}", summary="清除会话（兼容旧接口）")
async def clear_chat(session_id: str, _: dict = Depends(get_current_user)):
    clear_session(session_id)
    return {"success": True, "message": "会话已清除"}


# ==================== 会话历史 ====================

@app.get("/sessions", summary="获取历史会话（管理员看全部，普通用户看自己的）")
async def list_sessions(current_user: dict = Depends(get_current_user)):
    username = None if current_user["role"] == "admin" else current_user["username"]
    return {"success": True, "data": get_all_sessions(username)}


@app.get("/sessions/{session_id}", summary="获取某个会话的完整对话历史")
async def get_session_detail(session_id: str, current_user: dict = Depends(get_current_user)):
    username = None if current_user["role"] == "admin" else current_user["username"]
    data = get_session(session_id, username)
    if data is None:
        raise HTTPException(404, "会话不存在")
    return {"success": True, "data": data}


@app.delete("/sessions/{session_id}", summary="删除会话")
async def delete_session(session_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin" and not session_belongs_to(session_id, current_user["username"]):
        raise HTTPException(404, "会话不存在")
    clear_session(session_id)
    return {"success": True, "message": "会话已删除"}


# ==================== 多模型管理（仅管理员） ====================

def _mask_key(key: str) -> str:
    if not key:
        return "未设置"
    if len(key) > 10:
        return f"{key[:6]}...{key[-4:]}"
    return "已设置"


@app.get("/models", summary="获取模型列表（全员可读，管理员可见详情）")
async def list_models(current_user: dict = Depends(get_current_user)):
    is_admin = current_user["role"] == "admin"
    result = [
        {
            "id": m.id,
            "name": m.name,
            "is_default": m.is_default,
            # 以下字段仅管理员可见
            **({"api_key_masked": _mask_key(m.api_key), "base_url": m.base_url, "model_name": m.model_name} if is_admin else {}),
        }
        for m in cfg.get_all_models()
    ]
    return {"success": True, "data": result}


@app.post("/models", summary="添加模型")
async def create_model(body: ModelCreate, _: dict = Depends(require_admin)):
    model = cfg.add_model(
        name=body.name,
        api_key=body.api_key,
        base_url=body.base_url,
        model_name=body.model_name,
        is_default=body.is_default,
    )
    return {
        "success": True,
        "message": f"模型「{model.name}」添加成功",
        "data": {"id": model.id, "name": model.name, "is_default": model.is_default},
    }


@app.put("/models/{model_id}", summary="更新模型")
async def update_model(model_id: str, body: ModelUpdate, _: dict = Depends(require_admin)):
    updates = body.model_dump(exclude_none=True)
    if updates.get("api_key") == "":
        del updates["api_key"]
    result = cfg.update_model(model_id, **updates)
    if result is None:
        raise HTTPException(404, "模型不存在")
    return {"success": True, "message": "更新成功"}


@app.delete("/models/{model_id}", summary="删除模型")
async def delete_model(model_id: str, _: dict = Depends(require_admin)):
    if not cfg.delete_model(model_id):
        raise HTTPException(404, "模型不存在")
    return {"success": True, "message": "模型已删除"}


@app.post("/models/{model_id}/default", summary="设为默认模型")
async def set_default(model_id: str, _: dict = Depends(require_admin)):
    if not cfg.set_default_model(model_id):
        raise HTTPException(404, "模型不存在")
    return {"success": True, "message": "已设为默认模型"}


# ==================== 使用统计 ====================

@app.get("/stats/summary", summary="统计概览")
async def stats_summary(_: dict = Depends(get_current_user)):
    return {"success": True, "data": get_summary()}


@app.get("/stats/recent", summary="最近提问记录")
async def stats_recent(limit: int = 10, _: dict = Depends(get_current_user)):
    return {"success": True, "data": get_recent_queries(min(limit, 50))}


@app.get("/stats/top", summary="Top5 高频问题")
async def stats_top(limit: int = 5, _: dict = Depends(get_current_user)):
    return {"success": True, "data": get_top_questions(limit)}


@app.post("/feedback", summary="提交问答反馈")
async def submit_feedback(body: FeedbackRequest, _: dict = Depends(get_current_user)):
    if body.feedback not in ("up", "down"):
        raise HTTPException(400, "feedback 只能是 'up' 或 'down'")
    record_feedback(body.session_id, body.msg_index, body.feedback)
    increment_run_count("answer_feedback")
    return {"success": True, "message": "反馈已记录"}


# ==================== 工作流管理（仅管理员） ====================

@app.get("/workflows", summary="获取工作流列表")
async def list_workflows(_: dict = Depends(require_admin)):
    return {"success": True, "data": get_all_workflows()}


@app.put("/workflows/{workflow_id}/toggle", summary="切换工作流开关")
async def toggle_wf(
    workflow_id: str,
    body: WorkflowToggleRequest,
    _: dict = Depends(require_admin),
):
    ok = toggle_workflow(workflow_id, body.enabled)
    if not ok:
        raise HTTPException(404, "工作流不存在")
    state = "已开启" if body.enabled else "已关闭"
    return {"success": True, "message": f"工作流{state}"}


# ==================== 系统信息（公开） ====================

@app.get("/config", summary="系统配置")
async def get_system_config():
    return {
        "success": True,
        "data": {
            "embedding_model": cfg.settings.EMBEDDING_MODEL_NAME,
            "chroma_db_path": cfg.settings.CHROMA_DB_PATH,
            "chunk_size": cfg.settings.CHUNK_SIZE,
            "top_k": cfg.settings.TOP_K,
            "model_count": len(cfg.models_store),
        },
    }


@app.get("/health")
async def health():
    default = cfg.get_default_model()
    return {
        "status": "ok",
        "service": "数字专家系统",
        "model_count": len(cfg.models_store),
        "default_model": default.name if default else None,
    }


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"数字专家系统后端启动中，端口：{port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port)
