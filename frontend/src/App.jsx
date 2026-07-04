import { useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import FileUpload from './components/FileUpload'
import ModelConfig from './components/ModelConfig'
import RightPanel from './components/RightPanel'
import Stats from './components/Stats'
import Workflow from './components/Workflow'
import { ChipIcon, EditIcon } from './components/Icons'

const PAGE_TITLES = {
  chat:     '智能问答',
  docs:     '文档管理',
  config:   '模型配置',
  stats:    '使用统计',
  workflow: '工作流管理',
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

function App() {
  const [activeNav, setActiveNav] = useState('chat')
  const [modelName, setModelName] = useState('')
  const [currentSessionId, setCurrentSessionId] = useState(getOrCreateSessionId)
  const [sessionVersion, setSessionVersion] = useState(0)  // 每次发消息/删会话时自增，触发右侧列表刷新

  const isChat = activeNav === 'chat'

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

  const handleMessageSent = () => {
    setSessionVersion(v => v + 1)
  }

  const handleSessionDeleted = () => {
    setSessionVersion(v => v + 1)
  }

  return (
    <div className="app-layout">
      <Sidebar activeNav={activeNav} onNavChange={setActiveNav} />

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
                    onClick={() => setActiveNav('config')}
                    title="点击前往模型配置"
                  >
                    <ChipIcon size={14} />
                    <span className="model-badge-label">当前模型：</span>
                    <span className="model-badge-name">{modelName}</span>
                    <span className="model-badge-arrow">▾</span>
                  </button>
                )}
              </>
            )}
          </div>
        </header>

        {/* 内容区 */}
        <div className={`content-wrapper ${isChat ? 'chat-mode' : ''}`}>
          {isChat ? (
            <>
              <ChatWindow
                sessionId={currentSessionId}
                onModelChange={setModelName}
                onMessageSent={handleMessageSent}
              />
              <RightPanel
                currentSessionId={currentSessionId}
                sessionVersion={sessionVersion}
                onSessionSelect={handleSessionSelect}
                onSessionDeleted={handleSessionDeleted}
                onNavChange={setActiveNav}
              />
            </>
          ) : (
            <div className="page-content">
              {activeNav === 'docs'     && <FileUpload />}
              {activeNav === 'config'   && <ModelConfig />}
              {activeNav === 'stats'    && <Stats />}
              {activeNav === 'workflow' && <Workflow />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
