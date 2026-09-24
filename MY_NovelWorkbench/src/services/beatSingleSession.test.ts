// @vitest-environment jsdom
/**
 * 单路节拍整章会话控制器单测（v2 三批遗留修复）
 * 覆盖：发起→流式→完成收尾（finalize 落编辑器）/ 用户中断（保留已落文本）/
 *       生成失败（丢挂起缓冲+错误可见）/ 发起失败自清理（不进会话态）/
 *       终态清空与重新发起 / 写入器生命周期与会话解耦（浮层关闭不中断的架构保证）
 * window.api 以 stub 替代（aiStore.test 同款）；编辑器用真实 Tiptap 实例
 * （generationWriter.test 同款——验证 finalize 的 markdown 重排真实生效）
 *
 * 作者: 李文煜
 * 日期: 2026-09-23
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import type { Editor as EditorType } from '@tiptap/core'

// ---- window.api stub（须在导入 aiStore 前就位；jsdom 下保留原生 window——
// vi.stubGlobal 整替会丢 DOMParser，Tiptap Editor 初始化会崩）。
// onChunk 支持多订阅（会话自订阅 + aiStore 单订阅并存，按注册序派发——
// 单 sink 互相覆盖会吞掉会话的 done 包捕获） ----
const stopCalls: string[] = []
const chunkSinks: Array<(chunk: unknown) => void> = []
;(globalThis.window as unknown as { api: unknown }).api = {
  llm: {
    generate: async (): Promise<void> => {},
    stop: async (requestId: string): Promise<void> => {
      stopCalls.push(requestId)
    },
    onChunk: (cb: (chunk: unknown) => void): (() => void) => {
      chunkSinks.push(cb)
      return () => {
        const i = chunkSinks.indexOf(cb)
        if (i >= 0) chunkSinks.splice(i, 1)
      }
    }
  }
}

const { useAiStore } = await import('@/store/aiStore')
const { beatSingleSession } = await import('@/services/beatSingleSession')

type MarkdownEditor = EditorType & { getMarkdown: () => string }

const pushChunk = (chunk: Record<string, unknown>): void => {
  for (const cb of [...chunkSinks]) cb(chunk)
}

/** 等待帧调度落地（StreamInserter 走 rAF/16ms 定时） */
const nextFrames = async (frames = 2): Promise<void> => {
  await new Promise((r) => setTimeout(r, 20 * frames))
}

