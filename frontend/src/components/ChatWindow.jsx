import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import axios from 'axios'

const API = '/api'

// ==================== 引导式提问配置 ====================
const GUIDE_CONFIG = [
  {
    id: 'sic',
    label: '碳化硅产品',
    directions: ['热场相关', '压力相关', '功率相关', '工艺参数', '缺陷分析', '其他'],
  },
  {
    id: 'diamond',
    label: '金刚石产品',
    directions: ['热场相关', '压力相关', '合成工艺', '品质检测', '其他'],
  },
  {
    id: 'other',
    label: '其他产品',
    directions: ['其他'],
  },
]

const SUGGESTION_SETS = [
  ['碳化硅热场材料主要性能指标？', '金刚石合成工艺关键参数是什么？', '压力系统维护注意事项？', '碳化硅缺陷分析检测方法？'],
  ['功率器件对碳化硅材料的要求？', '金刚石品质检测的评价标准？', '工艺参数对产品性能的影响？', '如何提升合成工艺的稳定性？'],
]

// ==================== 工具函数 ====================

function buildFinalMessage(categoryLabel, directions, rawInput) {
  return `【产品类别：${categoryLabel}】【问题方向：${directions.join('、')}】${rawInput.trim()}`
}

function parseAnswer(content) {
  const MARKER = '\n\n---\n📚 **参考来源：**'
  const idx = content.indexOf(MARKER)
  if (idx === -1) return { text: content, sources: null }
  const text = content.slice(0, idx)
  const sourceStr = content.slice(idx + MARKER.length).trim()
  return { text, sources: sourceStr.split(', ').filter(Boolean) }
}

// ==================== 子组件 ====================

function WelcomeBanner() {
  return (
    <div className="welcome-banner">
      <div className="welcome-text">
        <div className="welcome-tag">✨ AI 专家助手</div>
        <h2 className="welcome-title">您好，我是数字专家</h2>
        <p className="welcome-subtitle">
          基于知识库和大模型的智能问答助手<br />
          专注碳化硅、金刚石等超硬材料领域，为您提供专业、准确的解答
        </p>
      </div>
      <div className="welcome-avatar-wrap">
        <div className="welcome-avatar-circle">🤖</div>
      </div>
    </div>
  )
}

