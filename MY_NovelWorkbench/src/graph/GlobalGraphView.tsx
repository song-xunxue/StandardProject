/**
 * 全局图谱视图（M4，FR-09）：AntV G6 5 力导向投影
 * 全部节点/边投影为一张图（跨蓝图）；按标签着色 + 标签过滤（图例勾选）；
 * 点击节点跳转其所在蓝图并选中；分析开关：孤立节点高亮 / 未回收「伏笔」标签高亮。
 * 深色主题（画布 #161618 与蓝图编辑器一致）；挂载时取图数据快照构建
 * （图谱为观察视图，切回编辑后重开即刷新，不做实时增量）
 *
 * 作者: 李文煜
 * 日期: 2026-08-27
 *
 * 2026-08-27
 * 变更说明：
 *   1. M4-A 初版
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Graph, NodeEvent } from '@antv/g6'
import type { EdgeData, NodeData } from '@antv/g6'
import type { BlueprintNode, EdgeType } from '@shared/blueprint'
import type { TagDef } from '@shared/tags'
import { nodeAccentColor } from '@shared/tags'
import { useGraphStore } from '@/store/graphStore'
import { useNovelStore } from '@/store/novelStore'
import { flattenChapterFiles } from '@/services/chapterTree'

/** 连线视觉映射（与画布 EDGE_VISUAL 同款口径） */
const EDGE_COLOR: Record<EdgeType, string> = { arrow: '#6c9ef8', line: '#9da0a8', dashed: '#c8a2f0' }

/** 类型回退色（无标签时）：蓝图蓝 / 引用绿 / 文本灰 */
function typeFallbackColor(node: BlueprintNode): string {
  if (node.type === 'blueprint') return 'rgba(108, 158, 248, 0.75)'
  if (node.type === 'ref') return 'rgba(126, 201, 143, 0.75)'
  return '#4a4d55'
}

