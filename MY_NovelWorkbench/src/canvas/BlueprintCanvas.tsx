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

import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactElement, ReactNode, RefObject } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  MarkerType,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams
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
import { CanvasToolbar } from './CanvasToolbar'
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
  // 受控选中：store 数组回灌 selected，store 驱动的 props 全量重建不再丢 RF 内部选中态
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds)
  const selectedEdgeIds = useGraphStore((s) => s.selectedEdgeIds)
  // useMemo 依赖用拼接键而非数组身份：内容不变时跳过全量重建，断开「回灌→通知→再重建」回环
  const selectedNodeKey = selectedNodeIds.join(',')
  const selectedEdgeKey = selectedEdgeIds.join(',')

  const currentGraphId = route[route.length - 1]
  const graph = graphs[currentGraphId]

  const { rfNodes, rfEdges } = useMemo(() => {
    if (!graph) return { rfNodes: [] as Node[], rfEdges: [] as Edge[] }
    const memberIds = new Set(graph.nodeIds)
    const nodeSelected = new Set(selectedNodeIds)
    const edgeSelected = new Set(selectedEdgeIds)

    // 本图节点（标签决定着色；内容为标题 + ref 指向 + 标签 chips）
    const rfNodes: Node[] = graph.nodeIds
      .map((id) => nodes[id])
      .filter((n): n is BlueprintNode => Boolean(n))
      .map((n) => ({
        id: n.id,
        position: n.position,
        data: { label: renderNodeLabel(n, tagLibrary) },
        style: nodeStyle(n.type, nodeAccentColor(tagLibrary, n)),
        selected: nodeSelected.has(n.id)
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
        selected: edgeSelected.has(e.id),
        style: {
          stroke: visual.stroke,
          strokeWidth: 1.5,
          ...(visual.dashed ? { strokeDasharray: '6 4' } : {})
        }
      })
    }

    return { rfNodes: [...rfNodes, ...uniqueProxies], rfEdges }
    // 依赖中的选中态用拼接键（内容语义）而非数组身份：内容不变时跳过全量重建，
    // 断开「受控回灌 → RF onSelectionChange 再通知 → 再重建」的回环
  }, [graph, nodes, edges, graphs, tagLibrary, selectedNodeKey, selectedEdgeKey])

  /** 选中变化（点击/框选/空白）：全量同步 store（代理节点映射回远端真实节点） */
  const handleSelectionChange = ({ nodes: selNodes, edges: selEdges }: OnSelectionChangeParams): void => {
    const nodeIds = selNodes.map((n) => (isProxyId(n.id) ? remoteIdOf(n.id) : n.id))
    setSelection(nodeIds, selEdges.map((e) => e.id))
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

  /** 拖拽结束：批量回写最终坐标（代理节点不持久化） */
  const handleNodeDragStop = (_e: unknown, _node: Node, dragged: Node[]): void => {
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
        nodes={rfNodes}
        edges={rfEdges}
        fitView
        minZoom={0.2}
        maxZoom={2.5}
        deleteKeyCode={['Delete']}
        connectionLineStyle={{ stroke: '#6c9ef8', strokeWidth: 1.5 }}
        onSelectionChange={handleSelectionChange}
        onConnect={handleConnect}
        onNodeDragStop={handleNodeDragStop}
        onNodesDelete={handleNodesDelete}
        onEdgesDelete={handleEdgesDelete}
        onNodeDoubleClick={handleNodeDoubleClick}
      >
        {/* 黑色点阵网格背景（ComfyUI 式） */}
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#3a3a3c" />
        <MiniMap
          pannable
          zoomable
          style={{ background: '#161618', border: '1px solid #2f3136' }}
          maskColor="rgba(13, 14, 15, 0.7)"
          nodeColor={(n) => nodeAccentColor(tagLibrary, nodes[n.id] ?? { tags: [] }) ?? '#3f3f46'}
        />
        <Controls showInteractive={false} />
      </ReactFlow>
      <Breadcrumb />
      <div className="canvas-hint">
        双击 ◆ 进入子图 · 双击 § 引用打开指向 · 拖端口连线（拖到 ↗ 代理=跨图边） · Delete 删除选中
      </div>
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
