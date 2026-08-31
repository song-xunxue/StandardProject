/**
 * 码字统计面板（浮层，v2-F7）：今日新增 / 总字数 / 连续天数 / 近 14 天趋势柱
 * 数据源主进程 statsService（writing-stats.json，openNovel 对账 + saveChapter 入账）
 *
 * 作者: 李文煜
 * 日期: 2026-08-31
 *
 * 2026-08-31
 * 变更说明：
 *   1. v2-F7 初版（左栏 footer「统计」入口唤起；纯 CSS 柱状图，零图表依赖）
 */

import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { WritingStatsView } from '@shared/types'

/** 千分位格式化 */
const fmt = (n: number): string => n.toLocaleString('zh-CN')

export function StatsPanel(props: { onClose: () => void }): ReactElement {
  const [stats, setStats] = useState<WritingStatsView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        setStats(await window.api.fs.getWritingStats())
      } catch (err) {
        console.error('[StatsPanel] 读取码字统计失败:', err)
        setLoadError(err instanceof Error ? err.message : String(err))
      }
    })()
  }, [])

  /** 近 14 天趋势柱：以期间最大日增定标（全 0 时给 1 防除零） */
  const maxGain = Math.max(1, ...(stats?.recent.map((r) => r.gain) ?? [0]))

  return (
    <div className="snapshot-overlay" onMouseDown={props.onClose}>
      <div className="resource-panel nokey stats-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="resource-header">
          <span className="resource-title">码字统计</span>
          <button className="resource-close" title="关闭" onClick={props.onClose}>
            ×
          </button>
        </div>
        {loadError && <div className="insp-hint">统计读取失败：{loadError}</div>}
        {!stats && !loadError && <div className="insp-hint">加载中…</div>}
        {stats && (
          <>
            <div className="stats-cards">
              <div className="stats-card">
                <div className="stats-card-num">{fmt(stats.todayGain)}</div>
                <div className="stats-card-label">今日新增（字）</div>
              </div>
              <div className="stats-card">
                <div className="stats-card-num">{fmt(stats.totalChars)}</div>
                <div className="stats-card-label">总字数</div>
              </div>
              <div className="stats-card">
                <div className="stats-card-num">{stats.streakDays}</div>
                <div className="stats-card-label">连续码字（天）</div>
              </div>
            </div>
            <div className="stats-chart-title">近 14 天每日新增</div>
            <div className="stats-chart">
              {stats.recent.map((r) => (
                <div key={r.date} className="stats-bar-col" title={`${r.date}：+${fmt(r.gain)} 字（总量 ${fmt(r.total)}）`}>
                  <div className="stats-bar" style={{ height: `${Math.max(2, Math.round((r.gain / maxGain) * 96))}px` }} />
                  <div className="stats-bar-date">{r.date.slice(5)}</div>
                </div>
              ))}
            </div>
            <div className="insp-hint stats-note">
              口径：正文去空白字符；打开小说时全量对账（外部编辑计入当日），章节保存即入账。数据存于小说目录 writing-stats.json。
            </div>
          </>
        )}
      </div>
    </div>
  )
}
