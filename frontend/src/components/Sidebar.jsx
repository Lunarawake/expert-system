// 侧边栏导航组件
import { ChatIcon, FolderIcon, SlidersIcon, WorkflowIcon, ChartIcon } from './Icons'

const NAV_ITEMS = [
  { id: 'chat',     label: '智能问答',   Icon: ChatIcon },
  { id: 'docs',     label: '文档管理',   Icon: FolderIcon },
  { id: 'config',   label: '模型配置',   Icon: SlidersIcon },
  { id: null, divider: true },
  { id: 'workflow', label: '工作流管理', Icon: WorkflowIcon },
  { id: 'stats',    label: '使用统计',   Icon: ChartIcon },
]

function Sidebar({ activeNav, onNavChange }) {
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <img src="/logo.png" className="sidebar-logo-img" alt="Cristar 晶品众" />
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
