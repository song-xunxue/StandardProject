/**
 * 通用对话框组件：渲染 dialogStore 中的请求（prompt 输入 / confirm 确认）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：Enter 提交 / Esc 取消 / 遮罩点击取消
 */

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import { useDialogStore } from '@/store/dialogStore'

export function Dialog(): ReactElement | null {
  const request = useDialogStore((s) => s.request)
  const close = useDialogStore((s) => s.close)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setValue(request?.defaultValue ?? '')
    if (request?.type === 'prompt') {
      // 弹出后聚焦并全选，便于直接覆盖默认值
      setTimeout(() => inputRef.current?.select(), 0)
    }
    // confirm 型无输入框：聚焦主按钮，使 Enter 确定 / Esc 取消即时可用
    if (request?.type === 'confirm') {
      setTimeout(() => confirmBtnRef.current?.focus(), 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  if (!request) return null

  const submit = (): void => {
    close(request.type === 'prompt' ? value : true)
  }
  const cancel = (): void => {
    close(request.type === 'prompt' ? null : false)
  }
  const onKeyDown = (e: ReactKeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  return (
    <div className="dialog-overlay" onMouseDown={cancel}>
      <div className="dialog nokey" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown} role="dialog" aria-label={request.title}>
        <div className="dialog-title">{request.title}</div>
        {request.type === 'prompt' && (
          <>
            {request.label && <div className="dialog-label">{request.label}</div>}
            <input
              ref={inputRef}
              className="dialog-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </>
        )}
        {request.type === 'confirm' && <div className="dialog-label">{request.label ?? '确认执行此操作？'}</div>}
        <div className="dialog-actions">
          <button className="dialog-btn" onClick={cancel}>
            取消
          </button>
          <button ref={confirmBtnRef} className="dialog-btn primary" onClick={submit}>
            {request.okText ?? '确定'}
          </button>
        </div>
      </div>
    </div>
  )
}
