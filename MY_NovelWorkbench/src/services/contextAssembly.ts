/**
 * AI 上下文组装（纯函数，M0 最小版）
 * 规则（PROJECT_PLAN.md 3.3）：三层优先级 + 深度截断 + 分层预算 + 边语义加权 + 关键词兜底
 *   第 1 层：当前节点（含 prompt）+ 直接前后链接节点 —— 全文
 *   第 2 层：上级蓝图链各级的摘要卡（summary，而非全文）
 *   第 3 层：深度 ≥2 的链接节点 —— 按边语义加权排序（箭头 > 直线 > 虚线）
 *   预算：默认总预算 8000 token，按 60/25/15 分层；超预算截断/丢弃并记录
 *   兜底：预算未满且草稿文本命中节点 标题/别名/标签 时补齐（role=keyword）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M0 初版：BFS 深度计算、祖先链注入、预算截断、关键词兜底，全部纯函数可单测
 *
 * 2026-08-30
 * 变更说明：
 *   1. 性能批次：关键词兜底只扫草稿尾部 KEYWORD_SCAN_TAIL_CHARS 字（此前全文逐候选
 *      includes，压力规模下随 300ms 草稿 tick 连续卡顿主线程）
 */

import type { BlueprintEdge, BlueprintNode, EdgeType, GraphData } from '@/types/blueprint'
import { ancestorNodesOf } from './graphTraversal'

/** 默认总 token 预算 */
export const DEFAULT_TOTAL_BUDGET = 8000
/** 默认三层预算比例（60/25/15，见 PROJECT_PLAN.md 3.3） */
export const DEFAULT_LAYER_RATIOS: [number, number, number] = [0.6, 0.25, 0.15]
/** 关键词兜底的草稿扫描窗口（尾部字数）——超出部分（旧文）不参与命中 */
export const KEYWORD_SCAN_TAIL_CHARS = 20000

/** 由总预算与比例计算各层预算（面板与组装共用同一口径） */
export function layerBudgetsOf(
  totalBudget: number = DEFAULT_TOTAL_BUDGET,
  ratios: [number, number, number] = DEFAULT_LAYER_RATIOS
): [number, number, number] {
  return [
    Math.floor(totalBudget * ratios[0]),
    Math.floor(totalBudget * ratios[1]),
    Math.floor(totalBudget * ratios[2])
  ]
}

/** 组装出的上下文片段 */
export interface ContextSegment {
  nodeId: string
  title: string
  /** 1=当前+直接邻居 2=上级蓝图链 3=深层节点 */
  layer: 1 | 2 | 3
  /** 片段角色：self 当前节点 / neighbor 直接邻居 / ancestor 上级蓝图 / deep 深层 / keyword 兜底 */
  role: 'self' | 'neighbor' | 'ancestor' | 'deep' | 'keyword'
  /** 实际注入的文本 */
  text: string
  tokens: number
}

export interface AssembleOptions {
  /** 当前草稿正文（关键词兜底的扫描源），可选 */
  draft?: string
  /** 第 3 层的深度截断（默认 2：即仅收 depth ≤ maxDepth 的节点，第 3 层恰为 depth=2） */
  maxDepth?: number
  /** 总 token 预算（默认 8000） */
  totalBudget?: number
  /** 三层预算比例（默认 [0.6, 0.25, 0.15]） */
  layerRatios?: [number, number, number]
}

export interface AssembleResult {
  segments: ContextSegment[]
  /** 各层实际占用 token */
  layerTokens: [number, number, number]
  totalTokens: number
  totalBudget: number
  /** 因预算被丢弃/截断的记录 */
  dropped: Array<{ nodeId: string; title: string; reason: 'layer-budget' | 'truncated' }>
}

/** 边语义权重：箭头（因果/顺序）> 直线（关联）> 虚线（参考/伏笔），见 ADR-15 */
const EDGE_WEIGHT: Record<EdgeType, number> = { arrow: 3, line: 2, dashed: 1 }

/**
 * token 估算（确定性近似）：CJK 字符约 0.65 token/字，其余 ASCII 词约 1.3 token/词
 * 仅用于预算控制与展示，不追求与真实分词器一致
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  const cjk = (text.match(/[一-鿿㐀-䶿]/g) ?? []).length
  const rest = text.length - cjk
  return Math.ceil(cjk * 0.65 + (rest / 4) * 1.3)
}

/** 节点注入文本：text 节点用全文（+prompt 前缀），blueprint 用摘要卡 */
function nodeText(node: BlueprintNode): string {
  if (node.type === 'text') {
    const body = node.content ?? node.summary
    return node.prompt ? `【写作要求】${node.prompt}\n${body}` : body
  }
  return `【${node.title}·摘要】${node.summary}`
}

