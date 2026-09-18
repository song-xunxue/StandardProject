/**
 * 前情提要双档组装纯函数单测（v2-F9）
 *
 * 作者: 李文煜
 * 日期: 2026-09-17
 */

import { describe, expect, it } from 'vitest'
import type { NovelMeta, RecapConfig } from '@shared/types'
import { DEFAULT_RECAP_CONFIG, RECAP_MAX_TOTAL_CHARS, assembleRecap, recapConfigOf, recapModeLabel } from './recapAssembly'

const meta = (recap?: RecapConfig): NovelMeta => ({
  id: 'n-1',
  title: '测试小说',
  createdAt: '2026-09-17T00:00:00.000Z',
  tagLibrary: [],
  ...(recap ? { recap } : {})
})

const long = (n: number): string => '风'.repeat(n)

describe('recapConfigOf（novel.json 兜底归一）', () => {
  it('无 recap 字段/旧小说 → 兜底默认（与 F9 之前的硬编码行为一致）', () => {
    expect(recapConfigOf(null)).toEqual({ mode: 'tail', chapters: 2, tailChars: 800, summaryChars: 300 })
    expect(recapConfigOf(meta())).toEqual(DEFAULT_RECAP_CONFIG)
  })

  it('合法自定义配置原样读取', () => {
    expect(recapConfigOf(meta({ mode: 'summary', chapters: 5, tailChars: 1200, summaryChars: 200 }))).toEqual({
      mode: 'summary',
      chapters: 5,
      tailChars: 1200,
      summaryChars: 200
    })
  })

  it('非法值 clamp 到合法区间（错档回落 tail、非数回落默认、越界钳制）', () => {
    const cfg = recapConfigOf(meta({ mode: 'other' as never, chapters: -3, tailChars: 1e9, summaryChars: Number.NaN }))
    expect(cfg.mode).toBe('tail')
    expect(cfg.chapters).toBe(1)
    expect(cfg.tailChars).toBe(5000)
    expect(cfg.summaryChars).toBe(DEFAULT_RECAP_CONFIG.summaryChars)
  })
})

describe('assembleRecap（双档组装）', () => {
  const sources = [
    { title: '第01章', content: `开局\n\n${long(1000)}` },
    { title: '第02章', content: `承接\n\n${long(500)}` }
  ]

  it('全文层（tail）：每章取正文尾部、折叠空白、旧→新拼接', () => {
    const out = assembleRecap(sources, { mode: 'tail', chapters: 2, tailChars: 10, summaryChars: 5 })
    const lines = out.split('\n')
    expect(lines).toHaveLength(2)
    // 尾部 10 字 + 前缀「…」；空白折叠为单空格
    expect(lines[0]).toBe(`【第01章】…${long(10)}`)
    expect(lines[1]).toBe(`【第02章】…${long(10)}`)
  })

  it('摘要层（summary）：每章取首段开头（不混入第二段）并带后缀省略号', () => {
    const out = assembleRecap(sources, { mode: 'summary', chapters: 2, tailChars: 10, summaryChars: 5 })
    // 首段=「开局」（短于上限不越段取第二段的「风」字）
    expect(out.split('\n')).toEqual([`【第01章】开局…`, `【第02章】承接…`])
    // 首段超上限时截断
    const longFirst = [{ title: '长首段', content: '一二三四五六七八九十\n\n第二段不该进来' }]
    expect(assembleRecap(longFirst, { mode: 'summary', chapters: 1, tailChars: 10, summaryChars: 4 })).toBe(
      '【长首段】一二三四…'
    )
  })

  it('空白正文与空源列表：跳过/返回空串（不注入前情块）', () => {
    expect(assembleRecap([], DEFAULT_RECAP_CONFIG)).toBe('')
    expect(assembleRecap([{ title: '空章', content: ' \n\t ' }], DEFAULT_RECAP_CONFIG)).toBe('')
  })

  it('总量上限均摊：单章上限高于均摊配额时按配额截断（防前 N 章叠加超支）', () => {
    // 10 章 × 每章尾部 5000 字 > 总量 6000 → 均摊 600 字/章
    const many = Array.from({ length: 10 }, (_, i) => ({ title: `第${i + 1}章`, content: long(5000) }))
    const out = assembleRecap(many, { mode: 'tail', chapters: 10, tailChars: 5000, summaryChars: 300 })
    const lines = out.split('\n')
    expect(lines).toHaveLength(10)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(`【第10章】…`.length + 600)
    // 总量不超上限（每行 = 标题 6 字 + … + 600）
    expect(lines.join('').length).toBeLessThanOrEqual(RECAP_MAX_TOTAL_CHARS + 10 * 8)
  })

  it('档位说明文案（Context Viewer 与 system 注入头共用口径）', () => {
    expect(recapModeLabel('tail')).toBe('正文结尾')
    expect(recapModeLabel('summary')).toBe('开头摘要')
  })
})
