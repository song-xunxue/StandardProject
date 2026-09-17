/**
 * 节拍整章组装纯函数单测（v2-F16）：节拍排序（arrow 拓扑/坐标回退/容环/never 过滤）+ 消息组装
 *
 * 作者: 李文煜
 * 日期: 2026-09-17
 */

import { describe, expect, it } from 'vitest'
import type { BlueprintEdge, BlueprintNode, GraphData } from '@/types/blueprint'
import { BEAT_LENGTH_PRESETS, beatChapterMessages, maxTokensOfChars, planBeats } from './beatAssembly'

let seq = 0
const beat = (over: Partial<BlueprintNode> = {}): BlueprintNode => ({
  id: `n${++seq}`,
  type: 'text',
  title: `拍${seq}`,
  graphId: 'g-sub',
  tags: [],
  aliases: [],
  prompt: '',
  summary: '',
  position: { x: 0, y: seq * 100 },
  size: { width: 160, height: 60 },
  ...over
})

const edge = (from: string, to: string, type: BlueprintEdge['type'] = 'arrow'): BlueprintEdge => ({
  id: `e${from}-${to}-${type}`,
  from,
  to,
  type
})

const dataOf = (nodes: BlueprintNode[], edges: BlueprintEdge[] = [], graphId = 'g-sub'): GraphData => ({
  nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
  edges: Object.fromEntries(edges.map((e) => [e.id, e])),
  graphs: { [graphId]: { id: graphId, title: '子图', nodeIds: nodes.map((n) => n.id), ownerNodeId: null } }
})

describe('planBeats（节拍排序）', () => {
  it('arrow 拓扑序：A→B→C 打乱存放也按链序输出；usedTopo=true', () => {
    const a = beat({ id: 'a', title: 'A' })
    const b = beat({ id: 'b', title: 'B' })
    const c = beat({ id: 'c', title: 'C' })
    // nodeIds 顺序故意乱放
    const data = dataOf([c, a, b], [edge('a', 'b'), edge('b', 'c')])
    data.graphs['g-sub']!.nodeIds = [c.id, a.id, b.id]
    const plan = planBeats(data, 'g-sub')
    expect(plan.beats.map((n) => n.title)).toEqual(['A', 'B', 'C'])
    expect(plan.usedTopo).toBe(true)
  })

  it('并列拍（多起点/分支）：ready 池按画布 y/x 稳定排序展开', () => {
    const a = beat({ id: 'a', title: '下位并列', position: { x: 0, y: 200 } })
    const b = beat({ id: 'b', title: '上位并列', position: { x: 100, y: 100 } })
    const c = beat({ id: 'c', title: '汇合', position: { x: 50, y: 300 } })
    const data = dataOf([a, b, c], [edge('a', 'c'), edge('b', 'c')])
    const plan = planBeats(data, 'g-sub')
    // 上位并列（y=100）先于下位并列（y=200），汇合最后
    expect(plan.beats.map((n) => n.title)).toEqual(['上位并列', '下位并列', '汇合'])
  })

  it('无 arrow 边：回退 y/x 坐标序（usedTopo=false）——结构模板网格布局行序即节拍序', () => {
    const n3 = beat({ id: '3', title: '第三拍', position: { x: 0, y: 220 } })
    const n1 = beat({ id: '1', title: '第一拍', position: { x: 0, y: 0 } })
    const n2 = beat({ id: '2', title: '第二拍', position: { x: 0, y: 110 } })
    const data = dataOf([n3, n1, n2], [edge('1', '2', 'line')])
    const plan = planBeats(data, 'g-sub')
    expect(plan.beats.map((n) => n.title)).toEqual(['第一拍', '第二拍', '第三拍'])
    expect(plan.usedTopo).toBe(false)
  })

  it('arrow 成环：整体回退坐标序（addEdge 不拒环，必须容环）', () => {
    const a = beat({ id: 'a', title: 'A', position: { x: 0, y: 0 } })
    const b = beat({ id: 'b', title: 'B', position: { x: 0, y: 100 } })
    const data = dataOf([a, b], [edge('a', 'b'), edge('b', 'a')])
    const plan = planBeats(data, 'g-sub')
    expect(plan.usedTopo).toBe(false)
    expect(plan.beats.map((n) => n.title)).toEqual(['A', 'B'])
  })

  it('F1「永不注入」节拍被排除并单独列出；ref/blueprint 成员分流到 supporting', () => {
    const a = beat({ id: 'a', title: '正常拍' })
    const nv = beat({ id: 'nv', title: '防剧透拍', aiVisibility: 'never' })
    const ref = beat({ id: 'ref', title: '引用节点', type: 'ref', refTarget: 'chapters/第01章.md' })
    const data = dataOf([a, nv, ref], [])
    const plan = planBeats(data, 'g-sub')
    expect(plan.beats.map((n) => n.id)).toEqual(['a'])
    expect(plan.neverBeats.map((n) => n.title)).toEqual(['防剧透拍'])
    expect(plan.supporting.map((n) => n.id)).toEqual(['ref'])
  })

  it('同向重复 arrow 边去重（不重复计度）；跨子图边不参与排序', () => {
    const a = beat({ id: 'a', title: 'A' })
    const b = beat({ id: 'b', title: 'B' })
    const data = dataOf([a, b], [edge('a', 'b'), edge('a', 'b'), edge('b', 'a', 'dashed')])
    // a→b 双条 arrow 去重；b→a 是 dashed 不构成度
    const plan = planBeats(data, 'g-sub')
    expect(plan.beats.map((n) => n.title)).toEqual(['A', 'B'])
    expect(plan.usedTopo).toBe(true)
  })

  it('子图不存在：空规划不抛错', () => {
    const plan = planBeats(dataOf([]), 'g-none')
    expect(plan.beats).toEqual([])
    expect(plan.usedTopo).toBe(false)
  })
})

