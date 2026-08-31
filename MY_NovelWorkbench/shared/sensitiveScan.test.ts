/**
 * 敏感词扫描单测（v2-F6）：AC 自动机命中/重叠后缀词/上下文/空词与去重/大规模性能口径
 *
 * 作者: 李文煜
 * 日期: 2026-08-31
 *
 * 2026-08-31
 * 变更说明：
 *   1. v2-F6 初版
 */

import { describe, expect, it } from 'vitest'
import { buildMatcher, scanSensitiveWords } from './sensitiveScan'

describe('Aho-Corasick 敏感词扫描（v2-F6）', () => {
  it('基础命中：词与索引正确，上下文含前后片段', () => {
    const matches = scanSensitiveWords('他在黑屋里提到了禁忌之词。', ['禁忌之词'])
    expect(matches).toHaveLength(1)
    expect(matches[0]!.index).toBe(8)
    expect(matches[0]!.context).toContain('禁忌之词')
    expect(matches[0]!.context.startsWith('他在黑屋里提到')).toBe(true)
  })

  it('多词并行命中互不干扰', () => {
    const text = '甲词出现一次，乙词出现两次：乙词。'
    const matches = scanSensitiveWords(text, ['甲词', '乙词'])
    expect(matches.filter((m) => m.word === '甲词')).toHaveLength(1)
    expect(matches.filter((m) => m.word === '乙词')).toHaveLength(2)
  })

  it('重叠与后缀词：一词内含另一词时两者都命中（fail 输出）', () => {
    // 「武器」是「冷武器」的后缀
    const matches = scanSensitiveWords('他掏出了冷武器。', ['冷武器', '武器'])
    expect(matches.map((m) => m.word).sort()).toEqual(['冷武器', '武器'])
  })

  it('跨词边界的部分匹配不误报；无命中返回空数组', () => {
    // 「禁」「忌」分开出现，不应命中「禁忌」
    expect(scanSensitiveWords('禁而不同，忌讳莫深。', ['禁忌'])).toHaveLength(0)
    expect(scanSensitiveWords('普通正文。', ['词汇'])).toEqual([])
  })

  it('空词与重复词被清理；重叠出现逐一命中且保持文本顺序', () => {
    const text = 'aaabbb'
    const matches = scanSensitiveWords(text, ['', 'aa', 'aa', 'bb'])
    // 'aaa' 含重叠的 'aa'×2（索引 0 与 1），'bbb' 同理
    expect(matches.map((m) => m.word)).toEqual(['aa', 'aa', 'bb', 'bb'])
    expect(matches.map((m) => m.index)).toEqual([0, 1, 3, 4])
  })

  it('匹配器可复用且确定性：同词表两次构建扫描结果一致', () => {
    const m1 = buildMatcher(['剑冢', '伏笔'])
    const m2 = buildMatcher(['伏笔', '剑冢'])
    const text = '剑冢里埋着伏笔。'
    expect(m1(text)).toEqual(m2(text))
    expect(m1(text).map((x) => x.word)).toEqual(['剑冢', '伏笔'])
  })

  it('性能口径：5 千词 × 10 万字符扫描在交互可接受时间内完成', () => {
    const words = Array.from({ length: 5000 }, (_, i) => `测试词${i}号`)
    words.push('埋伏词汇')
    const text = '寻常正文段落。'.repeat(8000) + '这里出现了埋伏词汇。' + '继续正文。'.repeat(4000)
    const t0 = Date.now()
    const matches = scanSensitiveWords(text, words)
    const cost = Date.now() - t0
    expect(matches).toHaveLength(1)
    expect(cost).toBeLessThan(2000) // 上限防回归（实测应远低于此；朴素 includes 需 10^9 比较不可用）
  })
})