/** 无向 BFS：返回各节点到起点的深度（含跨图边；忽略不存在的端点） */
export function bfsDepths(data: GraphData, startNodeId: string): Map<string, number> {
  const depths = new Map<string, number>([[startNodeId, 0]])
  if (!data.nodes[startNodeId]) return depths
  // 邻接表（无向）
  const adjacency = new Map<string, Array<{ to: string; edge: BlueprintEdge }>>()
  for (const edge of Object.values(data.edges)) {
    if (!data.nodes[edge.from] || !data.nodes[edge.to]) continue
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, [])
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, [])
    adjacency.get(edge.from)!.push({ to: edge.to, edge })
    adjacency.get(edge.to)!.push({ to: edge.from, edge })
  }
  const queue = [startNodeId]
  while (queue.length > 0) {
    const current = queue.shift()!
    const depth = depths.get(current)!
    for (const { to } of adjacency.get(current) ?? []) {
      if (!depths.has(to)) {
        depths.set(to, depth + 1)
        queue.push(to)
      }
    }
  }
  return depths
}

/** 节点连到第 1 层的边的最大权重（第 3 层排序依据；无记录则 0） */
function maxEdgeWeightToLayer1(data: GraphData, nodeId: string, layer1Ids: Set<string>): number {
  let weight = 0
  for (const edge of Object.values(data.edges)) {
    const touches = (edge.from === nodeId && layer1Ids.has(edge.to)) || (edge.to === nodeId && layer1Ids.has(edge.from))
    if (touches) weight = Math.max(weight, EDGE_WEIGHT[edge.type])
  }
  return weight
}

/**
 * 组装上下文（纯函数）
 * @param data 全局图数据（nodes/edges/graphs）
 * @param targetNodeId 当前正在创作的节点
 */