beforeEach(() => {
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

describe('BeatSingleSession（v2 三批遗留修复）', () => {
  it('发起→流式→完成：正文落编辑器（finalize 恢复段落），终态 done 带字数', async () => {
    const editor = new Editor({ extensions: [StarterKit, Markdown] }) as MarkdownEditor
    editor.commands.setContent('前文。', { contentType: 'markdown' } as never)
    useAiStore.setState({ chapterEditor: editor })

    await beatSingleSession.start({ messages: [{ role: 'user', content: '写' }], maxTokens: 1000, targetTitle: '第01章' })
    expect(beatSingleSession.getState()?.status).toBe('running')

    const rid = useAiStore.getState().generation!.requestId
    pushChunk({ requestId: rid, delta: '少年提剑而立，' })
    pushChunk({ requestId: rid, delta: '风从北方来。\n\n第二段收束。' })
    await nextFrames()
    pushChunk({ requestId: rid, done: true })
    await nextFrames()

    const state = beatSingleSession.getState()
    expect(state?.status).toBe('done')
    expect(state?.chars).toBe('少年提剑而立，风从北方来。\n\n第二段收束。'.length)
    const md = editor.getMarkdown()
    expect(md).toContain('少年提剑而立，风从北方来。')
    expect(md).toContain('第二段收束。')
    expect(md).toContain('前文。')
    editor.destroy()
    beatSingleSession.clear()
  })

  it('用户中断：stop 标记 stopped、正文保留已生成部分', async () => {
    const editor = new Editor({ extensions: [StarterKit, Markdown] }) as MarkdownEditor
    editor.commands.setContent('开头。', { contentType: 'markdown' } as never)
    useAiStore.setState({ chapterEditor: editor })

    await beatSingleSession.start({ messages: [], maxTokens: 500, targetTitle: '第02章' })
    const rid = useAiStore.getState().generation!.requestId
    pushChunk({ requestId: rid, delta: '已生成的部分。' })
    await nextFrames()

    await beatSingleSession.stop()
    expect(stopCalls).toContain(rid)
    expect(beatSingleSession.getState()?.status).toBe('stopped')
    expect(editor.getMarkdown()).toContain('已生成的部分。')
    editor.destroy()
    beatSingleSession.clear()
  })

  it('外部中断（切/关 Tab 触发编辑器卸载守卫等）：无 done 包 → 标 stopped 不误报完成', async () => {
    const editor = new Editor({ extensions: [StarterKit, Markdown] }) as MarkdownEditor
    editor.commands.setContent('', { contentType: 'markdown' } as never)
    useAiStore.setState({ chapterEditor: editor })

    await beatSingleSession.start({ messages: [], maxTokens: 500, targetTitle: '第02章' })
    const rid = useAiStore.getState().generation!.requestId
    pushChunk({ requestId: rid, delta: '半章文本。' })
    await nextFrames()
    // 模拟外部中断：不经会话 stop、无 done 包——直接摘会话置空 generation
    // （ChapterEditor 卸载守卫 / AI 面板停止按钮的实际路径）
    useAiStore.setState({ generation: null })

    const state = beatSingleSession.getState()
    expect(state?.status).toBe('stopped') // 原先误报 'done'
    expect(editor.getMarkdown()).toContain('半章文本。') // 已落文本保留
    editor.destroy()
    beatSingleSession.clear()
  })

  it('生成失败：error 终态可见、挂起缓冲被丢弃（abort）', async () => {
    const editor = new Editor({ extensions: [StarterKit, Markdown] }) as MarkdownEditor
    editor.commands.setContent('原文。', { contentType: 'markdown' } as never)
    useAiStore.setState({ chapterEditor: editor })

    await beatSingleSession.start({ messages: [], maxTokens: 500, targetTitle: '第03章' })
    const rid = useAiStore.getState().generation!.requestId
    pushChunk({ requestId: rid, delta: '落下的部分。' })
    await nextFrames()
    // 错误包携带尾部 delta：先转发再收尾（晨间审查口径）
    pushChunk({ requestId: rid, delta: '挂起未落地', error: 'Provider 超时' })
    await nextFrames()

    const state = beatSingleSession.getState()
    expect(state?.status).toBe('error')
    expect(state?.error).toBe('Provider 超时')
    expect(editor.getMarkdown()).toContain('落下的部分。')
    editor.destroy()
    beatSingleSession.clear()
  })

  it('发起失败（互斥守卫）：自清理不进会话态，错误上抛由调用方提示', async () => {
    // 预置一个进行中的会话触发 startGeneration 互斥
    useAiStore.setState({ generation: { requestId: 'other', mode: 'continue' } })
    await expect(
      beatSingleSession.start({ messages: [], maxTokens: 500, targetTitle: '第04章' })
    ).rejects.toThrow('已有生成进行中')
    expect(beatSingleSession.getState()).toBeNull()
    useAiStore.setState({ generation: null })
  })

  it('终态清空后可重新发起（状态条随新会话刷新）', async () => {
    const editor = new Editor({ extensions: [StarterKit, Markdown] }) as MarkdownEditor
    editor.commands.setContent('', { contentType: 'markdown' } as never)
    useAiStore.setState({ chapterEditor: editor })

    await beatSingleSession.start({ messages: [], maxTokens: 500, targetTitle: '第05章' })
    const rid1 = useAiStore.getState().generation!.requestId
    pushChunk({ requestId: rid1, delta: '第一轮。' })
    await nextFrames()
    pushChunk({ requestId: rid1, done: true })
    await nextFrames()
    expect(beatSingleSession.getState()?.status).toBe('done')

    beatSingleSession.clear()
    expect(beatSingleSession.getState()).toBeNull()

    await beatSingleSession.start({ messages: [], maxTokens: 500, targetTitle: '第06章' })
    expect(beatSingleSession.getState()?.status).toBe('running')
    expect(beatSingleSession.getState()?.targetTitle).toBe('第06章')
    const rid2 = useAiStore.getState().generation!.requestId
    pushChunk({ requestId: rid2, done: true })
    await nextFrames()
    editor.destroy()
    beatSingleSession.clear()
  })

  it('running 态拒绝重复发起与清空（关闭入口仅终态提供）', async () => {
    await beatSingleSession.start({ messages: [], maxTokens: 500, targetTitle: '第07章' })
    await expect(beatSingleSession.start({ messages: [], maxTokens: 500, targetTitle: '第08章' })).rejects.toThrow(
      '单路会话已存在'
    )
    beatSingleSession.clear() // running 态清空应为 no-op
    expect(beatSingleSession.getState()?.status).toBe('running')
    // 收尾清理供后续用例
    const rid = useAiStore.getState().generation!.requestId
    pushChunk({ requestId: rid, done: true })
    await nextFrames()
    beatSingleSession.clear()
  })

  it('订阅通知：状态变化触发监听器（状态条渲染依据）', async () => {
    const seen: Array<string | null> = []
    const unsubscribe = beatSingleSession.subscribe(() => seen.push(beatSingleSession.getState()?.status ?? null))

    await beatSingleSession.start({ messages: [], maxTokens: 500, targetTitle: '第09章' })
    const rid = useAiStore.getState().generation!.requestId
    pushChunk({ requestId: rid, done: true })
    await nextFrames()
    beatSingleSession.clear()
    unsubscribe()

    expect(seen).toContain('running')
    expect(seen).toContain('done')
    expect(seen[seen.length - 1]).toBeNull()
  })

  it('写入器生命周期与浮层/组件卸载解耦：会话不随无关 store 变化误收尾', async () => {
    const editor = new Editor({ extensions: [StarterKit, Markdown] }) as MarkdownEditor
    editor.commands.setContent('', { contentType: 'markdown' } as never)
    useAiStore.setState({ chapterEditor: editor })

    await beatSingleSession.start({ messages: [], maxTokens: 500, targetTitle: '第10章' })
    // 无关 store 更新（provider 列表刷新等）不触发收尾
    useAiStore.setState({ providers: [{ id: 'p1', name: 'x', model: 'm', isDefault: true, hasKey: true }] })
    expect(beatSingleSession.getState()?.status).toBe('running')
    // 终态后的无关更新同样安全（writer 已清，收尾守卫跳过）
    const rid = useAiStore.getState().generation!.requestId
    pushChunk({ requestId: rid, done: true })
    await nextFrames()
    useAiStore.setState({ providers: [] })
    expect(beatSingleSession.getState()?.status).toBe('done')
    editor.destroy()
    beatSingleSession.clear()
  })
})