export function GlobalGraphView(props: { onClose: () => void }): ReactElement {
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const tagLibrary = useNovelStore((s) => s.novel?.tagLibrary ?? [])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const g6Ref = useRef<Graph | null>(null)

  /** 分析开关：孤立节点（度=0）/ 未回收伏笔（含「伏笔」标签） */
  const [showIsolated, setShowIsolated] = useState(false)
  const [showForeshadow, setShowForeshadow] = useState(false)
  /** 标签过滤：勾选集合为空 = 全部显示 */
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())

  /** 节点度数（无向：出+入） */
  const degreeMap = useMemo(() => {
    const deg = new Map<string, number>()
    for (const e of Object.values(edges)) {
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1)
      deg.set(e.to, (deg.get(e.to) ?? 0) + 1)
    }
    return deg
  }, [edges])

  /** 图例标签：内置在前，按库顺序 */
  const legendTags = useMemo(() => {
    const used = new Set<string>()
    for (const n of Object.values(nodes)) for (const t of n.tags) used.add(t)
    return tagLibrary.filter((t) => used.has(t.name))
  }, [nodes, tagLibrary])

  /** 构建投影数据（过滤/高亮在计算属性层完成，切换开关即重建——百级节点可接受） */
  const projected = useMemo(() => {
    const list = Object.values(nodes)
    const foreshadowIds = new Set(
      list.filter((n) => n.tags.includes('伏笔') || n.aliases.includes('伏笔')).map((n) => n.id)
    )
    const keep = (n: BlueprintNode): boolean => {
      if (activeTags.size === 0) return true
      return n.tags.some((t) => activeTags.has(t))
    }
    const visible = new Set(list.filter(keep).map((n) => n.id))
    const g6Nodes: NodeData[] = list
      .filter((n) => visible.has(n.id))
      .map((n) => {
        const deg = degreeMap.get(n.id) ?? 0
        const isolated = deg === 0
        const accent = nodeAccentColor(tagLibrary as TagDef[], n) ?? typeFallbackColor(n)
        const highlight =
          (showIsolated && isolated) || (showForeshadow && foreshadowIds.has(n.id))
        const size = 20 + Math.min(deg, 6) * 3
        return {
          id: n.id,
          data: { title: n.title, kind: n.type, graphId: n.graphId },
          style: {
            size,
            fill: highlight ? '#e07a7a' : accent,
            stroke: isolated ? 'rgba(224, 122, 122, 0.5)' : 'rgba(255,255,255,0.15)',
            lineWidth: 1,
            labelText: n.title.length > 8 ? `${n.title.slice(0, 8)}…` : n.title,
            labelFill: '#dcdfe3',
            labelFontSize: 10,
            labelOffsetY: 4,
            labelPlacement: 'bottom' as const,
            iconText: n.type === 'blueprint' ? (highlight ? '!' : '◆') : n.type === 'ref' ? '§' : '',
            iconFill: '#161618',
            iconFontSize: n.type === 'blueprint' ? 11 : 10,
            cursor: 'pointer'
          }
        }
      })
    const g6Edges: EdgeData[] = Object.values(edges)
      .filter((e) => visible.has(e.from) && visible.has(e.to))
      .map((e) => ({
        id: e.id,
        source: e.from,
        target: e.to,
        style: {
          stroke: EDGE_COLOR[e.type],
          lineWidth: 1,
          ...(e.type === 'dashed' ? { lineDash: [6, 4] } : {}),
          ...(e.type === 'arrow' ? { endArrow: true } : {}),
          opacity: 0.7
        }
      }))
    return {
      g6Nodes,
      g6Edges,
      stats: {
        total: list.length,
        visible: g6Nodes.length,
        isolated: list.filter((n) => (degreeMap.get(n.id) ?? 0) === 0).length,
        foreshadow: foreshadowIds.size
      }
    }
  }, [nodes, edges, tagLibrary, activeTags, showIsolated, showForeshadow, degreeMap])

  /** G6 实例生命周期：挂载创建 → 数据/开关变化重设 → 卸载销毁 */
  useEffect(() => {
    if (!containerRef.current) return
    const g6 = new Graph({
      container: containerRef.current,
      autoFit: 'view',
      animation: false,
      padding: 40,
      node: { type: 'circle' },
      edge: { type: 'line' },
      layout: { type: 'd3-force', link: { distance: 90 }, manyBody: { strength: -160 }, collide: { radius: 28 } },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element']
    })
    g6Ref.current = g6
    return () => {
      g6.destroy()
      g6Ref.current = null
    }
  }, [])

  useEffect(() => {
    const g6 = g6Ref.current
    if (!g6) return
    let disposed = false
    void (async () => {
      g6.setData({ nodes: projected.g6Nodes, edges: projected.g6Edges })
      await g6.render()
      if (!disposed) await g6.fitView()
    })()
    return () => {
      disposed = true
    }
  }, [projected])

  /** 点击节点：跳转其所在蓝图并选中（图谱→编辑区的定位入口） */
  useEffect(() => {
    const g6 = g6Ref.current
    if (!g6) return
    const onClick = (event: unknown): void => {
      const id = (event as { target?: { id?: string } }).target?.id
      if (typeof id !== 'string') return
      const gs = useGraphStore.getState()
      const node = gs.nodes[id]
      if (!node) return
      gs.enterGraph(node.graphId)
      gs.selectNode(id)
      const bpPath = gs.graphPaths[node.graphId]
      if (bpPath) useNovelStore.getState().openTab('blueprint', bpPath)
      props.onClose()
    }
    g6.on(NodeEvent.CLICK, onClick)
    return () => {
      g6.off(NodeEvent.CLICK, onClick)
    }
  }, [props])

  const toggleTag = (name: string): void => {
    setActiveTags((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const chapterCount = flattenChapterFiles(useNovelStore.getState().tree).length

  return (
    <div className="graph-fullview nokey">
      <div className="graph-header">
        <span className="graph-title">全局图谱</span>
        <span className="graph-stats">
          {projected.stats.visible}/{projected.stats.total} 节点 · {projected.g6Edges.length} 边 · 孤立 {projected.stats.isolated} · 伏笔 {projected.stats.foreshadow} · 章节 {chapterCount}
        </span>
        <label className="graph-toggle">
          <input type="checkbox" checked={showIsolated} onChange={(e) => setShowIsolated(e.target.checked)} />
          高亮孤立节点
        </label>
        <label className="graph-toggle">
          <input type="checkbox" checked={showForeshadow} onChange={(e) => setShowForeshadow(e.target.checked)} />
          高亮未回收伏笔
        </label>
        <button className="graph-close" title="返回工作区" onClick={props.onClose}>
          × 关闭图谱
        </button>
      </div>
      <div className="graph-legend">
        <span className="graph-legend-label">标签过滤（不选=全部）：</span>
        {legendTags.map((t) => (
          <button
            key={t.name}
            type="button"
            className={`graph-legend-chip${activeTags.has(t.name) ? ' on' : ''}`}
            style={{ '--tag-color': t.color } as React.CSSProperties}
            onClick={() => toggleTag(t.name)}
          >
            <span className="bp-node-tag-dot" />
            {t.name}
          </button>
        ))}
        {legendTags.length === 0 && <span className="graph-legend-empty">图内暂无标签</span>}
      </div>
      <div ref={containerRef} className="graph-container" />
      <div className="canvas-hint">
        拖拽平移 · 滚轮缩放 · 节点可拖动 · 点击节点跳转其所在蓝图 · 边色：箭头=顺序 直线=关联 虚线=参考
      </div>
    </div>
  )
}
