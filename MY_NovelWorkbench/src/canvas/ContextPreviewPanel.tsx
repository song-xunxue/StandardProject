/**
 * 上下文预览面板（Context Viewer 的 M0 雏形）
 * 对选中节点（默认第一卷）实时展示 assembleContext 的三层组装结果与预算占用
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M0 初版：展示片段列表（层/角色/标题/token）+ 各层预算条 + 丢弃记录
 */

import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { useGraphStore } from '@/store/graphStore'
import { assembleContext, layerBudgetsOf } from '@/services/contextAssembly'

const ROLE_LABEL: Record<string, string> = {
  self: '当前',
  neighbor: '直接邻居',
  ancestor: '上级蓝图',
  deep: '深层(语义加权)',
  keyword: '关键词兜底'
}

const LAYER_LABEL = ['第1层 60%', '第2层 25%', '第3层 15%']

/** 演示用草稿：含「剑冢」关键词，用于触发兜底（M3 后接真实编辑器内容） */
const DEMO_DRAFT = '少年立于北原镇的风雪中，怀中古剑发出微鸣。他想起酒馆里那句关于剑冢的醉话，握紧了剑柄。'

export function ContextPreviewPanel(): ReactElement {
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)

  // 目标优先级：选中节点 → 当前画布首个节点 → 任意节点（均无则空面板）
  const route = useGraphStore((s) => s.route)
  const graphs = useGraphStore((s) => s.graphs)
  const targetId = useMemo(() => {
    if (selectedNodeId && nodes[selectedNodeId]) return selectedNodeId
    const currentGraph = route.length > 0 ? graphs[route[route.length - 1]!] : undefined
    const first = currentGraph?.nodeIds.find((id) => nodes[id])
    return first ?? Object.keys(nodes)[0] ?? ''
  }, [selectedNodeId, nodes, route, graphs])
  const result = useMemo(
    () => assembleContext({ nodes, edges, graphs }, targetId, { draft: DEMO_DRAFT }),
    [nodes, edges, graphs, targetId]
  )
  const target = nodes[targetId]

  return (
    <div className="ctx-panel left-scroll">
      <div className="ctx-header">
        <div className="ctx-title">上下文预览（M0）</div>
        <div className="ctx-target">目标节点：{target ? target.title : targetId}</div>
      </div>

      <div className="ctx-budget">
        {result.layerTokens.map((used, i) => {
          const budget = layerBudgetsOf()[i]
          const pct = Math.min(100, Math.round((used / budget) * 100))
          return (
            <div key={i} className="ctx-budget-row">
              <span className="ctx-budget-label">{LAYER_LABEL[i]}</span>
              <div className="ctx-budget-bar">
                <div className="ctx-budget-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="ctx-budget-num">
                {used}/{budget}
              </span>
            </div>
          )
        })}
        <div className="ctx-total">
          合计 {result.totalTokens} / {result.totalBudget} token
        </div>
      </div>

      <div className="ctx-segments">
        {result.segments.map((seg, i) => (
          <div key={`${seg.nodeId}-${i}`} className={`ctx-seg layer-${seg.layer}`}>
            <div className="ctx-seg-head">
              <span className="ctx-seg-layer">L{seg.layer}</span>
              <span className="ctx-seg-title">{seg.title}</span>
              <span className="ctx-seg-role">{ROLE_LABEL[seg.role] ?? seg.role}</span>
              <span className="ctx-seg-tokens">{seg.tokens}t</span>
            </div>
            <div className="ctx-seg-text">{seg.text}</div>
          </div>
        ))}
      </div>

      {result.dropped.length > 0 && (
        <div className="ctx-dropped">
          <div className="ctx-dropped-title">预算外丢弃（{result.dropped.length}）</div>
          {result.dropped.map((d) => (
            <div key={d.nodeId} className="ctx-dropped-item">
              {d.title} — {d.reason === 'truncated' ? '已截断' : '超层预算'}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
