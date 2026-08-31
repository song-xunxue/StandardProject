/**
 * 左侧竖排图标工具条（PyCharm 式，视觉参考 docs/assets/left-toolbar-ref.png）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. 初版：静态图标占位（小说/搜索/蓝图/AI/图谱 + 底部设置），激活态高亮
 *
 * 2026-08-30
 * 变更说明：
 *   1. 审查修复：移除无对应功能的 search/blueprint 两项（点击只高亮无任何反应，
 *      误导用户）；底部设置按钮接线到 AI 面板（Provider 管理入口在此），不再是摆设
 *
 * 2026-09-01
 * 变更说明：
 *   1. v2-F4：新增 timeline 项（时间线矩阵——情节线×章节的 Plottr 式投影）
 */

import type { ReactElement, ReactNode } from 'react'

interface IconItem {
  key: string
  title: string
  /** 悬停提示补充说明 */
  hint: string
}

const ICON_ITEMS: IconItem[] = [
  { key: 'novel', title: '小说项目', hint: '创建/打开小说目录' },
  { key: 'ai', title: 'AI 撰写', hint: 'AI 辅助创作面板与 Provider 管理' },
  { key: 'graph', title: '全局图谱', hint: '双向链接图谱总览' },
  { key: 'timeline', title: '时间线矩阵', hint: '情节线 × 章节的伏笔/支线排布' }
]

/** 内联 SVG 图标集（单色线性风格） */
const iconPath: Record<string, ReactNode> = {
  // 书本：小说项目
  novel: (
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5v-15Zm0 15A1.5 1.5 0 0 0 5.5 21H19v-3M8 7h7M8 10.5h5" />
  ),
  // 波纹+对话气泡：AI 撰写（视觉参考 docs/assets/ai-write-icon-ref.png）
  ai: (
    <>
      <path d="M3 12a3.5 3.5 0 0 1 3.5 3.5" />
      <path d="M6 8a7 7 0 0 1 10 6.3" />
      <path d="M9 8.5A4 4 0 0 1 15 12" />
      <circle cx="16.2" cy="16.2" r="1.2" />
    </>
  ),
  // 圆点网络：全局图谱
  graph: (
    <>
      <circle cx="6" cy="6.5" r="2.2" />
      <circle cx="18" cy="8" r="2.2" />
      <circle cx="9" cy="17.5" r="2.2" />
      <path d="m8 8 8.3-.7M7 8.6l1.4 6.7" />
    </>
  ),
  // 网格矩阵：时间线（v2-F4）
  timeline: (
    <>
      <rect x="4" y="4" width="5" height="5" rx="0.5" />
      <rect x="11" y="4" width="5" height="5" rx="0.5" />
      <rect x="4" y="11" width="5" height="5" rx="0.5" />
      <rect x="11" y="11" width="5" height="5" rx="0.5" />
      <path d="M9.5 6.5h1M9.5 13.5h1M6.5 9.5v1M13.5 9.5v1" />
    </>
  ),
  // 齿轮：设置
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1" />
    </>
  )
}

export function IconStrip({ active, onSelect }: { active: string; onSelect: (key: string) => void }): ReactElement {
  return (
    <div className="icon-strip" style={{ width: 'var(--icon-strip-width)', background: 'var(--bg-left)' }}>
      {ICON_ITEMS.map((item) => (
        <button
          key={item.key}
          className={`strip-btn${active === item.key ? ' active' : ''}`}
          title={`${item.title} — ${item.hint}`}
          onClick={() => onSelect(item.key)}
        >
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {iconPath[item.key]}
          </svg>
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <button
        className={`strip-btn${active === 'ai' ? ' active' : ''}`}
        title="设置 — AI Provider 管理（打开 AI 撰写面板）"
        onClick={() => onSelect('ai')}
      >
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          {iconPath['settings']}
        </svg>
      </button>
    </div>
  )
}
