/**
 * 生成区写入器（M3 审查修订）：流式批次写入 Tiptap 的编排逻辑（可单测）
 * 修复三个审查缺陷：
 *   1. 帧批次以 markdown insertContentAt 会逐帧关闭段落（生成文本被碎成逐词换行）
 *      → 流式期间以纯文本内联插入，finalize() 时把生成区整段按 markdown 重新解析替换
 *   2. 改写模式点击即删选区，失败/空响应原文丢失
 *      → 延迟删除：首批落地时才删选区；零批次 = 原文完好
 *   3. 生成中切 Tab 编辑器已销毁 → 实时取编辑器实例 + isDestroyed 防护，静默跳过
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M3 审查修订初版
 */

import type { Editor } from '@tiptap/core'

export interface RewriteRange {
  from: number
  to: number
}

export class GenerationWriter {
  /** 生成区起点（首批落地时确定） */
  private start: number | null = null
  /** 生成区终点（随插入推进） */
  private end: number | null = null
  /** 改写模式：待删选区（首批落地时消费；失败/空响应不删） */
  private pendingRange: RewriteRange | null = null
  /** 已落地的原始文本累积（finalize 重解析用） */
  private fullText = ''
  /** 结束后拒绝再写 */
  private finished = false

  constructor(private readonly getEditor: () => Editor | null) {}

  /** 改写模式：登记待删选区（首批落地时才消费；失败/空响应原文完好） */
  beginRewrite(range: RewriteRange): void {
    this.pendingRange = range
  }

  /** 当前编辑器实例（可能为 null / 已销毁——切 Tab 场景） */
  private editor(): Editor | null {
    const editor = this.getEditor()
    if (!editor || editor.isDestroyed) return null
    return editor
  }

  /**
   * 流式批次落地：纯文本内联插入（换行替换为空格——流式预览不逐帧建段落，
   * 段落结构由 finalize 的 markdown 重解析恢复）；改写模式首批先删选区
   */
  applyBatch(batch: string): void {
    if (this.finished || batch === '') return
    const editor = this.editor()
    if (!editor) return
    // 改写模式：首批落地才删选区（生成失败/空响应时原文完好）
    if (this.pendingRange) {
      const range = this.pendingRange
      this.pendingRange = null
      editor.chain().focus().deleteRange(range).run()
      this.start = range.from
      this.end = range.from
    }
    if (this.start === null || this.end === null) {
      this.start = editor.state.doc.content.size
      this.end = this.start
    }
    const pos = this.end
    const inline = batch.replace(/\n+/g, ' ')
    const sizeBefore = editor.state.doc.content.size
    // 纯文本插入（无 contentType）：走 insertText 内联路径，不产生新段落
    editor.chain().focus().insertContentAt(pos, inline).run()
    this.end = pos + (editor.state.doc.content.size - sizeBefore)
    this.fullText += batch
  }

  /**
   * 结束收尾：把生成区 [start, end] 整段重新解析替换
   * 含换行 → 按 markdown 重解析（恢复段落/标题/列表等块级结构）；
   * 纯单行 → 纯文本内联回填（不拆断所在段落）
   */
  finalize(): void {
    this.finished = true
    const editor = this.editor()
    if (!editor || this.start === null || this.end === null || this.fullText === '') return
    const start = this.start
    const end = this.end
    const text = this.fullText
    this.start = null
    this.end = null
    this.fullText = ''
    if (/\n/.test(text)) {
      editor
        .chain()
        .focus()
        .deleteRange({ from: start, to: end })
        .insertContentAt(start, text, { contentType: 'markdown' } as never)
        .run()
    } else {
      editor.chain().focus().deleteRange({ from: start, to: end }).insertContentAt(start, text).run()
    }
  }

  /** 是否已有批次落地（用于判断改写选区是否已被消费） */
  get started(): boolean {
    return this.start !== null
  }
}
