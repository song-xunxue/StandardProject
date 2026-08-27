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
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import type { BlueprintNode, EdgeType, NodeType } from '@shared/blueprint'
import type { TagDef } from '@shared/tags'
import { nodeAccentColor, tagColorOf } from '@shared/tags'
import { pathToGraph } from '@/services/graphTraversal'
import { useGraphStore } from '@/store/graphStore'
import { useNovelStore } from '@/store/novelStore'
import { dialogConfirm } from '@/store/dialogStore'
import { Breadcrumb } from './Breadcrumb'
import { CanvasToolbar, canvasCreateBridge } from './CanvasToolbar'
import { ResourcePanel } from './ResourcePanel'

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

/** 节点内容：标题（◆ 蓝图 / § 引用 前缀）+ ref 指向 + 标签 chips */
function renderNodeLabel(node: BlueprintNode, tagLibrary: TagDef[]): ReactNode {
  const prefix = node.type === 'blueprint' ? '◆ ' : node.type === 'ref' ? '§ ' : ''
  return (
    <div className="bp-node-label">
      <span className="bp-node-title">{prefix}
        {node.title}
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
  const removeEdgeAction = useGraphStore((s) => s.removeEdge)
  const tagLibrary = useNovelStore((s) => s.novel?.tagLibrary ?? [])

  const currentGraphId = route[route.length - 1]
  const graph = graphs[currentGraphId]

  // MiniMap 着色回调稳定化：内联闭包会令 memo 失效、拖拽期间每帧全量重算着色
  const minimapNodeColor = useCallback(
    (n: Node): string => nodeAccentColor(tagLibrary, nodes[n.id] ?? EMPTY_TAGS_NODE) ?? '#3f3f46',
    [tagLibrary, nodes]
  )

  // ---- 右键菜单（M3 交互调整：节点创建入口；创建逻辑经 canvasCreateBridge 复用工具条实现） ----
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const ctxMenuRef = useRef<HTMLDivElement | null>(null)

  // Esc / 菜单外按下鼠标关闭（与左栏菜单行为一致）
  useEffect(() => {
    if (!ctxMenu) return
    const onDown = (e: MouseEvent): void => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as globalThis.Node)) setCtxMenu(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setCtxMenu(null)
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [ctxMenu])

  // 视口边缘钳制：靠右/下缘打开时收回到屏内（菜单条目始终可达）
  useLayoutEffect(() => {
    if (!ctxMenu || !ctxMenuRef.current) return
    const el = ctxMenuRef.current
    const maxX = window.innerWidth - el.offsetWidth - 8
    const maxY = window.innerHeight - el.offsetHeight - 8
    const x = Math.min(ctxMenu.x, Math.max(8, maxX))
    const y = Math.min(ctxMenu.y, Math.max(8, maxY))
    if (x !== ctxMenu.x || y !== ctxMenu.y) setCtxMenu({ x, y })
  }, [ctxMenu])

  // ---- 拖拽跟手（受控节点镜像）：RF 受控模式下必须接 onNodesChange，否则拖拽变更被丢弃、
  // 节点只在 dragStop 提交时跳变。镜像只承接 position/remove——dimensions（尺寸测量）与
  // select 若回灌会与 RF 内部测量/选中形成「重建→再测量→再变更」无限循环打满主线程 ----
  const [nodeMirror, setNodeMirror] = useState<Node[]>([])
  const draggingRef = useRef(false)
  const handleNodesChange = (changes: NodeChange[]): void => {
    const relevant = changes.filter((c) => c.type === 'position' || c.type === 'remove')
    if (relevant.length === 0) return
    setNodeMirror((prev) => applyNodeChanges(relevant, prev))
  }

  const { rfNodes, rfEdges } = useMemo(() => {
    if (!graph) return { rfNodes: [] as Node[], rfEdges: [] as Edge[] }
    const memberIds = new Set(graph.nodeIds)

    // 本图节点（标签决定着色；内容为标题 + ref 指向 + 标签 chips）
    // 选中态不回灌（非受控）：RF 内部维护视觉选中，store 选中只在用户点击时变化——
    // 受控 selected 回灌会在结构变更（建节点/建边）时与 RF 内部状态形成无限渲染循环
    const rfNodes: Node[] = graph.nodeIds
      .map((id) => nodes[id])
      .filter((n): n is BlueprintNode => Boolean(n))
      .map((n) => ({
        id: n.id,
        position: n.position,
        data: { label: renderNodeLabel(n, tagLibrary) },
        style: nodeStyle(n.type, nodeAccentColor(tagLibrary, n))
      }))

    // 跨图边：另一端不在本图 → 生成代理节点（proxy:前缀），摆放于本图连出节点右侧
    const proxies: Node[] = []
    for (const e of Object.values(edges)) {
      const fromIn = memberIds.has(e.from)
      const toIn = memberIds.has(e.to)
      if (fromIn === toIn) continue // 同图边（都进或都不进）不生成代理
      const localId = fromIn ? e.from : e.to
      const remoteId = fromIn ? e.to : e.from
      const remote = nodes[remoteId]
      const local = nodes[localId]
      if (!remote || !local) continue
      proxies.push({
        id: `proxy:${remoteId}`,
        position: { x: local.position.x + 280, y: local.position.y + 40 },
        data: { label: `↗ ${remote.title}（${graphs[remote.graphId]?.title ?? '外部'}）` },
        style: nodeStyle('proxy'),
        draggable: true
      })
    }
    // 去重（多条跨图边指向同一远端节点时只画一个代理）
    const seen = new Set<string>()
    const uniqueProxies = proxies.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))

    // 本图边 + 跨图边（连到代理节点）
    // 端点在本图 → 用真实节点 id；不在本图 → 用其代理节点 id（两个方向对称处理）
    const rfEdges: Edge[] = []
    for (const e of Object.values(edges)) {
      const fromIn = memberIds.has(e.from)
      const toIn = memberIds.has(e.to)
      if (!fromIn && !toIn) continue // 两端都不在本图，不渲染
      const source = fromIn ? e.from : `${PROXY_PREFIX}${e.from}`
      const target = toIn ? e.to : `${PROXY_PREFIX}${e.to}`
      const visual = EDGE_VISUAL[e.type]
      rfEdges.push({
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
      })
    }

    return { rfNodes: [...rfNodes, ...uniqueProxies], rfEdges }
  }, [graph, nodes, edges, graphs, tagLibrary])

  // store 派生结果同步进本地镜像；拖拽进行中跳过——否则 watcher→hydrate 的重建
  // 会把拖拽中间态整体重置（节点跳回原点并以错误基准继续）
  useEffect(() => {
    if (!draggingRef.current) setNodeMirror(rfNodes)
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

  /** Delete 键删除（代理节点跳过——它由跨图边派生） */
  const handleNodesDelete = (deleted: Node[]): void => {
    const ids = deleted.filter((n) => !isProxyId(n.id)).map((n) => n.id)
    if (ids.length > 0) removeNodesAction(ids)
  }

  const handleEdgesDelete = (deleted: Edge[]): void => {
    for (const e of deleted) removeEdgeAction(e.id)
  }

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
        deleteKeyCode={['Delete']}
        connectionLineStyle={{ stroke: '#6c9ef8', strokeWidth: 1.5 }}
        onNodesChange={handleNodesChange}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onConnect={handleConnect}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onNodesDelete={handleNodesDelete}
        onEdgesDelete={handleEdgesDelete}
        onNodeDoubleClick={handleNodeDoubleClick}
        onPaneContextMenu={(e) => {
          e.preventDefault()
          setCtxMenu({ x: e.clientX, y: e.clientY })
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
      {/* 右键菜单：节点创建（落点=鼠标位置） */}
      {ctxMenu && (
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
