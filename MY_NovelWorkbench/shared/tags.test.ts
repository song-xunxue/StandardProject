/**
 * 标签工具单测（M2）
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M2 初版：tagColorOf / nodeAccentColor / nextPaletteColor
 */

import { describe, expect, it } from 'vitest'
import { nodeAccentColor, nextPaletteColor, TAG_PALETTE, tagColorOf } from './tags'
import type { TagDef } from './tags'

const library: TagDef[] = [
  { name: '设定', color: '#6c9ef8', builtin: true },
  { name: '伏笔', color: '#c8a2f0', builtin: true },
  { name: '大纲', color: '#7ec98f', builtin: true },
  { name: '世界观', color: '#e0a868', builtin: true },
  { name: '配角', color: '#e07a7a', builtin: false }
]

describe('tagColorOf', () => {
  it('内置与自定义标签均能查到颜色', () => {
    expect(tagColorOf(library, '设定')).toBe('#6c9ef8')
    expect(tagColorOf(library, '配角')).toBe('#e07a7a')
  })

  it('未入库标签返回 undefined', () => {
    expect(tagColorOf(library, '不存在的标签')).toBeUndefined()
  })
})

describe('nodeAccentColor', () => {
  it('取第一个已入库标签的颜色', () => {
    expect(nodeAccentColor(library, { tags: ['伏笔', '设定'] })).toBe('#c8a2f0')
  })

  it('跳过未入库标签，取其后第一个入库标签', () => {
    expect(nodeAccentColor(library, { tags: ['幽灵标签', '设定'] })).toBe('#6c9ef8')
  })

  it('无标签或全部未入库返回 undefined（回退类型默认色）', () => {
    expect(nodeAccentColor(library, { tags: [] })).toBeUndefined()
    expect(nodeAccentColor(library, { tags: ['幽灵标签'] })).toBeUndefined()
  })
})

describe('nextPaletteColor', () => {
  it('按已有自定义标签数轮转色板，且不越界', () => {
    expect(nextPaletteColor(0)).toBe(TAG_PALETTE[0])
    expect(nextPaletteColor(1)).toBe(TAG_PALETTE[1])
    expect(nextPaletteColor(TAG_PALETTE.length)).toBe(TAG_PALETTE[0])
    expect(nextPaletteColor(TAG_PALETTE.length * 3 + 2)).toBe(TAG_PALETTE[2])
  })
})
