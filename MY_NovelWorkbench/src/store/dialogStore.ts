/**
 * 对话框存储：Promise 化的 prompt / confirm（Electron 渲染层无原生实现）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：ask() 返回 Promise，Dialog 组件渲染并 resolve
 */

import { create } from 'zustand'

export interface DialogRequest {
  type: 'prompt' | 'confirm'
  title: string
  label?: string
  defaultValue?: string
  /** confirm 的确认按钮文案 */
  okText?: string
}

type Resolve = (value: string | boolean | null) => void

interface DialogState {
  request: DialogRequest | null
  resolver: Resolve | null
  /** 发起对话框：prompt → string|null（取消）；confirm → boolean */
  ask: (request: DialogRequest) => Promise<string | boolean | null>
  /** Dialog 组件调用：提交结果并关闭 */
  close: (value: string | boolean | null) => void
}

export const useDialogStore = create<DialogState>()((set, get) => ({
  request: null,
  resolver: null,

  ask: (request) =>
    new Promise<string | boolean | null>((resolve) => {
      set({ request, resolver: resolve })
    }),

  close: (value) => {
    const { resolver } = get()
    resolver?.(value)
    set({ request: null, resolver: null })
  }
}))

/** 便捷封装 */
export const dialogPrompt = (title: string, label?: string, defaultValue?: string): Promise<string | null> =>
  useDialogStore.getState().ask({ type: 'prompt', title, label, defaultValue }) as Promise<string | null>

export const dialogConfirm = (title: string, okText?: string): Promise<boolean> =>
  useDialogStore.getState().ask({ type: 'confirm', title, okText }) as Promise<boolean>
