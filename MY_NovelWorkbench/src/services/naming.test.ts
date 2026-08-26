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
import { defaultTitle } from './naming'

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
