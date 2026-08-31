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
 *
 * 2026-08-30
 * 变更说明：
 *   1. 审查修复：新增 chapterFlush 章节冲刷桥（ChapterEditor 注册，章节文件系统
 *      变更前调用——防卸载冲刷覆盖/复活文件）
 *
 * 2026-09-01
 * 变更说明：
 *   1. v2-F3 多候选分支续写：delta 路由从模块级单变量改 Map<requestId, handler>
 *      （单会话与三路并发候选共用同一路由表，互不串扰）；新增 multiGen 候选组
 *      （同 prompt 三路并发、流式累积 80ms 节流批量 flush）、stopMultiGeneration
 *      （中断未完成路保留文本）、dismissMultiGeneration（采纳/放弃后清空）
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

/** v2-F3：一路候选（同 prompt 并发生成，A/B/C 标签供挑选） */
export interface GenCandidate {
  requestId: string
  label: string
  text: string
  done: boolean
  error: string | null
}

interface AiState {
  providers: ProviderInfo[]
  /** 当前选中的 Provider id */
  activeProviderId: string | null
  /** 正在进行的生成会话 */
  generation: { requestId: string; mode: GenerateMode } | null
  /** 最近一次生成错误（done.error） */
  generationError: string | null
  /** v2-F3 多候选会话组（与单会话互斥：任一进行中另一方禁发起） */
  multiGen: { candidates: GenCandidate[]; running: boolean } | null
  /** 编辑中的章节草稿 */
  editingDraft: EditingDraft | null
  /** 正文编辑器实例（流式插入与改写需要；不入 zustand 响应式语义，仅引用存放） */
  chapterEditor: Editor | null
  /**
   * 章节冲刷桥（2026-08-30 审查修复）：ChapterEditor 挂载时注册的「立即落盘挂起编辑」回调。
   * novelStore 的 exchangeFiles/deleteFile/renameFile 在改动文件系统【之前】调用它，
   * 清掉编辑器的 600ms 防抖定时器——否则随后的重挂载卸载冲刷会用旧内存内容覆盖
   * 交换/重命名后的文件（吞掉对方章节正文）或复活已删除文件。
   * paths 传集合时仅当编辑器路径命中才冲刷；undefined = 无条件冲刷
   */
  chapterFlush: ((paths?: string[]) => Promise<void>) | null

  loadProviders: () => Promise<void>
  saveProvider: (config: Omit<ProviderInfo, 'hasKey'>, apiKey?: string) => Promise<void>
  deleteProvider: (id: string) => Promise<void>
  testProvider: (id: string) => Promise<{ ok: boolean; message: string }>
  setActiveProvider: (id: string) => void

  /** 发起流式生成：onDelta 由调用方接 StreamInserter；返回 requestId */
  startGeneration: (mode: GenerateMode, messages: ChatMessage[], onDelta: (delta: string) => void) => Promise<string>
  /** 中断当前生成 */
  stopGeneration: () => Promise<void>
  /** 内部：处理 llm:chunk 推送（按 requestId 路由 delta 与会话状态） */
  handleChunk: (chunk: LlmChunkPayload) => void

  /** v2-F3：发起 count 路并发候选（同一 messages；各路独立 requestId 路由） */
  startMultiGeneration: (count: number, messages: ChatMessage[]) => Promise<void>
  /** v2-F3：中断未完成的路（保留已生成文本供采纳） */
  stopMultiGeneration: () => Promise<void>
  /** v2-F3：清空候选区（采纳/放弃后调用；会先中断未完成路） */
  dismissMultiGeneration: () => Promise<void>

  setDraft: (draft: EditingDraft | null) => void
  setChapterEditor: (editor: Editor | null) => void
}

const api = (): typeof window.api => {
  if (typeof window === 'undefined' || !window.api) throw new Error('window.api 不可用（需在 Electron 中运行）')
  return window.api
}

/** 模块级：delta 处理器按 requestId 路由（v2-F3 起多会话共用一张表） */
const deltaHandlers = new Map<string, (delta: string) => void>()
let unsubscribeChunks: (() => void) | null = null

/** v2-F3：候选流的待落账文本（requestId → 累积增量），80ms 节流批量并入 state */
const pendingMultiText = new Map<string, string>()
let multiFlushTimer: ReturnType<typeof setTimeout> | null = null

function ensureChunkSubscription(): void {
  if (unsubscribeChunks) return
  unsubscribeChunks = api().llm.onChunk((chunk) => {
    useAiStore.getState().handleChunk(chunk)
  })
}

const newRequestId = (): string => `gen-${crypto.randomUUID().slice(0, 8)}`

/** 把累积的候选增量批量并入 multiGen（节流终点调用） */
function flushMultiText(): void {
  if (multiFlushTimer !== null) {
    clearTimeout(multiFlushTimer)
    multiFlushTimer = null
  }
  if (pendingMultiText.size === 0) return
  const additions = [...pendingMultiText.entries()]
  pendingMultiText.clear()
  useAiStore.setState((s) => {
    if (!s.multiGen) return s
    return {
      multiGen: {
        ...s.multiGen,
        candidates: s.multiGen.candidates.map((c) => {
          const hit = additions.find(([id]) => id === c.requestId)
          return hit ? { ...c, text: c.text + hit[1] } : c
        })
      }
    }
  })
}

