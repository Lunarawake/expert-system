# 数字专家系统

基于 RAG（检索增强生成）技术的中文专业知识库问答系统。上传 PDF/Word 文档建立知识库，通过 Web 界面进行智能问答。

## 功能特性

- 📄 **文档入库**：支持 PDF、Word(.docx) 上传，自动分块（500字/块，50字重叠）向量化
- 🔍 **语义检索**：中文 Embedding（shibing624/text2vec-base-chinese），召回 top-5 相关片段
- 💬 **多轮对话**：保留最近 10 轮上下文，回答末尾标注参考来源
- 🤖 **模型配置化**：支持所有兼容 OpenAI 格式的接口，一键切换模型
- 📱 **响应式界面**：PC 和手机浏览器均可使用

---

## 快速启动

### 第一步：启动后端

```bash
cd expert-system/backend

# 建议使用虚拟环境
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate

# 安装依赖（首次约需几分钟）
pip install -r requirements.txt

# 复制并编辑配置文件
cp .env.example .env
# 用编辑器打开 .env，填入你的 API Key（也可启动后在网页配置）

# 启动服务（首次会下载 Embedding 模型，约 400MB）
python main.py
```

后端运行在 **http://localhost:8000**，API 文档：http://localhost:8000/docs

### 第二步：启动前端

```bash
cd expert-system/frontend

npm install
npm run dev
```

前端运行在 **http://localhost:3000**，打开浏览器访问即可使用。

---

## 填写 API Key

**方式一：网页配置（推荐）**

打开 http://localhost:3000，点击顶部「系统配置」标签，选择预设或手动填写，保存即刻生效。

**方式二：编辑 .env 文件（持久化）**

```env
# backend/.env
LLM_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL_NAME=gpt-4o-mini
```

修改后重启后端生效。

---

## 支持的模型

| 平台 | Base URL | 推荐模型 |
|------|----------|---------|
| OpenAI | `https://api.openai.com/v1` | gpt-4o-mini |
| DeepSeek | `https://api.deepseek.com/v1` | deepseek-chat |
| 智谱 AI | `https://open.bigmodel.cn/api/paas/v4` | glm-4-flash（免费） |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | qwen-turbo |
| Moonshot | `https://api.moonshot.cn/v1` | moonshot-v1-8k |
| 零一万物 | `https://api.lingyiwanwu.com/v1` | yi-lightning |

> 所有兼容 OpenAI `/chat/completions` 接口的服务均可接入。

---

## 接入新模型

只需修改三个字段（网页配置或 .env 均可）：

```
LLM_BASE_URL    →  新模型的 API 地址
LLM_MODEL_NAME  →  新模型名称
LLM_API_KEY     →  对应平台的 API Key
```

---

## API 接口文档

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/upload` | 上传文档入库（multipart/form-data） |
| GET | `/documents` | 获取已入库文档列表 |
| DELETE | `/documents/{doc_id}` | 删除指定文档 |
| POST | `/chat` | 多轮对话（`{"session_id":"...", "message":"..."}`) |
| DELETE | `/chat/{session_id}` | 清除会话历史 |
| GET | `/config` | 查看当前模型配置 |
| POST | `/config` | 更新模型配置 |
| GET | `/health` | 服务健康检查 |

完整 Swagger 文档：http://localhost:8000/docs

---

## 项目结构

```
expert-system/
├── backend/
│   ├── main.py              # FastAPI 主入口，所有接口
│   ├── config.py            # 配置管理（API Key、模型名称等）
│   ├── knowledge_base.py    # 文档解析 + 向量入库
│   ├── retriever.py         # 中文语义搜索召回
│   ├── chat.py              # 多轮对话 + 上下文记忆
│   ├── requirements.txt
│   └── .env.example         # 配置文件模板
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── index.css
    │   ├── main.jsx
    │   └── components/
    │       ├── ChatWindow.jsx      # 对话窗口
    │       ├── FileUpload.jsx      # 文档上传管理
    │       └── ModelConfig.jsx     # 模型配置面板
    ├── vite.config.js
    └── package.json
```

---

## 常见问题

**Q: 首次启动很慢？**  
A: 首次运行会下载中文 Embedding 模型（约 400MB），需要网络连接，请耐心等待。

**Q: 向量数据库数据在哪？**  
A: 存储在 `backend/chroma_db/` 目录，重启服务后数据保留。删除该目录可清空知识库。

**Q: 对话历史会保存吗？**  
A: 对话历史存储在内存中，重启后端后清空。session_id 存储在浏览器 localStorage，刷新页面后可继续同一会话。

**Q: 如何对接微信？**  
A: 后端已配置 CORS 允许所有来源，将后端部署到公网服务器后，微信小程序直接调用 `/chat` 接口即可。

---

## 生产部署：systemd 开机自启

仓库自带 `backend/expert-system.service`，把它安装为系统服务后，服务器重启会自动拉起后端，进程崩溃也会自动重启。

```bash
# 1. 把服务文件复制到 systemd 目录
cp /var/www/expert-system/backend/expert-system.service /etc/systemd/system/expert-system.service

# 2. 重新加载 systemd 配置
systemctl daemon-reload

# 3. 设置开机自启
systemctl enable expert-system

# 4. 立即启动服务
systemctl start expert-system
```

常用管理命令：

```bash
systemctl status expert-system   # 查看运行状态
systemctl restart expert-system  # 重启服务
journalctl -u expert-system -f   # 实时查看日志
```

> `expert-system.service` 里的 `ExecStart` 假设虚拟环境路径为 `backend/venv`；如果服务器上的虚拟环境目录名不同，需同步修改该文件里的路径后再执行上述步骤。
