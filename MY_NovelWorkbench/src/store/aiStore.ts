/**
 * AI 工作区存储（zustand）：Provider 列表与选择 / 流式生成会话 / 正在编辑的章节草稿
 * LLM 请求在主进程执行（llmService），渲染层经 onChunk 订阅增量并写入 StreamInserter
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M3 初版
 */

import { create } from 'zustand'
import type { Editor } from '@tiptap/core'
import type { ChatMessage, LlmChunkPayload, ProviderInfo } from '@shared/types'

/** 正在编辑的章节草稿（ChapterEditor 发布，上下文组装与 AI 面板消费） */
export interface EditingDraft {
  /** 章节文件相对路径 */
  path: string
  /** 编辑器当前 markdown 全文 */
  text: string
}

type GenerateMode = 'continue' | 'rewrite'

interface AiState {
  providers: ProviderInfo[]
  /** 当前选中的 Provider id */
  activeProviderId: string | null
  /** 正在进行的生成会话 */
  generation: { requestId: string; mode: GenerateMode } | null
  /** 最近一次生成错误（done.error） */
  generationError: string | null
  /** 编辑中的章节草稿 */
  editingDraft: EditingDraft | null
  /** 正文编辑器实例（流式插入与改写需要；不入 zustand 响应式语义，仅引用存放） */
  chapterEditor: Editor | null

  loadProviders: () => Promise<void>
  saveProvider: (config: Omit<ProviderInfo, 'hasKey'>, apiKey?: string) => Promise<void>
  deleteProvider: (id: string) => Promise<void>
  testProvider: (id: string) => Promise<{ ok: boolean; message: string }>
  setActiveProvider: (id: string) => void

  /** 发起流式生成：onDelta 由调用方接 StreamInserter；返回 requestId */
  startGeneration: (mode: GenerateMode, messages: ChatMessage[], onDelta: (delta: string) => void) => Promise<string>
  /** 中断当前生成 */
  stopGeneration: () => Promise<void>
  /** 内部：处理 llm:chunk 推送 */
  handleChunk: (chunk: LlmChunkPayload, onDelta: (delta: string) => void) => void
  /** 供 startGeneration 绑定的 delta 回调注册（模块级单订阅） */
  bindDeltaHandler: (handler: ((delta: string) => void) | null) => void

  setDraft: (draft: EditingDraft | null) => void
  setChapterEditor: (editor: Editor | null) => void
}

const api = (): typeof window.api => {
  if (typeof window === 'undefined' || !window.api) throw new Error('window.api 不可用（需在 Electron 中运行）')
  return window.api
}

/** 模块级：当前生成的 delta 处理器（chunk 推送是全局通道，需路由到当前会话） */
let deltaHandler: ((delta: string) => void) | null = null
let unsubscribeChunks: (() => void) | null = null

function ensureChunkSubscription(): void {
  if (unsubscribeChunks) return
  unsubscribeChunks = api().llm.onChunk((chunk) => {
    useAiStore.getState().handleChunk(chunk, (delta) => deltaHandler?.(delta))
  })
}

const newRequestId = (): string => `gen-${crypto.randomUUID().slice(0, 8)}`

export const useAiStore = create<AiState>()((set, get) => ({
  providers: [],
  activeProviderId: null,
  generation: null,
  generationError: null,
  editingDraft: null,
  chapterEditor: null,

  loadProviders: async () => {
    const providers = await api().provider.list()
    const active =
      get().activeProviderId && providers.some((p) => p.id === get().activeProviderId)
        ? get().activeProviderId
        : (providers.find((p) => p.isDefault) ?? providers[0])?.id ?? null
    set({ providers, activeProviderId: active })
  },

  saveProvider: async (config, apiKey) => {
    await api().provider.save(config, apiKey)
    await get().loadProviders()
  },

  deleteProvider: async (id) => {
    await api().provider.remove(id)
    await get().loadProviders()
  },

  testProvider: async (id) => api().provider.test(id),

  setActiveProvider: (id) => set({ activeProviderId: id }),

  startGeneration: async (mode, messages, onDelta) => {
    const providerId = get().activeProviderId
    if (!providerId) throw new Error('未选择 AI Provider（先在面板中配置）')
    const requestId = newRequestId()
    deltaHandler = onDelta
    ensureChunkSubscription()
    set({ generation: { requestId, mode }, generationError: null })
    await api().llm.generate({ requestId, providerId, messages })
    return requestId
  },

  stopGeneration: async () => {
    const gen = get().generation
    if (!gen) return
    await api().llm.stop(gen.requestId)
    set({ generation: null })
  },

  handleChunk: (chunk, onDelta) => {
    const gen = get().generation
    if (!gen || chunk.requestId !== gen.requestId) return
    if (chunk.error) {
      set({ generation: null, generationError: chunk.error })
      deltaHandler = null
      return
    }
    if (chunk.delta) onDelta(chunk.delta)
    if (chunk.done) {
      set({ generation: null })
      deltaHandler = null
    }
  },

  bindDeltaHandler: (handler) => {
    deltaHandler = handler
  },

  setDraft: (draft) => set({ editingDraft: draft }),

  setChapterEditor: (editor) => set({ chapterEditor: editor })
}))
