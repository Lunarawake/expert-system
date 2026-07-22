"""
企业微信接入模块
员工在企业微信发消息 → 本服务接收 → 调用AI问答 → 通过企业微信API回复
"""
import hashlib
import struct
import base64
import time
import xml.etree.ElementTree as ET
from typing import Optional

import requests as http
from fastapi import APIRouter, Request, Response

# ==================== 企业微信配置（部署后填写） ====================

CORP_ID = "wwbdba07e2dd6d4382"   # 企业ID，在企业微信管理后台「我的企业」页面查看
AGENT_ID = "1000002"              # 应用AgentId，在「应用管理」页面查看
CORP_SECRET = ""                  # 应用Secret，在「应用管理 → 该应用详情」页面查看
TOKEN = "cristar2026"             # 自定义Token，在企业微信后台「接收消息」填写同样的值
ENCODING_AES_KEY = ""             # 消息加解密Key（43位字符串），配置后端回调时后台会生成，填入此处

# ==================== 路由 ====================

router = APIRouter()

# ==================== access_token 缓存 ====================

_token_cache: dict = {"value": None, "expires_at": 0.0}


def _get_access_token() -> Optional[str]:
    """
    获取企业微信 access_token。
    有效期2小时，提前5分钟自动刷新，缓存在内存避免频繁请求。
    CORP_SECRET 未配置时返回 None。
    """
    if not CORP_SECRET:
        return None
    now = time.time()
    if _token_cache["value"] and now < _token_cache["expires_at"]:
        return _token_cache["value"]
    try:
        resp = http.get(
            "https://qyapi.weixin.qq.com/cgi-bin/gettoken",
            params={"corpid": CORP_ID, "corpsecret": CORP_SECRET},
            timeout=10,
        )
        data = resp.json()
        token = data.get("access_token")
        expires_in = data.get("expires_in", 7200)
        if not token:
            print(f"⚠️ 获取 access_token 失败: {data}")
            return None
        _token_cache["value"] = token
        _token_cache["expires_at"] = now + expires_in - 300  # 提前5分钟续期
        print("✅ 企业微信 access_token 已刷新")
        return token
    except Exception as e:
        print(f"⚠️ 获取企业微信 access_token 异常: {e}")
        return None


# ==================== 签名计算 ====================

def _sha1(*args: str) -> str:
    """计算企业微信签名：对所有参数排序后拼接做 SHA1"""
    return hashlib.sha1("".join(sorted(args)).encode("utf-8")).hexdigest()


# ==================== AES 解密（安全模式） ====================

def _aes_decrypt(encrypted_b64: str) -> str:
    """
    解密企业微信安全模式下的消息体。
    EncodingAESKey（43位）补一个"="变成44位再 base64 解码得到32字节 AES 密钥。
    数据格式：random(16) + msgLen(4, big-endian) + msg_xml + corp_id
    """
    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        from cryptography.hazmat.backends import default_backend

        key = base64.b64decode(ENCODING_AES_KEY + "=")  # 32字节 = AES-256
        iv = key[:16]
        ciphertext = base64.b64decode(encrypted_b64)

        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
        raw = cipher.decryptor().update(ciphertext)

        # 去掉 PKCS7 填充
        pad_len = raw[-1]
        raw = raw[:-pad_len]

        # 跳过随机头16字节，取消息长度（4字节大端整数），再取消息体
        msg_len = struct.unpack(">I", raw[16:20])[0]
        return raw[20: 20 + msg_len].decode("utf-8")
    except Exception as e:
        print(f"⚠️ AES解密失败: {e}")
        return ""


# ==================== 发送消息 ====================

def _send_text(user_id: str, content: str):
    """
    调用企业微信「发送应用消息」API 主动回复员工。
    单条文本消息上限约2048字，超出自动截断并提示。
    """
    token = _get_access_token()
    if not token:
        print(f"⚠️ 消息未发送（CORP_SECRET未配置）: {content[:60]}")
        return

    # 企业微信文本消息最大约2048字符，超出截断
    MAX_LEN = 1800
    if len(content) > MAX_LEN:
        content = content[:MAX_LEN] + "\n\n……（内容较长，建议在网页端查看完整回答）"

    try:
        resp = http.post(
            f"https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token={token}",
            json={
                "touser": user_id,        # 接收人的企业微信UserID
                "msgtype": "text",
                "agentid": int(AGENT_ID),
                "text": {"content": content},
                "safe": 0,                # 0=普通消息，1=保密消息
            },
            timeout=10,
        )
        data = resp.json()
        if data.get("errcode") != 0:
            print(f"⚠️ 企业微信发送消息失败 errcode={data.get('errcode')}: {data.get('errmsg')}")
    except Exception as e:
        print(f"⚠️ 企业微信发送消息异常: {e}")


# ==================== 接口：验证回调URL ====================

