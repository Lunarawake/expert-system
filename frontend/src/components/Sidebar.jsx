// 侧边栏导航组件
import { ChatIcon, FolderIcon, SlidersIcon, WorkflowIcon, ChartIcon, UsersIcon, ShieldIcon, UserIcon } from './Icons'

const ALL_NAV_ITEMS = [
  { id: 'chat',     label: '智能问答',   Icon: ChatIcon,     roles: ['admin', 'operator'] },
  { id: 'docs',     label: '文档管理',   Icon: FolderIcon,   roles: ['admin', 'operator'] },
  { id: 'stats',    label: '使用统计',   Icon: ChartIcon,    roles: ['admin', 'operator'] },
  { id: null, divider: true, roles: ['admin'] },
  { id: 'config',   label: '模型配置',   Icon: SlidersIcon,  roles: ['admin'] },
  { id: 'workflow', label: '工作流管理', Icon: WorkflowIcon, roles: ['admin'] },
  { id: 'users',    label: '用户管理',   Icon: UsersIcon,    roles: ['admin'] },
]

function Sidebar({ activeNav, onNavChange, user }) {
  const role = user?.role || 'operator'
  const navItems = ALL_NAV_ITEMS.filter(item => item.roles?.includes(role))
  const initial = user?.username?.charAt(0).toUpperCase() || '用'

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <img src="/logo.png" className="sidebar-logo-img" alt="Cristar 晶品众" />
      </div>

      {/* 导航菜单 */}
      <nav className="sidebar-nav">
        {navItems.map((item, i) => {
          if (item.divider) {
            return <div key={`divider-${i}`} style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
          }
          return (
            <button
              key={item.id}
              className={`nav-item ${activeNav === item.id ? 'active' : ''}`}
              onClick={() => onNavChange(item.id)}
              title={item.label}
            >
              <span className="nav-icon"><item.Icon size={18} /></span>
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* 底部用户信息 */}
      <div className="sidebar-user">
        <div className="user-avatar">{initial}</div>
        <div style={{ minWidth: 0 }}>
          <div className="user-name">{user?.username || '未登录'}</div>
          <div className="user-role">
            {role === 'admin'
              ? <><ShieldIcon size={10} /> 管理员</>
              : <><UserIcon size={10} /> 操作员</>
            }
          </div>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
