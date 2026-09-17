/**
 * 生成消息组装纯函数单测（v2 二批自 AiPanel 抽出）
 * 覆盖：默认指令 / F13 改写预设替换式注入 / F9 前情提要双档注入头
 *
 * 作者: 李文煜
 * 日期: 2026-09-17
 */

import { describe, expect, it } from 'vitest'
import { CONTINUE_INSTRUCTION, REWRITE_INSTRUCTION, buildGenerateMessages } from './generateMessages'

describe('buildGenerateMessages', () => {
  it('续写：system=上下文+前情块；user=默认续写指令+正文尾部', () => {
    const msgs = buildGenerateMessages({
      mode: 'continue',
      contextText: '上下文全文',
      recap: '【第01章】…前情',
      recapHeader: '【前情提要】（当前章之前最近 2 章的正文结尾，情节须保持连贯）',
      body: '正文尾部'
    })
    expect(msgs).toHaveLength(2)
    expect(msgs[0]!.role).toBe('system')
    expect(msgs[0]!.content).toBe(
      '上下文全文\n\n【前情提要】（当前章之前最近 2 章的正文结尾，情节须保持连贯）\n【第01章】…前情'
    )
    expect(msgs[1]).toEqual({ role: 'user', content: `${CONTINUE_INSTRUCTION}\n\n正文尾部` })
  })

  it('无前情时 system 不含前情块；上下文为空回落占位提示', () => {
    const msgs = buildGenerateMessages({
      mode: 'continue',
      contextText: '',
      recap: '',
      recapHeader: '头',
      body: '正文'
    })
    expect(msgs[0]!.content).toBe('（上下文为空：请在蓝图中先组织节点与连线）')
    expect(msgs[0]!.content).not.toContain('前情提要')
  })

  it('F13 预设指令为替换式：rewrite + 预设 → user 用预设指令，默认改写指令不残留', () => {
    const msgs = buildGenerateMessages({
      mode: 'rewrite',
      contextText: 'ctx',
      recap: '',
      recapHeader: '头',
      body: '选中文字',
      rewriteInstruction: '请去除 AI 写作痕迹后改写下面选中的文字……'
    })
    expect(msgs[1]!.content).toBe('请去除 AI 写作痕迹后改写下面选中的文字……\n\n选中文字')
    expect(msgs[1]!.content).not.toContain(REWRITE_INSTRUCTION)
  })

  it('F13 空白预设回落默认改写指令（视为未选）', () => {
    const msgs = buildGenerateMessages({
      mode: 'rewrite',
      contextText: 'ctx',
      recap: '',
      recapHeader: '头',
      body: '选中文字',
      rewriteInstruction: '   '
    })
    expect(msgs[1]!.content).toBe(`${REWRITE_INSTRUCTION}\n\n选中文字`)
  })

  it('F13 预设不污染续写：mode=continue 时即使传入 rewriteInstruction 也用续写默认指令', () => {
    const msgs = buildGenerateMessages({
      mode: 'continue',
      contextText: 'ctx',
      recap: '',
      recapHeader: '头',
      body: '正文',
      rewriteInstruction: '不应出现的改写指令'
    })
    expect(msgs[1]!.content).toBe(`${CONTINUE_INSTRUCTION}\n\n正文`)
  })

  it('确定性：同输入两次调用结果相等', () => {
    const input = {
      mode: 'rewrite' as const,
      contextText: 'ctx',
      recap: '前情',
      recapHeader: '【前情提要】（当前章之前最近 2 章的开头摘要，情节须保持连贯）',
      body: '选中',
      rewriteInstruction: '预设指令'
    }
    expect(buildGenerateMessages(input)).toEqual(buildGenerateMessages(input))
  })
})
