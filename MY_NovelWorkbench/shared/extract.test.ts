/**
 * 拆书抽取纯函数单测（v2-F15）：LLM 输出容错解析（围栏/噪声/类型漂移/坏条目/
 * 截断抢救）/ 跨章去重合并 / 既有节点匹配 / 超长章节切窗
 *
 * 作者: 李文煜
 * 日期: 2026-09-23
 */

import { describe, expect, it } from 'vitest'
import {
  entityKeyOf,
  matchExistingNodes,
  mergeExtractedEntities,
  parseExtractOutput,
  splitChapterWindows
} from './extract'
import type { BlueprintNode } from './blueprint'

describe('parseExtractOutput（容错解析）', () => {
  it('干净 JSON（entities 包装形态）', () => {
    const out = parseExtractOutput('{"entities":[{"name":"林越","aliases":["越哥"],"type":"人物","summary":"主角"}]}')
    expect(out).toEqual([{ name: '林越', aliases: ['越哥'], type: '人物', summary: '主角' }])
  })

  it('裸数组形态', () => {
    const out = parseExtractOutput('[{"name":"青云宗","type":"势力","summary":""}]')
    expect(out).toEqual([{ name: '青云宗', aliases: [], type: '势力', summary: '' }])
  })

  it('```json 围栏与前后解释文字', () => {
    const text = '好的，以下是抽取结果：\n```json\n{"entities":[{"name":"北荒","type":"地点","summary":"大陆北境"}]}\n```\n希望有帮助'
    const out = parseExtractOutput(text)
    expect(out).toHaveLength(1)
    expect(out[0]!.name).toBe('北荒')
  })

  it('字段类型漂移：aliases 字符串→单元素、未知 type 兜底、超长截断', () => {
    const out = parseExtractOutput(
      '{"entities":[{"name":"张三","aliases":"张师长","type":"武器","summary":"' +
        '长'.repeat(300) +
        '"}]}'
    )
    expect(out[0]!.aliases).toEqual(['张师长'])
    expect(out[0]!.type).toBe('人物') // 未知类型兜底
    expect(out[0]!.summary.length).toBe(200)
  })

  it('坏条目跳过不阻断（name 缺失/非对象）', () => {
    const out = parseExtractOutput('{"entities":[{"name":"甲","type":"人物"},"无名条目",{"aliases":["乙"],"type":"人物"},"字符串"]}').map((e) => e.name)
    expect(out).toEqual(['甲'])
  })

  it('max_tokens 截断（末对象未闭合）：对象级抢救，丢尾不炸', () => {
    const text = '{"entities":[{"name":"完整甲","type":"人物","summary":"一"},{"name":"完整乙","type":"地点","summary":"二"},{"name":"被截断的丙","type":"人物","summ'
    const out = parseExtractOutput(text)
    expect(out.map((e) => e.name)).toEqual(['完整甲', '完整乙'])
  })

  it('完全非法输入返回空数组', () => {
    expect(parseExtractOutput('')).toEqual([])
    expect(parseExtractOutput('模型拒绝回答')).toEqual([])
    expect(parseExtractOutput('{"entities": "not-a-list"}')).toEqual([])
  })

  it('空实体名单（合法空结果）', () => {
    expect(parseExtractOutput('{"entities":[]}')).toEqual([])
  })
})

