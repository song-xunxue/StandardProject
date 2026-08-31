/**
 * 蓝图文件编解码（纯函数）：内存 GraphData ↔ 落盘 BlueprintFile
 * 约定：节点 graphId 不落盘（由所属文件隐含），解析时回填为文件 id
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：文件 → 图视图集合（owner 关系由父文件节点 refGraphId 推导）
 *   2. M2 审查修订：解析时对节点做字段归一化（缺 tags/position 等的外部手编文件
 *      不再让渲染层抛 TypeError）；type 非法或 id 缺失的节点跳过并告警
 *
 * 2026-08-31
 * 变更说明：
 *   1. v2-F1：节点归一化补 aiVisibility（非法值回落 undefined=auto）
 */

import type { AiVisibility, BlueprintEdge, BlueprintNode, GraphData, GraphView, NodeType } from './blueprint'
import type { BlueprintFile, BlueprintFileNode } from './types'

const VALID_NODE_TYPES: ReadonlySet<string> = new Set(['blueprint', 'text', 'ref'])
const VALID_EDGE_TYPES: ReadonlySet<string> = new Set(['arrow', 'line', 'dashed'])

/** 落盘节点：剥离 graphId（所属文件即 graphId） */
export function toFileNodes(nodes: BlueprintNode[]): Array<Omit<BlueprintFileNode, 'graphId'>> {
  return nodes.map(({ graphId: _graphId, ...rest }) => rest)
}

/**
 * 节点归一化：外部编辑器可能写出缺字段/坏类型的节点，渲染层（node.tags.length 等）
 * 会对 undefined 直接抛错——在数据入口统一补默认值；id 缺失或 type 非法则跳过该节点
 */
function normalizeNode(n: unknown, fileId: string): BlueprintNode | null {
  if (typeof n !== 'object' || n === null) return null
  const raw = n as Partial<BlueprintFileNode> & { id?: unknown; type?: unknown }
  if (typeof raw.id !== 'string' || raw.id === '' || raw.id.startsWith('proxy:')) {
    console.warn(`[blueprintCodec] 跳过非法节点（id 缺失或占用 proxy: 前缀）：${fileId}`)
    return null
  }
  if (typeof raw.type !== 'string' || !VALID_NODE_TYPES.has(raw.type)) {
    console.warn(`[blueprintCodec] 跳过非法节点（type 未知：${String(raw.type)}）：${fileId}`)
    return null
  }
  return {
    id: raw.id,
    type: raw.type as NodeType,
    title: typeof raw.title === 'string' && raw.title !== '' ? raw.title : raw.id,
    graphId: fileId,
    refGraphId: typeof raw.refGraphId === 'string' ? raw.refGraphId : undefined,
    refTarget: typeof raw.refTarget === 'string' ? raw.refTarget : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    aliases: Array.isArray(raw.aliases) ? raw.aliases.filter((t): t is string => typeof t === 'string') : [],
    prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    aiVisibility:
      raw.aiVisibility === 'always' || raw.aiVisibility === 'never' ? (raw.aiVisibility as AiVisibility) : undefined,
    position:
      raw.position && typeof raw.position.x === 'number' && typeof raw.position.y === 'number'
        ? { x: raw.position.x, y: raw.position.y }
        : { x: 0, y: 0 },
    size:
      raw.size && typeof raw.size.width === 'number' && typeof raw.size.height === 'number'
        ? { width: raw.size.width, height: raw.size.height }
        : { width: 160, height: 50 }
  }
}

/** 边归一化：id/from/to 缺失或 type 非法（渲染层 EDGE_VISUAL 查表会炸）时跳过 */
function normalizeEdge(e: unknown, fileId: string): BlueprintEdge | null {
  const raw = e as Partial<BlueprintEdge> | null
  if (
    raw === null ||
    typeof raw.id !== 'string' ||
    typeof raw.from !== 'string' ||
    typeof raw.to !== 'string' ||
    typeof raw.type !== 'string' ||
    !VALID_EDGE_TYPES.has(raw.type)
  ) {
    console.warn(`[blueprintCodec] 跳过非法边：${fileId}`)
    return null
  }
  return {
    id: raw.id,
    from: raw.from,
    to: raw.to,
    type: raw.type as BlueprintEdge['type'],
    label: typeof raw.label === 'string' && raw.label !== '' ? raw.label : undefined
  }
}

/** 解析文件：回填 graphId 为所属文件 id；节点/边字段归一化（坏条目跳过不阻断） */
export function parseBlueprintFile(file: BlueprintFile): { nodes: BlueprintNode[]; edges: BlueprintEdge[] } {
  const nodes: BlueprintNode[] = []
  for (const n of file.nodes) {
    const normalized = normalizeNode(n, file.id)
    if (normalized) nodes.push(normalized)
  }
  const edges: BlueprintEdge[] = []
  for (const e of file.edges) {
    const normalized = normalizeEdge(e, file.id)
    if (normalized) edges.push(normalized)
  }
  return { nodes, edges }
}

/**
 * 多个蓝图文件 → 全局图数据（水合入口）
 * 图视图：nodeIds 取「graphId = 文件 id」的节点；ownerNodeId 取父文件中 refGraphId 指向本图的节点
 */
export function hydrateGraphData(files: BlueprintFile[]): GraphData {
  const nodes: Record<string, BlueprintNode> = {}
  const edges: Record<string, BlueprintEdge> = {}
  const graphs: Record<string, GraphView> = {}
  for (const file of files) {
    const parsed = parseBlueprintFile(file)
    for (const n of parsed.nodes) nodes[n.id] = n
    for (const e of parsed.edges) edges[e.id] = e
  }
  for (const file of files) {
    const memberIds = Object.values(nodes)
      .filter((n) => n.graphId === file.id)
      .map((n) => n.id)
    // 拥有节点：任一文件中的 blueprint 节点，其 refGraphId 指向本图
    const owner = Object.values(nodes).find((n) => n.type === 'blueprint' && n.refGraphId === file.id)
    graphs[file.id] = {
      id: file.id,
      title: file.title,
      nodeIds: memberIds,
      ownerNodeId: owner ? owner.id : null
    }
  }
  return { nodes, edges, graphs }
}

/** 从全局图数据导出单个蓝图文件（保存入口） */
export function exportBlueprintFile(data: GraphData, graphId: string): BlueprintFile | null {
  const graph = data.graphs[graphId]
  if (!graph) return null
  return {
    id: graphId,
    title: graph.title,
    nodes: toFileNodes(graph.nodeIds.map((id) => data.nodes[id]).filter((n): n is BlueprintNode => Boolean(n))),
    edges: graph.nodeIds
      .flatMap((id) => collectEdgesOf(data, id))
      .map((e) => ({ ...e }))
  }
}

/** 归属规则：边保存在 from 端节点所在图；from 端节点缺失的孤儿边按 to 端归属 */
function collectEdgesOf(data: GraphData, nodeId: string): BlueprintEdge[] {
  return Object.values(data.edges).filter((e) => {
    if (e.from === nodeId) return true
    return e.to === nodeId && !data.nodes[e.from]
  })
}
