import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import axios from 'axios'
import {
  ChipIcon, BookIcon, GemIcon, CrystalIcon, SearchIcon, SparkleIcon,
  CopyIcon, ThumbsUpIcon, ThumbsDownIcon, UserIcon, AlertTriangleIcon,
  TagIcon, CheckIcon, SendIcon, RefreshIcon, ChatIcon,
} from './Icons'

const API = '/api'

// ==================== 知识库分组配置 ====================
const KB_GROUPS = [
  { id: 'all',     label: '全部',     Icon: SearchIcon },
  { id: 'general', label: '通用库',   Icon: BookIcon },
  { id: 'sic',     label: '碳化硅库', Icon: CrystalIcon },
  { id: 'diamond', label: '金刚石库', Icon: GemIcon },
]

// ==================== 引导式提问配置 ====================
const PRODUCT_CATEGORIES = [
  {
    id: 'all',
    name: '全部',
    subCategories: [],
  },
  {
    id: 'pcd',
    name: '聚晶金刚石（PCD）',
    subCategories: ['内部缺陷检测', '石墨化温度', '热导率', '密度与致密性', '电学性能', '烧结工艺', '其他'],
  },
  {
    id: 'sic',
    name: '碳化硅（SiC）',
    subCategories: ['热场相关', '压力相关', '功率器件', '工艺参数', '缺陷分析', '其他'],
  },
  {
    id: 'diamond_sic',
    name: '金刚石-SiC复合材料',
    subCategories: ['高温高压烧结工艺', '工艺参数优化', '性能指标检测', '设备操作（六面顶压机）', '原料配比', '其他'],
  },
  {
    id: 'detection',
    name: '检测与质量管控',
    subCategories: ['原材料检测', '成品性能检测', '数据规律分析', '质量标准', '其他'],
  },
]

const ALL_SUGGESTIONS = [
  { text: 'PCD热导率检测方法是什么？' },
  { text: 'Diamond-SiC烧结压力范围是多少？' },
  { text: '六面顶压机如何调整顶锤？' },
  { text: 'PCD气孔率验收标准是什么？' },
  { text: '如何判断PCD石墨化温度？' },
  { text: 'SiC热场相关工艺参数？' },
]

// ==================== 提示词模板 ====================
const PROMPT_TEMPLATES = [
  {
    id: 'sintering',
    label: 'Diamond-SiC烧结工艺',
    items: [
      { title: '推荐烧结参数', text: '请根据目标热导率[填写]W/(m·K)，推荐合适的烧结温度、保温时间、烧结压力、升温速率、降温速率和金刚石重量占比参数范围。' },
      { title: '计算石墨化边界温度', text: '当烧结压力为[填写]GPa时，根据T上限≈370P-530公式，计算石墨化边界温度，给出安全工艺窗口建议。' },
      { title: '分析石墨化风险', text: '分析石墨化风险：当烧结温度为[填写]℃、压力为[填写]GPa时，是否在安全工艺窗口内？' },
      { title: 'Si与C反应不充分问题', text: 'Si与C反应不充分时有哪些表现特征？如何通过调整工艺参数解决？' },
    ],
  },
  {
    id: 'thermal',
    label: '热学性能分析',
    items: [
      { title: '影响热导率的关键因素', text: '请分析影响Diamond-SiC复合材料室温热导率的关键因素，重点说明界面热阻（TBR）的影响机制。' },
      { title: '热膨胀系数匹配Si芯片', text: '目标热膨胀系数需与Si芯片匹配（2.5~4.5 ppm/K），请推荐满足此约束的材料配比和工艺参数。' },
      { title: '优化热扩散系数', text: '如何通过调整金刚石重量占比（70~90wt%）来优化热扩散系数？' },
    ],
  },
  {
    id: 'microstructure',
    label: '微观结构分析',
    items: [
      { title: '残留Si或石墨相分析', text: '理想物相比例应为"金刚石+SiC"，如果检测到残留Si或石墨相，分别说明原因和改进措施。' },
      { title: '致密度判断与检测', text: '如何判断致密度是否满足高热导率要求？致密度与孔隙率的检测方法有哪些？' },
    ],
  },
  {
    id: 'pcd',
    label: 'PCD性能检测',
    items: [
      { title: 'PCD气孔率验收标准', text: '请说明PCD材料气孔率验收标准：散热级<[填写]%，切削级<[填写]%，并解释检测方法。' },
      { title: 'LFA法测定热导率', text: '如何用激光闪射法（LFA）测定PCD热导率？测量结果如何换算？' },
    ],
  },
]

