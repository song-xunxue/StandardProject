/**
 * AI 工作区多会话路由单测（v2-F3）：delta 按 requestId 分路路由 / 多候选流式累积与
 * done/error 状态 / 单会话与多候选互不串扰 / 停止与清空
 * window.api 以 stub 替代（llm.generate 记录请求、onChunk 捕获推送回调）
 *
 * 作者: 李文煜
 * 日期: 2026-09-01
 *
 * 2026-09-01
 * 变更说明：
 *   1. v2-F3 初版
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- window.api stub（须在导入 aiStore 前就位） ----
const generateCalls: string[] = []
const stopCalls: string[] = []
let chunkSink: ((chunk: unknown) => void) | null = null
vi.stubGlobal('window', {
  api: {
    provider: {
      list: async () => [{ id: 'p1', name: '测试', model: 'm', isDefault: true, hasKey: true }],
      save: async () => {},
      remove: async () => {},
      test: async () => ({ ok: true, message: 'ok' })
    },
    llm: {
      generate: async (payload: { requestId: string }): Promise<void> => {
        generateCalls.push(payload.requestId)
      },
      stop: async (requestId: string): Promise<void> => {
        stopCalls.push(requestId)
      },
      onChunk: (cb: (chunk: unknown) => void): (() => void) => {
        chunkSink = cb
        return () => {
          chunkSink = null
        }
      }
    }
  }
})

const { useAiStore } = await import('./aiStore')

const pushChunk = (chunk: Record<string, unknown>): void => {
  chunkSink?.(chunk)
}

beforeEach(() => {
  generateCalls.length = 0
  stopCalls.length = 0
  useAiStore.setState({
    providers: [],
    activeProviderId: 'p1',
    generation: null,
    generationError: null,
    multiGen: null,
    editingDraft: null,
    chapterEditor: null,
    chapterFlush: null
  })
})

describe('多会话 delta 路由（v2-F3）', () => {
  it('startMultiGeneration：三路并发各得独立 requestId，全部经 llm.generate 发起', async () => {
    await useAiStore.getState().startMultiGeneration(3, [])
    const mg = useAiStore.getState().multiGen!
    expect(mg.running).toBe(true)
    expect(mg.candidates.map((c) => c.label)).toEqual(['A', 'B', 'C'])
    expect(new Set(mg.candidates.map((c) => c.requestId)).size).toBe(3)
    expect(generateCalls).toHaveLength(3)
  })

  it('delta 按 requestId 路由到对应候选（节流 flush 后文本正确分栏）', async () => {
    await useAiStore.getState().startMultiGeneration(3, [])
    const [a, b] = useAiStore.getState().multiGen!.candidates
    pushChunk({ requestId: a.requestId, delta: '甲', done: false })
    pushChunk({ requestId: b.requestId, delta: '乙', done: false })
    pushChunk({ requestId: a.requestId, delta: '丙', done: false })
    // 等 80ms 节流 flush
    await new Promise((r) => setTimeout(r, 150))
    const mg = useAiStore.getState().multiGen!
    expect(mg.candidates.find((c) => c.label === 'A')!.text).toBe('甲丙')
    expect(mg.candidates.find((c) => c.label === 'B')!.text).toBe('乙')
    expect(mg.candidates.find((c) => c.label === 'C')!.text).toBe('')
  })

  it('单路 done 收尾不影响其余路；全部 done 后 running=false', async () => {
    await useAiStore.getState().startMultiGeneration(2, [])
    const [a, b] = useAiStore.getState().multiGen!.candidates
    pushChunk({ requestId: a.requestId, delta: '完成文本', done: false })
    await new Promise((r) => setTimeout(r, 150))
    pushChunk({ requestId: a.requestId, done: true })
    expect(useAiStore.getState().multiGen!.running).toBe(true)
    pushChunk({ requestId: b.requestId, done: true })
    const mg = useAiStore.getState().multiGen!
    expect(mg.running).toBe(false)
    expect(mg.candidates.every((c) => c.done)).toBe(true)
    expect(mg.candidates.find((c) => c.label === 'A')!.text).toBe('完成文本')
  })

  it('单会话与多候选互不串扰：单会话 delta 只进 handler，不落候选文本', async () => {
    let singleText = ''
    await useAiStore.getState().startGeneration('continue', [], (d) => {
      singleText += d
    })
    await useAiStore.getState().startMultiGeneration(1, []).catch(() => undefined) // 单会话进行中应拒绝
    expect(useAiStore.getState().multiGen).toBeNull()
    const gen = useAiStore.getState().generation!
    pushChunk({ requestId: gen.requestId, delta: '单会话内容', done: false })
    expect(singleText).toBe('单会话内容')
    pushChunk({ requestId: gen.requestId, done: true })
    expect(useAiStore.getState().generation).toBeNull()
  })

  it('stopMultiGeneration：中断未完成路（llm.stop 各路）并保留文本；dismiss 清空', async () => {
    await useAiStore.getState().startMultiGeneration(3, [])
    const mg = useAiStore.getState().multiGen!
    pushChunk({ requestId: mg.candidates[0]!.requestId, delta: '部分', done: false })
    await new Promise((r) => setTimeout(r, 150))
    await useAiStore.getState().stopMultiGeneration()
    const stopped = useAiStore.getState().multiGen!
    expect(stopCalls).toHaveLength(3)
    expect(stopped.running).toBe(false)
    expect(stopped.candidates.find((c) => c.label === 'A')!.text).toBe('部分')
    await useAiStore.getState().dismissMultiGeneration()
    expect(useAiStore.getState().multiGen).toBeNull()
  })
})
