/**
 * 右键菜单公共 hook：开合状态 + 菜单外 mousedown/Esc 关闭 + 视口边缘钳制
 * 消费方：TabBar / LeftPanel / BlueprintCanvas（画布与节点菜单）——三处菜单行为统一单点维护
 *
 * 作者: 李文煜
 * 日期: 2026-08-30
 *
 * 2026-08-30
 * 变更说明：
 *   1. 体验优化批次：从三处复制粘贴的菜单实现抽取（此前已出现关闭时机漂移：
 *      仅画布菜单有 onMouseLeave 关闭）
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** 菜单目标载荷（消费方自定义：Tab id / 树区域 / 画布节点等） */
export interface ContextMenuState<T> {
  x: number
  y: number
  target: T
}

export function useContextMenu<T>() {
  const [menu, setMenu] = useState<ContextMenuState<T> | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // 菜单外 mousedown / Esc 关闭（capture 拦截，先于其他点击处理）
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) setMenu(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  // 视口边缘钳制（靠右/下缘右键时菜单收回屏内，条目始终可达）
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return
    const el = menuRef.current
    const x = Math.min(menu.x, Math.max(8, window.innerWidth - el.offsetWidth - 8))
    const y = Math.min(menu.y, Math.max(8, window.innerHeight - el.offsetHeight - 8))
    if (x !== menu.x || y !== menu.y) setMenu({ ...menu, x, y })
  }, [menu])

  return { menu, setMenu, menuRef }
}
