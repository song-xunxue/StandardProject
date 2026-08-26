/**
 * 全局图存储（zustand）：节点表 + 边表 + 图视图 + 路由栈
 * M1 起由文件系统水合（novelStore 读取蓝图文件 → hydrateGraphData → hydrate）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M0 初版：内存版演示数据 + enterGraph/popTo 路由栈 + pathToGraph 祖先链
 *   2. M1：移除演示数据，新增 hydrate（文件水合）与 graphPaths（图 → 文件路径）
 */

import { create } from 'zustand'
import type { GraphData } from '@shared/blueprint'
import { pathToGraph } from '@/services/graphTraversal'

/** 路由栈状态与动作 */
interface GraphState extends GraphData {
  /** 图 id → 蓝图文件相对路径（保存时用） */
  graphPaths: Record<string, string>
  /** 根图（ownerNodeId 为 null 的图）id */
  rootGraphId: string | null
  /** 路由栈：从根图到当前图的 graphId 序列（面包屑数据源） */
  route: string[]
  selectedNodeId: string | null
  /** 文件水合：替换全部图数据；保留仍有效的当前图与选中节点（失效则回退根图/清空） */
  hydrate: (data: GraphData, paths: Record<string, string>) => void
  /** 进入子图（双击蓝图节点）；对非祖先目标则整体替换为目标的祖先路径 */
  enterGraph: (graphId: string) => void
  /** 面包屑回退到指定层级 */
  popTo: (index: number) => void
  /** 选中节点（上下文预览面板的目标） */
  selectNode: (id: string | null) => void
}

const emptyData: GraphData = { nodes: {}, edges: {}, graphs: {} }

export const useGraphStore = create<GraphState>()((set, get) => ({
  ...emptyData,
  graphPaths: {},
  rootGraphId: null,
  route: [],
  selectedNodeId: null,

  hydrate: (data, paths) => {
    const root = Object.values(data.graphs).find((g) => g.ownerNodeId === null)
    const rootId = root ? root.id : null
    // 保留仍有效的当前图（沿新数据重建祖先链），否则回退根图——避免文件保存把用户弹回根图
    const prev = get()
    const currentId = prev.route[prev.route.length - 1]
    let route: string[] = []
    if (currentId && data.graphs[currentId]) {
      route = pathToGraph(data, currentId)
    } else if (rootId) {
      route = [rootId]
    }
    const selected = prev.selectedNodeId && data.nodes[prev.selectedNodeId] ? prev.selectedNodeId : null
    set({ ...data, graphPaths: paths, rootGraphId: rootId, route, selectedNodeId: selected })
  },

  enterGraph: (graphId) => {
    const { graphs, route } = get()
    if (!graphs[graphId]) return
    // 目标是当前图的子图 → 入栈；否则（如跨图代理跳转）替换为目标的完整祖先路径
    if (route[route.length - 1] !== graphId) {
      const path = pathToGraph({ nodes: get().nodes, edges: get().edges, graphs }, graphId)
      set({ route: path.length > 0 ? path : route })
    }
  },

  popTo: (index) => {
    const { route, selectedNodeId, nodes } = get()
    if (index < 0 || index >= route.length) return
    const next = route.slice(0, index + 1)
    // 选中节点所属图不在新路由内时清空选中，避免预览面板展示画布外节点
    const selected = selectedNodeId ? nodes[selectedNodeId] : undefined
    if (selected && !next.includes(selected.graphId)) {
      set({ route: next, selectedNodeId: null })
    } else {
      set({ route: next })
    }
  },

  selectNode: (id) => set({ selectedNodeId: id })
}))
