/**
 * 拆书抽取会话存储（zustand，v2-F15）：逐章顺序 LLM 抽取的进度与候选实体
 * 自有 requestId 前缀（extract-）+ 自建 llm:chunk 订阅——绕开 aiStore 的单会话
 * 互斥（长批次抽取不应锁死续写/改写半小时）；aiStore.handleChunk 对未知 requestId
 * 是安全 no-op，两边互不串扰（requestId 前缀过滤双向成立）。
 * 章节级状态机：pending → extracting → done / failed（失败可重试；停止把当前章
 * 回退 pending）。候选实体在确认入库前只存内存（关闭浮层即失——UI 明示）。
 *
 * 作者: 李文煜
 * 日期: 2026-09-23
 */

import { create } from 'zustand'
import type { LlmChunkPayload } from '@shared/types'
import {
  mergeExtractedEntities,
  parseExtractOutput,
  splitChapterWindows
} from '@shared/extract'
import type { ExtractedEntity } from '@shared/extract'
import { extractChapterMessages, EXTRACT_MAX_TOKENS } from '@/services/extractAssembly'
import { useAiStore } from '@/store/aiStore'

/** 单章抽取任务状态 */
export interface ExtractChapterTask {
  path: string
  title: string
  volume?: string
  status: 'pending' | 'extracting' | 'done' | 'failed'
  error: string | null
}

interface ExtractState {
  /** 章节任务列表（prepare 时由文件树摊平生成） */
  chapters: ExtractChapterTask[]
  /** 累计候选实体（跨章合并；确认面板可编辑） */
  candidates: ExtractedEntity[]
  running: boolean
  prepare: (chapters: Array<{ path: string; title: string; volume?: string }>) => void
  start: () => Promise<void>
  /** 停止：当前章回退 pending，已完成章与候选保留 */
  stop: () => void
  /** 重试全部失败章（重新进入 running） */
  retryFailed: () => Promise<void>
  /** 候选行内编辑（确认面板） */
  updateCandidate: (index: number, patch: Partial<ExtractedEntity>) => void
  removeCandidate: (index: number) => void
  /** 清空会话（入库后/放弃后） */
  reset: () => void
}

const api = (): typeof window.api => {
  if (typeof window === 'undefined' || !window.api) throw new Error('window.api 不可用（需在 Electron 中运行）')
  return window.api
}

// ---- 模块级：自有 chunk 订阅与请求路由（aiStore 同款模式，前缀隔离） ----
const REQUEST_PREFIX = 'extract-'
const extractBuffers = new Map<string, string>()
interface ExtractWaiter {
  resolve: (entities: ExtractedEntity[]) => void
  reject: (err: Error) => void
}
const extractWaiters = new Map<string, ExtractWaiter>()
let unsubscribeChunks: (() => void) | null = null
/** 停止标记（stop() 置位；循环与在途请求据此中断） */
let stopRequested = false
/** 会话代际号（审查修复：reset 后快速重开时，旧循环的迟到结算不得写入新会话/打回 running） */
let sessionEpoch = 0

function ensureChunkSubscription(): void {
  if (unsubscribeChunks) return
  unsubscribeChunks = api().llm.onChunk((chunk) => {
    const payload = chunk as LlmChunkPayload
    if (!payload.requestId.startsWith(REQUEST_PREFIX)) return
    const waiter = extractWaiters.get(payload.requestId)
    if (!waiter) return // 已停止/已超时：迟到分块丢弃
    if (payload.error) {
      extractWaiters.delete(payload.requestId)
      extractBuffers.delete(payload.requestId)
      waiter.reject(new Error(payload.error))
    } else if (payload.done) {
      const text = extractBuffers.get(payload.requestId) ?? ''
      extractWaiters.delete(payload.requestId)
      extractBuffers.delete(payload.requestId)
      waiter.resolve(parseExtractOutput(text))
    } else if (payload.delta) {
      extractBuffers.set(payload.requestId, (extractBuffers.get(payload.requestId) ?? '') + payload.delta)
    }
  })
}

