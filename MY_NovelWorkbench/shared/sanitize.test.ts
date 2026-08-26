/**
 * 文件名清洗单测
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：保留字符过滤 / 空白与点号 / 回退值
 */

import { describe, expect, it } from 'vitest'
import { sanitizeFileName } from './sanitize'

describe('sanitizeFileName', () => {
  it('过滤 Windows 保留字符', () => {
    expect(sanitizeFileName('第一卷：启程')).toBe('第一卷：启程') // 中文冒号合法
    expect(sanitizeFileName('a<b>c:d*e?f"g|h\\i/j')).toBe('abcdefghij')
  })

  it('剥离首尾空白与点号', () => {
    expect(sanitizeFileName('  .标题. ')).toBe('标题')
  })

  it('空与纯非法字符回退「未命名」', () => {
    expect(sanitizeFileName('')).toBe('未命名')
    expect(sanitizeFileName('???')).toBe('未命名')
  })

  it('超长截断到 80 字符', () => {
    expect(sanitizeFileName('长'.repeat(100)).length).toBe(80)
  })
})
