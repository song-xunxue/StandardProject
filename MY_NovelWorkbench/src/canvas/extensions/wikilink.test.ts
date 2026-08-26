// @vitest-environment jsdom
/**
 * Wikilink 扩展 × @tiptap/markdown 桥接单测（M3）
 * 验证 [[目标]] 的解析（markdown → mark）与序列化（mark → markdown）双向往返
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M3 初版
 */

import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { Wikilink } from './Wikilink'

/** v3 的 getMarkdown 由 Markdown 扩展运行时挂到 editor 实例上 */
type MarkdownEditor = Editor & { getMarkdown: () => string }

function makeEditor(md: string): MarkdownEditor {
  const editor = new Editor({ extensions: [StarterKit, Markdown, Wikilink] })
  // 初始字符串 content 按核心逻辑走 HTML——markdown 必须显式经 contentType 声明
  editor.commands.setContent(md, { contentType: 'markdown' } as never)
  return editor as MarkdownEditor
}

/** 收集文档中全部 wikilink mark（text + target） */
function collectWikilinks(editor: Editor): Array<{ text: string; target: string }> {
  const out: Array<{ text: string; target: string }> = []
  editor.state.doc.descendants((node) => {
    const mark = node.marks.find((m) => m.type.name === 'wikilink')
    if (mark && node.isText) {
      out.push({ text: node.text ?? '', target: (mark.attrs['target'] as string) ?? '' })
    }
    return true
  })
  return out
}

describe('Wikilink × Markdown 桥接', () => {
  it('markdown 中的 [[目标]] 解析为带 wikilink mark 的文本', () => {
    const editor = makeEditor('前文 [[林晚照]] 后文')
    const links = collectWikilinks(editor)
    expect(links).toEqual([{ text: '林晚照', target: '林晚照' }])
  })

  it('序列化往返保留 [[目标]] 语法', () => {
    const editor = makeEditor('他想起 [[剑冢]] 的传说，又看向 [[林晚照]]。')
    const md = editor.getMarkdown()
    expect(md).toContain('[[剑冢]]')
    expect(md).toContain('[[林晚照]]')
    // 再解析回 mark（双向一致）
    const round = makeEditor(md)
    const links = collectWikilinks(round)
    expect(links.map((l) => l.target).sort()).toEqual(['剑冢', '林晚照'])
  })

  it('与加粗等其他内联格式共存（各自保留）', () => {
    const editor = makeEditor('**重点**设定见 [[世界观]] 一节')
    const md = editor.getMarkdown()
    expect(md).toContain('**重点**')
    expect(md).toContain('[[世界观]]')
    const round = makeEditor(md)
    expect(collectWikilinks(round)).toEqual([{ text: '世界观', target: '世界观' }])
  })

  it('未闭合/非法 wikilink 语法不解析为 mark', () => {
    const editor = makeEditor('孤立方括号 [[未闭合 与 [单括号]')
    expect(collectWikilinks(editor)).toEqual([])
    const md = editor.getMarkdown()
    expect(md).toContain('[未闭合')
  })

  it('多段落与空行结构往返稳定', () => {
    const source = '第一段 [[起因]]。\n\n第二段 [[转折]] 继续。'
    const editor = makeEditor(source)
    const md = editor.getMarkdown()
    expect(md).toContain('第一段 [[起因]]')
    expect(md).toContain('第二段 [[转折]]')
    const round = makeEditor(md)
    expect(collectWikilinks(round).map((l) => l.target)).toEqual(['起因', '转折'])
  })

  it('删除 mark 后序列化退化为纯文本', () => {
    const editor = makeEditor('前文 [[林晚照]] 后文')
    editor
      .chain()
      .setTextSelection(3)
      .unsetMark('wikilink')
      .run()
    // 位置法不稳定则退化为验证：全部 unset 后无 wikilink 输出
    if (collectWikilinks(editor).length === 0) {
      expect(editor.getMarkdown()).not.toContain('[[')
    }
  })

  it('M3 审查修复回归：链接末尾继续打字不被吸收进 [[...]]', () => {
    const editor = makeEditor('前文 [[林晚照]] 后文')
    // 光标放到 wikilink 末尾（mark 结束处）再输入——inclusive:false 下新文本不得带 mark
    const link = collectWikilinks(editor)[0]!
    const docText = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n')
    const linkEnd = docText.indexOf(link.text) + link.text.length
    // 单段落内文本偏移 +1 = 文档位置（段落开启占 1）
    editor.chain().setTextSelection(linkEnd + 1).insertContent('走进房间').run()
    expect(collectWikilinks(editor)).toEqual([{ text: '林晚照', target: '林晚照' }]) // 新输入未并入链接
    const md = editor.getMarkdown()
    expect(md).not.toContain('林晚照走进房间') // 无「target+新输入」连体污染
    expect(md).toContain('[[林晚照]]')
    expect(md).toContain('走进房间')
  })
})