function AssistantMessage({ content, msgIdx, usedModel, copiedIdx, onCopy }) {
  const [sourcesExpanded, setSourcesExpanded] = useState(false)
  const { text, sources } = parseAnswer(content)
  const isCopied = copiedIdx === msgIdx

  return (
    <div className="message assistant">
      <div className="msg-avatar ai">🤖</div>
      <div className="ai-message-wrapper">
        {sources && (
          <button className="source-badge" onClick={() => setSourcesExpanded(v => !v)}>
            <span>📚</span>
            <span>已搜索知识库，参考 <strong>{sources.length}</strong> 篇资料</span>
            <span className="source-badge-arrow">{sourcesExpanded ? '▴' : '▾'}</span>
          </button>
        )}
        {usedModel && (
          <span style={{
            fontSize: 11, color: 'var(--text-3)', marginLeft: 2,
            background: 'var(--bg)', border: '1px solid var(--border)',
            padding: '1px 7px', borderRadius: 10, alignSelf: 'flex-start',
          }}>
            🤖 {usedModel}
          </span>
        )}
        <div className="bubble ai-bubble">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
        {sources && sourcesExpanded && (
          <div className="source-list">
            {sources.map((s, i) => <span key={i} className="source-chip">{s}</span>)}
          </div>
        )}
        <div className="msg-actions">
          <button
            className={`msg-action-btn ${isCopied ? 'copied' : ''}`}
            onClick={() => onCopy(text, msgIdx)}
          >
            {isCopied ? '✓ 已复制' : '📋 复制'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ==================== 主组件 ====================

function ChatWindow({ sessionId, onModelChange, onMessageSent }) {
  const [messages, setMessages] = useState([])
  const [sessionTitle, setSessionTitle] = useState('')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState(null)
  const [suggestionPage, setSuggestionPage] = useState(0)

  // 多模型选择
  const [models, setModels] = useState([])
  const [selectedModelId, setSelectedModelId] = useState(null)

  // 引导选择
  const [selectedCatId, setSelectedCatId] = useState(null)
  const [selectedDirs, setSelectedDirs] = useState([])

  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  const currentCat = GUIDE_CONFIG.find(c => c.id === selectedCatId)
  const currentModel = models.find(m => m.id === selectedModelId)
  const canSend = !loading && !!selectedModelId && !!selectedCatId && selectedDirs.length > 0 && !!input.trim()
  const suggestions = SUGGESTION_SETS[suggestionPage % SUGGESTION_SETS.length]

  // 加载模型列表（只需加载一次）
  useEffect(() => {
    axios.get(`${API}/models`).then(res => {
      const data = res.data.data || []
      setModels(data)
      const def = data.find(m => m.is_default) || data[0]
      if (def) {
        setSelectedModelId(def.id)
        onModelChange?.(def.name)
      }
    }).catch(() => {})
  }, [])

  // 当 sessionId 变化时：清空并加载对应会话历史
  useEffect(() => {
    if (!sessionId) return
    setMessages([])
    setSessionTitle('')
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    axios.get(`${API}/sessions/${sessionId}`)
      .then(res => {
        const data = res.data.data
        if (data?.messages?.length > 0) {
          setMessages(data.messages)
          setSessionTitle(data.title || '')
        }
      })
      .catch(() => {
        // 新会话或不存在，保持空白欢迎界面
      })
  }, [sessionId])

  // 自动滚底
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const autoResize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 130) + 'px'
  }

  const handleCatToggle = (catId) => {
    if (selectedCatId === catId) { setSelectedCatId(null); setSelectedDirs([]) }
    else { setSelectedCatId(catId); setSelectedDirs([]) }
  }

  const handleDirToggle = (dir) => {
    setSelectedDirs(prev => prev.includes(dir) ? prev.filter(d => d !== dir) : [...prev, dir])
  }

  const handleModelSelect = (modelId) => {
    setSelectedModelId(modelId)
    const m = models.find(m => m.id === modelId)
    onModelChange?.(m?.name || '')
  }

  const sendMessage = useCallback(async () => {
    if (!canSend) return
    const finalMsg = buildFinalMessage(currentCat.label, selectedDirs, input)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setMessages(prev => [...prev, { role: 'user', content: finalMsg }])
    setLoading(true)
    try {
      const res = await axios.post(`${API}/chat`, {
        session_id: sessionId,
        message: finalMsg,
        model_id: selectedModelId,
      })
      const { answer, model_used } = res.data.data
      setMessages(prev => [...prev, { role: 'assistant', content: answer, model_used }])
      onMessageSent?.()
      // 首条消息后更新本地标题显示
      if (!sessionTitle) setSessionTitle(finalMsg.slice(0, 20))
    } catch (err) {
      const detail = err.response?.data?.detail || '请求失败，请检查后端服务是否启动'
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ **错误：** ${detail}` }])
    } finally {
      setLoading(false)
    }
  }, [canSend, currentCat, selectedDirs, input, sessionId, selectedModelId, sessionTitle])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const copyMessage = async (text, idx) => {
    try { await navigator.clipboard.writeText(text) } catch {}
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  const textareaPlaceholder = !selectedModelId
    ? '请先选择要使用的模型...'
    : !selectedCatId
    ? '请先选择产品类别...'
    : selectedDirs.length === 0
    ? '请选择问题方向后再输入...'
    : '请详细描述您的具体问题（Enter 发送，Shift+Enter 换行）'

  return (
    <div className="chat-container">
      {/* 消息列表 */}
      <div className="chat-messages">
        {messages.length === 0 && <WelcomeBanner />}

        {/* 历史会话标题栏 */}
        {sessionTitle && messages.length > 0 && (
          <div className="session-title-bar">
            <span className="session-title-icon">💬</span>
            <span className="session-title-text">{sessionTitle}</span>
          </div>
        )}

        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <div key={i} className="message user">
              <div className="bubble user-bubble">{msg.content}</div>
              <div className="msg-avatar">👤</div>
            </div>
          ) : (
            <AssistantMessage
              key={i}
              content={msg.content}
              msgIdx={i}
              usedModel={msg.model_used}
              copiedIdx={copiedIdx}
              onCopy={copyMessage}
            />
          )
        )}

        {loading && (
          <div className="message assistant">
            <div className="msg-avatar ai">🤖</div>
            <div className="bubble ai-bubble">
              <div className="loading-dots"><span /><span /><span /></div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 引导式选择面板 */}
      <div className="guide-panel">
        {/* 第零级：选择模型 */}
        <div className="guide-row">
          <span className="guide-row-label">使用模型</span>
          {models.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--error)' }}>
              ⚠️ 尚未配置模型，请前往「模型配置」页面添加
            </span>
          ) : (
            <div className="tag-group">
              {models.map(m => (
                <button
                  key={m.id}
                  className={`tag ${selectedModelId === m.id ? 'tag-cat-selected' : ''}`}
                  onClick={() => handleModelSelect(m.id)}
                  title={`${m.model_name} · ${m.base_url}`}
                >
                  {m.name}
                  {m.is_default && <span style={{ fontSize: 9, marginLeft: 3, opacity: 0.7 }}>默认</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 第一级：产品类别 */}
        <div className="guide-row">
          <span className="guide-row-label">产品类别</span>
          <div className="tag-group">
            {GUIDE_CONFIG.map(cat => (
              <button
                key={cat.id}
                className={`tag ${selectedCatId === cat.id ? 'tag-cat-selected' : ''}`}
                onClick={() => handleCatToggle(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* 第二级：问题方向（联动） */}
        {currentCat && (
          <div className="guide-row">
            <span className="guide-row-label">问题方向</span>
            <div className="tag-group">
              {currentCat.directions.map(dir => (
                <button
                  key={dir}
                  className={`tag ${selectedDirs.includes(dir) ? 'tag-dir-selected' : ''}`}
                  onClick={() => handleDirToggle(dir)}
                >
                  {dir}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 已选预览 */}
        {selectedCatId && selectedDirs.length > 0 && (
          <div className="guide-preview">
            {currentModel && <span className="guide-preview-badge" style={{ background: '#722ed1' }}>{currentModel.name}</span>}
            <span className="guide-preview-badge">{currentCat.label}</span>
            {selectedDirs.map(d => <span key={d} className="guide-preview-badge dir">{d}</span>)}
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="chat-input-area">
        <div className="chat-input-row">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            placeholder={textareaPlaceholder}
            value={input}
            onChange={e => { setInput(e.target.value); autoResize() }}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={loading || !selectedModelId || !selectedCatId || selectedDirs.length === 0}
          />
          <button
            className="send-btn"
            onClick={sendMessage}
            disabled={!canSend}
            title={!selectedModelId ? '请先选择模型' : !selectedCatId ? '请选择产品类别' : selectedDirs.length === 0 ? '请选择问题方向' : '发送'}
          >
            ➤
          </button>
        </div>
      </div>

      {/* 快捷问题栏 */}
      <div className="suggestion-bar">
        {suggestions.map((q, i) => (
          <button key={i} className="suggestion-chip"
            onClick={() => { setInput(q); textareaRef.current?.focus() }}>
            {q}
          </button>
        ))}
        <button className="suggestion-refresh" onClick={() => setSuggestionPage(p => p + 1)}>
          ↻ 换一换
        </button>
      </div>
    </div>
  )
}

export default ChatWindow
