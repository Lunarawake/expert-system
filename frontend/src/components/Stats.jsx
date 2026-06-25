import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  ChartIcon, ChatIcon, SunIcon, FileTextIcon, ThumbsUpIcon, ThumbsDownIcon,
  RefreshIcon, ClockIcon, SearchIcon, TrendingUpIcon,
} from './Icons'

const API = import.meta.env.VITE_API_BASE_URL || '/api'

const KB_LABELS = { all: '全部', general: '通用库', sic: '碳化硅库', diamond: '金刚石库' }

function formatDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  const diffDays = Math.floor(diff / 86400000)
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) return `${diffDays} 天前`
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatChars(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + ' 万'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

function SummaryCard({ icon, label, value, sub, accent }) {
  return (
    <div className="stats-summary-card" style={accent ? { borderColor: 'var(--primary)', background: 'var(--primary-lighter)' } : {}}>
      <div className="stats-card-icon">{icon}</div>
      <div className="stats-card-body">
        <div className="stats-card-label">{label}</div>
        <div className="stats-card-value" style={accent ? { color: 'var(--primary)' } : {}}>{value}</div>
        {sub && <div className="stats-card-sub">{sub}</div>}
      </div>
    </div>
  )
}

function Stats() {
  const [summary, setSummary] = useState(null)
  const [recent, setRecent] = useState([])
  const [top, setTop] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, r, t] = await Promise.all([
        axios.get(`${API}/stats/summary`),
        axios.get(`${API}/stats/recent?limit=10`),
        axios.get(`${API}/stats/top?limit=5`),
      ])
      setSummary(s.data.data)
      setRecent(r.data.data || [])
      setTop(t.data.data || [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, opacity: 0.5 }}>
          <ChartIcon size={32} />
        </div>
        <div>加载统计数据中…</div>
      </div>
    )
  }

  const s = summary || {}

  return (
    <div className="stats-page">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 className="section-title"><ChartIcon size={20} /> 使用统计</h2>
          <p className="section-subtitle">记录每次提问，帮助了解系统使用情况和知识库状态</p>
        </div>
        <button className="btn btn-ghost" style={{ marginTop: 4 }} onClick={load}><RefreshIcon size={13} /> 刷新</button>
      </div>

      {/* 概览卡片 */}
      <div className="stats-summary-grid">
        <SummaryCard icon={<ChatIcon size={20} />} label="总提问次数" value={s.total_queries ?? 0} accent />
        <SummaryCard icon={<SunIcon size={20} />} label="今日提问" value={s.today_queries ?? 0}
          sub={s.total_queries ? `占总量 ${Math.round(((s.today_queries ?? 0) / s.total_queries) * 100)}%` : undefined} />
        <SummaryCard icon={<FileTextIcon size={20} />} label="知识库文档" value={s.doc_count ?? 0} sub="份文档" />
        <SummaryCard icon={<FileTextIcon size={20} />} label="总字数（估算）" value={formatChars(s.total_chars ?? 0)} />
      </div>

      {/* 反馈统计 */}
      {(s.feedback_up > 0 || s.feedback_down > 0) && (
        <div className="stats-feedback-row">
          <span className="stats-feedback-item up">
            <ThumbsUpIcon size={14} />
            <span>点赞 {s.feedback_up}</span>
          </span>
          <span className="stats-feedback-item down">
            <ThumbsDownIcon size={14} />
            <span>踩 {s.feedback_down}</span>
          </span>
          {(s.feedback_up + s.feedback_down) > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              好评率 {Math.round((s.feedback_up / (s.feedback_up + s.feedback_down)) * 100)}%
            </span>
          )}
        </div>
      )}

      <div className="stats-two-col">
        {/* 最近提问记录 */}
        <div className="card stats-section-card">
          <div className="stats-section-header">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClockIcon size={15} /> 最近提问记录</span>
            <span className="stats-section-count">{recent.length} 条</span>
          </div>
          {recent.length === 0 ? (
            <div className="empty-state" style={{ padding: '28px 0' }}>
              <div className="empty-state-icon" style={{ opacity: 0.5 }}><SearchIcon size={28} /></div>
              <div className="empty-state-hint">暂无提问记录</div>
            </div>
          ) : (
            <div className="stats-query-list">
              {recent.map(q => (
                <div key={q.id} className="stats-query-item">
                  <div className="stats-query-main">
                    <div className="stats-query-text" title={q.message}>{q.message}</div>
                    <div className="stats-query-meta">
                      {q.model_used && <span className="stats-meta-tag">{q.model_used}</span>}
                      <span className="stats-meta-tag">{KB_LABELS[q.kb_group] || q.kb_group}</span>
                    </div>
                  </div>
                  <div className="stats-query-time">{formatDate(q.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top5 高频问题 */}
        <div className="card stats-section-card">
          <div className="stats-section-header">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><TrendingUpIcon size={15} /> 高频问题 Top 5</span>
          </div>
          {top.length === 0 ? (
            <div className="empty-state" style={{ padding: '28px 0' }}>
              <div className="empty-state-icon" style={{ opacity: 0.5 }}><FileTextIcon size={28} /></div>
              <div className="empty-state-hint">暂无数据</div>
            </div>
          ) : (
            <ol className="stats-top-list">
              {top.map((q, i) => (
                <li key={i} className="stats-top-item">
                  <span className={`stats-rank stats-rank-${i < 3 ? i + 1 : 'other'}`}>{i + 1}</span>
                  <div className="stats-top-body">
                    <div className="stats-query-text" title={q.message}>{q.message}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                      <span className="stats-meta-tag">问了 {q.count} 次</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>最近：{formatDate(q.last_asked)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}

export default Stats