describe('beatChapterMessages（消息组装）', () => {
  it('system=上层设定+节拍设定；user=目标章+节拍序列+字数指令+直出要求', () => {
    const msgs = beatChapterMessages({
      beats: [
        { title: '开场', prompt: '雨天码头', summary: '主角抵达' },
        { title: '冲突', prompt: '', summary: '遭遇追杀' }
      ],
      ancestors: [{ title: '第一卷', summary: '南下寻仇' }],
      recap: '【第01章】…码头夜雨',
      targetTitle: '第02章',
      lengthChars: 4000
    })
    expect(msgs).toHaveLength(2)
    expect(msgs[0]!.role).toBe('system')
    expect(msgs[0]!.content).toContain('【上层设定】')
    expect(msgs[0]!.content).toContain('【第一卷】南下寻仇')
    expect(msgs[0]!.content).toContain('第1拍 · 开场')
    expect(msgs[0]!.content).toContain('主角抵达')
    expect(msgs[0]!.content).toContain('（创作要求：雨天码头）')
    expect(msgs[0]!.content).toContain('第2拍 · 冲突')
    expect(msgs[1]!.role).toBe('user')
    expect(msgs[1]!.content).toContain('「第02章」')
    expect(msgs[1]!.content).toContain('1. 开场——主角抵达')
    expect(msgs[1]!.content).toContain('【前情提要】')
    expect(msgs[1]!.content).toContain('4000 字')
    expect(msgs[1]!.content).toContain('不要章节标题')
  })

  it('无上级设定/无前情：对应块不注入；空 summary 有占位', () => {
    const msgs = beatChapterMessages({
      beats: [{ title: '孤拍', prompt: '', summary: '' }],
      ancestors: [],
      recap: '',
      targetTitle: '第01章',
      lengthChars: 2500
    })
    expect(msgs[0]!.content).not.toContain('上层设定')
    expect(msgs[1]!.content).not.toContain('前情提要')
  })

  it('确定性：同输入两次调用相等；maxTokens 按字数 1.2 倍向上取整', () => {
    const input = {
      beats: [{ title: 'a', prompt: 'p', summary: 's' }],
      ancestors: [],
      recap: '',
      targetTitle: '第01章',
      lengthChars: 4000
    }
    expect(beatChapterMessages(input)).toEqual(beatChapterMessages(input))
    expect(maxTokensOfChars(4000)).toBe(4800)
    expect(maxTokensOfChars(2501)).toBe(3002)
    expect(BEAT_LENGTH_PRESETS).toHaveLength(3)
  })
})
