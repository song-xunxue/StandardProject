/**
 * 面包屑导航：根图 → 当前图的层级路径（popTo 回退）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M0 初版：读取 graphStore.route 渲染层级路径，点击任意层级回退
 */

import type { ReactElement } from 'react'
import { useGraphStore } from '@/store/graphStore'

export function Breadcrumb(): ReactElement {
  const route = useGraphStore((s) => s.route)
  const graphs = useGraphStore((s) => s.graphs)
  const popTo = useGraphStore((s) => s.popTo)

  return (
    <div className="breadcrumb" aria-label="蓝图层级路径">
      {route.map((graphId, index) => {
        const isLast = index === route.length - 1
        return (
          <span key={graphId} className="crumb-group">
            {index > 0 && <span className="crumb-sep">›</span>}
            <button
              className={`crumb${isLast ? ' current' : ''}`}
              onClick={() => popTo(index)}
              title={isLast ? `当前：${graphs[graphId]?.title ?? graphId}` : `回退到 ${graphs[graphId]?.title ?? graphId}`}
            >
              {graphs[graphId]?.title ?? graphId}
            </button>
          </span>
        )
      })}
    </div>
  )
}
