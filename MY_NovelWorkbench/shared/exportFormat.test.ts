/**
 * 导出格式化纯函数单测（v2-F18）：TXT/MD 拼装、wikilink 剥除、Markdown 记号纯文文化
 *
 * 作者: 李文煜
 * 日期: 2026-09-24
 */

import { describe, expect, it } from 'vitest'
import { assembleMd, assembleTxt, plainizeMarkdown, stripWikilinks } from './exportFormat'
import type { ExportChapterSource } from './exportFormat'

const chapters: ExportChapterSource[] = [
  { title: '第01章 初入宗门', volume: '第一卷', content: '少年[[林越]]推开山门。\n\n他回头看了一眼。' },
  { title: '第02章 夜雨', volume: '第一卷', content: '雨下了整夜。' },
  { title: '第03章 北上', volume: '第二卷', content: '车马北上。' }
]

const stripOpts = { bom: false, wikilinkMode: 'strip' as const, chapterTitles: true }
const keepOpts = { bom: false, wikilinkMode: 'keep' as const, chapterTitles: true }

describe('stripWikilinks / plainizeMarkdown', () => {
  it('[[目标]] → 目标；管道形态本项目不存在（剥成内文亦可接受）；未闭合原样', () => {
    expect(stripWikilinks('[[林越]]推门')).toBe('林越推门')
    expect(stripWikilinks('[[a|b]]')).toBe('a|b') // 正则允许管道（与 Wikilink.ts tokenizer 同口径）
    expect(stripWikilinks('[[x')).toBe('[[x') // 未闭合原样
  })

  it('Markdown 记号降级：标题/粗斜体/行内代码/链接', () => {
    expect(plainizeMarkdown('## 小标题\n')).toBe('小标题\n')
    expect(plainizeMarkdown('**关键**与*次要*')).toBe('关键与次要')
    expect(plainizeMarkdown('`code`')).toBe('code')
    expect(plainizeMarkdown('[文字](http://x)')).toBe('文字')
    expect(plainizeMarkdown('[[林越]]出场')).toBe('林越出场')
  })
})

describe('assembleTxt（网文粘贴档）', () => {
  it('全本：书名行+卷分隔+章标题行+段间单空行+章间双空行+CRLF', () => {
    const out = assembleTxt({ title: '北行记' }, chapters, stripOpts)
    expect(out.startsWith('《北行记》')).toBe(true)
    expect(out).toContain('【第一卷】')
    expect(out).toContain('【第二卷】')
    expect(out).toContain('第01章 初入宗门')
    expect(out).toContain('少年林越推开山门。\r\n\r\n他回头看了一眼。') // wikilink 剥除+段间空行
    expect(out).toContain('\r\n\r\n\r\n') // 章间双空行
    expect(out).not.toContain('[[')
    expect(out.endsWith('\r\n')).toBe(true)
  })

  it('粘贴档（chapterTitles=false）：无标题行直接正文', () => {
    const single: ExportChapterSource[] = [{ title: '第01章', content: '正文段落。' }]
    const out = assembleTxt({ title: '书' }, single, { ...stripOpts, chapterTitles: false })
    expect(out).toBe('正文段落。\r\n') // 单章无书名行
    expect(out).not.toContain('第01章')
  })

  it('keep 模式保留 [[双链]]', () => {
    const out = assembleTxt({ title: '书' }, chapters, keepOpts)
    expect(out).toContain('[[林越]]')
  })

  it('未分卷章节无卷分隔行（首章直入）', () => {
    const noVol: ExportChapterSource[] = [
      { title: '第01章', content: '一' },
      { title: '第02章', content: '二' }
    ]
    const out = assembleTxt({ title: '书' }, noVol, stripOpts)
    expect(out).not.toContain('【')
  })
})

describe('assembleMd（Obsidian 回流档）', () => {
  it('书名 # / 卷 # / 章 ##，双链保留，段间不超双换行', () => {
    const out = assembleMd({ title: '北行记' }, chapters, keepOpts)
    expect(out.startsWith('# 北行记\n')).toBe(true)
    expect(out).toContain('# 第一卷')
    expect(out).toContain('## 第01章 初入宗门')
    expect(out).toContain('[[林越]]')
    expect(out).not.toMatch(/\n{3,}/)
  })

  it('strip 模式剥双链；chapterTitles=false 无 ##', () => {
    const out = assembleMd({ title: '书' }, chapters, { ...stripOpts, chapterTitles: false })
    expect(out).not.toContain('[[')
    expect(out).not.toContain('## ')
  })
})
