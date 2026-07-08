import { useState } from 'react'
import axios from 'axios'

const API = '/api'

function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password) return
    setLoading(true)
    setError('')
    try {
      const res = await axios.post(`${API}/auth/login`, { username, password })
      const { token, username: uname, role } = res.data.data
      localStorage.setItem('expert_token', token)
      localStorage.setItem('expert_user', JSON.stringify({ username: uname, role }))
      onLogin({ username: uname, role })
    } catch (err) {
      setError(err.response?.data?.detail || '登录失败，请检查用户名和密码')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <img src="/logo.png" alt="晶品众" className="login-logo-img" />
        </div>

        <h2 className="login-title">数字专家系统</h2>
        <p className="login-subtitle">请登录以继续使用</p>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="login-error">{error}</div>
          )}

          <div className="form-group">
            <label className="form-label">用户名</label>
            <input
              className="form-input"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoFocus
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label className="form-label">密码</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary login-btn"
            disabled={loading || !username.trim() || !password}
          >
            {loading ? '登录中…' : '登录'}
          </button>
        </form>

        <p className="login-footer">晶品众科技 · 数字专家系统 v2.0</p>
      </div>
    </div>
  )
}

export default Login
