/**
 * 顶部文件切换 Tab 栏（M1 起动态化：数据来自 novelStore.tabs）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. 初版：静态 Tab 占位
 *   2. M1：动态 Tab（打开/激活/关闭），蓝图与章节图标区分
 */

import type { ReactElement } from 'react'
import { useNovelStore } from '@/store/novelStore'

export function TabBar(): ReactElement {
  const tabs = useNovelStore((s) => s.tabs)
  const activeTabId = useNovelStore((s) => s.activeTabId)
  const setActive = (id: string): void => useNovelStore.setState({ activeTabId: id })

  return (
    <div className="tabbar" style={{ height: 'var(--tabbar-height)' }}>
      {tabs.length === 0 && <div className="tabbar-empty">在左侧点击蓝图或章节文件打开</div>}
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab${activeTabId === tab.id ? ' active' : ''}`}
          onClick={() => setActive(tab.id)}
          title={tab.path}
        >
          <span style={{ color: tab.kind === 'blueprint' ? 'var(--accent)' : '#c8ccd4' }}>
            {tab.kind === 'blueprint' ? '◆' : '▪'}
          </span>
          {tab.title}
          <span
            className="tab-close"
            title="关闭"
            onClick={(e) => {
              e.stopPropagation()
              useNovelStore.getState().closeTab(tab.id)
            }}
          >
            ×
          </span>
        </button>
      ))}
    </div>
  )
}
