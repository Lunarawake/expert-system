// 侧边栏导航组件

const NAV_ITEMS = [
  // 可用功能
  { id: 'chat',   label: '智能问答', icon: '💬' },
  { id: 'docs',   label: '文档管理', icon: '📄' },
  { id: 'config', label: '模型配置', icon: '⚙️' },
  // 占位功能（后续扩展）
  { id: null, divider: true },
  { id: 'workflow', label: '工作流管理', icon: '🔄', disabled: true, tag: '即将上线' },
  { id: 'stats',    label: '使用统计',   icon: '📊', disabled: true, tag: '即将上线' },
]

function Sidebar({ activeNav, onNavChange }) {
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-icon">DE</div>
        <div>
          <div className="logo-name">数字专家系统</div>
          <div className="logo-sub">知识驱动 · 智能决策</div>
        </div>
      </div>

      {/* 导航菜单 */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item, i) => {
          if (item.divider) {
            return <div key={`divider-${i}`} style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
          }
          return (
            <button
              key={item.id}
              className={`nav-item ${activeNav === item.id ? 'active' : ''} ${item.disabled ? 'disabled' : ''}`}
              onClick={() => !item.disabled && onNavChange(item.id)}
              title={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.tag && <span className="nav-tag">{item.tag}</span>}
            </button>
          )
        })}
      </nav>

      {/* 底部用户信息 */}
      <div className="sidebar-user">
        <div className="user-avatar">管</div>
        <div>
          <div className="user-name">管理员</div>
          <div className="user-email">admin@local</div>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
