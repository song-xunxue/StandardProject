/**
 * 章节文本行级 diff 纯函数单测（v2-F8）
 *
 * 作者: 李文煜
 * 日期: 2026-09-17
 */

import { describe, expect, it } from 'vitest'
import { collapseContext, diffLines, diffStats } from './chapterDiff'

describe('diffLines', () => {
  it('完全相同：全 ctx、无增删（快照与当前一致场景）', () => {
    const text = '第一段\n\n第二段\n\n第三段'
    const ops = diffLines(text, text)
    expect(ops.every((op) => op.type === 'ctx')).toBe(true)
    expect(diffStats(ops)).toEqual({ added: 0, removed: 0 })
  })

  it('单行修改 = 一删一增，其余为 ctx（含行号）', () => {
    const ops = diffLines('第一段\n旧的中段\n第三段', '第一段\n新的中段\n第三段')
    expect(ops).toEqual([
      { type: 'ctx', oldLine: 1, newLine: 1, text: '第一段' },
      { type: 'del', oldLine: 2, text: '旧的中段' },
      { type: 'add', newLine: 2, text: '新的中段' },
      { type: 'ctx', oldLine: 3, newLine: 3, text: '第三段' }
    ])
    expect(diffStats(ops)).toEqual({ added: 1, removed: 1 })
  })

  it('纯插入：只出 add、旧行号轴连续；纯删除：只出 del', () => {
    const ins = diffLines('A\nC', 'A\nB\nC')
    expect(ins.map((op) => op.type)).toEqual(['ctx', 'add', 'ctx'])
    const del = diffLines('A\nB\nC', 'A\nC')
    expect(del.map((op) => op.type)).toEqual(['ctx', 'del', 'ctx'])
  })

  it('CRLF 与 LF 混用不构成变更（行尾归一）；结尾换行差异忽略', () => {
    const ops = diffLines('第一段\r\n第二段\r\n', '第一段\n第二段')
    expect(ops.every((op) => op.type === 'ctx')).toBe(true)
  })

  it('一侧为空：全部输出为另一侧的增/删', () => {
    expect(diffLines('', '新章\n内容')).toEqual([
      { type: 'add', newLine: 1, text: '新章' },
      { type: 'add', newLine: 2, text: '内容' }
    ])
    expect(diffLines('旧章', '').map((op) => op.type)).toEqual(['del'])
  })

  it('公共前缀/后缀快进不参与 LCS（中段行序移动正确对齐）', () => {
    // 前缀 3 行 + 后缀 3 行相同，中段 2 行顺序互换
    const old = 'P1\nP2\nP3\n甲\n乙\nS1\nS2\nS3'
    const now = 'P1\nP2\nP3\n乙\n甲\nS1\nS2\nS3'
    const mid = diffLines(old, now).filter((op) => op.type !== 'ctx')
    // 互换最少 2 删 2 增（LCS 保底任一行也可，但增删合计必须等于 4 或不超过 4）
    const stats = diffStats(mid)
    expect(stats.added + stats.removed).toBeLessThanOrEqual(4)
    expect(stats.added).toBeGreaterThan(0)
    expect(stats.removed).toBeGreaterThan(0)
  })

  it('超规模中段降级为整段替换（结果仍完整覆盖两侧行）', () => {
    // 3000×1500 行中段 > 4,000,000 上限触发降级
    const oldText = Array.from({ length: 3000 }, (_, i) => `旧${i}`).join('\n')
    const newText = Array.from({ length: 1500 }, (_, i) => `新${i}`).join('\n')
    const ops = diffLines(oldText, newText)
    const stats = diffStats(ops)
    expect(stats.removed).toBe(3000)
    expect(stats.added).toBe(1500)
    // 降级路径仍带行号
    expect(ops[0]!.oldLine).toBe(1)
    expect(ops[ops.length - 1]!.newLine).toBe(1500)
  })
})

describe('collapseContext', () => {
  it('长 ctx 段折叠为首尾各 3 行 + 跳过计数；短段保留原样', () => {
    const ops = diffLines(
      Array.from({ length: 10 }, (_, i) => `同${i}`).join('\n') + '\n改',
      Array.from({ length: 10 }, (_, i) => `同${i}`).join('\n') + '\n新',
    )
    const items = collapseContext(ops, 2)
    const skip = items.find((i) => i.type === 'skip')
    // 10 行 ctx > 2×2=4：折叠为 前2 + skip(6) + 后2
    expect(skip).toMatchObject({ type: 'skip', count: 6 })
    const ctxCount = items.filter((i) => i.type === 'ctx').length
    expect(ctxCount).toBe(4)
  })

  it('全部 ctx 且不超过窗口两倍：不折叠', () => {
    const items = collapseContext(diffLines('A\nB', 'A\nB'), 3)
    expect(items.every((i) => i.type === 'ctx')).toBe(true)
    expect(items).toHaveLength(2)
  })
})