describe('mergeExtractedEntities（跨章合并）', () => {
  it('同名合并：别名并集、summary 取最长、保序', () => {
    const a = [{ name: '林越', aliases: ['越哥'], type: '人物' as const, summary: '短' }]
    const b = [{ name: '林越', aliases: ['林大哥', '越哥'], type: '人物' as const, summary: '主角，剑修，北境人氏' }]
    const out = mergeExtractedEntities([a, b])
    expect(out).toHaveLength(1)
    expect(out[0]!.aliases).toEqual(['越哥', '林大哥'])
    expect(out[0]!.summary).toBe('主角，剑修，北境人氏')
  })

  it('别名命中合并：他章以别名作名出现（老张/张师长）', () => {
    const a = [{ name: '张师长', aliases: [], type: '人物' as const, summary: '一' }]
    const b = [{ name: '老张', aliases: [], type: '人物' as const, summary: '二' }]
    // 无交叉键：保持两个（不做单向包含合并）
    expect(mergeExtractedEntities([a, b])).toHaveLength(2)
    // 有别名桥：合并
    const c = [{ name: '张师长', aliases: ['老张'], type: '人物' as const, summary: '一' }]
    const d = [{ name: '老张', aliases: [], type: '人物' as const, summary: '二' }]
    const out = mergeExtractedEntities([c, d])
    expect(out).toHaveLength(1)
    expect(out[0]!.name).toBe('张师长')
    expect(out[0]!.aliases).toContain('老张')
  })

  it('不误并：无别名关系时「张三丰」与「张真人」保持两个', () => {
    const out = mergeExtractedEntities([
      [{ name: '张三丰', aliases: [], type: '人物' as const, summary: '' }],
      [{ name: '张真人', aliases: [], type: '人物' as const, summary: '' }]
    ])
    expect(out).toHaveLength(2)
  })

  it('累积合并（三章流式场景）：键索引随合并增长', () => {
    let cur = mergeExtractedEntities([[]])
    cur = mergeExtractedEntities([cur, [{ name: '甲', aliases: [], type: '人物' as const, summary: 'a' }]])
    cur = mergeExtractedEntities([cur, [{ name: '甲', aliases: ['大甲'], type: '人物' as const, summary: 'aa' }]])
    cur = mergeExtractedEntities([cur, [{ name: '乙', aliases: [], type: '地点' as const, summary: 'b' }]])
    expect(cur.map((e) => e.name)).toEqual(['甲', '乙'])
    expect(cur[0]!.aliases).toEqual(['大甲'])
    expect(cur[0]!.summary).toBe('aa')
  })
})

describe('matchExistingNodes（既有节点匹配）', () => {
  const node = (id: string, title: string, aliases: string[]): BlueprintNode =>
    ({ id, type: 'text', title, graphId: 'g1', tags: [], aliases, prompt: '', summary: '', position: { x: 0, y: 0 }, size: { width: 160, height: 50 } }) as BlueprintNode

  it('标题与别名双向命中（实体名==节点别名 / 实体别名==节点标题）', () => {
    const nodes = [node('n1', '林越', ['越哥']), node('n2', '青云宗', [])]
    const entities = [
      { name: '越哥', aliases: [], type: '人物' as const, summary: '' },
      { name: '林越', aliases: [], type: '人物' as const, summary: '' },
      { name: '北荒', aliases: [], type: '地点' as const, summary: '' }
    ]
    const out = matchExistingNodes(entities, nodes)
    expect(out.get(entityKeyOf('越哥'))).toBe('n1')
    expect(out.get(entityKeyOf('林越'))).toBe('n1')
    expect(out.get(entityKeyOf('北荒'))).toBeUndefined()
  })

  it('空白与大小写归一（英文名变体）', () => {
    const nodes = [node('n1', 'Ling Yue', [])]
    const entities = [{ name: 'ling  yue', aliases: [], type: '人物' as const, summary: '' }]
    expect(matchExistingNodes(entities, nodes).get(entityKeyOf('ling  yue'))).toBe('n1')
  })
})

describe('splitChapterWindows（超长章节切窗）', () => {
  it('短文原样单窗', () => {
    expect(splitChapterWindows('短文')).toEqual(['短文'])
    expect(splitChapterWindows('')).toEqual([])
  })

  it('超长按段落边界切窗，窗内不超上限', () => {
    const paras = Array.from({ length: 50 }, (_, i) => `第${i}段。${'字'.repeat(100)}`)
    const content = paras.join('\n\n') // ~5600 字
    const windows = splitChapterWindows(content, 1000)
    expect(windows.length).toBeGreaterThan(1)
    for (const w of windows) expect(w.length).toBeLessThanOrEqual(1000)
    // 无内容丢失
    expect(windows.join('\n\n').replace(/\n\n/g, '')).toBe(content.replace(/\n\n/g, ''))
  })

  it('单段超窗硬切', () => {
    const windows = splitChapterWindows('x'.repeat(2500), 1000)
    expect(windows).toEqual(['x'.repeat(1000), 'x'.repeat(1000), 'x'.repeat(500)])
  })
})
