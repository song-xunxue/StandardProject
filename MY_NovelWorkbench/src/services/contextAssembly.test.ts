/**
 * 上下文组装单元测试（vitest）
 * 覆盖：token 估算 / BFS 深度（含跨图边）/ 三层分配 / 深度截断 /
 *       边语义加权排序 / 分层预算截断 / 关键词兜底 / 祖先链防环 / 确定性
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M0 初版：11 个用例覆盖 M0 验收标准「纯函数+单测」
 *   2. 修正夹具可达性：b-1 → bp-b 补边（否则 bp-b 从 a-1 不可达）；预算用例改用 20 token 触发丢弃
 */

import { describe, expect, it } from 'vitest'
import { assembleContext, bfsDepths, estimateTokens } from './contextAssembly'
import type { BlueprintEdge, BlueprintNode, GraphData, GraphView } from '@/types/blueprint'

// ---------- 测试数据工厂 ----------

const node = (id: string, over: Partial<BlueprintNode> = {}): BlueprintNode => ({
  id,
  type: 'text',
  title: id,
  graphId: 'g-root',
  tags: [],
  aliases: [],
  prompt: '',
  summary: `${id} 的摘要`,
  content: `${id} 的正文内容。`,
  position: { x: 0, y: 0 },
  size: { width: 150, height: 50 },
  ...over
})

const edge = (id: string, from: string, to: string, type: BlueprintEdge['type'] = 'arrow'): BlueprintEdge => ({
  id,
  from,
  to,
  type
})

const graph = (id: string, nodeIds: string[], ownerNodeId: string | null = null): GraphView => ({
  id,
  title: id,
  nodeIds,
  ownerNodeId
})

/** 三层嵌套图 + 跨图边 + 孤立节点的固定夹具
 *  边：a-1→a-2(arrow) · a-1→b-1(dashed 跨图) · b-1→bp-b(line) · bp-a—bp-b(line) */
function fixture(): GraphData {
  return {
    nodes: {
      // 根图 g-root：两个蓝图节点
      'bp-a': node('bp-a', { type: 'blueprint', title: '蓝图A', refGraphId: 'g-a', summary: '蓝图A摘要', content: undefined }),
      'bp-b': node('bp-b', { type: 'blueprint', title: '蓝图B', refGraphId: 'g-b', summary: '蓝图B摘要', content: undefined }),
      // 子图 g-a（属于 bp-a）
      'a-1': node('a-1', { graphId: 'g-a' }),
      'a-2': node('a-2', { graphId: 'g-a' }),
      // 子图 g-b（属于 bp-b）
      'b-1': node('b-1', { graphId: 'g-b' }),
      // 孤立节点（仅关键词兜底可达）
      iso: node('iso', { graphId: 'g-a', title: '剑冢传说', aliases: ['剑冢'], tags: ['设定'] })
    },
    edges: {
      'e-root': edge('e-root', 'bp-a', 'bp-b', 'line'),
      'e-a': edge('e-a', 'a-1', 'a-2'),
      // 跨图边：g-a 的 a-1 → g-b 的 b-1（虚线）
      'e-cross': edge('e-cross', 'a-1', 'b-1', 'dashed'),
      // b-1 与其蓝图拥有节点 bp-b 的连线（保证 bp-b 从 a-1 可达）
      'e-b-owner': edge('e-b-owner', 'b-1', 'bp-b', 'line')
    },
    graphs: {
      'g-root': graph('g-root', ['bp-a', 'bp-b']),
      'g-a': graph('g-a', ['a-1', 'a-2', 'iso'], 'bp-a'),
      'g-b': graph('g-b', ['b-1'], 'bp-b')
    }
  }
}

// ---------- 用例 ----------

describe('estimateTokens', () => {
  it('CJK 字符按约 0.65 token/字估算', () => {
    expect(estimateTokens('一二三四五六七八九十')).toBe(Math.ceil(10 * 0.65))
  })

  it('ASCII 按约 1.3 token/词估算，空串为 0', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcd abcd')).toBe(Math.ceil((8 / 4) * 1.3))
  })
})

describe('bfsDepths', () => {
  it('跨图边参与遍历：a-1 出发 b-1 深度 1、bp-b 深度 2；图拥有关系不属于边遍历', () => {
    const depths = bfsDepths(fixture(), 'a-1')
    expect(depths.get('a-2')).toBe(1)
    expect(depths.get('b-1')).toBe(1) // 跨图边
    expect(depths.get('bp-b')).toBe(2) // 经 b-1 两跳
    expect(depths.get('bp-a')).toBe(3) // 经 b-1 → bp-b → bp-a 三跳（e-root 边）
    expect(depths.has('iso')).toBe(false) // 孤立节点不可达
  })
})

