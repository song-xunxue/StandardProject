/**
 * 全局图存储（zustand）：节点表 + 边表 + 图视图 + 路由栈 + 画布编辑（M2）
 * M1 起由文件系统水合（novelStore 读取蓝图文件 → hydrateGraphData → hydrate）
 * M2 新增变更 action 与保存编排：结构变更（增删节点/边、连线改型）立即落盘，
 * 属性/位置变更走 600ms 防抖——避免「子图文件创建触发 watcher → hydrate 覆盖
 * 未落盘内存」的竞态（外部编辑竞态见计划书风险 R6，v1 接受最后写者赢）
 *
 * 审查修订（2026-08-26）：
 *   - 选中态改数组化受控（selectedNodeIds/selectedEdgeIds）：React Flow 的 props
 *     全量重建会丢弃其内部选中态，必须由我们回灌 selected 才能保住属性面板会话
 *   - hydrate 增加脏图保护：未落盘的图保留内存版（我们是这些图的最后写者），
 *     防止自身保存触发的 watcher 回推把防抖窗口内的编辑回滚
 *   - 根图判定沿用 prev.rootGraphId：删除蓝图节点留下的孤儿子图（ownerNodeId=null）
 *     不再干扰打开小说时的初始路由
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M0 初版：内存版演示数据 + enterGraph/popTo 路由栈 + pathToGraph 祖先链
 *   2. M1：移除演示数据，新增 hydrate（文件水合）与 graphPaths（图 → 文件路径）
 *   3. M2：新增节点/边变更 action、脏图集合与防抖保存（exportBlueprintFile →
 *      fs.saveBlueprint）、边选中态、蓝图节点 8 层嵌套上限拦截（ADR-12）
 */

import { create } from 'zustand'
import { MAX_NESTING_DEPTH } from '@shared/blueprint'
import type { BlueprintEdge, BlueprintNode, EdgeType, GraphData, GraphView } from '@shared/blueprint'
import { exportBlueprintFile } from '@shared/blueprintCodec'
import { pathToGraph } from '@/services/graphTraversal'

/** 跨图代理节点 id 前缀（约定见 shared/blueprint.ts；连线端点可能带此前缀，换回真实 id） */
const PROXY_PREFIX = 'proxy:'

const stripProxy = (id: string): string => (id.startsWith(PROXY_PREFIX) ? id.slice(PROXY_PREFIX.length) : id)

/** 节点属性可编辑字段（type 不可变：blueprint → text 会遗留孤儿子图） */
export type NodeEditableFields = Partial<
  Pick<BlueprintNode, 'title' | 'tags' | 'aliases' | 'prompt' | 'summary' | 'refTarget' | 'refGraphId' | 'size'>
>

/** 新建节点输入（落点坐标由画布层按当前视口计算） */
export interface AddNodeInput {
  type: BlueprintNode['type']
  title: string
  position: { x: number; y: number }
  /** 目标图 id（缺省=当前画布；左栏「在某蓝图内新建子蓝图」时指定） */
  graphId?: string
  /** 仅 blueprint：子图 id（需先由 fs.createFile 建好子图文件并 refreshTree） */
  refGraphId?: string
  /** 仅 ref：指向的章节/蓝图文件相对路径 */
  refTarget?: string
  /** 资源模板插入时携带的完整草稿字段（缺省为空值） */
  tags?: string[]
  aliases?: string[]
  prompt?: string
  summary?: string
  size?: { width: number; height: number }
}

