"""
系统配置模块
多模型支持：每个模型有独立的 name/api_key/base_url/model_name，持久化到 models.json
"""
import uuid
import json
import os
from typing import List, Optional

from pydantic import BaseModel as PydanticModel, ConfigDict
from pydantic_settings import BaseSettings


# ==================== 模型实体 ====================

class LLMModel(PydanticModel):
    model_config = ConfigDict(protected_namespaces=())

    id: str
    name: str          # 界面显示名称，如 "DeepSeek"
    api_key: str
    base_url: str
    model_name: str    # 实际调用的模型 ID，如 "deepseek-chat"
    is_default: bool = False


# ==================== 系统级设置（非大模型） ====================

class Settings(BaseSettings):
    # 中文 Embedding 模型
    EMBEDDING_MODEL_NAME: str = "shibing624/text2vec-base-chinese"

    # ChromaDB 存储路径
    CHROMA_DB_PATH: str = "./chroma_db"

    # 文本分块
    CHUNK_SIZE: int = 500
    CHUNK_OVERLAP: int = 50

    # 语义召回数量
    TOP_K: int = 5

    # 多轮对话保留轮数
    MAX_HISTORY_TURNS: int = 10

    # 多模型配置持久化文件
    MODELS_FILE: str = "./models.json"

    model_config = ConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        protected_namespaces=(),
    )


settings = Settings()

# ==================== 内存多模型列表 ====================

models_store: List[LLMModel] = []


# ==================== 持久化 ====================

def _save():
    """将当前模型列表写入 JSON 文件"""
    try:
        with open(settings.MODELS_FILE, "w", encoding="utf-8") as f:
            json.dump([m.model_dump() for m in models_store], f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"⚠️ 保存模型配置失败: {e}")


def _load():
    """启动时从 JSON 文件恢复模型列表"""
    if not os.path.exists(settings.MODELS_FILE):
        return
    try:
        with open(settings.MODELS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        for item in data:
            models_store.append(LLMModel(**item))
        print(f"✅ 已加载 {len(models_store)} 个模型配置")
    except Exception as e:
        print(f"⚠️ 加载模型配置失败: {e}")


_load()  # 模块导入时立即加载


# ==================== 模型操作函数 ====================

def get_all_models() -> List[LLMModel]:
    return models_store


def get_model_by_id(model_id: str) -> Optional[LLMModel]:
    return next((m for m in models_store if m.id == model_id), None)


def get_default_model() -> Optional[LLMModel]:
    """返回标记为默认的模型；若无，返回第一个"""
    for m in models_store:
        if m.is_default:
            return m
    return models_store[0] if models_store else None


def add_model(
    name: str, api_key: str, base_url: str, model_name: str, is_default: bool = False
) -> LLMModel:
    # 若列表为空，强制设为默认
    if not models_store:
        is_default = True
    if is_default:
        for m in models_store:
            m.is_default = False

    model = LLMModel(
        id=str(uuid.uuid4()),
        name=name,
        api_key=api_key,
        base_url=base_url,
        model_name=model_name,
        is_default=is_default,
    )
    models_store.append(model)
    _save()
    return model


def update_model(model_id: str, **kwargs) -> Optional[LLMModel]:
    model = get_model_by_id(model_id)
    if not model:
        return None
    # 设置默认时先清除其他
    if kwargs.get("is_default"):
        for m in models_store:
            m.is_default = False
    for k, v in kwargs.items():
        if v is not None and hasattr(model, k):
            setattr(model, k, v)
    _save()
    return model


def delete_model(model_id: str) -> bool:
    global models_store
    model = get_model_by_id(model_id)
    if not model:
        return False
    was_default = model.is_default
    models_store = [m for m in models_store if m.id != model_id]
    # 删除的是默认模型时，自动将第一个设为默认
    if was_default and models_store:
        models_store[0].is_default = True
    _save()
    return True


def set_default_model(model_id: str) -> bool:
    model = get_model_by_id(model_id)
    if not model:
        return False
    for m in models_store:
        m.is_default = False
    model.is_default = True
    _save()
    return True
