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
 *
 * 2026-08-31
 * 变更说明：
 *   1. 夜间性能重构：过滤/分析开关切换不再全量 setData+render+fitView 重跑 d3-force
 *      （此前每次勾选都全图重排且用户拖好的布局全部丢失）——改为
 *      updateData 部分样式/visibility 更新 + draw()（G6 5 语义：仅重绘不重排），
 *      节点坐标全程保留；仅数据集变化（nodes/edges/标签库）才走 render 全量重排

 * 2026-09-18
 * 变更说明：
 *   1. v2 二批遗留修复（渲染代际守卫）：genRef 代际号 + chainRef 串行队列——所有
 *      G6 异步操作严格串行、旧代链空跑退出，杜绝数据集连变时两代渲染交错（瞬态
 *      闪烁/旧数据闪现）与管道中段销毁的 unhandledrejection；
 *      全量渲染 setData 首帧烤入当前过滤/高亮（viewStateRef，不进依赖——治
 *      「render 重建全可见再隐藏」的一帧闪烁根因）
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Graph, NodeEvent } from '@antv/g6'
import type { EdgeData, GraphData, NodeData } from '@antv/g6'
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

/** 节点完整视觉（全量构建与视图态增量共用同一构建器，保证口径一致） */
function nodeStyleOf(node: BlueprintNode, deg: number, isolated: boolean, highlight: boolean, tagLibrary: TagDef[]) {
  const accent = nodeAccentColor(tagLibrary, node) ?? typeFallbackColor(node)
  return {
    size: 20 + Math.min(deg, 6) * 3,
    fill: highlight ? '#e07a7a' : accent,
    stroke: isolated ? 'rgba(224, 122, 122, 0.5)' : 'rgba(255,255,255,0.15)',
    lineWidth: 1,
    labelText: node.title.length > 8 ? `${node.title.slice(0, 8)}…` : node.title,
    labelFill: '#dcdfe3',
    labelFontSize: 10,
    labelOffsetY: 4,
    labelPlacement: 'bottom' as const,
    iconText: node.type === 'blueprint' ? (highlight ? '!' : '◆') : node.type === 'ref' ? '§' : '',
    iconFill: '#161618',
    iconFontSize: node.type === 'blueprint' ? 11 : 10,
    cursor: 'pointer' as const
  }
}