function pickRandomSuggestions(list, count = 4) {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, count)
}

// ==================== 工具函数 ====================

function buildFinalMessage(categoryLabel, directions, rawInput) {
  if (categoryLabel === '全部') return rawInput.trim()
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
        <div className="welcome-tag"><SparkleIcon size={13} /> AI 专家助手</div>
        <h2 className="welcome-title">您好，我是数字专家</h2>
        <p className="welcome-subtitle">
          基于知识库和大模型的智能问答助手<br />
          专注碳化硅、金刚石、Diamond-SiC复合材料领域，为您提供专业、准确的解答
        </p>
      </div>
      <div className="welcome-avatar-wrap">
        <div className="welcome-avatar-circle"><ChipIcon size={36} /></div>
      </div>
    </div>
  )
}

function AssistantMessage({ content, msgIdx, usedModel, copiedIdx, onCopy, ratedMsgs, onFeedback }) {
  const [sourcesExpanded, setSourcesExpanded] = useState(false)
  const { text, sources } = parseAnswer(content)
  const isCopied = copiedIdx === msgIdx
  const rated = ratedMsgs?.[msgIdx]

  return (
    <div className="message assistant">
      <div className="msg-avatar ai"><ChipIcon size={16} /></div>
      <div className="ai-message-wrapper">
        {sources && (
          <button className="source-badge" onClick={() => setSourcesExpanded(v => !v)}>
            <BookIcon size={14} />
            <span>已搜索知识库，参考 <strong>{sources.length}</strong> 篇资料</span>
            <span className="source-badge-arrow">{sourcesExpanded ? '▴' : '▾'}</span>
          </button>
        )}
        {usedModel && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, color: 'var(--text-3)', marginLeft: 2,
            background: 'var(--bg)', border: '1px solid var(--border)',
            padding: '1px 7px', borderRadius: 10, alignSelf: 'flex-start',
          }}>
            <ChipIcon size={11} /> {usedModel}
          </span>
        )}
        <div className="bubble ai-bubble">
          <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{text}</ReactMarkdown>
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
            {isCopied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
            {isCopied ? '已复制' : '复制'}
          </button>
          {onFeedback && (
            <>
              <button
                className={`msg-action-btn ${rated === 'up' ? 'feedback-up' : ''}`}
                onClick={() => onFeedback(msgIdx, 'up')}
                disabled={!!rated}
                title="这个回答很有帮助"
              >
                <ThumbsUpIcon size={12} /> {rated === 'up' ? '已点赞' : ''}
              </button>
              <button
                className={`msg-action-btn ${rated === 'down' ? 'feedback-down' : ''}`}
                onClick={() => onFeedback(msgIdx, 'down')}
                disabled={!!rated}
                title="这个回答需要改进"
              >
                <ThumbsDownIcon size={12} /> {rated === 'down' ? '已踩' : ''}
              </button>
            </>
          )}
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
  const [suggestions, setSuggestions] = useState(() => pickRandomSuggestions(ALL_SUGGESTIONS))
  const [ratedMsgs, setRatedMsgs] = useState({}) // { msgIdx: 'up'|'down' }

  // 多模型选择
  const [models, setModels] = useState([])
  const [selectedModelId, setSelectedModelId] = useState(null)
  const [showModelMenu, setShowModelMenu] = useState(false)

  // 知识库分组
  const [selectedKbGroup, setSelectedKbGroup] = useState('all')
  const [showKbMenu, setShowKbMenu] = useState(false)

  // 引导选择（折叠式：默认收起，仅展示已选摘要）
  const [selectedCatId, setSelectedCatId] = useState(null)
  const [selectedDirs, setSelectedDirs] = useState([])
  const [showCatMenu, setShowCatMenu] = useState(false)

  // 提示词模板
  const [showTemplates, setShowTemplates] = useState(false)
  const [activeTplCat, setActiveTplCat] = useState(PROMPT_TEMPLATES[0].id)

  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const modelMenuRef = useRef(null)
  const kbMenuRef = useRef(null)
  const catMenuRef = useRef(null)
  const catOverlayRef = useRef(null)

  const currentCat = PRODUCT_CATEGORIES.find(c => c.id === selectedCatId)
  const currentModel = models.find(m => m.id === selectedModelId)
  const canSend = !loading && !!selectedModelId && !!selectedCatId && selectedDirs.length > 0 && !!input.trim()

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
    setRatedMsgs({})
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

  // 点击外部关闭模型下拉
  useEffect(() => {
    if (!showModelMenu) return
    const handler = (e) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target)) {
        setShowModelMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showModelMenu])

  // 点击外部关闭知识库下拉
  useEffect(() => {
    if (!showKbMenu) return
    const handler = (e) => {
      if (kbMenuRef.current && !kbMenuRef.current.contains(e.target)) {
        setShowKbMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showKbMenu])

  // 点击外部关闭产品类别浮层
  useEffect(() => {
    if (!showCatMenu) return
    const handler = (e) => {
      if (
        catMenuRef.current && !catMenuRef.current.contains(e.target) &&
        (!catOverlayRef.current || !catOverlayRef.current.contains(e.target))
      ) {
        setShowCatMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCatMenu])

  const autoResize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 130) + 'px'
  }

  const handleCatToggle = (catId) => {
    if (selectedCatId === catId) { setSelectedCatId(null); setSelectedDirs([]) }
    else {
      setSelectedCatId(catId)
      setSelectedDirs(catId === 'all' ? ['全部'] : [])
      if (catId === 'all') setShowCatMenu(false) // 全部类别无需再选方向，直接收起
    }
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
    const finalMsg = buildFinalMessage(currentCat.name, selectedDirs, input)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setMessages(prev => [...prev, { role: 'user', content: finalMsg }])
    setLoading(true)
    try {
      const res = await axios.post(`${API}/chat`, {
        session_id: sessionId,
        message: finalMsg,
        model_id: selectedModelId,
        kb_group: selectedKbGroup,
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
  }, [canSend, currentCat, selectedDirs, input, sessionId, selectedModelId, selectedKbGroup, sessionTitle])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const copyMessage = async (text, idx) => {
    try { await navigator.clipboard.writeText(text) } catch {}
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  const handleFeedback = async (msgIdx, type) => {
    if (ratedMsgs[msgIdx]) return
    setRatedMsgs(prev => ({ ...prev, [msgIdx]: type }))
    try {
      await axios.post(`${API}/feedback`, {
        session_id: sessionId,
        msg_index: msgIdx,
        feedback: type,
      })
    } catch {
      // 失败时回滚
      setRatedMsgs(prev => { const n = { ...prev }; delete n[msgIdx]; return n })
    }
  }

  const fillTemplate = (text) => {
    setInput(text)
    setShowTemplates(false)
    setTimeout(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      const idx = text.indexOf('[填写]')
      if (idx !== -1) el.setSelectionRange(idx, idx + 4)
    }, 50)
  }

  const catSummaryText = !selectedCatId
    ? '请选择产品类别'
    : selectedCatId === 'all'
    ? '全部'
    : selectedDirs.length > 0
    ? `${currentCat.name} · ${selectedDirs.join('、')}`
    : currentCat.name

  const textareaPlaceholder = !selectedModelId
    ? '请先选择要使用的模型...'
    : !selectedCatId
    ? '请先选择产品类别...'
    : selectedDirs.length === 0
    ? '可以先输入问题，选择问题方向后发送...'
    : '请详细描述您的具体问题（Enter 发送，Shift+Enter 换行）'

  return (
    <div className="chat-container">
      {/* 消息列表 */}
      <div className="chat-messages">
        {messages.length === 0 && <WelcomeBanner />}

        {/* 历史会话标题栏 */}
        {sessionTitle && messages.length > 0 && (
          <div className="session-title-bar">
            <span className="session-title-icon"><ChatIcon size={14} /></span>
            <span className="session-title-text">{sessionTitle}</span>
          </div>
        )}

        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <div key={i} className="message user">
              <div className="bubble user-bubble">{msg.content}</div>
              <div className="msg-avatar"><UserIcon size={16} /></div>
            </div>
          ) : (
            <AssistantMessage
              key={i}
              content={msg.content}
              msgIdx={i}
              usedModel={msg.model_used}
              copiedIdx={copiedIdx}
              onCopy={copyMessage}
              ratedMsgs={ratedMsgs}
              onFeedback={handleFeedback}
            />
          )
        )}

        {loading && (
          <div className="message assistant">
            <div className="msg-avatar ai"><ChipIcon size={16} /></div>
            <div className="bubble ai-bubble">
              <div className="loading-dots"><span /><span /><span /></div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 折叠式选择栏：默认收起，只占一行 */}
      <div className="guide-bar">
        {/* 模型选择 */}
        {models.length === 0 ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--error)' }}>
            <AlertTriangleIcon size={14} /> 尚未配置模型，请前往「模型配置」页面添加
          </span>
        ) : (
          <div ref={modelMenuRef} className="guide-bar-dropdown">
            <button className="model-dropdown" onClick={() => setShowModelMenu(v => !v)}>
              <ChipIcon size={14} />
              <span>{currentModel?.name || '选择模型'}</span>
              {currentModel?.is_default && <span className="model-default-badge">默认</span>}
              <span className="model-dropdown-arrow">{showModelMenu ? '▴' : '▾'}</span>
            </button>
            {showModelMenu && (
              <div className="model-dropdown-menu">
                {models.map(m => (
                  <button
                    key={m.id}
                    className={`model-menu-item ${selectedModelId === m.id ? 'active' : ''}`}
                    onClick={() => { handleModelSelect(m.id); setShowModelMenu(false) }}
                  >
                    <span>{m.name}</span>
                    {m.is_default && <span className="model-default-badge">默认</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="guide-bar-divider" />

        {/* 知识库分组 */}
        <div ref={kbMenuRef} className="guide-bar-dropdown">
          <button className="model-dropdown" onClick={() => setShowKbMenu(v => !v)}>
            {(() => {
              const cur = KB_GROUPS.find(g => g.id === selectedKbGroup)
              const CurIcon = cur?.Icon
              return <>{CurIcon && <CurIcon size={14} />} <span>{cur?.label}</span></>
            })()}
            <span className="model-dropdown-arrow">{showKbMenu ? '▴' : '▾'}</span>
          </button>
          {showKbMenu && (
            <div className="model-dropdown-menu">
              {KB_GROUPS.map(g => (
                <button
                  key={g.id}
                  className={`model-menu-item ${selectedKbGroup === g.id ? 'active' : ''}`}
                  onClick={() => { setSelectedKbGroup(g.id); setShowKbMenu(false) }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <g.Icon size={14} /> {g.label}
                  </span>
                  {g.id === 'all' && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>默认</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="guide-bar-divider" />

        {/* 产品类别 + 问题方向：折叠为单个触发按钮，展开为浮层 */}
        <div ref={catMenuRef} className="category-trigger-wrap">
          <button
            className={`category-trigger ${selectedCatId ? 'has-selection' : ''}`}
            onClick={() => setShowCatMenu(v => !v)}
          >
            <span className="category-trigger-text"><TagIcon size={14} /> {catSummaryText}</span>
            <span className="category-trigger-toggle">切换 {showCatMenu ? '▴' : '▾'}</span>
          </button>
        </div>

        {/* 提示词模板触发按钮（靠右） */}
        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <button
            className={`tpl-toggle-btn ${showTemplates ? 'active' : ''}`}
            onClick={() => setShowTemplates(v => !v)}
            title="提示词模板"
          >
            <BookIcon size={13} />
            <span>提示词模板</span>
            <span style={{ fontSize: 10, opacity: 0.7 }}>{showTemplates ? '▴' : '▾'}</span>
          </button>
        </div>
      </div>

      {/* 产品类别/问题方向选择面板 */}
      {showCatMenu && (
        <div ref={catOverlayRef} className="category-overlay">
          <div className="guide-row">
            <span className="guide-row-label">产品类别</span>
            <div className="tag-group">
              {PRODUCT_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  className={`tag ${selectedCatId === cat.id ? 'tag-cat-selected' : ''}`}
                  onClick={() => handleCatToggle(cat.id)}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {currentCat && selectedCatId !== 'all' && (
            <div className="guide-row">
              <span className="guide-row-label">问题方向</span>
              <div className="tag-group">
                {currentCat.subCategories.map(dir => (
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

          <div className="category-overlay-footer">
            <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 16px' }} onClick={() => setShowCatMenu(false)}>
              <CheckIcon size={13} /> 完成
            </button>
          </div>
        </div>
      )}

      {/* 提示词模板面板 */}
      {showTemplates && (
        <div className="tpl-panel">
          {/* 分类 Tab */}
          <div className="tpl-tabs">
            {PROMPT_TEMPLATES.map(cat => (
              <button
                key={cat.id}
                className={`tpl-tab ${activeTplCat === cat.id ? 'active' : ''}`}
                onClick={() => setActiveTplCat(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* 模板列表 */}
          <div className="tpl-list">
            {PROMPT_TEMPLATES.find(c => c.id === activeTplCat)?.items.map((tpl, i) => (
              <button key={i} className="tpl-item" onClick={() => fillTemplate(tpl.text)}>
                <span className="tpl-item-num">{i + 1}</span>
                <div className="tpl-item-body">
                  <div className="tpl-item-title">{tpl.title}</div>
                  <div className="tpl-item-preview">{tpl.text}</div>
                </div>
                <span className="tpl-item-use">填入 →</span>
              </button>
            ))}
          </div>

          <div className="tpl-hint">
            点击模板自动填入输入框，<strong>[填写]</strong> 处会被选中，直接输入替换即可
          </div>
        </div>
      )}

      {/* 输入区：已选类别/方向以小标签显示在输入框左上角，不单独占行 */}
      <div className="chat-input-area">
        <div className="chat-input-row">
          <div className="textarea-wrap">
            {selectedCatId && (
              <div className="input-corner-tags">
                <span className="input-tag">{currentCat.name}</span>
                {selectedCatId !== 'all' && selectedDirs.map(d => (
                  <span key={d} className="input-tag dir">{d}</span>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              className={`chat-textarea ${selectedCatId ? 'has-corner-tags' : ''}`}
              placeholder={textareaPlaceholder}
              value={input}
              onChange={e => { setInput(e.target.value); autoResize() }}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={loading || !selectedModelId || !selectedCatId}
            />
          </div>
          <button
            className="send-btn"
            onClick={sendMessage}
            disabled={!canSend}
            title={!selectedModelId ? '请先选择模型' : !selectedCatId ? '请选择产品类别' : selectedDirs.length === 0 ? '请选择问题方向' : '发送'}
          >
            <SendIcon size={16} />
          </button>
        </div>
      </div>

      {/* 快捷问题栏：单行横向滚动 */}
      <div className="suggestion-bar">
        <div className="suggestion-grid">
          {suggestions.map((s, i) => (
            <button key={i} className="suggestion-chip"
              onClick={() => { setInput(s.text); textareaRef.current?.focus() }}>
              <span className="suggestion-chip-dot" />
              <span>{s.text}</span>
            </button>
          ))}
        </div>
        <div className="suggestion-bar-header">
          <button className="suggestion-refresh" onClick={() => setSuggestions(pickRandomSuggestions(ALL_SUGGESTIONS))}>
            <RefreshIcon size={12} /> 换一换
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChatWindow
