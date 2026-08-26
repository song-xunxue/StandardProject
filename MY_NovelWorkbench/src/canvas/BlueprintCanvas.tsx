/**
 * 蓝图画布（M0 PoC 版）：store 驱动的 React Flow 集成
 * 能力：路由式子图进入（双击蓝图节点）/ 面包屑回退 / 跨图边代理节点渲染与跳转 /
 *       语义连线（箭头/直线/虚线）/ 黑色点阵网格 / 小地图
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
 */

import { useMemo } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  MarkerType,
  type Edge,
  type Node
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useGraphStore } from '@/store/graphStore'
import { Breadcrumb } from './Breadcrumb'
import type { BlueprintNode, EdgeType } from '@/types/blueprint'

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

/** 节点通用样式：深色卡片；蓝图节点带强调色边框；代理节点虚线紫框 */
function nodeStyle(kind: 'blueprint' | 'text' | 'proxy'): CSSProperties {
  const base: CSSProperties = {
    background: '#26282b',
    color: '#dcdfe3',
    borderRadius: 6,
    fontSize: 12,
    padding: '10px 14px',
    width: 160
  }
  if (kind === 'blueprint') base.border = '1px solid rgba(108, 158, 248, 0.55)'
  else if (kind === 'proxy') base.border = '1px dashed rgba(200, 162, 240, 0.7)'
  else base.border = '1px solid #3f3f46'
  return base
}

/** 节点标签：蓝图加 ◆ 前缀与标签（#设定 等） */
function nodeLabel(node: BlueprintNode): string {
  const prefix = node.type === 'blueprint' ? '◆ ' : ''
  const tags = node.tags.length > 0 ? `\n#${node.tags.join(' #')}` : ''
  return `${prefix}${node.title}${tags}`
}

export function BlueprintCanvas(): ReactElement {
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const graphs = useGraphStore((s) => s.graphs)
  const route = useGraphStore((s) => s.route)
  const enterGraph = useGraphStore((s) => s.enterGraph)
  const selectNode = useGraphStore((s) => s.selectNode)

  const currentGraphId = route[route.length - 1]
  const graph = graphs[currentGraphId]

  const { rfNodes, rfEdges } = useMemo(() => {
    if (!graph) return { rfNodes: [] as Node[], rfEdges: [] as Edge[] }
    const memberIds = new Set(graph.nodeIds)

    // 本图节点
    const rfNodes: Node[] = graph.nodeIds
      .map((id) => nodes[id])
      .filter((n): n is BlueprintNode => Boolean(n))
      .map((n) => ({
        id: n.id,
        position: n.position,
        data: { label: nodeLabel(n) },
        style: nodeStyle(n.type === 'blueprint' ? 'blueprint' : 'text')
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
        markerEnd: visual.marker ? { type: MarkerType.ArrowClosed, color: visual.stroke } : undefined,
        style: {
          stroke: visual.stroke,
          strokeWidth: 1.5,
          ...(visual.dashed ? { strokeDasharray: '6 4' } : {})
        }
      })
    }

    return { rfNodes: [...rfNodes, ...uniqueProxies], rfEdges }
  }, [graph, nodes, edges, graphs])

  /** 双击：蓝图节点进入子图；代理节点跳转到远端节点所属图并选中 */
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
    if (data?.type === 'blueprint' && data.refGraphId) {
      enterGraph(data.refGraphId)
    }
  }

  if (!graph) {
    return <div className="canvas-hint">图不存在：{currentGraphId}</div>
  }

  return (
    <div className="blueprint-canvas">
      {/* key=当前图 id：进入子图时强制重挂 ReactFlow 实例（路由式进入，M0 核心机制） */}
      <ReactFlow
        key={currentGraphId}
        nodes={rfNodes}
        edges={rfEdges}
        fitView
        minZoom={0.2}
        maxZoom={2.5}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeClick={(_e, node) => selectNode(isProxyId(node.id) ? remoteIdOf(node.id) : node.id)}
      >
        {/* 黑色点阵网格背景（ComfyUI 式） */}
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#3a3a3c" />
        <MiniMap
          pannable
          zoomable
          style={{ background: '#161618', border: '1px solid #2f3136' }}
          maskColor="rgba(13, 14, 15, 0.7)"
          nodeColor={() => '#3f3f46'}
        />
        <Controls showInteractive={false} />
      </ReactFlow>
      <Breadcrumb />
      <div className="canvas-hint">
        双击 ◆ 蓝图节点进入子图 · 双击 ↗ 代理节点跳转跨图节点 · 虚线紫框为跨图引用
      </div>
    </div>
  )
}