/** 单次抽取调用：发起 → 流式累积 → done 后一次容错解析 */
function generateExtract(
  providerId: string,
  messages: ReturnType<typeof extractChapterMessages>
): Promise<ExtractedEntity[]> {
  const requestId = `${REQUEST_PREFIX}${crypto.randomUUID().slice(0, 8)}`
  return new Promise<ExtractedEntity[]>((resolve, reject) => {
    extractWaiters.set(requestId, { resolve, reject })
    extractBuffers.set(requestId, '')
    void api()
      .llm.generate({ requestId, providerId, messages, maxTokens: EXTRACT_MAX_TOKENS })
      .catch((err) => {
        // 发起本身失败（通道异常）：直接结算等待方
        extractWaiters.delete(requestId)
        extractBuffers.delete(requestId)
        reject(err instanceof Error ? err : new Error(String(err)))
      })
  })
}

/** 中断在途抽取请求（stop 用）：等待方以「已中断」拒绝，主进程停流 */
function cancelActiveRequests(): void {
  for (const [requestId, waiter] of extractWaiters) {
    extractWaiters.delete(requestId)
    extractBuffers.delete(requestId)
    waiter.reject(new Error('已中断'))
    void api().llm.stop(requestId)
  }
}

export const useExtractStore = create<ExtractState>()((set, get) => ({
  chapters: [],
  candidates: [],
  running: false,

  prepare: (chapters) => {
    set({
      chapters: chapters.map((c) => ({ ...c, status: 'pending', error: null })),
      candidates: []
    })
  },

  start: async () => {
    if (get().running) return
    const providerId = useAiStore.getState().activeProviderId
    if (!providerId) throw new Error('未选择 AI Provider（先在 AI 面板配置）')
    ensureChunkSubscription()
    const epoch = ++sessionEpoch
    stopRequested = false
    set({ running: true })
    try {
      for (const task of get().chapters) {
        if (stopRequested) break
        if (task.status !== 'pending') continue
        set({
          chapters: get().chapters.map((c) =>
            c.path === task.path ? { ...c, status: 'extracting', error: null } : c
          )
        })
        try {
          const doc = await api().fs.readChapter(task.path)
          if (epoch !== sessionEpoch) return // 旧会话迟到结算：不写新会话状态
          const windows = splitChapterWindows(doc.content)
          const windowResults: ExtractedEntity[][] = []
          for (let w = 0; w < windows.length; w++) {
            if (stopRequested) break
            const messages = extractChapterMessages({
              title: task.title,
              content: windows[w]!,
              knownEntities: get().candidates
            })
            windowResults.push(await generateExtract(providerId, messages))
            if (epoch !== sessionEpoch) return // 同上（窗口结算点）
          }
          if (stopRequested) {
            // 中断：当前章回退 pending（含已完成的窗口结果——重试整章，避免半章状态）
            set({
              chapters: get().chapters.map((c) =>
                c.path === task.path ? { ...c, status: 'pending', error: null } : c
              )
            })
            break
          }
          set({
            candidates: mergeExtractedEntities([get().candidates, ...windowResults]),
            chapters: get().chapters.map((c) => (c.path === task.path ? { ...c, status: 'done' } : c))
          })
        } catch (err) {
          if (epoch !== sessionEpoch) return // 旧会话迟到失败：不写新会话状态
          if (stopRequested) {
            set({
              chapters: get().chapters.map((c) =>
                c.path === task.path ? { ...c, status: 'pending', error: null } : c
              )
            })
            break
          }
          const message = err instanceof Error ? err.message : String(err)
          set({
            chapters: get().chapters.map((c) =>
              c.path === task.path ? { ...c, status: 'failed', error: message } : c
            )
          })
          // Provider 级错误（未配置/鉴权失败）后续章必然同样失败——整批停止
          if (message.includes('Provider')) break
        }
      }
    } finally {
      // 代际守卫：旧会话退出不得把新会话刚置位的 running 打回 false
      if (epoch === sessionEpoch) set({ running: false })
    }
  },

  stop: () => {
    if (!get().running) return
    stopRequested = true
    cancelActiveRequests()
  },

  retryFailed: async () => {
    set({
      chapters: get().chapters.map((c) => (c.status === 'failed' ? { ...c, status: 'pending', error: null } : c))
    })
    await get().start()
  },

  updateCandidate: (index, patch) => {
    set({
      candidates: get().candidates.map((c, i) => (i === index ? { ...c, ...patch } : c))
    })
  },

  removeCandidate: (index) => {
    set({ candidates: get().candidates.filter((_, i) => i !== index) })
  },

  reset: () => {
    sessionEpoch++
    stopRequested = true
    cancelActiveRequests()
    set({ chapters: [], candidates: [], running: false })
  }
}))
