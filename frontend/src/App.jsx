import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import FileUpload from './components/FileUpload'
import ModelConfig from './components/ModelConfig'
import RightPanel from './components/RightPanel'
import Stats from './components/Stats'
import Workflow from './components/Workflow'
import UserManagement from './components/UserManagement'
import Login from './components/Login'
import { ChipIcon, EditIcon, LogoutIcon, KeyIcon, UserIcon, ShieldIcon } from './components/Icons'

const API = '/api'

const PAGE_TITLES = {
  chat:     '智能问答',
  docs:     '文档管理',
  config:   '模型配置',
  stats:    '使用统计',
  workflow: '工作流管理',
  users:    '用户管理',
}

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

function getOrCreateSessionId() {
  const stored = localStorage.getItem('expert_session_id')
  if (stored) return stored
  const id = generateUUID()
  localStorage.setItem('expert_session_id', id)
  return id
}

function readStoredUser() {
  try {
    const raw = localStorage.getItem('expert_user')
    const token = localStorage.getItem('expert_token')
    if (raw && token) return JSON.parse(raw)
  } catch {}
  return null
}

// ==================== 修改密码弹窗 ====================
function ChangePasswordModal({ user, onClose }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (pw.length < 6) return setError('密码不能少于6位')
    if (pw !== pw2) return setError('两次输入的密码不一致')
    setError('')
    setLoading(true)
    try {
      // 先获取当前用户ID
      const usersRes = await axios.get(`${API}/users`)
      const self = (usersRes.data.data || []).find(u => u.username === user.username)
      if (!self) throw new Error('用户不存在')
      await axios.put(`${API}/users/${self.id}/password`, { new_password: pw })
      setSuccess(true)
      setTimeout(onClose, 1500)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || '修改失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-title">修改密码</div>
        {success ? (
          <div className="modal-content" style={{ color: 'var(--success)' }}>密码修改成功！</div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="login-error" style={{ marginBottom: 14 }}>{error}</div>}
            <div className="form-group">
              <label className="form-label">新密码（≥6位）</label>
              <input className="form-input" type="password" value={pw}
                onChange={e => setPw(e.target.value)} placeholder="请输入新密码" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">确认新密码</label>
              <input className="form-input" type="password" value={pw2}
                onChange={e => setPw2(e.target.value)} placeholder="再次输入新密码" />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>取消</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? '提交中…' : '确认修改'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ==================== 顶部用户下拉菜单 ====================
function UserMenu({ user, onLogout, onChangePassword }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handle = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  return (
    <div className="user-menu-wrap" ref={ref}>
      <button className="user-menu-trigger" onClick={() => setOpen(v => !v)}>
        <div className="user-menu-avatar">{user.username.charAt(0).toUpperCase()}</div>
        <div className="user-menu-info">
          <span className="user-menu-name">{user.username}</span>
          <span className={`user-menu-role ${user.role === 'admin' ? 'role-admin' : 'role-operator'}`}>
            {user.role === 'admin' ? <><ShieldIcon size={10} /> 管理员</> : <><UserIcon size={10} /> 操作员</>}
          </span>
        </div>
        <span className="model-badge-arrow" style={{ marginLeft: 4 }}>▾</span>
      </button>

      {open && (
        <div className="user-menu-dropdown">
          <button className="user-menu-item" onClick={() => { setOpen(false); onChangePassword() }}>
            <KeyIcon size={14} /> 修改密码
          </button>
          <div className="user-menu-divider" />
          <button className="user-menu-item user-menu-logout" onClick={() => { setOpen(false); onLogout() }}>
            <LogoutIcon size={14} /> 退出登录
          </button>
        </div>
      )}
    </div>
  )
}

// ==================== 主应用 ====================
function App() {
  const [user, setUser] = useState(readStoredUser)
  const [activeNav, setActiveNav] = useState('chat')
  const [modelName, setModelName] = useState('')
  const [currentSessionId, setCurrentSessionId] = useState(getOrCreateSessionId)
  const [sessionVersion, setSessionVersion] = useState(0)
  const [showChangePw, setShowChangePw] = useState(false)

  // 监听 Token 过期事件（由 axios 拦截器触发）
  useEffect(() => {
    const handle = () => setUser(null)
    window.addEventListener('auth:expired', handle)
    return () => window.removeEventListener('auth:expired', handle)
  }, [])

  // 角色切换时，确保当前页面对该角色可见
  useEffect(() => {
    if (!user) return
    const adminOnly = ['config', 'workflow', 'users']
    if (user.role !== 'admin' && adminOnly.includes(activeNav)) {
      setActiveNav('chat')
    }
  }, [user, activeNav])

  const handleLogin = (userData) => {
    setUser(userData)
    setActiveNav('chat')
  }

  const handleLogout = () => {
    axios.post(`${API}/auth/logout`).catch(() => {})
    localStorage.removeItem('expert_token')
    localStorage.removeItem('expert_user')
    setUser(null)
  }

  const handleNewChat = () => {
    const newId = generateUUID()
    localStorage.setItem('expert_session_id', newId)
    setCurrentSessionId(newId)
  }

  const handleSessionSelect = (sessionId) => {
    localStorage.setItem('expert_session_id', sessionId)
    setCurrentSessionId(sessionId)
    setActiveNav('chat')
  }

  // 未登录：显示登录页
  if (!user) {
    return <Login onLogin={handleLogin} />
  }

  const isChat = activeNav === 'chat'

  return (
    <div className="app-layout">
      <Sidebar activeNav={activeNav} onNavChange={setActiveNav} user={user} />

      <div className="main-wrapper">
        {/* 顶部 Header */}
        <header className="main-header">
          <h1 className="header-title">{PAGE_TITLES[activeNav]}</h1>

          <div className="header-actions">
            {isChat && (
              <>
                <button className="new-chat-btn" onClick={handleNewChat}>
                  <EditIcon size={14} /> 新对话
                </button>
                {modelName && (
                  <button
                    className="model-badge"
                    onClick={() => user.role === 'admin' && setActiveNav('config')}
                    title={user.role === 'admin' ? '点击前往模型配置' : ''}
                    style={user.role !== 'admin' ? { cursor: 'default' } : {}}
                  >
                    <ChipIcon size={14} />
                    <span className="model-badge-label">当前模型：</span>
                    <span className="model-badge-name">{modelName}</span>
                    {user.role === 'admin' && <span className="model-badge-arrow">▾</span>}
                  </button>
                )}
              </>
            )}

            {/* 用户信息 + 下拉菜单 */}
            <UserMenu
              user={user}
              onLogout={handleLogout}
              onChangePassword={() => setShowChangePw(true)}
            />
          </div>
        </header>

        {/* 内容区 */}
        <div className={`content-wrapper ${isChat ? 'chat-mode' : ''}`}>
          {isChat ? (
            <>
              <ChatWindow
                sessionId={currentSessionId}
                onModelChange={setModelName}
                onMessageSent={() => setSessionVersion(v => v + 1)}
              />
              <RightPanel
                currentSessionId={currentSessionId}
                sessionVersion={sessionVersion}
                onSessionSelect={handleSessionSelect}
                onSessionDeleted={() => setSessionVersion(v => v + 1)}
                onNavChange={setActiveNav}
                isAdmin={user.role === 'admin'}
              />
            </>
          ) : (
            <div className="page-content">
              {activeNav === 'docs'     && <FileUpload isAdmin={user.role === 'admin'} />}
              {activeNav === 'config'   && user.role === 'admin' && <ModelConfig />}
              {activeNav === 'stats'    && <Stats />}
              {activeNav === 'workflow' && user.role === 'admin' && <Workflow />}
              {activeNav === 'users'    && user.role === 'admin' && <UserManagement currentUser={user} />}
            </div>
          )}
        </div>
      </div>

      {showChangePw && (
        <ChangePasswordModal user={user} onClose={() => setShowChangePw(false)} />
      )}
    </div>
  )
}

export default App
