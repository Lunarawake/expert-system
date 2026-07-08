import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  UsersIcon, PlusIcon, XIcon, CheckCircleIcon, XCircleIcon, ShieldIcon, UserIcon,
} from './Icons'

const API = '/api'

const ROLE_LABEL = { admin: '管理员', operator: '操作员' }
const ROLE_CLASS = { admin: 'role-badge-admin', operator: 'role-badge-operator' }

function formatDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function UserManagement({ currentUser }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', role: 'operator' })
  const [submitting, setSubmitting] = useState(false)
  const [alert, setAlert] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  useEffect(() => { loadUsers() }, [])

  const showAlert = (type, text) => {
    setAlert({ type, text })
    setTimeout(() => setAlert(null), 3500)
  }

  const loadUsers = async () => {
    try {
      const res = await axios.get(`${API}/users`)
      setUsers(res.data.data || [])
    } catch {
      showAlert('error', '加载用户列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.username.trim()) return showAlert('error', '用户名不能为空')
    if (form.password.length < 6) return showAlert('error', '密码不能少于6位')
    setSubmitting(true)
    try {
      await axios.post(`${API}/users`, form)
      showAlert('success', `用户「${form.username}」创建成功`)
      setForm({ username: '', password: '', role: 'operator' })
      setShowForm(false)
      await loadUsers()
    } catch (err) {
      showAlert('error', err.response?.data?.detail || '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDeleteId) return
    try {
      await axios.delete(`${API}/users/${confirmDeleteId}`)
      showAlert('success', '用户已删除')
      setConfirmDeleteId(null)
      await loadUsers()
    } catch (err) {
      showAlert('error', err.response?.data?.detail || '删除失败')
      setConfirmDeleteId(null)
    }
  }

  const deleteTarget = users.find(u => u.id === confirmDeleteId)

  return (
    <div className="um-page">
      <div className="um-header">
        <div>
          <h2 className="section-title"><UsersIcon size={20} /> 用户管理</h2>
          <p className="section-subtitle">管理系统登录账号，控制操作权限</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
          <PlusIcon size={14} /> 新增用户
        </button>
      </div>

      {alert && (
        <div className={`alert alert-${alert.type === 'error' ? 'error' : 'success'}`}>
          {alert.type === 'error' ? <XCircleIcon size={16} /> : <CheckCircleIcon size={16} />}
          <span>{alert.text}</span>
        </div>
      )}

      {/* 新增用户表单 */}
      {showForm && (
        <div className="um-form-card card">
          <div className="um-form-header">
            <span>新增用户</span>
            <button className="model-form-close" onClick={() => setShowForm(false)}>
              <XIcon size={14} />
            </button>
          </div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">用户名</label>
                <input
                  className="form-input"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="登录用户名"
                  autoComplete="off"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">密码（≥6位）</label>
                <input
                  className="form-input"
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="初始密码"
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">角色</label>
                <select
                  className="form-input"
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                >
                  <option value="operator">操作员</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? '创建中…' : '确认创建'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 用户列表 */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, opacity: 0.5 }}>
            <UsersIcon size={32} />
          </div>
          <div>加载中…</div>
        </div>
      ) : (
        <div className="um-table card">
          <table className="um-list">
            <thead>
              <tr>
                <th>用户名</th>
                <th>角色</th>
                <th>创建时间</th>
                <th>最后登录</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className={u.username === currentUser?.username ? 'um-row-self' : ''}>
                  <td>
                    <span className="um-username-cell">
                      {u.role === 'admin' ? <ShieldIcon size={14} /> : <UserIcon size={14} />}
                      {u.username}
                      {u.username === currentUser?.username && (
                        <span className="um-self-tag">（当前）</span>
                      )}
                    </span>
                  </td>
                  <td>
                    <span className={`role-badge ${ROLE_CLASS[u.role]}`}>
                      {ROLE_LABEL[u.role] || u.role}
                    </span>
                  </td>
                  <td className="um-time">{formatDate(u.created_at)}</td>
                  <td className="um-time">{formatDate(u.last_login)}</td>
                  <td>
                    {u.username !== currentUser?.username && (
                      <button
                        className="btn btn-danger"
                        style={{ fontSize: 12, padding: '5px 12px' }}
                        onClick={() => setConfirmDeleteId(u.id)}
                      >
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="empty-state" style={{ padding: '28px 0' }}>
              <div className="empty-state-hint">暂无用户数据</div>
            </div>
          )}
        </div>
      )}

      {/* 删除确认弹窗 */}
      {confirmDeleteId && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">确认删除</div>
            <div className="modal-content">
              确定要删除用户「<strong>{deleteTarget?.username}</strong>」吗？删除后该用户将无法登录。
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmDeleteId(null)}>取消</button>
              <button className="btn btn-danger" onClick={handleDelete}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserManagement
