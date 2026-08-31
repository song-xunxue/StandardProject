/**
 * 蓝图画布：store 驱动的 React Flow 集成（M2 完整编辑版）
 * 能力：路由式子图进入（双击蓝图节点）/ 面包屑回退 / 跨图边代理节点渲染与跳转 /
 *       三类节点创建编辑（工具条）/ 语义连线创建·改型（属性面板）/ 节点拖拽持久化 /
 *       标签着色 / Delete 删除选中 / 小地图 / 黑色点阵网格
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. 初版：静态演示节点
 *   2. M0：接入 graphStore——当前图节点渲染、双击进入子图（key 重挂实例）、
 *      跨图边另一端渲染为虚线代理节点（双击跳转其所属图并选中）
 *   3. M0 审查修订：修复「仅 to 端在本图」的跨图边悬空缺陷（端点映射改为对称的
 *      fromIn/toIn 判定）；proxy 前缀处理统一为 isProxyId/remoteIdOf 工具函数
 *   4. M2：节点标签着色与 chips 渲染、ref 节点 § 标识与双击打开指向、连线创建
 *      （onConnect，连到代理节点即跨图边）、拖拽结束坐标回写（onNodeDragStop）、
 *      Delete 键删除（onNodesDelete/onEdgesDelete）、选中态通知（onSelectionChange）、
 *      画布工具条与资源库浮层挂载
 *
 * 2026-08-28
 * 变更说明：
 *   1. M5：开启 onlyRenderVisibleElements 视口虚拟化（大画布只渲染可见节点/边）。
 *      安全性依据（@xyflow 源码 getNodesInside）：未测量节点 forceInitialRender
 *      必定渲染——首帧全渲染完成测量后裁剪才生效，fitView/拖拽/选中机制不受影响；
 *      未测量节点的存在也保证 dimensions 回灌陷阱（见下方镜像注释）不因虚拟化加剧
 *
 * 2026-08-30
 * 变更说明：
 *   1. 体验优化批次：节点右键菜单（删除（确认）/ 进入子图 / 打开指向，与空白处
 *      创建菜单同族）；菜单实现迁移共享 useContextMenu hook
 *   2. 审查修复存量缺陷：Delete 键删除改为自实现 window keydown（作用于 store 显式
 *      选中集 + dialogConfirm）——M3 联调起 select 变更不回灌镜像，RF 受控模式下
 *      永无内部选中集，deleteKeyCode 路径实际不可达（「Delete 删除选中」名存实亡）
 *
 * 2026-08-31
 * 变更说明：
 *   1. 夜间性能重构：rfNodes/rfEdges 增量缓存（源对象引用未变即复用上次构建产物——
 *      使 graphStore.mergeRefresh 的引用保护传导到 RF 层，无关保存回推不再重渲全图
 *      可见节点）；nodeMirror 等价跳过（逐项 id/position/data/style 一致时不再 set，
 *      消除 dragStop 与回推的第二轮全图渲染）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactElement, ReactNode, RefObject } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  MarkerType,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { MAX_NESTING_DEPTH } from '@shared/blueprint'
import type { BlueprintEdge, BlueprintNode, EdgeType, NodeType } from '@shared/blueprint'
import type { TagDef } from '@shared/tags'
import { nodeAccentColor, tagColorOf } from '@shared/tags'
import { pathToGraph } from '@/services/graphTraversal'
import { useGraphStore } from '@/store/graphStore'
import { useNovelStore } from '@/store/novelStore'
import { dialogConfirm } from '@/store/dialogStore'
import { Breadcrumb } from './Breadcrumb'
import { CanvasToolbar, canvasCreateBridge } from './CanvasToolbar'
import { ResourcePanel } from './ResourcePanel'
import { useContextMenu } from '@/components/useContextMenu'

/** 连线视觉映射（ADR-15 语义：箭头=因果/顺序，直线=关联，虚线=参考/伏笔） */
const EDGE_VISUAL: Record<EdgeType, { stroke: string; dashed: boolean; marker: boolean }> = {
  arrow: { stroke: '#6c9ef8', dashed: false, marker: true },
  line: { stroke: '#9da0a8', dashed: false, marker: false },
  dashed: { stroke: '#c8a2f0', dashed: true, marker: false }
}

/** 跨图代理节点 id 前缀（约定：真实节点 id 禁止以此开头，见 types/blueprint.ts） */
const PROXY_PREFIX = 'proxy:'

const isProxyId = (id: string): boolean => id.startsWith(PROXY_PREFIX)
const remoteIdOf = (id: string): string => id.slice(PROXY_PREFIX.length)

const basename = (path: string): string => path.split('/').pop() ?? path

/** MiniMap 着色兜底常量（避免每节点分配临时对象） */
const EMPTY_TAGS_NODE: { tags: string[] } = { tags: [] }

/** 右键菜单的节点创建项（M3 交互调整：创建入口移入画布右键菜单） */
const CREATE_MENU_ITEMS: Array<{ type: NodeType; icon: string; label: string; hint: string }> = [
  { type: 'blueprint', icon: '◆', label: '新建蓝图节点', hint: '可进入的子图（双击进入）' },
  { type: 'text', icon: '¶', label: '新建文本节点', hint: '纯文本创作单元' },
  { type: 'ref', icon: '§', label: '新建引用节点', hint: '指向章节/蓝图（属性面板选择指向）' }
]

/**
 * 节点样式：深色卡片；有标签时边框取主标签色（标签决定着色，FR-07），
 * 无标签按类型回退（blueprint 蓝 / text·ref 灰 / proxy 虚线紫）
 */
function nodeStyle(kind: NodeType | 'proxy', accent?: string): CSSProperties {
  const base: CSSProperties = {
    background: '#26282b',
    color: '#dcdfe3',
    borderRadius: 6,
    fontSize: 12,
    padding: '10px 14px',
    width: 160
  }
  if (accent) base.border = `1.5px solid ${accent}`
  else if (kind === 'blueprint') base.border = '1px solid rgba(108, 158, 248, 0.55)'
  else if (kind === 'proxy') base.border = '1px dashed rgba(200, 162, 240, 0.7)'
  else base.border = '1px solid #3f3f46'
  return base
}

/** 节点内容：标题（◆ 蓝图 / § 引用 前缀）+ ref 指向 + AI 可见性标记 + 标签 chips */
function renderNodeLabel(node: BlueprintNode, tagLibrary: TagDef[]): ReactNode {
  const prefix = node.type === 'blueprint' ? '◆ ' : node.type === 'ref' ? '§ ' : ''
  return (
    <div className="bp-node-label">
      <span className="bp-node-title">{prefix}
        {node.title}
        {node.aiVisibility === 'never' && <span className="bp-node-aivis" title="AI 永不注入（防剧透）">⊘AI</span>}
        {node.aiVisibility === 'always' && <span className="bp-node-aivis always" title="AI 常驻注入">⊕AI</span>}
      </span>
      {node.type === 'ref' && node.refTarget && <span className="bp-node-ref">→ {basename(node.refTarget)}</span>}
      {node.tags.length > 0 && (
        <span className="bp-node-tags">
          {node.tags.map((t) => (
            <span key={t} className="bp-node-tag" style={{ '--tag-color': tagColorOf(tagLibrary, t) ?? '#9da0a8' } as CSSProperties}>
              <span className="bp-node-tag-dot" />
              {t}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}

/** 画布主体（ReactFlowProvider 内，可用 useReactFlow 系 hooks 与节点交互事件） */
function BlueprintFlow(props: { bodyRef: RefObject<HTMLDivElement> }): ReactElement {
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const graphs = useGraphStore((s) => s.graphs)
  const route = useGraphStore((s) => s.route)
  const enterGraph = useGraphStore((s) => s.enterGraph)
  const selectNode = useGraphStore((s) => s.selectNode)
  const setSelection = useGraphStore((s) => s.setSelection)
  const addEdge = useGraphStore((s) => s.addEdge)
  const moveNodes = useGraphStore((s) => s.moveNodes)
  const removeNodesAction = useGraphStore((s) => s.removeNodes)
  const tagLibrary = useNovelStore((s) => s.novel?.tagLibrary ?? [])

  const currentGraphId = route[route.length - 1]
  const graph = graphs[currentGraphId]

  // MiniMap 着色回调稳定化：内联闭包会令 memo 失效、拖拽期间每帧全量重算着色
  const minimapNodeColor = useCallback(
    (n: Node): string => nodeAccentColor(tagLibrary, nodes[n.id] ?? EMPTY_TAGS_NODE) ?? '#3f3f46',
    [tagLibrary, nodes]
  )

  // ---- 右键菜单（useContextMenu 共享实现；target 区分 空白创建 / 节点操作 两类） ----
  const { menu: ctxMenu, setMenu: setCtxMenu, menuRef: ctxMenuRef } = useContextMenu<
    { kind: 'pane' } | { kind: 'node'; id: string }
  >()
  /** 节点菜单目标（菜单开着时节点被外部删除则不渲染菜单） */
  const menuNode = ctxMenu?.target.kind === 'node' ? (nodes[ctxMenu.target.id] ?? null) : null

  // ---- 拖拽跟手（受控节点镜像）：RF 受控模式下必须接 onNodesChange，否则拖拽变更被丢弃、
  // 节点只在 dragStop 提交时跳变。镜像只承接 position/remove——dimensions（尺寸测量）与
  // select 若回灌会与 RF 内部测量/选中形成「重建→再测量→再变更」无限循环打满主线程 ----
  const [nodeMirror, setNodeMirror] = useState<Node[]>([])
  const draggingRef = useRef(false)
  /** rfNodes/rfEdges 增量缓存（2026-08-30 夜间重构）：src=源对象（BlueprintNode/BlueprintEdge/代理输入元组），
   *  rf=上次构建产物；源引用未变即复用，使 store 层的引用保护传导到 RF 层（见 memo 内注释） */
  const buildCacheRef = useRef<{
    tagLib: TagDef[]
    rfNodes: Map<string, { src: unknown; rf: Node }>
    rfEdges: Map<string, { src: BlueprintEdge; rf: Edge }>
  }>({ tagLib: [], rfNodes: new Map(), rfEdges: new Map() })
  const handleNodesChange = (changes: NodeChange[]): void => {
    const relevant = changes.filter((c) => c.type === 'position' || c.type === 'remove')
    if (relevant.length === 0) return
    setNodeMirror((prev) => applyNodeChanges(relevant, prev))
  }

  const { rfNodes, rfEdges } = useMemo(() => {
    if (!graph) return { rfNodes: [] as Node[], rfEdges: [] as Edge[] }
    const memberIds = new Set(graph.nodeIds)

    // ---- 增量缓存（2026-08-30 夜间重构）：源对象引用未变时复用上次构建的 RF 对象 ----
    // 动机：graphStore.mergeRefresh 精心维持「未变节点对象引用稳定」，但此前 memo 每次
    // 依赖变化（如无关保存回推换 nodes 全表引用）都重建全部 rfNode/rfEdge 新对象——
    // RF 按对象身份 memo 的内部优化全部失效，当前图可见节点整体重渲。缓存把引用保护
    // 真正传导到 RF 层：未变条目命中缓存 → RF diff 无 replace → NodeWrapper 跳过渲染
    const cache = buildCacheRef.current
    if (cache.tagLib !== tagLibrary) {
      // 标签库影响全部节点的着色与标签 chips —— 整体失效（标签操作低频，代价可忽略）
      cache.tagLib = tagLibrary
      cache.rfNodes.clear()
    }

    /** 真实节点：BlueprintNode 引用未变 → 复用 */
    const nodeOf = (n: BlueprintNode): Node => {
      const hit = cache.rfNodes.get(n.id)
      if (hit && hit.src === n) return hit.rf
      const rf: Node = {
        id: n.id,
        position: n.position,
        data: { label: renderNodeLabel(n, tagLibrary) },
        style: nodeStyle(n.type, nodeAccentColor(tagLibrary, n))
      }
      cache.rfNodes.set(n.id, { src: n, rf })
      return rf
    }

    /** 代理节点：远端/本地节点引用与所属图标题均未变 → 复用 */
    const proxyOf = (remote: BlueprintNode, local: BlueprintNode, graphTitle: string): Node => {
      const key = `proxy:${remote.id}`
      const hit = cache.rfNodes.get(key)
      if (hit) {
        const src = hit.src as { remote: BlueprintNode; local: BlueprintNode; graphTitle: string }
        if (src.remote === remote && src.local === local && src.graphTitle === graphTitle) return hit.rf
      }
      const rf: Node = {
        id: key,
        position: { x: local.position.x + 280, y: local.position.y + 40 },
        data: { label: `↗ ${remote.title}（${graphTitle}）` },
        style: nodeStyle('proxy'),
        draggable: true
      }
      cache.rfNodes.set(key, { src: { remote, local, graphTitle }, rf })
      return rf
    }

    /** 边：源边引用与端点映射（真实/代理）均未变 → 复用 */
    const edgeOf = (e: BlueprintEdge, source: string, target: string): Edge => {
      const hit = cache.rfEdges.get(e.id)
      if (hit && hit.src === e && hit.rf.source === source && hit.rf.target === target) return hit.rf
      const visual = EDGE_VISUAL[e.type]
      const rf: Edge = {
        id: e.id,
        source,
        target,
        label: e.label,
        labelStyle: { fill: '#dcdfe3', fontSize: 11 },
        labelBgStyle: { fill: '#1c1d20' },
        markerEnd: visual.marker ? { type: MarkerType.ArrowClosed, color: visual.stroke } : undefined,
        style: {
          stroke: visual.stroke,
          strokeWidth: 1.5,
          ...(visual.dashed ? { strokeDasharray: '6 4' } : {})
        }
      }
      cache.rfEdges.set(e.id, { src: e, rf })
      return rf
    }

    // 本图节点（标签决定着色；内容为标题 + ref 指向 + 标签 chips）
    // 选中态不回灌（非受控）：RF 内部维护视觉选中，store 选中只在用户点击时变化——
    // 受控 selected 回灌会在结构变更（建节点/建边）时与 RF 内部状态形成无限渲染循环
    const rfNodes: Node[] = []
    for (const id of graph.nodeIds) {
      const n = nodes[id]
      if (n) rfNodes.push(nodeOf(n))
    }

    // 跨图边：另一端不在本图 → 生成代理节点（proxy:前缀），摆放于本图连出节点右侧
    // 去重（多条跨图边指向同一远端节点时只画一个代理）
    const seenProxies = new Set<string>()
    // 本图边 + 跨图边（连到代理节点）
    // 端点在本图 → 用真实节点 id；不在本图 → 用其代理节点 id（两个方向对称处理）
    const rfEdges: Edge[] = []
    for (const e of Object.values(edges)) {
      const fromIn = memberIds.has(e.from)
      const toIn = memberIds.has(e.to)
      if (!fromIn && !toIn) continue // 两端都不在本图，不渲染
      if (fromIn !== toIn) {
        // 跨图边：补代理节点
        const localId = fromIn ? e.from : e.to
        const remoteId = fromIn ? e.to : e.from
        const remote = nodes[remoteId]
        const local = nodes[localId]
        if (remote && local && !seenProxies.has(`proxy:${remoteId}`)) {
          seenProxies.add(`proxy:${remoteId}`)
          rfNodes.push(proxyOf(remote, local, graphs[remote.graphId]?.title ?? '外部'))
        }
      }
      rfEdges.push(edgeOf(e, fromIn ? e.from : `${PROXY_PREFIX}${e.from}`, toIn ? e.to : `${PROXY_PREFIX}${e.to}`))
    }

    // 缓存瘦身：清理本次未命中的陈旧条目（节点/边已删除），防跨图切换长期驻留
    for (const key of cache.rfNodes.keys()) {
      if (!seenProxies.has(key) && !memberIds.has(key)) cache.rfNodes.delete(key)
    }
    const liveEdgeIds = new Set(rfEdges.map((e) => e.id))
    for (const key of cache.rfEdges.keys()) {
      if (!liveEdgeIds.has(key)) cache.rfEdges.delete(key)
    }

    return { rfNodes, rfEdges }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, nodes, edges, graphs, tagLibrary])

  // store 派生结果同步进本地镜像；拖拽进行中跳过——否则 watcher→hydrate 的重建
  // 会把拖拽中间态整体重置（节点跳回原点并以错误基准继续）。
  // 等价跳过（2026-08-30 夜间重构）：镜像与新 rfNodes 逐项 id/position 一致且
  // data/style 引用一致（缓存复用保证）时不再 set——消除 dragStop 与无关保存回推的
  // 第二轮全图渲染
  useEffect(() => {
    if (draggingRef.current) return
    setNodeMirror((prev) => {
      if (
        prev.length === rfNodes.length &&
        prev.every((m, i) => {
          const n = rfNodes[i]!
          return m.id === n.id && m.position.x === n.position.x && m.position.y === n.position.y && m.data === n.data && m.style === n.style
        })
      ) {
        return prev // 内容等价：保持引用，跳过本次同步
      }
      return rfNodes
    })
  }, [rfNodes])

  /** 用户点击节点 → 选中（显式事件驱动，不随 props 重建波动；代理节点映射回远端） */
  const handleNodeClick = (_e: unknown, node: Node): void => {
    setSelection([isProxyId(node.id) ? remoteIdOf(node.id) : node.id], [])
  }

  /** 用户点击边 → 选中 */
  const handleEdgeClick = (_e: unknown, edge: Edge): void => {
    setSelection([], [edge.id])
  }

  /** 点击空白 → 清空选中并收起右键菜单 */
  const handlePaneClick = (): void => {
    setSelection([], [])
    setCtxMenu(null)
  }

  /** 端口拖拽连线：默认创建箭头型（改型在属性面板）；目标为代理节点时即跨图边 */
  const handleConnect = (conn: Connection): void => {
    if (!conn.source || !conn.target) return
    // 两端都是代理（跨图↔跨图）：产生的边不属于当前画布，创建即不可见——忽略并提示
    const gs = useGraphStore.getState()
    const graphId = gs.route.slice(-1)[0]
    const memberIds = new Set(graphId ? (gs.graphs[graphId]?.nodeIds ?? []) : [])
    const fromReal = isProxyId(conn.source) ? remoteIdOf(conn.source) : conn.source
    const toReal = isProxyId(conn.target) ? remoteIdOf(conn.target) : conn.target
    if (!memberIds.has(fromReal) && !memberIds.has(toReal)) {
      console.warn('[BlueprintCanvas] 拒绝在两个跨图代理之间创建连线（该边不属于当前画布）')
      return
    }
    addEdge(conn.source, conn.target, 'arrow')
  }

  /** 拖拽起止：置位标记防止 hydrate 重建重置拖拽中间态；结束批量回写最终坐标（代理不持久化） */
  const handleNodeDragStart = (): void => {
    draggingRef.current = true
  }

  const handleNodeDragStop = (_e: unknown, _node: Node, dragged: Node[]): void => {
    draggingRef.current = false
    const moves = dragged
      .filter((n) => !isProxyId(n.id))
      .map((n) => ({ id: n.id, position: n.position }))
    if (moves.length > 0) moveNodes(moves)
  }

  /**
   * Delete 键删除（自实现，审查修复存量缺陷）：M3 联调起镜像只承接 position/remove
   * 变更（select 回灌会与 RF 测量形成无限循环），RF 受控模式下因此永无内部选中集，
   * deleteKeyCode 路径实际不可达——改为监听 window keydown 作用于 store 显式选中集
   * （selectedNodeIds，与 Inspector 同源），带确认（与属性面板删除一致）。
   * 防线：输入控件与 .nokey 容器（AI 面板/Tab 栏/对话框等）内不拦截
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Delete') return
      const target = e.target as HTMLElement | null
      if (target?.closest('.nokey, input, textarea, [contenteditable="true"]')) return
      const gs = useGraphStore.getState()
      const ids = gs.selectedNodeIds
      if (ids.length === 0) return
      e.preventDefault()
      void (async () => {
        const label =
          ids.length === 1
            ? `删除节点「${gs.nodes[ids[0]]?.title ?? ids[0]}」？相连的边将一并删除`
            : `删除选中的 ${ids.length} 个节点？相连的边将一并删除`
        if (await dialogConfirm(label, '删除')) gs.removeNodes(ids)
      })()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /** 双击：蓝图节点进入子图（8 层上限拦截）；代理节点跳转远端；引用节点打开指向 */
  const handleNodeDoubleClick = (_event: unknown, node: Node): void => {
    if (isProxyId(node.id)) {
      const remoteId = remoteIdOf(node.id)
      const remote = nodes[remoteId]
      if (remote) {
        enterGraph(remote.graphId)
        selectNode(remoteId)
      }
      return
    }
    const data = nodes[node.id]
    if (!data) return
    if (data.type === 'blueprint' && data.refGraphId) {
      const path = pathToGraph({ nodes, edges, graphs }, data.refGraphId)
      if (path.length > MAX_NESTING_DEPTH) {
        void dialogConfirm(`已达蓝图嵌套上限（${MAX_NESTING_DEPTH} 层），无法进入更深层子图`, '知道了')
        return
      }
      enterGraph(data.refGraphId)
      return
    }
    if (data.type === 'ref' && data.refTarget) {
      // 双击引用节点：打开指向的正文/蓝图（归属关系由 ref 承载，见计划书 3.2）
      const kind = data.refTarget.endsWith('.md') ? 'chapter' : 'blueprint'
      useNovelStore.getState().openTab(kind, data.refTarget)
    }
  }

  if (!graph) {
    return (
      <div className="canvas-body" ref={props.bodyRef}>
        <div className="canvas-hint">图不存在：{currentGraphId}</div>
      </div>
    )
  }

  return (
    <div className="canvas-body" ref={props.bodyRef}>
      {/* key=当前图 id：进入子图时强制重挂 ReactFlow 实例（路由式进入，M0 核心机制） */}
      <ReactFlow
        key={currentGraphId}
        nodes={nodeMirror}
        edges={rfEdges}
        fitView
        minZoom={0.2}
        maxZoom={2.5}
        onlyRenderVisibleElements
        connectionLineStyle={{ stroke: '#6c9ef8', strokeWidth: 1.5 }}
        onNodesChange={handleNodesChange}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onConnect={handleConnect}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onNodeDoubleClick={handleNodeDoubleClick}
        onPaneContextMenu={(e) => {
          e.preventDefault()
          setCtxMenu({ x: e.clientX, y: e.clientY, target: { kind: 'pane' } })
        }}
        onNodeContextMenu={(e, node) => {
          e.preventDefault()
          // 代理节点映射回远端真实节点（菜单动作作用于真实数据）
          setCtxMenu({ x: e.clientX, y: e.clientY, target: { kind: 'node', id: isProxyId(node.id) ? remoteIdOf(node.id) : node.id } })
        }}
      >
        {/* 黑色点阵网格背景（ComfyUI 式） */}
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#3a3a3c" />
        <MiniMap
          pannable
          zoomable
          style={{ background: '#161618', border: '1px solid #2f3136' }}
          maskColor="rgba(13, 14, 15, 0.7)"
          nodeColor={minimapNodeColor}
        />
        <Controls showInteractive={false} />
      </ReactFlow>
      <Breadcrumb />
      <div className="canvas-hint">
        双击 ◆ 进入子图 · 双击 § 引用打开指向 · 拖端口连线（拖到 ↗ 代理=跨图边） · Delete 删除选中
      </div>
      {/* 右键菜单：空白处=节点创建（落点=鼠标位置）；节点上=节点操作（审查补齐覆盖面） */}
      {ctxMenu?.target.kind === 'pane' && (
        <div
          ref={ctxMenuRef}
          className="canvas-context-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseLeave={() => setCtxMenu(null)}
        >
          {CREATE_MENU_ITEMS.map((item) => (
            <button
              key={item.type}
              type="button"
              className="canvas-context-item"
              onClick={() => {
                const screen = ctxMenu
                setCtxMenu(null)
                void canvasCreateBridge.current?.(item.type, screen)
              }}
            >
              <span className="canvas-context-icon">{item.icon}</span>
              <span className="canvas-context-text">
                <span className="canvas-context-title">{item.label}</span>
                <span className="canvas-context-hint">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {ctxMenu?.target.kind === 'node' && menuNode && (
        <div
          ref={ctxMenuRef}
          className="canvas-context-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseLeave={() => setCtxMenu(null)}
        >
          {menuNode.type === 'blueprint' && menuNode.refGraphId && (
            <button
              type="button"
              className="canvas-context-item"
              onClick={() => {
                setCtxMenu(null)
                enterGraph(menuNode.refGraphId!)
              }}
            >
              <span className="canvas-context-icon">◆</span>
              <span className="canvas-context-text">
                <span className="canvas-context-title">进入子图</span>
                <span className="canvas-context-hint">打开「{menuNode.title}」的子蓝图</span>
              </span>
            </button>
          )}
          {menuNode.type === 'ref' && menuNode.refTarget && (
            <button
              type="button"
              className="canvas-context-item"
              onClick={() => {
                setCtxMenu(null)
                const kind = menuNode.refTarget!.endsWith('.md') ? 'chapter' : 'blueprint'
                useNovelStore.getState().openTab(kind, menuNode.refTarget!)
              }}
            >
              <span className="canvas-context-icon">§</span>
              <span className="canvas-context-text">
                <span className="canvas-context-title">打开指向</span>
                <span className="canvas-context-hint">{basename(menuNode.refTarget!)}</span>
              </span>
            </button>
          )}
          <button
            type="button"
            className="canvas-context-item"
            onClick={() => {
              setCtxMenu(null)
              void (async () => {
                if (await dialogConfirm(`删除节点「${menuNode.title}」？相连的边将一并删除`, '删除')) {
                  removeNodesAction([menuNode.id])
                }
              })()
            }}
          >
            <span className="canvas-context-icon">✕</span>
            <span className="canvas-context-text">
              <span className="canvas-context-title">删除节点</span>
              <span className="canvas-context-hint">与属性面板删除一致（二次确认）</span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

/** 蓝图画布入口：工具条 + 画布主体 + 资源库浮层（ReactFlowProvider 统一包裹） */
export function BlueprintCanvas(): ReactElement {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [resourcesOpen, setResourcesOpen] = useState(false)

  return (
    <div className="blueprint-canvas">
      <ReactFlowProvider>
        <CanvasToolbar bodyRef={bodyRef} onOpenResources={() => setResourcesOpen((v) => !v)} />
        <BlueprintFlow bodyRef={bodyRef} />
        {resourcesOpen && <ResourcePanel onClose={() => setResourcesOpen(false)} />}
      </ReactFlowProvider>
    </div>
  )
}
