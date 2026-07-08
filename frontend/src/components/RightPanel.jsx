// 右侧面板：知识库概览、快速上传、最近文档、历史对话
import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { CheckCircleIcon, XCircleIcon, LoaderIcon, UploadIcon, FileTextIcon, ChatIcon, XIcon } from './Icons'

const API = '/api'

function formatTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const now = new Date()
  const diffMs = now - d
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins}分钟前`
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}小时前`
  const diffDays = Math.floor(diffMins / 1440)
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) return `${diffDays}天前`
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function RightPanel({ currentSessionId, sessionVersion, onSessionSelect, onSessionDeleted, onNavChange, isAdmin = false }) {
  const [docs, setDocs] = useState([])
  const [sessions, setSessions] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => { loadDocs() }, [])
  useEffect(() => { loadSessions() }, [sessionVersion])

  const loadDocs = async () => {
    try {
      const res = await axios.get(`${API}/documents`)
      setDocs(res.data.data || [])
    } catch {}
  }

  const loadSessions = async () => {
    try {
      const res = await axios.get(`${API}/sessions`)
      setSessions(res.data.data || [])
    } catch {}
  }

  const handleDeleteSession = (e, sessionId) => {
    e.stopPropagation()
    setConfirmDeleteId(sessionId)
  }

  const confirmDelete = async () => {
    const sessionId = confirmDeleteId
    setConfirmDeleteId(null)
    try {
      await axios.delete(`${API}/sessions/${sessionId}`)
      setSessions(prev => prev.filter(s => s.session_id !== sessionId))
      onSessionDeleted?.()
    } catch {}
  }

  // 快速上传
  const handleUpload = async (file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['pdf', 'docx'].includes(ext)) {
      setUploadMsg({ type: 'error', text: '仅支持 PDF / Word' })
      setTimeout(() => setUploadMsg(null), 3000)
      return
    }
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      await axios.post(`${API}/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setUploadMsg({ type: 'ok', text: '上传成功' })
      await loadDocs()
    } catch (err) {
      setUploadMsg({ type: 'error', text: err.response?.data?.detail || '上传失败' })
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setTimeout(() => setUploadMsg(null), 3000)
  }

  const totalChunks = docs.reduce((s, d) => s + d.chunk_count, 0)
  const estChars = totalChunks * 350

  const formatChars = (n) => {
    if (n >= 10000) return (n / 10000).toFixed(1) + '万'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
    return n.toString()
  }

  return (
    <aside className="right-panel">
      {/* 知识库概览 */}
      <div className="panel-section">
        <div className="panel-section-header">
          <span>知识库概览</span>
          <span className="panel-more" onClick={() => onNavChange?.('docs')}>更多 ›</span>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">知识库文档总数</div>
            <div className="stat-value">{docs.length} <small>个文档</small></div>
          </div>
          <div className="stat-card">
            <div className="stat-label">总字数（估算）</div>
            <div className="stat-value">{formatChars(estChars)}</div>
          </div>
        </div>
      </div>

      {/* 快速上传（仅管理员） */}
      {isAdmin && <div style={{ padding: '12px 18px 4px' }}>
        {uploadMsg && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12, padding: '5px 10px', borderRadius: 6, marginBottom: 8,
            background: uploadMsg.type === 'ok' ? 'var(--success-bg)' : 'var(--error-bg)',
            color: uploadMsg.type === 'ok' ? 'var(--success)' : 'var(--error)',
          }}>
            {uploadMsg.type === 'ok' ? <CheckCircleIcon size={14} /> : <XCircleIcon size={14} />}
            {uploadMsg.text}
          </div>
        )}
        <input
          ref={fileInputRef} type="file" accept=".pdf,.docx"
          style={{ display: 'none' }}
          onChange={e => handleUpload(e.target.files?.[0])}
        />
        <div
          className={`panel-upload ${uploading ? 'disabled' : ''}`}
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          <div className={`panel-upload-icon ${uploading ? 'spin' : ''}`}>
            {uploading ? <LoaderIcon size={18} /> : <UploadIcon size={18} />}
          </div>
          <div>
            <div className="panel-upload-text">{uploading ? '上传中...' : '上传文档'}</div>
            <div className="panel-upload-hint">支持 PDF / Word 格式</div>
          </div>
        </div>
      </div>}

      {/* 最近文档 */}
      {docs.length > 0 && (
        <div className="panel-section">
          <div className="panel-section-header"><span>最近文档</span></div>
          <div className="panel-doc-list">
            {docs.slice(0, 3).map(doc => (
              <div key={doc.doc_id} className="panel-doc-item">
                <span className="panel-doc-icon"><FileTextIcon size={18} /></span>
                <div className="panel-doc-info">
                  <div className="panel-doc-name" title={doc.filename}>{doc.filename}</div>
                  <div className="panel-doc-meta">{doc.chunk_count} 个文本块</div>
                </div>
              </div>
            ))}
            {docs.length > 3 && (
              <div className="panel-more-link" onClick={() => onNavChange?.('docs')}>
                查看更多文档 ›
              </div>
            )}
          </div>
        </div>
      )}

      {/* 历史对话 */}
      <div className="panel-section panel-section-flex">
        <div className="panel-section-header">
          <span>历史对话</span>
          {sessions.length > 0 && (
            <span className="panel-session-count">{sessions.length} 条</span>
          )}
        </div>

        {sessions.length === 0 ? (
          <div className="panel-empty">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6, color: 'var(--text-3)', opacity: 0.6 }}>
              <ChatIcon size={26} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>暂无历史对话</div>
          </div>
        ) : (
          <div className="session-list">
            {sessions.map(s => (
              <div
                key={s.session_id}
                className={`session-item ${s.session_id === currentSessionId ? 'session-item-active' : ''}`}
                onClick={() => onSessionSelect?.(s.session_id)}
                title={s.title}
              >
                <div className="session-item-icon"><ChatIcon size={15} /></div>
                <div className="session-item-body">
                  <div className="session-item-title">{s.title}</div>
                  <div className="session-item-meta">
                    <span>{formatTime(s.updated_at)}</span>
                    <span>{s.message_count} 条消息</span>
                  </div>
                </div>
                <button
                  className="session-item-delete"
                  onClick={(e) => handleDeleteSession(e, s.session_id)}
                  title="删除此对话"
                >
                  <XIcon size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      {confirmDeleteId && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">确认删除</div>
            <div className="modal-content">确定要删除这条对话记录吗？删除后无法恢复。</div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmDeleteId(null)}>取消</button>
              <button className="btn btn-danger" onClick={confirmDelete}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

export default RightPanel
