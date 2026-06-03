import { useState, useRef, useEffect, useCallback } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_BASE_URL || '/api'

const KB_GROUPS = [
  { id: 'general', label: '通用库',   icon: '📚', color: 'general' },
  { id: 'sic',     label: '碳化硅库', icon: '💎', color: 'sic'     },
  { id: 'diamond', label: '金刚石库', icon: '✨', color: 'diamond'  },
]

function KbBadge({ group }) {
  const cfg = KB_GROUPS.find(g => g.id === group) || KB_GROUPS[0]
  return (
    <span className={`kb-badge kb-badge-${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

function FileUpload() {
  const [documents, setDocuments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [alert, setAlert] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState('general')
  const fileInputRef = useRef(null)

  useEffect(() => { loadDocuments() }, [])

  const showAlert = (type, text) => {
    setAlert({ type, text })
    setTimeout(() => setAlert(null), 4000)
  }

  const loadDocuments = async () => {
    try {
      const res = await axios.get(`${API}/documents`)
      setDocuments(res.data.data || [])
    } catch {}
  }

  const uploadFile = useCallback(async (file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['pdf', 'docx'].includes(ext)) {
      showAlert('error', '仅支持 PDF 和 Word(.docx) 格式文件')
      return
    }
    setUploading(true)
    setAlert(null)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('kb_group', selectedGroup)
    try {
      const res = await axios.post(`${API}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      showAlert('success', res.data.message)
      await loadDocuments()
    } catch (err) {
      showAlert('error', err.response?.data?.detail || '上传失败，请重试')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [selectedGroup])

  const handleFileSelect = (e) => { const f = e.target.files?.[0]; if (f) uploadFile(f) }

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files?.[0]; if (f) uploadFile(f)
  }

  const handleDelete = async (docId, filename) => {
    if (!window.confirm(`确认删除《${filename}》？删除后无法恢复。`)) return
    try {
      await axios.delete(`${API}/documents/${docId}`)
      showAlert('success', `《${filename}》已删除`)
      await loadDocuments()
    } catch { showAlert('error', '删除失败') }
  }

  const getDocIcon = (name) => name.toLowerCase().endsWith('.pdf') ? '📕' : '📘'

  return (
    <div>
      <h2 className="section-title">📄 文档管理</h2>
      <p className="section-subtitle">上传 PDF 或 Word 文档，系统自动分块建立专家知识库</p>

      {alert && (
        <div className={`alert alert-${alert.type === 'error' ? 'error' : 'success'}`}>
          <span>{alert.type === 'error' ? '❌' : '✅'}</span>
          <span>{alert.text}</span>
        </div>
      )}

      {/* 专家库选择 */}
      <div className="kb-group-selector">
        <span className="kb-group-label">归属专家库</span>
        <div className="tag-group">
          {KB_GROUPS.map(g => (
            <button
              key={g.id}
              className={`tag ${selectedGroup === g.id ? 'tag-cat-selected' : ''}`}
              onClick={() => setSelectedGroup(g.id)}
            >
              {g.icon} {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* 上传区域 */}
      <div
        className={`upload-zone ${dragging ? 'dragging' : ''} ${uploading ? 'disabled' : ''}`}
        onClick={() => !uploading && fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); if (!uploading) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={!uploading ? handleDrop : undefined}
      >
        <input ref={fileInputRef} type="file" accept=".pdf,.docx" onChange={handleFileSelect} style={{ display: 'none' }} />
        <div className="upload-icon">{uploading ? '⏳' : '📁'}</div>
        <div className="upload-text">
          {uploading
            ? '正在解析文档并入库，请稍候...'
            : <>点击选择文件，或将文件拖拽到此处<br /><small style={{ color: 'var(--text-3)', fontSize: 12 }}>将入库到：{KB_GROUPS.find(g => g.id === selectedGroup)?.label}</small></>
          }
        </div>
        <div className="upload-hint">支持 PDF、Word(.docx) 格式，单次上传一个文件</div>
        {uploading && <div className="progress-bar"><div className="progress-fill" /></div>}
      </div>

      {/* 文档列表标题 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700 }}>已入库文档</h3>
        <span className="badge badge-blue">{documents.length} 份</span>
      </div>

      {documents.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 24px' }}>
          <div className="empty-state-icon">📂</div>
          <div className="empty-state-text">知识库为空</div>
          <div className="empty-state-hint">上传文档后将显示在这里</div>
        </div>
      ) : (
        <div className="doc-list">
          {documents.map(doc => (
            <div key={doc.doc_id} className="doc-item">
              <div className="doc-info">
                <span className="doc-icon">{getDocIcon(doc.filename)}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="doc-name" title={doc.filename}>{doc.filename}</div>
                  <div className="doc-meta" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <KbBadge group={doc.kb_group || 'general'} />
                    <span>{doc.chunk_count} 个文本块</span>
                  </div>
                </div>
              </div>
              <button
                className="btn btn-danger"
                style={{ fontSize: 13, padding: '6px 14px' }}
                onClick={() => handleDelete(doc.doc_id, doc.filename)}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default FileUpload