@router.get("", summary="企业微信回调URL验证")
async def wechat_verify(request: Request):
    """
    企业微信在管理后台配置「接收消息服务器URL」时，会向该地址发 GET 请求来验证。
    验证逻辑：对 [Token, timestamp, nonce] 排序拼接后 SHA1，与 msg_signature 对比。
    安全模式下 echostr 是加密的，需先解密再返回；明文模式直接返回 echostr。
    """
    p = request.query_params
    msg_signature = p.get("msg_signature", "")
    timestamp = p.get("timestamp", "")
    nonce = p.get("nonce", "")
    echostr = p.get("echostr", "")

    if ENCODING_AES_KEY:
        # 安全模式：签名包含加密的 echostr
        expected = _sha1(TOKEN, timestamp, nonce, echostr)
        if expected != msg_signature:
            print(f"⚠️ 企业微信URL验证签名不匹配 expected={expected} got={msg_signature}")
            return Response(content="签名验证失败", status_code=403)
        # 解密 echostr 取出原始随机串返回
        plain = _aes_decrypt(echostr)
        if not plain:
            return Response(content="解密失败", status_code=500)
        return Response(content=plain, media_type="text/plain")
    else:
        # 明文模式（EncodingAESKey 未配置时的测试模式）
        expected = _sha1(TOKEN, timestamp, nonce)
        if expected != msg_signature:
            print(f"⚠️ 企业微信URL验证签名不匹配 expected={expected} got={msg_signature}")
            return Response(content="签名验证失败", status_code=403)
        return Response(content=echostr, media_type="text/plain")


# ==================== 接口：接收消息并回复 ====================

@router.post("", summary="接收企业微信员工消息并AI回复")
async def wechat_message(request: Request):
    """
    企业微信将员工发送的消息推送到此接口（POST XML格式）。
    安全模式下消息体被 AES 加密，需先解密；明文模式直接解析 XML。
    处理流程：提取文本内容 → 调用AI问答 → 通过API发送回复 → 返回 "success"。
    必须返回字符串 "success"，否则企业微信会认为投递失败并重试。
    """
    body = await request.body()

    # 解析外层 XML
    try:
        root = ET.fromstring(body.decode("utf-8"))
    except Exception as e:
        print(f"⚠️ 解析企业微信XML失败: {e}, body={body[:200]}")
        return Response(content="success", media_type="text/plain")

    # 安全模式：外层只有 Encrypt 字段，需解密后再解析真正的消息 XML
    encrypt_node = root.find("Encrypt")
    if encrypt_node is not None and encrypt_node.text:
        if not ENCODING_AES_KEY:
            print("⚠️ 收到加密消息但 ENCODING_AES_KEY 未配置，忽略")
            return Response(content="success", media_type="text/plain")

        # 验证消息签名
        p = request.query_params
        expected = _sha1(TOKEN, p.get("timestamp", ""), p.get("nonce", ""), encrypt_node.text)
        if expected != p.get("msg_signature", ""):
            print("⚠️ 企业微信消息签名验证失败，忽略该消息")
            return Response(content="success", media_type="text/plain")

        # 解密得到真正的消息 XML 字符串
        xml_str = _aes_decrypt(encrypt_node.text)
        if not xml_str:
            return Response(content="success", media_type="text/plain")
        try:
            root = ET.fromstring(xml_str)
        except Exception as e:
            print(f"⚠️ 解析解密后消息XML失败: {e}")
            return Response(content="success", media_type="text/plain")

    # 提取关键字段
    msg_type = root.findtext("MsgType", "").strip()
    from_user = root.findtext("FromUserName", "").strip()  # 发消息员工的UserID
    content = root.findtext("Content", "").strip()         # 文本内容

    # 当前只处理文本消息，其他类型（图片/语音/事件等）直接确认接收
    if msg_type != "text" or not content or not from_user:
        return Response(content="success", media_type="text/plain")

    print(f"📨 企业微信消息 [{from_user}]: {content[:100]}")

    # 调用AI问答
    try:
        from chat import chat as do_chat
        # 每个员工用独立的会话ID，保持上下文连续性
        session_id = f"wechat_{from_user}"
        result = await do_chat(
            session_id,
            content,
            username=f"wechat:{from_user}",  # 企业微信用户单独命名空间
        )
        answer = result.get("answer", "抱歉，暂时无法回答您的问题，请稍后再试。")

        # 去除参考来源标注（企业微信消息场景不需要）
        if "\n\n---\n" in answer:
            answer = answer[: answer.index("\n\n---\n")]
    except Exception as e:
        print(f"⚠️ AI问答异常: {e}")
        answer = "系统暂时繁忙，请稍后再试。"

    # 发送回复给员工
    _send_text(from_user, answer)

    # 企业微信要求响应体为 "success"（或空）才认为投递成功
    return Response(content="success", media_type="text/plain")
