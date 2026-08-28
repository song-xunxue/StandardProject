/**
 * frontmatter 编解码单测
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-28
 * 变更说明：
 *   1. M1 初版：内联/块数组解析、无 frontmatter、往返一致性、CRLF 兼容
 *   2. M4-B：未知键原样行保留（extraLines）——应用改写后用户手写键不丢失
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

  it('未知键以原样行保留（含块数组项与空值行）', () => {
    const raw = '---\ntitle: T\ndate: 2026-08-28\nstatus:\nextra:\n  - 甲\n  - 乙\ntags: [设定]\n---\n正文'
    const { data } = parseFrontmatter(raw)
    expect(data.title).toBe('T')
    expect(data.tags).toEqual(['设定'])
    expect(data.extraLines).toEqual(['date: 2026-08-28', 'status:', 'extra:', '  - 甲', '  - 乙'])
  })

  it('仅未知键走原样行；已知键缺值仍跳过', () => {
    const raw = '---\ntitle: T\ntags:\nrating: 5\n---\n正文'
    const { data } = parseFrontmatter(raw)
    expect(data.tags).toBeUndefined()
    expect(data.extraLines).toEqual(['rating: 5'])
  })

  it('非键值行（注释/含点号键/缩进续行）原样保留不丢弃（审查修复）', () => {
    const raw = '---\ntitle: T\n# 手写注释\nsome.key: v\ndesc: 第一行\n  第二行续\ntags: [设定]\n---\n正文'
    const { data } = parseFrontmatter(raw)
    expect(data.title).toBe('T')
    expect(data.tags).toEqual(['设定'])
    expect(data.extraLines).toEqual(['# 手写注释', 'some.key: v', 'desc: 第一行', '  第二行续'])
    // 往返稳定：原样行再次 parse 仍原样保留
    const out = serializeFrontmatter(data, '正文')
    expect(parseFrontmatter(out).data.extraLines).toEqual(data.extraLines)
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

  it('未知键经 parse→serialize 往返不丢失（应用改写文件场景）', () => {
    const raw = '---\ntitle: 第一章\ndate: 2026-08-28\nstatus: 完稿\ntags: [设定]\n---\n\n正文。'
    const { data, content } = parseFrontmatter(raw)
    // 模拟应用保存：改 title，透传 extraLines
    const out = serializeFrontmatter({ ...data, title: '改名后的第一章' }, content)
    const reparsed = parseFrontmatter(out)
    expect(reparsed.data.title).toBe('改名后的第一章')
    expect(reparsed.data.extraLines).toEqual(['date: 2026-08-28', 'status: 完稿'])
    expect(reparsed.data.tags).toEqual(['设定'])
    expect(reparsed.content).toBe('正文。')
  })

  it('extraLines 为空数组时不输出多余行', () => {
    const out = serializeFrontmatter({ title: 'T', extraLines: [] }, '正文')
    expect(out).toBe('---\ntitle: T\n---\n\n正文')
  })
})