export const useAiStore = create<AiState>()((set, get) => ({
  providers: [],
  activeProviderId: null,
  generation: null,
  generationError: null,
  multiGen: null,
  editingDraft: null,
  chapterEditor: null,
  chapterFlush: null,

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

  testProvider: (id) => api().provider.test(id),

  setActiveProvider: (id) => set({ activeProviderId: id }),

  startGeneration: async (mode, messages, onDelta) => {
    const providerId = get().activeProviderId
    if (!providerId) throw new Error('未选择 AI Provider（先在面板中配置）')
    const requestId = newRequestId()
    deltaHandlers.set(requestId, onDelta)
    ensureChunkSubscription()
    set({ generation: { requestId, mode }, generationError: null })
    await api().llm.generate({ requestId, providerId, messages })
    return requestId
  },

  stopGeneration: async () => {
    const gen = get().generation
    if (!gen) return
    // 先同步摘除会话再通知主进程：generation 置 null 后 handleChunk 按 requestId 失配
    // 丢弃迟到分块——否则 IPC 往返期间流式文本可能写入已切换的新章节（M5 审查修复）
    set({ generation: null })
    deltaHandlers.delete(gen.requestId)
    await api().llm.stop(gen.requestId)
  },

  handleChunk: (chunk) => {
    // ---- 单会话状态（续写/改写主流程）----
    const gen = get().generation
    if (gen && chunk.requestId === gen.requestId) {
      if (chunk.error) {
        set({ generation: null, generationError: chunk.error })
        deltaHandlers.delete(chunk.requestId)
        return
      }
      if (chunk.done) {
        set({ generation: null })
        deltaHandlers.delete(chunk.requestId)
        return
      }
    }
    // ---- 多候选状态（v2-F3）----
    const mg = get().multiGen
    if (mg) {
      const cand = mg.candidates.find((c) => c.requestId === chunk.requestId)
      if (cand) {
        if (chunk.error) {
          deltaHandlers.delete(chunk.requestId)
          flushMultiText()
          const cur = get().multiGen!
          set({
            multiGen: {
              candidates: cur.candidates.map((c) => (c.requestId === chunk.requestId ? { ...c, done: true, error: chunk.error ?? '生成失败' } : c)),
              running: cur.candidates.some((c) => c.requestId !== chunk.requestId && !c.done)
            }
          })
          return
        }
        if (chunk.done) {
          deltaHandlers.delete(chunk.requestId)
          flushMultiText()
          const cur = get().multiGen!
          set({
            multiGen: {
              candidates: cur.candidates.map((c) => (c.requestId === chunk.requestId ? { ...c, done: true } : c)),
              running: cur.candidates.some((c) => c.requestId !== chunk.requestId && !c.done)
            }
          })
          return
        }
        if (chunk.delta) {
          // 候选文本节流累积（80ms 批量并入 state，避免每 chunk 一次 setState × 三路）
          pendingMultiText.set(chunk.requestId, (pendingMultiText.get(chunk.requestId) ?? '') + chunk.delta)
          if (multiFlushTimer === null) {
            multiFlushTimer = setTimeout(flushMultiText, 80)
          }
          return
        }
      }
    }
    // ---- delta 转发（单会话 StreamInserter；多候选不走此处——文本在上方累积）----
    if (chunk.delta) deltaHandlers.get(chunk.requestId)?.(chunk.delta)
  },

  startMultiGeneration: async (count, messages) => {
    const providerId = get().activeProviderId
    if (!providerId) throw new Error('未选择 AI Provider（先在面板中配置）')
    if (get().generation !== null || get().multiGen?.running) throw new Error('已有生成进行中')
    const labels = ['A', 'B', 'C', 'D', 'E']
    const candidates: GenCandidate[] = Array.from({ length: count }, (_, i) => ({
      requestId: newRequestId(),
      label: labels[i] ?? String(i + 1),
      text: '',
      done: false,
      error: null
    }))
    ensureChunkSubscription()
    set({ multiGen: { candidates, running: true }, generationError: null })
    // 并发发起（fire-and-forget；结果全部经 chunk 推送按 requestId 路由回各候选）
    for (const cand of candidates) {
      void api().llm.generate({ requestId: cand.requestId, providerId, messages }).catch((err) => {
        console.error('[aiStore] 候选发起失败:', cand.label, err)
      })
    }
  },

  stopMultiGeneration: async () => {
    const mg = get().multiGen
    if (!mg?.running) return
    for (const cand of mg.candidates) {
      if (!cand.done) {
        deltaHandlers.delete(cand.requestId)
        void api().llm.stop(cand.requestId)
      }
    }
    flushMultiText()
    set({ multiGen: { ...mg, running: false, candidates: mg.candidates.map((c) => ({ ...c, done: true })) } })
  },

  dismissMultiGeneration: async () => {
    await get().stopMultiGeneration()
    pendingMultiText.clear()
    set({ multiGen: null })
  },

  setDraft: (draft) => set({ editingDraft: draft }),

  setChapterEditor: (editor) => set({ chapterEditor: editor })
}))