export function assembleContext(data: GraphData, targetNodeId: string, options: AssembleOptions = {}): AssembleResult {
  const { draft = '', maxDepth = 2, totalBudget = DEFAULT_TOTAL_BUDGET, layerRatios = DEFAULT_LAYER_RATIOS } = options
  const target = data.nodes[targetNodeId]
  const empty: AssembleResult = {
    segments: [],
    layerTokens: [0, 0, 0],
    totalTokens: 0,
    totalBudget,
    dropped: []
  }
  if (!target) return empty

  // ---- 分层收集（nodeId → layer/role，先到先得：self > neighbor > ancestor > deep）----
  const assigned = new Map<string, { layer: 1 | 2 | 3; role: ContextSegment['role'] }>()
  assigned.set(targetNodeId, { layer: 1, role: 'self' })

  const depths = bfsDepths(data, targetNodeId)
  for (const [nodeId, depth] of depths) {
    if (nodeId === targetNodeId) continue
    if (depth === 1) assigned.set(nodeId, { layer: 1, role: 'neighbor' })
  }

  // 上级蓝图链（共用 graphTraversal 的单一实现，自带防环；不覆盖已分配的）
  const ancestors = ancestorNodesOf(data, targetNodeId)
  for (const ancestor of ancestors) {
    if (!assigned.has(ancestor.id)) assigned.set(ancestor.id, { layer: 2, role: 'ancestor' })
  }

  // 深层节点：depth ≥2 且 ≤ maxDepth，未分配的进入第 3 层
  // layer1Ids 在循环外构建一次（第 1/2 层分配已定，循环内不再变化）
  const layer1Ids = new Set<string>()
  for (const [nid, info] of assigned) {
    if (info.layer === 1) layer1Ids.add(nid)
  }
  const deepCandidates: Array<{ node: BlueprintNode; weight: number }> = []
  for (const [nodeId, depth] of depths) {
    if (depth < 2 || depth > maxDepth || assigned.has(nodeId)) continue
    const node = data.nodes[nodeId]
    if (!node) continue
    deepCandidates.push({ node, weight: maxEdgeWeightToLayer1(data, nodeId, layer1Ids) })
  }
  deepCandidates.sort((a, b) => b.weight - a.weight || a.node.id.localeCompare(b.node.id))
  for (const { node } of deepCandidates) assigned.set(node.id, { layer: 3, role: 'deep' })

  // ---- 分层预算填充 ----
  const layerBudgets: [number, number, number] = layerBudgetsOf(totalBudget, layerRatios)
  const segments: ContextSegment[] = []
  const layerTokens: [number, number, number] = [0, 0, 0]
  const dropped: AssembleResult['dropped'] = []
  // 层内顺序：第 1 层 self 最先；第 3 层按权重；第 2 层自内向外
  const roleOrder: Record<string, number> = { self: 0, neighbor: 1, ancestor: 0, deep: 0 }
  const layerEntries = (layer: 1 | 2 | 3): Array<[string, { layer: 1 | 2 | 3; role: ContextSegment['role'] }]> =>
    [...assigned.entries()].filter(([, info]) => info.layer === layer)
  const orderLayer = (layer: 1 | 2 | 3): Array<[string, { layer: 1 | 2 | 3; role: ContextSegment['role'] }]> => {
    if (layer === 1) {
      return layerEntries(1).sort((a, b) => roleOrder[a[1].role] - roleOrder[b[1].role] || a[0].localeCompare(b[0]))
    }
    if (layer === 2) {
      // 祖先链顺序：ancestors 数组即自内向外
      return ancestors
        .filter((a) => assigned.get(a.id)?.layer === 2)
        .map((a) => [a.id, assigned.get(a.id)!] as [string, { layer: 1 | 2 | 3; role: ContextSegment['role'] }])
    }
    return deepCandidates.map(({ node }) => [node.id, assigned.get(node.id)!] as [string, { layer: 1 | 2 | 3; role: ContextSegment['role'] }])
  }

  for (const layer of [1, 2, 3] as const) {
    let used = layerTokens[layer - 1]
    const budget = layerBudgets[layer - 1]
    for (const [nodeId, info] of orderLayer(layer)) {
      const node = data.nodes[nodeId]
      if (!node) continue
      const text = nodeText(node)
      const tokens = estimateTokens(text)
      if (used + tokens <= budget) {
        segments.push({ nodeId, title: node.title, layer, role: info.role, text, tokens })
        used += tokens
      } else {
        const remaining = budget - used
        if (remaining >= 32) {
          // 截断到剩余预算（按估算比例近似裁剪字符数）并标记
          const keepChars = Math.max(0, Math.floor((remaining / tokens) * text.length))
          const truncatedText = text.slice(0, keepChars) + '…'
          segments.push({
            nodeId,
            title: node.title,
            layer,
            role: info.role,
            text: truncatedText,
            tokens: estimateTokens(truncatedText)
          })
          used = budget
          dropped.push({ nodeId, title: node.title, reason: 'truncated' })
        } else {
          dropped.push({ nodeId, title: node.title, reason: 'layer-budget' })
        }
      }
    }
    layerTokens[layer - 1] = used
  }

  // ---- 关键词兜底：各层结余预算内，用草稿命中的未分配节点补齐 ----
  const overallUsed = layerTokens[0] + layerTokens[1] + layerTokens[2]
  let remainingOverall = totalBudget - overallUsed
  if (draft && remainingOverall > 64) {
    // 性能批次：只扫草稿尾部窗口（与续写取正文尾部的口径一致）——全文逐候选 includes
    // 在压力规模（数百节点 × 十万字草稿）是每 300ms 的主线程热点，且头部旧文对
    // 「就近补上下文」的语义贡献远低于尾部
    const scanText =
      draft.length > KEYWORD_SCAN_TAIL_CHARS ? draft.slice(-KEYWORD_SCAN_TAIL_CHARS) : draft
    for (const node of keywordCandidates(data, assigned)) {
      if (remainingOverall <= 64) break
      const hit = [node.title, ...node.aliases, ...node.tags].some((k) => k && scanText.includes(k))
      if (!hit) continue
      const text = nodeText(node)
      const tokens = estimateTokens(text)
      if (tokens > remainingOverall) continue // 放不下的候选跳过，继续找更小的
      segments.push({ nodeId: node.id, title: node.title, layer: 3, role: 'keyword', text, tokens })
      remainingOverall -= tokens
      // 兜底片段计入第 3 层统计，保证 layerTokens 之和 === totalTokens 口径一致
      layerTokens[2] += tokens
    }
  }

  const totalTokens = segments.reduce((sum, s) => sum + s.tokens, 0)
  return { segments, layerTokens, totalTokens, totalBudget, dropped }
}

/** 关键词兜底候选：未进入任何层级的节点（排除自身），确定性排序 */
function keywordCandidates(
  data: GraphData,
  assigned: Map<string, { layer: 1 | 2 | 3; role: ContextSegment['role'] }>
): BlueprintNode[] {
  return Object.values(data.nodes)
    .filter((n) => !assigned.has(n.id))
    .sort((a, b) => a.id.localeCompare(b.id))
}
