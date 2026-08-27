/**
 * 命名工具单测（M2 审查修订）
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. 初版：同名基数计数 / 序号递增 / 空占用
 */

import { describe, expect, it } from 'vitest'
import { cnToNum, defaultTitle, nextNumberedName, numToCn } from './naming'

describe('defaultTitle', () => {
  it('无占用时返回 base 本身', () => {
    expect(defaultTitle('新蓝图', [])).toBe('新蓝图')
  })

  it('同名 base 已占用时返回「base 2」（M2 审查修复点）', () => {
    expect(defaultTitle('新蓝图', ['新蓝图'])).toBe('新蓝图 2')
    expect(defaultTitle('新蓝图', ['别的节点', '新蓝图'])).toBe('新蓝图 2')
  })

  it('带序号变体已占用时递增到下一个空位', () => {
    expect(defaultTitle('新蓝图', ['新蓝图', '新蓝图 2'])).toBe('新蓝图 3')
    expect(defaultTitle('新蓝图', ['新蓝图 2', '新蓝图 3'])).toBe('新蓝图')
  })

  it('与其他 base 同序号的标题不干扰', () => {
    expect(defaultTitle('新蓝图', ['新文本', '新文本 2', '新蓝图'])).toBe('新蓝图 2')
  })
})

describe('中文序号（M3+ 左栏自动命名）', () => {
  it('numToCn 覆盖 1-99 常见形态', () => {
    expect(numToCn(1)).toBe('一')
    expect(numToCn(10)).toBe('十')
    expect(numToCn(12)).toBe('十二')
    expect(numToCn(20)).toBe('二十')
    expect(numToCn(23)).toBe('二十三')
    expect(numToCn(99)).toBe('九十九')
  })

  it('cnToNum 与 numToCn 互逆（1-99）', () => {
    for (let n = 1; n <= 99; n++) expect(cnToNum(numToCn(n))).toBe(n)
    expect(cnToNum(' abc ')).toBeNull()
    expect(cnToNum('百')).toBeNull()
  })

  it('nextNumberedName 取同级最大序号 +1；无序号从一开始；无关名忽略', () => {
    expect(nextNumberedName([], '章')).toBe('第一章')
    expect(nextNumberedName(['第一章', '第二章'], '章')).toBe('第三章')
    expect(nextNumberedName(['第九章', '第十章'], '章')).toBe('第十一章')
    expect(nextNumberedName(['序章', '第一章'], '章')).toBe('第二章')
    expect(nextNumberedName(['第一卷'], '卷')).toBe('第二卷')
    // 带卷前缀的章名不算同级序章（目录内仅文件名）
    expect(nextNumberedName(['第一章'], '卷')).toBe('第一卷')
  })
})
