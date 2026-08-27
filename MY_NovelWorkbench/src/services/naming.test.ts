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
import { chapterNameCompare, cnToNum, defaultTitle, nextNumberedName, numToCn } from './naming'

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

  it('全量审查修订：>99 回绕阿拉伯数字不撞车；阿拉伯与中文混排取最大', () => {
    // 99 章之后：第一百章生成 '第100章'；再次计算时阿拉伯 100 也能解析 → 101
    expect(nextNumberedName(['第九十九章'], '章')).toBe('第100章')
    expect(nextNumberedName(['第九十九章', '第100章'], '章')).toBe('第101章')
    expect(nextNumberedName(['第2章', '第一章'], '章')).toBe('第三章')
  })

  it('全量审查修订：畸形中文数字返回 null 而非误解析', () => {
    expect(cnToNum('十十')).toBeNull()
    expect(cnToNum('二十十')).toBeNull()
    expect(cnToNum('零零')).toBeNull()
    expect(cnToNum('一十')).toBe(10) // 宽容的等价写法（X十 = X×10）
  })

  it('全量审查修订：chapterNameCompare 按数字序（zh-CN 拼音序的回归钉）', () => {
    // 拼音序会得到完全乱序——数字序应为升序 1,3,7,9,11,19,20,21
    const names = ['第七章', '第三章', '第九章', '第一章', '第十一章', '第二十章', '第十九章', '第二十一章']
    const sorted = [...names].sort(chapterNameCompare)
    expect(sorted.map((n) => cnToNum(n.replace(/^第|章$/g, '')))).toEqual([1, 3, 7, 9, 11, 19, 20, 21])
    // 带序号排在无序号前；无序号之间稳定（zh-CN 拼音字典序，仅验证非 0 即可）
    expect(chapterNameCompare('第一章', '序章')).toBeLessThan(0)
    expect(chapterNameCompare('番外一', '番外二')).not.toBe(0)
    expect(chapterNameCompare('番外一', '番外一')).toBe(0)
  })
})
