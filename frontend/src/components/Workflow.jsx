import { useState, useEffect } from 'react'
import axios from 'axios'
import { WorkflowIcon, UploadIcon, BellIcon, ThumbsUpIcon, XCircleIcon, CheckCircleIcon, InfoIcon } from './Icons'

const API = ''

const WF_ICONS = {
  doc_auto_import: UploadIcon,
  kb_update_reminder: BellIcon,
  answer_feedback: ThumbsUpIcon,
}

function formatDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  const diffDays = Math.floor(diff / 86400000)
  if (diffDays < 7) return `${diffDays} 天前`
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <label className={`toggle-switch ${disabled ? 'toggle-disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => !disabled && onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="toggle-track" />
    </label>
  )
}

const STATUS_MAP = {
  doc_auto_import:    { on: '运行中', off: '已停止' },
  kb_update_reminder: { on: '监听中', off: '已停止' },
  answer_feedback:    { on: '收集中', off: '已停止' },
}

const RUN_LABEL = {
  doc_auto_import:    (n) => `已处理 ${n} 次文档`,
  kb_update_reminder: (n) => `已发送 ${n} 次提醒`,
  answer_feedback:    (n) => `已收集 ${n} 条反馈`,
}

function WorkflowCard({ wf, onToggle, toggling }) {
  const statusLabel = wf.enabled
    ? STATUS_MAP[wf.id]?.on || '运行中'
    : STATUS_MAP[wf.id]?.off || '已停止'
  const WfIcon = WF_ICONS[wf.id] || WorkflowIcon

  return (
    <div className={`wf-card ${wf.enabled ? 'wf-card-active' : ''}`}>
      <div className="wf-card-left">
        <div className="wf-icon"><WfIcon size={20} /></div>
        <div className="wf-info">
          <div className="wf-title">
            {wf.name}
            <span className="wf-type-badge">{wf.type_label}</span>
          </div>
          <p className="wf-desc">{wf.description}</p>
          <div className="wf-stats">
            <span className={`wf-status-dot ${wf.enabled ? 'wf-status-on' : 'wf-status-off'}`} />
            <span className="wf-status-text">{statusLabel}</span>
            {wf.run_count > 0 && (
              <>
                <span className="wf-stats-divider">·</span>
                <span>{RUN_LABEL[wf.id]?.(wf.run_count) || `运行 ${wf.run_count} 次`}</span>
              </>
            )}
            {wf.last_run && (
              <>
                <span className="wf-stats-divider">·</span>
                <span>最后运行：{formatDate(wf.last_run)}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="wf-card-right">
        <ToggleSwitch
          checked={wf.enabled}
          onChange={enabled => onToggle(wf.id, enabled)}
          disabled={toggling === wf.id}
        />
        <div className="wf-toggle-label">{wf.enabled ? '已开启' : '已关闭'}</div>
      </div>
    </div>
  )
}

function Workflow() {
  const [workflows, setWorkflows] = useState([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    axios.get(`${API}/workflows`)
      .then(res => setWorkflows(res.data.data || []))
      .finally(() => setLoading(false))
  }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  const handleToggle = async (id, enabled) => {
    setToggling(id)
    try {
      await axios.put(`${API}/workflows/${id}/toggle`, { enabled })
      setWorkflows(prev => prev.map(w => w.id === id ? { ...w, enabled } : w))
      showToast(enabled ? '工作流已开启' : '工作流已关闭')
    } catch {
      showToast('操作失败，请重试', 'error')
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="wf-page">
      <h2 className="section-title"><WorkflowIcon size={20} /> 工作流管理</h2>
      <p className="section-subtitle">管理系统内置工作流，开启后自动执行对应功能</p>

      {toast && (
        <div className={`alert alert-${toast.type === 'error' ? 'error' : 'success'}`}
          style={{ marginBottom: 16 }}>
          {toast.type === 'error' ? <XCircleIcon size={16} /> : <CheckCircleIcon size={16} />}
          <span>{toast.msg}</span>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, opacity: 0.5 }}>
            <WorkflowIcon size={32} />
          </div>
          <div>加载中…</div>
        </div>
      ) : (
        <div className="wf-list">
          {workflows.map(wf => (
            <WorkflowCard
              key={wf.id}
              wf={wf}
              onToggle={handleToggle}
              toggling={toggling}
            />
          ))}
        </div>
      )}

      {/* 说明 */}
      <div className="card" style={{ marginTop: 24, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
          <InfoIcon size={15} /> 使用说明
        </div>
        <ul style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 2, paddingLeft: 18, margin: 0 }}>
          <li><strong>触发式</strong>工作流在特定动作发生时自动执行，如文档上传</li>
          <li><strong>定时式</strong>工作流按设定周期检测并提醒，无需手动干预</li>
          <li><strong>交互式</strong>工作流在用户界面展示反馈入口，数据实时收集</li>
          <li>关闭工作流不会删除历史数据，重新开启后继续累计</li>
        </ul>
      </div>
    </div>
  )
}

export default Workflow
