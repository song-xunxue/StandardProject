// @vitest-environment jsdom
/**
 * 生成区写入器单测（M3 审查修订）
 * 覆盖：多批次流式不碎段落（finalize 重解析）/ 改写延迟删选区（零批次原文完好）/
 *       编辑器销毁静默跳过 / 换行在流式期被压平、收尾恢复
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M3 审查修订初版
 */

import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import type { Editor as EditorType } from '@tiptap/core'
import { GenerationWriter } from './generationWriter'

type MarkdownEditor = EditorType & { getMarkdown: () => string }

function makeEditor(md: string, holder: { current: MarkdownEditor | null }): MarkdownEditor {
  const editor = new Editor({ extensions: [StarterKit, Markdown] }) as MarkdownEditor
  editor.commands.setContent(md, { contentType: 'markdown' } as never)
  holder.current = editor
  return editor
}

describe('GenerationWriter', () => {
  it('续写：多批次流式后 finalize 恢复段落结构（不逐帧碎段）', () => {
    const holder: { current: MarkdownEditor | null } = { current: null }
    makeEditor('前文最后一行。', holder)
    const writer = new GenerationWriter(() => holder.current)
    for (const batch of ['少年', '提剑而立，', '风从', '北方来。']) writer.applyBatch(batch)
    writer.finalize()
    const md = holder.current!.getMarkdown()
    // 生成文本成为独立于「前文最后一行。」的内容——至少不允许每批次一个段落
    expect(md).toContain('少年提剑而立，风从北方来。')
    expect(md).toContain('前文最后一行。')
    holder.current!.destroy()
  })

  it('流式中的换行在 finalize 恢复为段落分隔', () => {
    const holder: { current: MarkdownEditor | null } = { current: null }
    makeEditor('开头。', holder)
    const writer = new GenerationWriter(() => holder.current)
    writer.applyBatch('第一段生成。\n\n')
    writer.applyBatch('第二段生成。')
    writer.finalize()
    const md = holder.current!.getMarkdown()
    expect(md).toContain('第一段生成。')
    expect(md).toContain('第二段生成。')
    // 两段之间应是段落边界（双换行），而非同一行
    expect(md.indexOf('第一段生成。')).toBeLessThan(md.indexOf('第二段生成。'))
    const between = md.slice(md.indexOf('第一段生成。'), md.indexOf('第二段生成。'))
    expect(between).toContain('\n')
    holder.current!.destroy()
  })

  it('改写：零批次（生成失败/空响应）原文完好', () => {
    const holder: { current: MarkdownEditor | null } = { current: null }
    const editor = makeEditor('旧句子保留。', holder)
    const failWriter = new GenerationWriter(() => holder.current)
    // 登记了改写选区但没有任何批次到达（模拟失败/空响应）→ finalize 不动原文
    failWriter.beginRewrite({ from: 1, to: 4 })
    failWriter.finalize()
    expect(editor.getMarkdown()).toContain('旧句子保留。')
    editor.destroy()
  })

  it('改写：有批次时选区被替换为生成文本', () => {
    const holder: { current: MarkdownEditor | null } = { current: null }
    const editor = makeEditor('前缀。[旧文]后缀。', holder)
    // 找到 [旧文] 的区间
    const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n')
    const from = text.indexOf('[旧文]')
    const to = from + '[旧文]'.length
    // 将选区映射为文档位置（单段落内偏移即文档位置-1 偏移：段落开启占 1）
    const writer = new GenerationWriter(() => holder.current)
    writer.beginRewrite({ from: from + 1, to: to + 1 })
    writer.applyBatch('崭新的句子。')
    writer.finalize()
    const md = editor.getMarkdown()
    expect(md).toContain('前缀。崭新的句子。后缀。')
    expect(md).not.toContain('[旧文]')
    holder.current!.destroy()
  })

  it('编辑器销毁（切 Tab）时批次静默跳过，不抛错', () => {
    const holder: { current: MarkdownEditor | null } = { current: null }
    makeEditor('正文。', holder)
    const writer = new GenerationWriter(() => holder.current)
    writer.applyBatch('一批')
    holder.current!.destroy() // 模拟切 Tab 销毁
    expect(() => writer.applyBatch('二批')).not.toThrow()
    expect(() => writer.finalize()).not.toThrow()
  })

  it('finalize 后拒绝继续写入', () => {
    const holder: { current: MarkdownEditor | null } = { current: null }
    const editor = makeEditor('正文。', holder)
    const writer = new GenerationWriter(() => holder.current)
    writer.applyBatch('一段')
    writer.finalize()
    const before = editor.getMarkdown()
    writer.applyBatch('迟到的批次')
    expect(editor.getMarkdown()).toBe(before)
    editor.destroy()
  })
})
