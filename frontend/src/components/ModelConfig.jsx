import { useState, useEffect } from 'react'
import axios from 'axios'
import { SlidersIcon, PlusIcon, XCircleIcon, CheckCircleIcon, EditIcon, XIcon, SaveIcon, ChipIcon, InfoIcon } from './Icons'

const API = import.meta.env.VITE_API_BASE_URL || '/api'

// 常用模型快速预设
const PRESETS = [
  { name: 'OpenAI GPT-4o',  url: 'https://api.openai.com/v1',                           model: 'gpt-4o-mini' },
  { name: 'DeepSeek',       url: 'https://api.deepseek.com/v1',                          model: 'deepseek-chat' },
  { name: '智谱 GLM',       url: 'https://open.bigmodel.cn/api/paas/v4',                 model: 'glm-4-flash' },
  { name: '通义千问',       url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',    model: 'qwen-turbo' },
  { name: 'Moonshot',       url: 'https://api.moonshot.cn/v1',                           model: 'moonshot-v1-8k' },
  { name: '零一万物',       url: 'https://api.lingyiwanwu.com/v1',                       model: 'yi-lightning' },
]

const EMPTY_FORM = { name: '', api_key: '', base_url: '', model_name: '', is_default: false }

function ModelConfig() {
  const [models, setModels] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)   // null = 新增，有值 = 编辑
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [alert, setAlert] = useState(null)

  useEffect(() => { loadModels() }, [])

  const showAlert = (type, text) => {
    setAlert({ type, text })
    setTimeout(() => setAlert(null), 4000)
  }

  const loadModels = async () => {
    try {
      const res = await axios.get(`${API}/models`)
      setModels(res.data.data || [])
    } catch {
      showAlert('error', '加载模型列表失败，请确认后端已启动')
    }
  }

  // 打开新增表单
  const openAdd = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(true)
  }

  // 打开编辑表单
  const openEdit = (model) => {
    setForm({
      name: model.name,
      api_key: '',           // 已脱敏，编辑时留空=不修改
      base_url: model.base_url,
      model_name: model.model_name,
      is_default: model.is_default,
    })
    setEditingId(model.id)
    setShowForm(true)
  }

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM) }

  const applyPreset = (preset) => {
    setForm(prev => ({ ...prev, name: prev.name || preset.name, base_url: preset.url, model_name: preset.model }))
  }

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  // 保存（新增 or 更新）
  const save = async () => {
    if (!form.name.trim() || !form.base_url.trim() || !form.model_name.trim()) {
      showAlert('error', '显示名称、接口地址、模型名称为必填项')
      return
    }
    if (!editingId && !form.api_key.trim()) {
      showAlert('error', '新增模型时 API Key 不能为空')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await axios.put(`${API}/models/${editingId}`, form)
        showAlert('success', `模型「${form.name}」更新成功`)
      } else {
        await axios.post(`${API}/models`, form)
        showAlert('success', `模型「${form.name}」添加成功`)
      }
      closeForm()
      await loadModels()
    } catch (err) {
      showAlert('error', err.response?.data?.detail || '操作失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`确认删除模型「${name}」？`)) return
    try {
      await axios.delete(`${API}/models/${id}`)
      showAlert('success', `模型「${name}」已删除`)
      await loadModels()
    } catch { showAlert('error', '删除失败') }
  }

  const handleSetDefault = async (id, name) => {
    try {
      await axios.post(`${API}/models/${id}/default`)
      showAlert('success', `「${name}」已设为默认模型`)
      await loadModels()
    } catch { showAlert('error', '操作失败') }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h2 className="section-title" style={{ marginBottom: 0 }}><SlidersIcon size={20} /> 模型配置</h2>
        <button className="btn btn-primary" style={{ gap: 6 }} onClick={openAdd}>
          <PlusIcon size={15} /> 添加模型
        </button>
      </div>
      <p className="section-subtitle">配置多个大模型，提问时可自由切换使用</p>

      {alert && (
        <div className={`alert alert-${alert.type === 'error' ? 'error' : 'success'}`}>
          {alert.type === 'error' ? <XCircleIcon size={16} /> : <CheckCircleIcon size={16} />}
          <span>{alert.text}</span>
        </div>
      )}

      {/* 添加 / 编辑表单 */}
      {showForm && (
        <div className="model-form">
          <div className="model-form-header">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {editingId ? <EditIcon size={15} /> : <PlusIcon size={15} />}
              {editingId ? '编辑模型' : '添加模型'}
            </span>
            <button className="model-form-close" onClick={closeForm}><XIcon size={13} /></button>
          </div>

          <div className="form-group">
            <label className="form-label">显示名称 <span style={{ color: 'var(--error)' }}>*</span></label>
            <input className="form-input" placeholder="如：DeepSeek / 文心一言 Pro"
              value={form.name} onChange={e => update('name', e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">快速预设</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {PRESETS.map(p => (
                <button key={p.name} className="btn btn-ghost"
                  style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => applyPreset(p)}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">API Base URL <span style={{ color: 'var(--error)' }}>*</span></label>
            <input className="form-input" placeholder="https://api.openai.com/v1"
              value={form.base_url} onChange={e => update('base_url', e.target.value)} />
            <div className="form-hint">末尾不需要加斜杠，支持所有兼容 OpenAI /chat/completions 格式的接口</div>
          </div>

          <div className="form-group">
            <label className="form-label">模型名称（Model ID）<span style={{ color: 'var(--error)' }}>*</span></label>
            <input className="form-input" placeholder="gpt-4o-mini / deepseek-chat / glm-4-flash"
              value={form.model_name} onChange={e => update('model_name', e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">
              API Key {editingId ? <span style={{ color: 'var(--text-3)', fontWeight: 400 }}> — 留空表示不修改</span> : <span style={{ color: 'var(--error)' }}>*</span>}
            </label>
            <input className="form-input" type="password" autoComplete="new-password"
              placeholder={editingId ? '留空则保留原有 Key' : '请输入 API Key'}
              value={form.api_key} onChange={e => update('api_key', e.target.value)} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <input type="checkbox" id="is_default" checked={form.is_default}
              onChange={e => update('is_default', e.target.checked)}
              style={{ width: 15, height: 15, cursor: 'pointer' }} />
            <label htmlFor="is_default" style={{ fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
              设为默认模型（提问时不选择模型则使用此模型）
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={closeForm}>取消</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {!saving && <SaveIcon size={14} />} {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}

      {/* 模型列表 */}
      {models.length === 0 && !showForm ? (
        <div className="empty-state">
          <div className="empty-state-icon"><ChipIcon size={40} /></div>
          <div className="empty-state-text">尚未配置任何模型</div>
          <div className="empty-state-hint">点击右上角「添加模型」开始配置</div>
        </div>
      ) : (
        <div className="model-list">
          {models.map(model => (
            <div key={model.id} className={`model-card ${model.is_default ? 'is-default' : ''}`}>
              <div className="model-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ display: 'flex', color: 'var(--icon-color-inactive)' }}><ChipIcon size={20} /></span>
                  <span className="model-card-name">{model.name}</span>
                  {model.is_default && <span className="default-badge">默认</span>}
                </div>
                <div className="model-card-actions">
                  {!model.is_default && (
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }}
                      onClick={() => handleSetDefault(model.id, model.name)}>
                      设为默认
                    </button>
                  )}
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => openEdit(model)}>
                    编辑
                  </button>
                  <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => handleDelete(model.id, model.name)}>
                    删除
                  </button>
                </div>
              </div>
              <div className="model-card-info">
                <div className="model-card-row">
                  <span className="model-card-label">模型 ID</span>
                  <code className="model-card-value">{model.model_name}</code>
                </div>
                <div className="model-card-row">
                  <span className="model-card-label">接口地址</span>
                  <span className="model-card-value text-ellipsis">{model.base_url}</span>
                </div>
                <div className="model-card-row">
                  <span className="model-card-label">API Key</span>
                  <span className="model-card-value">{model.api_key_masked}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 使用说明 */}
      <div className="card hint-card" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 10, fontSize: 14 }}>
          <InfoIcon size={15} /> 使用说明
        </div>
        <div style={{ fontSize: 13, lineHeight: 2, color: 'var(--text-2)' }}>
          <p>1. 点击「添加模型」配置一个或多个大模型</p>
          <p>2. 在「智能问答」页面顶部选择要使用的模型再提问</p>
          <p>3. 可随时切换不同模型对比回答效果</p>
          <p>4. 标记为「默认」的模型在未指定时自动使用</p>
          <p>5. 模型配置持久化到 <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 4 }}>backend/models.json</code>，重启后自动恢复</p>
        </div>
      </div>
    </div>
  )
}

export default ModelConfig
