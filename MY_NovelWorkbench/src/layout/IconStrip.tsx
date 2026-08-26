/**
 * 左侧竖排图标工具条（PyCharm 式，视觉参考 docs/assets/left-toolbar-ref.png）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. 初版：静态图标占位（小说/搜索/蓝图/AI/图谱 + 底部设置），激活态高亮
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
  { key: 'search', title: '搜索', hint: '全库搜索节点与正文' },
  { key: 'blueprint', title: '蓝图', hint: '节点工作流画布' },
  { key: 'ai', title: 'AI 撰写', hint: 'AI 辅助创作面板' },
  { key: 'graph', title: '全局图谱', hint: '双向链接图谱总览' }
]

/** 内联 SVG 图标集（单色线性风格） */
const iconPath: Record<string, ReactNode> = {
  // 书本：小说项目
  novel: (
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5v-15Zm0 15A1.5 1.5 0 0 0 5.5 21H19v-3M8 7h7M8 10.5h5" />
  ),
  // 放大镜：搜索
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="m15 15 4.5 4.5" />
    </>
  ),
  // 节点连线：蓝图
  blueprint: (
    <>
      <rect x="3.5" y="4" width="6" height="4.5" rx="1" />
      <rect x="14.5" y="4" width="6" height="4.5" rx="1" />
      <rect x="9" y="15.5" width="6" height="4.5" rx="1" />
      <path d="M9.5 6.25h5M12.5 8.5v3.5h-3v3.5" />
    </>
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
      <button className="strip-btn" title="设置 — AI Provider / 主题 / 标签库">
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          {iconPath['settings']}
        </svg>
      </button>
    </div>
  )
}
