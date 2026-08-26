/**
 * 图遍历纯函数（store 与上下文组装共用，消除重复实现）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M0 审查修订：自 graphStore/contextAssembly 抽出 pathToGraph/ancestorNodesOf，
 *      单一实现 + 直接单测（含 owner 链成环脏数据用例）
 */

import type { BlueprintNode, GraphData, GraphView } from '@/types/blueprint'

/**
 * 计算某图的祖先路径（根图 → 该图），用于路由栈替换与面包屑
 * 沿 ownerNodeId 链回溯；带 visited 防环（脏数据下不死循环，返回截断到环点的路径）
 */
export function pathToGraph(data: GraphData, graphId: string): string[] {
  const path: string[] = []
  const visited = new Set<string>()
  let current: GraphView | undefined = data.graphs[graphId]
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    path.unshift(current.id)
    if (current.ownerNodeId === null) break
    const owner: BlueprintNode | undefined = data.nodes[current.ownerNodeId]
    current = owner ? data.graphs[owner.graphId] : undefined
  }
  return path
}

/**
 * 某节点的上级蓝图链（自内向外）：节点所在图的拥有节点 → 拥有节点所在图的拥有节点 → …
 * 返回蓝图节点数组（含各级 summary 摘要卡，供上下文组装第 2 层注入）
 */
export function ancestorNodesOf(data: GraphData, nodeId: string): BlueprintNode[] {
  const result: BlueprintNode[] = []
  const visited = new Set<string>()
  const node = data.nodes[nodeId]
  if (!node) return result
  let owner: string | null = data.graphs[node.graphId]?.ownerNodeId ?? null
  while (owner && !visited.has(owner)) {
    visited.add(owner)
    const ownerNode = data.nodes[owner]
    if (!ownerNode) break
    result.push(ownerNode)
    owner = data.graphs[ownerNode.graphId]?.ownerNodeId ?? null
  }
  return result
}
