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
 */

import type { BlueprintEdge, BlueprintNode, GraphData, GraphView } from './blueprint'
import type { BlueprintFile, BlueprintFileNode } from './types'

/** 落盘节点：剥离 graphId（所属文件即 graphId） */
export function toFileNodes(nodes: BlueprintNode[]): Array<Omit<BlueprintFileNode, 'graphId'>> {
  return nodes.map(({ graphId: _graphId, ...rest }) => rest)
}

/** 解析文件：回填 graphId 为所属文件 id */
export function parseBlueprintFile(file: BlueprintFile): { nodes: BlueprintNode[]; edges: BlueprintEdge[] } {
  return {
    nodes: file.nodes.map((n) => ({ ...n, graphId: file.id })),
    edges: file.edges.map((e) => ({ ...e }))
  }
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