/** 路由栈状态与动作 */
interface GraphState extends GraphData {
  /** 图 id → 蓝图文件相对路径（保存时用） */
  graphPaths: Record<string, string>
  /** 根图（ownerNodeId 为 null 且被认定的图）id */
  rootGraphId: string | null
  /** 路由栈：从根图到当前图的 graphId 序列（面包屑数据源） */
  route: string[]
  /** 受控选中（数组：支持框选多选；属性面板取首个） */
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  /** 待保存的图集合 */
  dirtyGraphIds: string[]
  /** 正在落盘的图集合（与脏图一并受 hydrate 保护：保存窗口内的内存版即最新真相） */
  savingGraphIds: string[]
  /** 是否正在落盘（画布工具条保存状态指示） */
  saving: boolean
  saveError: string | null
  /**
   * 文件水合：替换全部图数据；脏图保留内存版（见文件头审查修订）；
   * 保留仍有效的当前图与选中节点/边（失效则回退根图/清空）
   */
  hydrate: (data: GraphData, paths: Record<string, string>) => void
  /** 进入子图（双击蓝图节点）；对非祖先目标则整体替换为目标的祖先路径；超 8 层拒绝（ADR-12） */
  enterGraph: (graphId: string) => void
  /** 面包屑回退到指定层级 */
  popTo: (index: number) => void
  /** 单选节点（画布点击/代理跳转；清空边选中） */
  selectNode: (id: string | null) => void
  /** 单选边（清空节点选中） */
  selectEdge: (id: string | null) => void
  /** 画布 onSelectionChange 全量同步（内容相同则跳过，防受控选中回环） */
  setSelection: (nodeIds: string[], edgeIds: string[]) => void
  /** 创建节点（落在当前图）：返回新节点 id；蓝图节点超 8 层嵌套上限时返回 null（ADR-12） */
  addNode: (input: AddNodeInput) => string | null
  /** 编辑节点属性（标题/标签/prompt/summary/refTarget 等） */
  updateNode: (id: string, patch: NodeEditableFields) => void
  /** 拖拽结束批量回写坐标（proxy 代理节点由画布层过滤，不进此列表） */
  moveNodes: (moves: Array<{ id: string; position: { x: number; y: number } }>) => void
  /** 删除节点（级联删除任一端相连接的边，含跨图边；子图文件不删——纯文件真相源不静默丢数据） */
  removeNodes: (ids: string[]) => void
  /**
   * 创建语义连线：端点可带 proxy: 前缀（画布上连到跨图代理节点即创建跨图边）；
   * 自环与同方向重复边拒绝（返回 null）
   */
  addEdge: (from: string, to: string, type: EdgeType) => string | null
  /** 修改连线类型（立即落盘）与 label（走防抖） */
  updateEdge: (id: string, patch: { type?: EdgeType; label?: string }) => void
  /** 删除连线 */
  removeEdge: (id: string) => void
  /** 立即落盘全部脏图（结构变更在 action 内自动调用；属性/位置变更由防抖定时器调用） */
  flushDirty: () => Promise<void>
}

const emptyData: GraphData = { nodes: {}, edges: {}, graphs: {} }

/** 属性/位置变更的保存防抖（与章节编辑器一致取 600ms） */
const SAVE_DEBOUNCE_MS = 600
let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave(): void {
  if (saveTimer !== null) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void useGraphStore.getState().flushDirty()
  }, SAVE_DEBOUNCE_MS)
}

/** 立即冲刷（取消挂起的防抖） */
function flushNow(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  void useGraphStore.getState().flushDirty()
}

const api = (): typeof window.api => {
  if (typeof window === 'undefined' || !window.api) throw new Error('window.api 不可用（需在 Electron 中运行）')
  return window.api
}

/** 生成节点/边 id（8 位随机段，对齐 fileService 的 g-xxxx 风格；禁 proxy: 前缀无冲突） */
const newId = (prefix: string): string => `${prefix}-${crypto.randomUUID().slice(0, 8)}`

/** 脏集合并集工具 */
const withDirty = (state: GraphState, gids: string[]): string[] => Array.from(new Set([...state.dirtyGraphIds, ...gids]))

/** 两数组是否含相同元素集合（顺序无关；受控选中防回环用） */
const sameIdSet = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x) => b.includes(x))