describe('assembleContext 分层', () => {
  it('三层分配正确：自身+直接邻居(含跨图)在 L1，蓝图拥有链在 L2，两跳节点在 L3', () => {
    const result = assembleContext(fixture(), 'a-1')
    const seg = (id: string) => result.segments.find((s) => s.nodeId === id)
    expect(seg('a-1')?.role).toBe('self')
    expect(seg('a-1')?.layer).toBe(1)
    expect(seg('a-2')?.layer).toBe(1)
    expect(seg('b-1')?.layer).toBe(1) // 跨图直接邻居
    expect(seg('bp-a')?.layer).toBe(2) // 上级蓝图链（graphId=g-a 的拥有节点）
    expect(seg('bp-a')?.role).toBe('ancestor')
    expect(seg('bp-b')?.layer).toBe(3) // 两跳深层节点
    expect(seg('bp-b')?.role).toBe('deep')
    // iso 孤立：默认无草稿不进上下文
    expect(result.segments.some((s) => s.nodeId === 'iso')).toBe(false)
  })

  it('maxDepth=1 时第 3 层为空', () => {
    // b-1 出发：邻居 a-1、bp-b；深层（a-2 两跳）被 maxDepth=1 截断
    const result = assembleContext(fixture(), 'b-1', { maxDepth: 1 })
    expect(result.segments.filter((s) => s.role === 'deep')).toHaveLength(0)
  })

  it('边语义加权：arrow 连边的深层节点排在 line 连边的深层节点之前', () => {
    const data = fixture()
    // 新增 c-1：经 b-1 的 arrow 边连接（与 bp-b 的 line 边同为两跳深层）
    data.nodes['c-1'] = node('c-1', { graphId: 'g-b' })
    data.edges['e-c'] = edge('e-c', 'b-1', 'c-1', 'arrow')
    const result = assembleContext(data, 'a-1')
    const deepOrder = result.segments.filter((s) => s.role === 'deep').map((s) => s.nodeId)
    expect(deepOrder.indexOf('c-1')).toBeLessThan(deepOrder.indexOf('bp-b'))
  })

  it('分层预算截断：极小预算下 dropped 有记录且各层不超预算', () => {
    // 每个片段约 6-8 token，总预算 20（分层 12/5/3）必然触发丢弃
    const result = assembleContext(fixture(), 'a-1', { totalBudget: 20 })
    const [l1, l2, l3] = result.layerTokens
    expect(l1).toBeLessThanOrEqual(12)
    expect(l2).toBeLessThanOrEqual(5)
    expect(l3).toBeLessThanOrEqual(3)
    expect(result.dropped.length).toBeGreaterThan(0)
    expect(result.dropped.every((d) => d.reason === 'layer-budget' || d.reason === 'truncated')).toBe(true)
  })

  it('截断分支：剩余预算 ≥32 时片段被截断而非整段丢弃', () => {
    // 目标 a-1 第 1 层片段（自身+两邻居，各约 6 token）：预算 24（L1=14）放不下第三个邻居，
    // 但剩余 14-6=8 <32 → 丢弃；改用 44（L1=26）：6+6 后剩余 14 <32 仍丢弃…
    // 直接构造：预算 52 → L1=31：6+6=12，第三片段 6 → 12+6=18 ≤31 放得下，不触发。
    // 精确触发需要「放不下但剩余 ≥32」：把 b-1 的 content 加长即可
    const data = fixture()
    data.nodes['b-1']!.content = `${'长'.repeat(80)}`
    // b-1 tokens ≈ ceil(80*0.65)=52；L1 预算 = floor(64*0.6)=38：self 6 + a-2 6 =12，52 放不下，
    // 剩余 38-12=26 <32 → 仍丢。预算 80 → L1=48：剩余 36 ≥32 → 截断
    const result = assembleContext(data, 'a-1', { totalBudget: 80 })
    const truncated = result.dropped.find((d) => d.reason === 'truncated')
    expect(truncated?.nodeId).toBe('b-1')
    const seg = result.segments.find((s) => s.nodeId === 'b-1')
    expect(seg).toBeDefined()
    expect(seg?.text.endsWith('…')).toBe(true)
  })

  it('关键词兜底：草稿命中别名时补入孤立节点，无草稿不补', () => {
    const withDraft = assembleContext(fixture(), 'a-1', { draft: '他在剑冢边缘驻足。' })
    const seg = withDraft.segments.find((s) => s.nodeId === 'iso')
    expect(seg?.role).toBe('keyword')

    const noDraft = assembleContext(fixture(), 'a-1')
    expect(noDraft.segments.some((s) => s.nodeId === 'iso')).toBe(false)
  })

  it('祖先链防环：owner 成环时不死循环且正常返回', () => {
    const data = fixture()
    // 制造环：bp-a 挂到 g-b，bp-b 挂到 g-a，两图互为拥有
    data.graphs['g-a']!.ownerNodeId = 'bp-a'
    data.graphs['g-b']!.ownerNodeId = 'bp-b'
    data.nodes['bp-a']!.graphId = 'g-b'
    data.nodes['bp-b']!.graphId = 'g-a'
    const result = assembleContext(data, 'a-1')
    expect(result.segments.length).toBeGreaterThan(0)
  })

  it('目标节点不存在时返回空结果', () => {
    const result = assembleContext(fixture(), 'not-exist')
    expect(result.segments).toHaveLength(0)
    expect(result.totalTokens).toBe(0)
  })

  it('确定性：相同输入两次组装结果完全一致', () => {
    const a = assembleContext(fixture(), 'a-1', { draft: '剑冢' })
    const b = assembleContext(fixture(), 'a-1', { draft: '剑冢' })
    expect(a.segments).toEqual(b.segments)
    expect(a.dropped).toEqual(b.dropped)
  })
})
