/**
 * 拆书抽取会话单测（v2-F15）：逐章顺序抽取与候选跨章合并 / 停止回退当前章 /
 * 失败章可重试 / Provider 级错误整批停止 / 自有 requestId 前缀绕开 aiStore 互斥
 * window.api 以 stub 替代（llm.generate 捕获 requestId、onChunk 捕获推送回调）
 *
 * 作者: 李文煜
 * 日期: 2026-09-23
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterDoc } from '@shared/types'

// ---- window.api stub（须在导入 store 前就位） ----
const stopCalls: string[] = []
const generatePayloads: Array<Record<string, unknown>> = []
/** 章节路径 → 模拟正文 */
let chapterBodies: Record<string, string> = {}
let chunkSink: ((chunk: unknown) => void) | null = null
vi.stubGlobal('window', {
  api: {
    fs: {
      readChapter: async (path: string): Promise<ChapterDoc> => ({
        path,
        title: path.split('/').pop()?.replace(/\.md$/, '') ?? '',
        tags: [],
        aliases: [],
        content: chapterBodies[path] ?? ''
      })
    },
    llm: {
      generate: async (payload: { requestId: string }): Promise<void> => {
        generatePayloads.push(payload as Record<string, unknown>)
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

const { useExtractStore } = await import('@/store/extractStore')
const { useAiStore } = await import('@/store/aiStore')

const pushChunk = (chunk: Record<string, unknown>): void => {
  chunkSink?.(chunk)
}

/** 把一次生成从发起到 done 推完（delta 两条 + done 一条） */
const flushGeneration = async (requestId: string, text: string): Promise<void> => {
  pushChunk({ requestId, delta: text.slice(0, Math.ceil(text.length / 2)) })
  pushChunk({ requestId, delta: text.slice(Math.ceil(text.length / 2)) })
  pushChunk({ requestId, done: true })
}

/** 轮询等待条件成立（异步循环推进） */
const waitUntil = async (fn: () => boolean): Promise<void> => {
  for (let i = 0; i < 200; i++) {
    if (fn()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('waitUntil 超时')
}

const lastRequestId = (): string => String(generatePayloads[generatePayloads.length - 1]!.requestId)

beforeEach(() => {
  stopCalls.length = 0
  generatePayloads.length = 0
  chapterBodies = {}
  useAiStore.setState({ activeProviderId: 'p1', generation: null, multiGen: null })
  useExtractStore.getState().reset()
})

describe('拆书抽取会话（v2-F15）', () => {
  it('逐章顺序抽取：requestId 带 extract- 前缀（绕开 aiStore 互斥），候选跨章合并', async () => {
    chapterBodies = { 'chapters/第01章.md': '第一章正文', 'chapters/第02章.md': '第二章正文' }
    useExtractStore.getState().prepare([
      { path: 'chapters/第01章.md', title: '第01章' },
      { path: 'chapters/第02章.md', title: '第02章' }
    ])
    const run = useExtractStore.getState().start()
    // 第一章
    await waitUntil(() => generatePayloads.length === 1)
    expect(lastRequestId().startsWith('extract-')).toBe(true)
    expect(generatePayloads[0]!.maxTokens).toBe(4096)
    await flushGeneration(lastRequestId(), '{"entities":[{"name":"林越","aliases":["越哥"],"type":"人物","summary":"主角"}]}')
    await waitUntil(() => generatePayloads.length === 2)
    // 第二章返回同名实体（合并）+ 新实体
    await flushGeneration(lastRequestId(), '{"entities":[{"name":"林越","aliases":["林大哥"],"type":"人物","summary":"主角，剑修"},{"name":"青云宗","type":"势力","summary":"宗门"}]}')
    await run
    const s = useExtractStore.getState()
    expect(s.running).toBe(false)
    expect(s.chapters.map((c) => c.status)).toEqual(['done', 'done'])
    expect(s.candidates.map((c) => c.name)).toEqual(['林越', '青云宗'])
    expect(s.candidates[0]!.aliases).toEqual(['越哥', '林大哥'])
    expect(s.candidates[0]!.summary).toBe('主角，剑修')
  })

  it('停止：当前章回退 pending、在途请求取消（llm.stop）', async () => {
    chapterBodies = { 'chapters/第01章.md': '正文' }
    useExtractStore.getState().prepare([{ path: 'chapters/第01章.md', title: '第01章' }])
    const run = useExtractStore.getState().start()
    await waitUntil(() => generatePayloads.length === 1)
    useExtractStore.getState().stop()
    await run
    const s = useExtractStore.getState()
    expect(s.running).toBe(false)
    expect(s.chapters[0]!.status).toBe('pending')
    expect(stopCalls).toContain(lastRequestId())
  })

  it('单章失败（非 Provider 错误）：标记 failed 继续下一章', async () => {
    chapterBodies = { 'chapters/第01章.md': '一', 'chapters/第02章.md': '二' }
    useExtractStore.getState().prepare([
      { path: 'chapters/第01章.md', title: '第01章' },
      { path: 'chapters/第02章.md', title: '第02章' }
    ])
    const run = useExtractStore.getState().start()
    await waitUntil(() => generatePayloads.length === 1)
    pushChunk({ requestId: lastRequestId(), error: '网络超时' })
    await waitUntil(() => generatePayloads.length === 2) // 失败后继续第二章
    await flushGeneration(lastRequestId(), '{"entities":[{"name":"乙","type":"地点","summary":""}]}')
    await run
    const s = useExtractStore.getState()
    expect(s.chapters[0]!.status).toBe('failed')
    expect(s.chapters[0]!.error).toBe('网络超时')
    expect(s.chapters[1]!.status).toBe('done')
    expect(s.candidates.map((c) => c.name)).toEqual(['乙'])
  })

  it('Provider 级错误整批停止：后续章不再发起', async () => {
    chapterBodies = { 'chapters/第01章.md': '一', 'chapters/第02章.md': '二' }
    useExtractStore.getState().prepare([
      { path: 'chapters/第01章.md', title: '第01章' },
      { path: 'chapters/第02章.md', title: '第02章' }
    ])
    const run = useExtractStore.getState().start()
    await waitUntil(() => generatePayloads.length === 1)
    pushChunk({ requestId: lastRequestId(), error: '未选择 AI Provider' })
    await run
    expect(generatePayloads).toHaveLength(1)
    expect(useExtractStore.getState().chapters[0]!.status).toBe('failed')
  })

  it('retryFailed：失败章回 pending 并重新抽取成功', async () => {
    chapterBodies = { 'chapters/第01章.md': '一' }
    useExtractStore.getState().prepare([{ path: 'chapters/第01章.md', title: '第01章' }])
    const run1 = useExtractStore.getState().start()
    await waitUntil(() => generatePayloads.length === 1)
    pushChunk({ requestId: lastRequestId(), error: '网络超时' })
    await run1
    expect(useExtractStore.getState().chapters[0]!.status).toBe('failed')

    const run2 = useExtractStore.getState().retryFailed()
    await waitUntil(() => generatePayloads.length === 2)
    await flushGeneration(lastRequestId(), '{"entities":[{"name":"甲","type":"人物","summary":""}]}')
    await run2
    const s = useExtractStore.getState()
    expect(s.chapters[0]!.status).toBe('done')
    expect(s.candidates.map((c) => c.name)).toEqual(['甲'])
  })

  it('未选择 Provider：发起直接失败且不进入 running', async () => {
    useAiStore.setState({ activeProviderId: null })
    useExtractStore.getState().prepare([{ path: 'chapters/第01章.md', title: '第01章' }])
    await expect(useExtractStore.getState().start()).rejects.toThrow('未选择 AI Provider')
    expect(useExtractStore.getState().running).toBe(false)
  })

  it('候选编辑与移除（确认面板行内编辑的数据面）', () => {
    useExtractStore.getState().prepare([])
    useExtractStore.setState({
      candidates: [
        { name: '甲', aliases: [], type: '人物', summary: '' },
        { name: '乙', aliases: [], type: '地点', summary: '' }
      ]
    })
    useExtractStore.getState().updateCandidate(0, { name: '甲改', type: '势力' })
    expect(useExtractStore.getState().candidates[0]).toEqual({ name: '甲改', aliases: [], type: '势力', summary: '' })
    useExtractStore.getState().removeCandidate(0)
    expect(useExtractStore.getState().candidates.map((c) => c.name)).toEqual(['乙'])
  })

  it('超长章节切窗多次抽取后合并（EXTRACT_WINDOW_CHARS 生效链路）', async () => {
    chapterBodies = { 'chapters/第01章.md': '段'.repeat(21000) }
    useExtractStore.getState().prepare([{ path: 'chapters/第01章.md', title: '第01章' }])
    const run = useExtractStore.getState().start()
    await waitUntil(() => generatePayloads.length === 1)
    await flushGeneration(lastRequestId(), '{"entities":[{"name":"甲","type":"人物","summary":""}]}')
    await waitUntil(() => generatePayloads.length === 2)
    await flushGeneration(lastRequestId(), '{"entities":[{"name":"甲","aliases":["甲二"],"type":"人物","summary":"更长的一些概要"},{"name":"乙","type":"事件","summary":""}]}')
    await run
    const s = useExtractStore.getState()
    expect(s.chapters[0]!.status).toBe('done')
    expect(s.candidates.map((c) => c.name)).toEqual(['甲', '乙'])
    expect(s.candidates[0]!.aliases).toEqual(['甲二'])
  })
})
