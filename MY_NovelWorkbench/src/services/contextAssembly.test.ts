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
 *   3. M3 补齐（≥90% 分支覆盖验收）：空图/prompt 前缀/content 回退/关键词按标题与标签命中/
 *      兜底放不下跳过与中途断流/总结余不足不进兜底/不命中 continue/权重平局字典序/
 *      悬空边忽略/起点不存在/layerBudgetsOf/祖先兼邻居只计一次
 */

import { describe, expect, it } from 'vitest'
import { assembleContext, bfsDepths, estimateTokens, KEYWORD_SCAN_TAIL_CHARS, layerBudgetsOf } from './contextAssembly'
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

// ---------- M3 补齐：≥90% 分支覆盖 ----------

describe('assembleContext 分支补齐（M3）', () => {
  it('空图返回空结果', () => {
    const result = assembleContext({ nodes: {}, edges: {}, graphs: {} }, 'any')
    expect(result.segments).toHaveLength(0)
    expect(result.layerTokens).toEqual([0, 0, 0])
  })

  it('text 节点带 prompt 时注入「【写作要求】」前缀', () => {
    const data = fixture()
    data.nodes['a-2']!.prompt = '多用短句'
    const result = assembleContext(data, 'a-1')
    const seg = result.segments.find((s) => s.nodeId === 'a-2')
    expect(seg?.text.startsWith('【写作要求】多用短句')).toBe(true)
  })

  it('text 节点 content 缺失时回退 summary', () => {
    const data = fixture()
    data.nodes['a-2']!.content = undefined
    const result = assembleContext(data, 'a-1')
    const seg = result.segments.find((s) => s.nodeId === 'a-2')
    expect(seg?.text).toContain('a-2 的摘要')
  })

  it('关键词兜底可按 title 与 tags 命中（不止 aliases）', () => {
    const byTitle = assembleContext(fixture(), 'a-1', { draft: '关于剑冢传说的正文字。' })
    expect(byTitle.segments.some((s) => s.nodeId === 'iso' && s.role === 'keyword')).toBe(true)
    const byTag = assembleContext(fixture(), 'a-1', { draft: '这段提到了设定 事项。' })
    expect(byTag.segments.some((s) => s.nodeId === 'iso' && s.role === 'keyword')).toBe(true)
  })

  it('关键词兜底只扫草稿尾部窗口（性能批次回归）：窗口外的旧文提及不命中', () => {
    const filler = '水'.repeat(KEYWORD_SCAN_TAIL_CHARS)
    // 提及在头部（窗口外）→ 不补入
    const headOnly = assembleContext(fixture(), 'a-1', { draft: `他在剑冢边缘驻足。${filler}` })
    expect(headOnly.segments.some((s) => s.nodeId === 'iso')).toBe(false)
    // 同一提及在尾部（窗口内）→ 补入
    const tailHit = assembleContext(fixture(), 'a-1', { draft: `${filler}他在剑冢边缘驻足。` })
    expect(tailHit.segments.some((s) => s.nodeId === 'iso' && s.role === 'keyword')).toBe(true)
  })

  it('兜底候选放不下时跳过，更小的候选仍被补入', () => {
    const data = fixture()
    // 大候选（远超剩余）在字典序最前；小候选 13 token 可放入
    data.nodes['a-big'] = node('a-big', { graphId: 'g-a', aliases: ['触发词'], content: '长'.repeat(1000) })
    data.nodes['a-small'] = node('a-small', { graphId: 'g-a', aliases: ['触发词'], content: '十'.repeat(20) })
    const draft = '这里出现了触发词。'
    const result = assembleContext(data, 'a-1', { totalBudget: 300, draft })
    expect(result.segments.some((s) => s.nodeId === 'a-big')).toBe(false)
    expect(result.segments.some((s) => s.nodeId === 'a-small' && s.role === 'keyword')).toBe(true)
  })

  it('兜底循环中途总结余 ≤64 时断流（后续命中候选不再补入）', () => {
    const data = fixture()
    data.nodes['a-big'] = node('a-big', { graphId: 'g-a', aliases: ['触发词'], content: '长'.repeat(1000) })
    data.nodes['a-s1'] = node('a-s1', { graphId: 'g-a', aliases: ['触发词'], content: '十'.repeat(20) })
    data.nodes['a-s2'] = node('a-s2', { graphId: 'g-a', aliases: ['触发词'], content: '十'.repeat(20) })
    const draft = '这里出现了触发词。'
    // 预算 100：三层用掉约 26，剩 74 >64 进入兜底 → a-big 跳过 → a-s1(13t) 补入后剩 61 ≤64 → a-s2 断流
    const result = assembleContext(data, 'a-1', { totalBudget: 100, draft })
    expect(result.segments.some((s) => s.nodeId === 'a-s1')).toBe(true)
    expect(result.segments.some((s) => s.nodeId === 'a-s2')).toBe(false)
  })

  it('有草稿但总结余 ≤64 时完全不进兜底', () => {
    // 预算 70：三层约 26 → 剩 44 ≤64，即使草稿命中也不补
    const result = assembleContext(fixture(), 'a-1', { totalBudget: 70, draft: '他在剑冢边缘驻足。' })
    expect(result.segments.some((s) => s.nodeId === 'iso')).toBe(false)
  })

  it('不命中的候选被跳过（continue 分支）', () => {
    const data = fixture()
    data.nodes['zz-unrelated'] = node('zz-unrelated', { graphId: 'g-a', content: '无关内容' })
    const result = assembleContext(data, 'a-1', { draft: '他在剑冢边缘驻足。' })
    expect(result.segments.some((s) => s.nodeId === 'zz-unrelated')).toBe(false)
    expect(result.segments.some((s) => s.nodeId === 'iso')).toBe(true)
  })

  it('深层候选权重平局时按 id 字典序稳定排序', () => {
    const data = fixture()
    data.nodes['c-1'] = node('c-1', { graphId: 'g-b' })
    data.nodes['c-2'] = node('c-2', { graphId: 'g-b' })
    data.edges['e-c1'] = edge('e-c1', 'b-1', 'c-1', 'arrow')
    data.edges['e-c2'] = edge('e-c2', 'b-1', 'c-2', 'arrow')
    const r1 = assembleContext(data, 'a-1')
    const r2 = assembleContext(data, 'a-1')
    const deepIds = r1.segments.filter((s) => s.role === 'deep').map((s) => s.nodeId)
    expect(deepIds.indexOf('c-1')).toBeGreaterThan(-1)
    expect(deepIds.indexOf('c-2')).toBe(deepIds.indexOf('c-1') + 1) // 字典序相邻
    expect(r1.segments).toEqual(r2.segments) // 两次一致（确定性）
  })

  it('悬空边（端点不存在）被 BFS 忽略', () => {
    const data = fixture()
    data.edges['e-ghost'] = edge('e-ghost', 'a-1', 'ghost-node')
    const depths = bfsDepths(data, 'a-1')
    expect(depths.has('ghost-node')).toBe(false)
    // 组装不抛错
    expect(() => assembleContext(data, 'a-1')).not.toThrow()
  })

  it('bfsDepths 起点不存在时返回仅含起点的深度表', () => {
    const depths = bfsDepths(fixture(), 'ghost')
    expect(depths.size).toBe(1)
    expect(depths.get('ghost')).toBe(0)
  })

  it('祖先同时是直接邻居时只以 neighbor 身份出现一次', () => {
    // b-1 的邻居含 bp-b（e-b-owner），bp-b 又是 g-b 的拥有节点（其祖先）
    const result = assembleContext(fixture(), 'b-1')
    const appearances = result.segments.filter((s) => s.nodeId === 'bp-b')
    expect(appearances).toHaveLength(1)
    expect(appearances[0]?.role).toBe('neighbor')
    expect(appearances[0]?.layer).toBe(1)
  })

  it('layerBudgetsOf：默认比例 60/25/15 向下取整；自定义比例生效', () => {
    expect(layerBudgetsOf()).toEqual([4800, 2000, 1200])
    expect(layerBudgetsOf(1000)).toEqual([600, 250, 150])
    expect(layerBudgetsOf(99, [0.5, 0.3, 0.2])).toEqual([49, 29, 19])
  })
})
