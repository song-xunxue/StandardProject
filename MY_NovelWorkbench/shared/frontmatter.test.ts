/**
 * frontmatter 编解码单测
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：内联/块数组解析、无 frontmatter、往返一致性、CRLF 兼容
 */

import { describe, expect, it } from 'vitest'
import { parseFrontmatter, serializeFrontmatter } from './frontmatter'

describe('parseFrontmatter', () => {
  it('解析标量与内联数组', () => {
    const raw = `---\ntitle: 第一章\ntags: [设定, 伏笔]\naliases: [断剑]\n---\n\n正文开始。`
    const { data, content } = parseFrontmatter(raw)
    expect(data.title).toBe('第一章')
    expect(data.tags).toEqual(['设定', '伏笔'])
    expect(data.aliases).toEqual(['断剑'])
    expect(content).toBe('正文开始。')
  })

  it('兼容块数组语法（- 项）', () => {
    const raw = `---\ntitle: T\ntags:\n  - 设定\n  - 世界观\n---\nbody`
    expect(parseFrontmatter(raw).data.tags).toEqual(['设定', '世界观'])
  })

  it('无 frontmatter 时全文为 content，data 为空', () => {
    const { data, content } = parseFrontmatter('只是正文')
    expect(data).toEqual({})
    expect(content).toBe('只是正文')
  })

  it('CRLF 换行兼容', () => {
    const raw = '---\r\ntitle: T\r\ntags: [a, b]\r\n---\r\n正文'
    const { data, content } = parseFrontmatter(raw)
    expect(data.title).toBe('T')
    expect(data.tags).toEqual(['a', 'b'])
    expect(content).toContain('正文')
  })
})

describe('serializeFrontmatter', () => {
  it('往返一致（parse(serialize(x)) === x）', () => {
    const data = { title: '第一卷：启程', tags: ['大纲'], aliases: ['启程', '第一卷'] }
    const serialized = serializeFrontmatter(data, '正文内容。')
    const parsed = parseFrontmatter(serialized)
    expect(parsed.data).toEqual(data)
    expect(parsed.content).toBe('正文内容。')
  })

  it('空数组字段不输出，content 前有空行', () => {
    const serialized = serializeFrontmatter({ title: 'T', tags: [] }, '正文')
    expect(serialized).not.toContain('tags')
    expect(serialized).toContain('---\n\ntitle: T\n---\n\n正文'.replace('---\n\ntitle', 'title'))
  })
})