export function GlobalGraphView(props: { onClose: () => void }): ReactElement {
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const tagLibrary = useNovelStore((s) => s.novel?.tagLibrary ?? [])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const g6Ref = useRef<Graph | null>(null)
  /** 全量渲染完成计数：视图态 effect 依赖它，保证重排后重新套用过滤/高亮 */
  const [renderTick, setRenderTick] = useState(0)
  /** v2 二批遗留修复（渲染代际守卫）：自增代际号——数据集连变时旧代链空跑、
   *  卸载/新渲染使在途链全部失效，杜绝两代渲染在 G6 内部交错（瞬态闪烁/旧数据闪现） */
  const genRef = useRef(0)
  /** G6 异步操作串行队列：render/updateData/draw 全部排队执行，任何时刻至多一条链在跑
   *  （G6 5 小版本间并发语义有差异——串行化后只依赖「无并发」弱假设） */
  const chainRef = useRef<Promise<void>>(Promise.resolve())
  /** 最新已结算的全量渲染代际：视图态增量早于全量渲染到达时跳过本轮（renderTick 兜底补套） */
  const settledGenRef = useRef(0)

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

  /** 伏笔集合（标题/别名含「伏笔」或挂「伏笔」标签） */
  const foreshadowIds = useMemo(() => {
    const ids = new Set<string>()
    for (const n of Object.values(nodes)) {
      if (n.tags.includes('伏笔') || n.aliases.includes('伏笔')) ids.add(n.id)
    }
    return ids
  }, [nodes])

  /** 图例标签：内置在前，按库顺序 */
  const legendTags = useMemo(() => {
    const used = new Set<string>()
    for (const n of Object.values(nodes)) for (const t of n.tags) used.add(t)
    return tagLibrary.filter((t) => used.has(t.name))
  }, [nodes, tagLibrary])

  /**
   * 全量投影数据（不含过滤/高亮——视图态在增量层套用）。
   * 仅在数据集变化（nodes/edges/标签库）时重建并触发 d3-force 重排；
   * 图谱为全屏覆盖层，打开期间数据基本不变，重建即等价于「重开刷新」
   */
  const fullData = useMemo(() => {
    const g6Nodes: NodeData[] = Object.values(nodes).map((n) => {
      const deg = degreeMap.get(n.id) ?? 0
      return {
        id: n.id,
        data: { title: n.title, kind: n.type, graphId: n.graphId },
        style: nodeStyleOf(n, deg, deg === 0, false, tagLibrary as TagDef[])
      }
    })
    const g6Edges: EdgeData[] = Object.values(edges).map((e) => ({
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
    return { g6Nodes, g6Edges }
    // degreeMap/foreshadowIds 由 nodes/edges 派生，此处无需重复依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, tagLibrary])

  /** 视图态（过滤/高亮）的纯计算：可见性与每节点视觉，供增量更新与统计共用 */
  const viewState = useMemo(() => {
    const visibleNode = (n: BlueprintNode): boolean =>
      activeTags.size === 0 || n.tags.some((t) => activeTags.has(t))
    const visible = new Map<string, boolean>()
    const styles = new Map<string, ReturnType<typeof nodeStyleOf>>()
    for (const n of Object.values(nodes)) {
      const deg = degreeMap.get(n.id) ?? 0
      const isolated = deg === 0
      const highlight = (showIsolated && isolated) || (showForeshadow && foreshadowIds.has(n.id))
      visible.set(n.id, visibleNode(n))
      styles.set(n.id, nodeStyleOf(n, deg, isolated, highlight, tagLibrary as TagDef[]))
    }
    const visibleEdge = (from: string, to: string): boolean => visible.get(from) === true && visible.get(to) === true
    return {
      visible,
      styles,
      visibleEdge,
      stats: {
        total: Object.keys(nodes).length,
        visibleCount: Array.from(visible.values()).filter(Boolean).length,
        isolated: Object.values(nodes).filter((n) => (degreeMap.get(n.id) ?? 0) === 0).length,
        foreshadow: foreshadowIds.size
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, degreeMap, foreshadowIds, tagLibrary, activeTags, showIsolated, showForeshadow])

  /** 视图态快照（声明先于消费它的 effect，每次提交同步——全量渲染首帧烤入过滤/高亮，
   *  不进 fullData 依赖：过滤勾选不得触发全量重排（08-31 重构红线）） */
  const viewStateRef = useRef(viewState)
  useEffect(() => {
    viewStateRef.current = viewState
  })

  /** G6 实例生命周期：挂载创建 → 卸载销毁 */
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
      // 代际失效：在途渲染/增量链的代际检查全部失配 → 空跑退出（不再触碰 G6）
      genRef.current++
      // 清理必须整体容错：第三方库的销毁路径若同步抛异常会打断 React 提交导致整树白屏
      try {
        // 先停布局（终止 d3-force 的 rAF tick 链），再延迟销毁一个宏任务：让在途
        // draw()/prepare()（内部经 Promise.resolve 延迟检查 destroyed）先完成——
        // 立即销毁会产生 G6「instance has been destroyed」告警竞态
        if (!g6.destroyed) g6.stopLayout()
      } catch {
        /* 布局已停/未启动时 stopLayout 可能抛错——销毁照常进行 */
      }
      setTimeout(() => {
        try {
          if (!g6.destroyed) g6.destroy()
        } catch {
          /* 已销毁实例的重复销毁忽略 */
        }
        if (g6Ref.current === g6) g6Ref.current = null
      }, 50)
    }
  }, [])

  /**
   * 全量渲染：挂载与数据集变化时（d3-force 重排 + fitView），完成后递增 renderTick。
   *  v2 二批遗留修复：
   *  - 串行队列：setData→render→fitView 链入 chainRef，任何时刻至多一条 G6 链在跑，
   *    全链 try/catch（G6 管道中段被销毁的 reject 不再变 unhandledrejection）；
   *  - 代际号：数据集连变时旧代链在每个 await 恢复点检查失配即退出（不交错、不闪旧数据）；
   *  - 首帧烤入：setData 前用 viewStateRef 给节点补过滤/高亮与 visibility——治
   *    「render 重建为全可见、隔一提交再隐藏」的一帧闪烁（缺口 A 根因）
   */
  useEffect(() => {
    const g6 = g6Ref.current
    if (!g6) return
    const gen = ++genRef.current
    const run = async (): Promise<void> => {
      if (genRef.current !== gen || g6.destroyed) return
      const vs = viewStateRef.current
      const baked = fullData.g6Nodes.map((n) => {
        const style = vs.styles.get(n.id)
        return style
          ? {
              ...n,
              style: { ...style, visibility: (vs.visible.get(n.id) ? 'visible' : 'hidden') as 'visible' | 'hidden' }
            }
          : n
      })
      g6.setData({ nodes: baked, edges: fullData.g6Edges })
      await g6.render()
      if (genRef.current !== gen || g6.destroyed) return
      await g6.fitView()
      if (genRef.current !== gen || g6.destroyed) return
      settledGenRef.current = gen
      setRenderTick((t) => t + 1)
    }
    chainRef.current = chainRef.current
      .then(run)
      .catch((err) => {
        console.error('[GlobalGraphView] 全量渲染失败:', err)
      })
      .then(() => {
        // 失败路径也推进结算代际（否则视图态增量永久停跳，图谱停在无过滤态）
        if (genRef.current === gen) settledGenRef.current = gen
      })
  }, [fullData])

  /**
   * 视图态增量更新：过滤勾选/分析开关变化时仅更新样式与显隐——
   * updateData 为部分合并（G6 setElementVisibility 同款机制），不携带 x/y 故节点坐标
   * 全程保留；draw() 只重绘不重排（G6 5 语义），用户拖好的布局不再丢失。
   *  v2 二批遗留修复：同样链入串行队列；全量渲染未结算（settled 落后于当前代际）时
   *  跳过本轮——render 完成后 renderTick 递增会触发补套，消除与 render 管道的交错
   */
  useEffect(() => {
    const g6 = g6Ref.current
    if (!g6) return
    const gen = genRef.current
    const run = async (): Promise<void> => {
      if (settledGenRef.current !== genRef.current) return
      if (genRef.current !== gen || g6.destroyed) return
      const nodeUpdates = Object.values(nodes).map((n) => ({
        id: n.id,
        style: { ...viewState.styles.get(n.id), visibility: viewState.visible.get(n.id) ? 'visible' : 'hidden' }
      }))
      const edgeUpdates = Object.values(edges).map((e) => ({
        id: e.id,
        style: { visibility: viewState.visibleEdge(e.from, e.to) ? 'visible' : 'hidden' }
      }))
      g6.updateData({
        nodes: nodeUpdates,
        edges: edgeUpdates
      } as unknown as GraphData)
      if (genRef.current !== gen || g6.destroyed) return
      await g6.draw()
    }
    chainRef.current = chainRef.current.then(run).catch((err) => {
      console.error('[GlobalGraphView] 视图态增量更新失败:', err)
    })
    // renderTick 依赖：全量重排后元素重建为可见态，需重新套用当前过滤/高亮
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewState, renderTick])

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
          {viewState.stats.visibleCount}/{viewState.stats.total} 节点 · {Object.values(edges).filter((e) => viewState.visibleEdge(e.from, e.to)).length} 边 · 孤立 {viewState.stats.isolated} · 伏笔 {viewState.stats.foreshadow} · 章节 {chapterCount}
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
