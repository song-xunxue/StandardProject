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
 *
 * 2026-08-30
 * 变更说明：
 *   1. 体验优化批次：Tab 右键菜单（关闭 / 关闭其他 / 关闭右侧 / 关闭所有，经 closeTabs
 *      批量底座，含激活态回退与画布路由同步）；中键点击关闭（mousedown 阶段拦截自动滚动）；
 *      Tab 溢出时横向滚动（滚轮纵转横 + 激活 Tab 自动滚入视野，滚动条隐藏防行高跳变）；
 *      菜单实现迁移共享 useContextMenu hook
 */

import { useEffect, useRef } from 'react'
import type { ReactElement, MouseEvent as ReactMouseEvent } from 'react'
import { useNovelStore } from '@/store/novelStore'
import { useContextMenu } from '@/components/useContextMenu'

export function TabBar(): ReactElement {
  const tabs = useNovelStore((s) => s.tabs)
  const activeTabId = useNovelStore((s) => s.activeTabId)
  const barRef = useRef<HTMLDivElement | null>(null)
  // 激活走 store 动作（蓝图 Tab 会同步画布路由，而非裸 set）
  const setActive = (id: string): void => useNovelStore.getState().activateTab(id)

  // ---- 右键菜单（useContextMenu：外点/Esc 关闭 + 视口钳制，与左栏/画布菜单同族） ----
  const { menu, setMenu, menuRef } = useContextMenu<{ id: string }>()

  /** Tab 右键：记录目标 Tab（不改变激活态——编辑器惯例）并弹菜单 */
  const onTabContextMenu = (e: ReactMouseEvent, id: string): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, target: { id } })
  }

  const menuTab = menu ? tabs.find((t) => t.id === menu.target.id) : undefined
  const menuIndex = menuTab ? tabs.indexOf(menuTab) : -1
  // 条件渲染代替置灰项：无可操作对象时不出现该项（如唯一 Tab 时「关闭其他/关闭所有」与「关闭」等价，收敛为单项）
  const menuItems: Array<{ key: string; label: string; run: () => void }> = menuTab
    ? [
        { key: 'close', label: '关闭', run: () => useNovelStore.getState().closeTabs([menuTab.id]) },
        ...(tabs.length > 1
          ? [
              {
                key: 'others',
                label: '关闭其他',
                run: () =>
                  useNovelStore
                    .getState()
                    .closeTabs(
                      tabs.filter((t) => t.id !== menuTab.id).map((t) => t.id),
                      menuTab.id
                    )
              }
            ]
          : []),
        ...(menuIndex < tabs.length - 1
          ? [
              {
                key: 'right',
                label: '关闭右侧',
                run: () =>
                  useNovelStore
                    .getState()
                    .closeTabs(
                      tabs.slice(menuIndex + 1).map((t) => t.id),
                      menuTab.id
                    )
              }
            ]
          : []),
        ...(tabs.length > 1
          ? [{ key: 'all', label: '关闭所有', run: () => useNovelStore.getState().closeTabs(tabs.map((t) => t.id)) }]
          : [])
      ]
    : []

  // 激活 Tab 变化 / Tab 集合增减时滚入视野（Tab 多到溢出时，左栏/菜单打开的 Tab 不藏在滚动区外）
  useEffect(() => {
    if (!activeTabId) return
    barRef.current?.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTabId, tabs.length])

  return (
    <div
      ref={barRef}
      className="tabbar nokey"
      style={{ height: 'var(--tabbar-height)' }}
      onWheel={(e) => {
        // 纵向滚轮转横向滚动（编辑器 Tab 条惯例；触控板原生横滚 deltaX 优先，均不阻止默认行为）
        const el = barRef.current
        if (!el || e.deltaX !== 0 || e.deltaY === 0) return
        el.scrollLeft += e.deltaY
      }}
    >
      {tabs.length === 0 && <div className="tabbar-empty">在左侧双击蓝图或章节文件打开</div>}
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab${activeTabId === tab.id ? ' active' : ''}`}
          onClick={() => setActive(tab.id)}
          onContextMenu={(e) => onTabContextMenu(e, tab.id)}
          // 中键自动滚动须在 mousedown 阶段拦截（auxclick 已来不及）；关闭动作本身在 auxClick
          onMouseDown={(e) => {
            if (e.button === 1) e.preventDefault()
          }}
          onAuxClick={(e) => {
            if (e.button === 1) useNovelStore.getState().closeTab(tab.id)
          }}
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
      {/* Tab 右键菜单（复用画布菜单样式族；紧凑宽度变体见 .tab-context-menu） */}
      {menuTab && menu && (
        <div
          ref={menuRef}
          className="canvas-context-menu tab-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={() => setMenu(null)}
        >
          {menuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className="canvas-context-item"
              onClick={() => {
                setMenu(null)
                item.run()
              }}
            >
              <span className="canvas-context-title">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
