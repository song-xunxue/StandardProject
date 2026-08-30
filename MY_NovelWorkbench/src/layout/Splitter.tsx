/**
 * 可拖动分界线（PyCharm 式左右分栏调整，需求 FR/UI：分界线 #26282B）
 * 支持鼠标拖动、双击复位、方向键微调（可访问性）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. 初版：Pointer Events 拖动 + 双击复位 + 键盘方向键调整
 *
 * 2026-08-30
 * 变更说明：
 *   1. 性能批次：拖动位移 rAF 合帧（此前每个 pointermove 直接触发 App 级重渲，
 *      高回报率鼠标下每秒数百次整树/画布/面板 reconcile）
 */

import { useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactElement } from 'react'

export function Splitter({
  onResize,
  onReset
}: {
  /** 拖动/按键产生的水平位移增量（正值加宽左栏） */
  onResize: (dx: number) => void
  /** 双击复位 */
  onReset: () => void
}): ReactElement {
  const dragging = useRef(false)
  // rAF 合帧：累计位移，每帧至多回调一次（丢帧无损失——增量已累积）
  const accRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  const flushAcc = (): void => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      if (accRef.current !== 0) {
        onResize(accRef.current)
        accRef.current = 0
      }
    })
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragging.current) return
    accRef.current += e.movementX
    flushAcc()
  }

  const stopDrag = (e: ReactPointerEvent<HTMLDivElement>): void => {
    dragging.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
    // 松手即冲刷余量（不等下一帧），确保最终宽度精确
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (accRef.current !== 0) {
      onResize(accRef.current)
      accRef.current = 0
    }
  }

  // 键盘可访问性：左右方向键调整分栏宽度
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onResize(-16)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      onResize(16)
    }
  }

  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
    />
  )
}