export const useGraphStore = create<GraphState>()((set, get) => ({
  ...emptyData,
  graphPaths: {},
  rootGraphId: null,
  route: [],
  selectedNodeIds: [],
  selectedEdgeIds: [],
  dirtyGraphIds: [],
  savingGraphIds: [],
  saving: false,
  saveError: null,

  hydrate: (data, paths) => {
    const prev = get()
    // 脏图/保存中图保护：未落盘或正在落盘的图整体保留内存版（节点/图视图/归属边），
    // 我们是这些图的最后写者——自身保存触发的 watcher 回推不得回滚防抖窗口内的编辑，
    // 也不得用「保存尚未完成时的旧磁盘数据」覆盖已导出的内存版
    const dirty = new Set([...prev.dirtyGraphIds, ...prev.savingGraphIds])
    const nodes: Record<string, BlueprintNode> = {}
    const graphs: Record<string, GraphView> = {}
    const mergedPaths: Record<string, string> = { ...paths }
    for (const gid of dirty) {
      const g = prev.graphs[gid]
      if (!g) continue
      graphs[gid] = g
      for (const nid of g.nodeIds) {
        const n = prev.nodes[nid]
        if (n) nodes[nid] = n
      }
      // 新数据没有该图路径时保留旧路径（如孤儿文件被外部删除，flushDirty 仍可复活）
      if (!mergedPaths[gid]) mergedPaths[gid] = prev.graphPaths[gid]
    }
    // 非脏图按磁盘数据合入；脏图的磁盘节点跳过（内存删除的节点不得从磁盘复活）
    for (const [id, n] of Object.entries(data.nodes)) {
      if (dirty.has(n.graphId)) continue
      if (!nodes[id]) nodes[id] = n
    }
    for (const [id, g] of Object.entries(data.graphs)) {
      if (!graphs[id]) graphs[id] = g
    }
    // 边归属 from 端节点所在图（与 codec 导出规则一致）：脏图的边以内存版为准
    const edges: Record<string, BlueprintEdge> = {}
    for (const e of Object.values(data.edges)) {
      const fromGid = prev.nodes[e.from]?.graphId ?? data.nodes[e.from]?.graphId
      if (fromGid && dirty.has(fromGid)) continue
      edges[e.id] = e
    }
    for (const e of Object.values(prev.edges)) {
      const fromNode = prev.nodes[e.from]
      if (fromNode && dirty.has(fromNode.graphId)) edges[e.id] = e
    }
    const merged: GraphData = { nodes, edges, graphs }

    // 根图判定：优先沿用 prev.rootGraphId（仍为无主图时）——孤儿子图（删除蓝图节点
    // 后 ownerNodeId=null）不再凭文件名排序抢走根图身份
    let rootId: string | null = null
    if (prev.rootGraphId && graphs[prev.rootGraphId]?.ownerNodeId === null) {
      rootId = prev.rootGraphId
    } else {
      rootId = Object.values(graphs).find((g) => g.ownerNodeId === null)?.id ?? null
    }
    // 保留仍有效的当前图（沿新数据重建祖先链），否则回退根图——避免文件保存把用户弹回根图
    const currentId = prev.route[prev.route.length - 1]
    let route: string[] = []
    if (currentId && graphs[currentId]) {
      route = pathToGraph(merged, currentId)
    } else if (rootId) {
      route = [rootId]
    }
    const selNodes = prev.selectedNodeIds.filter((id) => Boolean(nodes[id]))
    const selEdges = prev.selectedEdgeIds.filter((id) => Boolean(edges[id]))
    set({
      ...merged,
      graphPaths: mergedPaths,
      rootGraphId: rootId,
      route,
      selectedNodeIds: selNodes,
      selectedEdgeIds: selEdges
    })
  },

  enterGraph: (graphId) => {
    const { graphs, route } = get()
    if (!graphs[graphId]) return
    // 目标是当前图的子图 → 入栈；否则（如跨图代理跳转）替换为目标的完整祖先路径
    if (route[route.length - 1] !== graphId) {
      const path = pathToGraph({ nodes: get().nodes, edges: get().edges, graphs }, graphId)
      // ADR-12：目标祖先链超 8 层（异常深的外部构造文件）拒绝进入
      if (path.length > MAX_NESTING_DEPTH) return
      set({ route: path.length > 0 ? path : route })
    }
  },

  popTo: (index) => {
    const { route, selectedNodeIds, nodes } = get()
    if (index < 0 || index >= route.length) return
    const next = route.slice(0, index + 1)
    // 选中节点所属图不在新路由内时清空选中，避免预览面板展示画布外节点
    const selected = selectedNodeIds.filter((id) => next.includes(nodes[id]?.graphId ?? ''))
    if (selected.length !== selectedNodeIds.length) {
      set({ route: next, selectedNodeIds: selected })
    } else {
      set({ route: next })
    }
  },

  selectNode: (id) =>
    set((s) => ({
      selectedNodeIds: id ? [id] : [],
      selectedEdgeIds: id ? [] : s.selectedEdgeIds
    })),

  selectEdge: (id) =>
    set((s) => ({
      selectedEdgeIds: id ? [id] : [],
      selectedNodeIds: id ? [] : s.selectedNodeIds
    })),

  setSelection: (nodeIds, edgeIds) => {
    const prev = get()
    // 内容相同直接跳过：受控选中回灌 → RF onSelectionChange 再通知 → 无状态变化，断开回环
    if (sameIdSet(prev.selectedNodeIds, nodeIds) && sameIdSet(prev.selectedEdgeIds, edgeIds)) return
    set({ selectedNodeIds: nodeIds, selectedEdgeIds: edgeIds })
  },

  addNode: (input) => {
    const { route, graphs, nodes } = get()
    const graphId = input.graphId ?? route[route.length - 1]
    if (!graphId || !graphs[graphId]) return null
    // ADR-12：蓝图节点承载下一层子图，目标图已达第 8 层深度时禁止创建（UI 层负责提示）
    if (input.type === 'blueprint') {
      const depth = input.graphId
        ? pathToGraph({ nodes: get().nodes, edges: get().edges, graphs }, input.graphId).length
        : route.length
      if (depth >= MAX_NESTING_DEPTH) return null
    }
    const id = newId('n')
    const node: BlueprintNode = {
      id,
      type: input.type,
      title: input.title,
      graphId,
      refGraphId: input.refGraphId,
      refTarget: input.refTarget,
      tags: input.tags ?? [],
      aliases: input.aliases ?? [],
      prompt: input.prompt ?? '',
      summary: input.summary ?? '',
      position: input.position,
      size: input.size ?? { width: 160, height: 50 }
    }
    const graph = graphs[graphId]!
    set({
      nodes: { ...nodes, [id]: node },
      graphs: { ...graphs, [graphId]: { ...graph, nodeIds: [...graph.nodeIds, id] } },
      selectedNodeIds: [id],
      selectedEdgeIds: [],
      dirtyGraphIds: withDirty(get(), [graphId])
    })
    flushNow()
    return id
  },

  updateNode: (id, patch) => {
    const node = get().nodes[id]
    if (!node) return
    set({
      nodes: { ...get().nodes, [id]: { ...node, ...patch } },
      dirtyGraphIds: withDirty(get(), [node.graphId])
    })
    scheduleSave()
  },

  moveNodes: (moves) => {
    const nodes = { ...get().nodes }
    const gids: string[] = []
    for (const m of moves) {
      const node = nodes[m.id]
      if (!node) continue
      nodes[m.id] = { ...node, position: m.position }
      gids.push(node.graphId)
    }
    if (gids.length === 0) return
    set({ nodes, dirtyGraphIds: withDirty(get(), gids) })
    scheduleSave()
  },

  removeNodes: (ids) => {
    const state = get()
    if (ids.length === 0) return
    const idSet = new Set(ids)
    // 级联删除任一端命中的边；边的归属图 = from 端节点所在图（与 codec 导出规则一致）
    const removedEdgeIds: string[] = []
    const dirty = new Set<string>()
    for (const e of Object.values(state.edges)) {
      if (idSet.has(e.from) || idSet.has(e.to)) {
        removedEdgeIds.push(e.id)
        const owner = state.nodes[e.from] ?? state.nodes[e.to]
        if (owner) dirty.add(owner.graphId)
      }
    }
    const nodes = { ...state.nodes }
    for (const id of ids) {
      const node = nodes[id]
      if (node) {
        dirty.add(node.graphId)
        delete nodes[id]
      }
    }
    const edges = { ...state.edges }
    for (const eid of removedEdgeIds) delete edges[eid]
    const graphs = { ...state.graphs }
    for (const g of Object.values(graphs)) {
      const filtered = g.nodeIds.filter((nid) => !idSet.has(nid))
      if (filtered.length !== g.nodeIds.length) graphs[g.id] = { ...g, nodeIds: filtered }
    }
    set({
      nodes,
      edges,
      graphs,
      selectedNodeIds: state.selectedNodeIds.filter((id) => !idSet.has(id)),
      selectedEdgeIds: state.selectedEdgeIds.filter((id) => !removedEdgeIds.includes(id)),
      dirtyGraphIds: withDirty(state, [...dirty])
    })
    flushNow()
  },

  addEdge: (fromRaw, toRaw, type) => {
    const from = stripProxy(fromRaw)
    const to = stripProxy(toRaw)
    const state = get()
    if (!state.nodes[from] || !state.nodes[to]) return null
    if (from === to) return null
    // 同方向重复边拒绝（视觉重叠难分辨）；反向边允许
    if (Object.values(state.edges).some((e) => e.from === from && e.to === to)) return null
    const id = newId('e')
    const edge: BlueprintEdge = { id, from, to, type }
    // 边保存在 from 端节点所在图（codec 归属规则）
    const ownerGraphId = state.nodes[from]!.graphId
    set({
      edges: { ...state.edges, [id]: edge },
      selectedEdgeIds: [id],
      selectedNodeIds: [],
      dirtyGraphIds: withDirty(state, [ownerGraphId])
    })
    flushNow()
    return id
  },

  updateEdge: (id, patch) => {
    const state = get()
    const edge = state.edges[id]
    if (!edge) return
    const owner = state.nodes[edge.from] ?? state.nodes[edge.to]
    set({
      edges: { ...state.edges, [id]: { ...edge, ...patch } },
      dirtyGraphIds: withDirty(state, owner ? [owner.graphId] : [])
    })
    // 连线改型是离散的结构语义 → 立即落盘；label 是连续文本编辑 → 防抖
    if (patch.type !== undefined) flushNow()
    else scheduleSave()
  },

  removeEdge: (id) => {
    const state = get()
    const edge = state.edges[id]
    if (!edge) return
    const edges = { ...state.edges }
    delete edges[id]
    const owner = state.nodes[edge.from] ?? state.nodes[edge.to]
    set({
      edges,
      selectedEdgeIds: state.selectedEdgeIds.filter((eid) => eid !== id),
      dirtyGraphIds: withDirty(state, owner ? [owner.graphId] : [])
    })
    flushNow()
  },

  flushDirty: async () => {
    const state = get()
    if (state.dirtyGraphIds.length === 0) return
    if (state.saving) {
      scheduleSave() // 上一轮保存进行中：稍后重试
      return
    }
    const pending = [...state.dirtyGraphIds]
    set({ dirtyGraphIds: [], saving: true, savingGraphIds: pending, saveError: null })
    const failed: string[] = []
    for (const gid of pending) {
      const path = get().graphPaths[gid]
      // 无对应文件路径（新建子图文件尚未被 readTree 收录）：跳过，待水合补齐后由下次变更带出
      if (!path) continue
      const file = exportBlueprintFile(get(), gid)
      if (!file) continue
      try {
        await api().fs.saveBlueprint(path, file)
      } catch (err) {
        console.error(`[graphStore] 蓝图保存失败 ${path}:`, err)
        failed.push(gid)
      }
    }
    // 合并保存期间新增的脏图；失败的图保留在脏集合，由下次防抖/变更重试
    const stillDirty = Array.from(new Set([...failed, ...get().dirtyGraphIds]))
    set({
      saving: false,
      savingGraphIds: [],
      dirtyGraphIds: stillDirty,
      saveError: failed.length > 0 ? '部分蓝图保存失败，将在下次编辑时重试' : null
    })
    if (failed.length > 0) scheduleSave()
  }
}))
