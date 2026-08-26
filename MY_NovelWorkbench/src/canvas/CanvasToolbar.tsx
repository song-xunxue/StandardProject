/**
 * 画布工具条：三类节点创建 / 资源库入口 / 保存状态与嵌套层级指示
 * 位于 ReactFlowProvider 内（screenToFlowCoordinate 计算新节点落点=当前视口中心）
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M2 初版：节点创建（蓝图节点先建子图文件并刷新再落节点，见 graphStore 竞态说明）
 */

import type { ReactElement } from 'react'
import type { RefObject } from 'react'
import { useReactFlow } from '@xyflow/react'
import { MAX_NESTING_DEPTH } from '@shared/blueprint'
import type { NodeType } from '@shared/blueprint'
import { useGraphStore } from '@/store/graphStore'
import { useNovelStore } from '@/store/novelStore'
import { dialogConfirm } from '@/store/dialogStore'
import { defaultTitle } from '@/services/naming'

/** 节点创建按钮配置（顺序=工具条展示顺序） */
const CREATE_BUTTONS: Array<{ type: NodeType; label: string; hint: string }> = [
  { type: 'blueprint', label: '+ 蓝图节点', hint: '创建可进入的子图节点（双击进入）' },
  { type: 'text', label: '+ 文本节点', hint: '创建纯文本创作单元' },
  { type: 'ref', label: '+ 引用节点', hint: '创建指向章节/蓝图的引用（右侧面板选择指向）' }
]

export function CanvasToolbar(props: {
  bodyRef: RefObject<HTMLDivElement>
  onOpenResources: () => void
}): ReactElement {
  const { screenToFlowPosition } = useReactFlow()
  const route = useGraphStore((s) => s.route)
  const saving = useGraphStore((s) => s.saving)
  const dirtyCount = useGraphStore((s) => s.dirtyGraphIds.length)
  const saveError = useGraphStore((s) => s.saveError)

  /** 当前视口中心（流坐标）+ 少量错位，避免连续创建的节点完全重叠 */
  const centerPosition = (): { x: number; y: number } => {
    const rect = props.bodyRef.current?.getBoundingClientRect()
    const center = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 0, y: 0 }
    const graphId = useGraphStore.getState().route.slice(-1)[0]
    const nodeCount = graphId ? (useGraphStore.getState().graphs[graphId]?.nodeIds.length ?? 0) : 0
    const offset = (nodeCount % 5) * 36
    return { x: Math.round(center.x + offset), y: Math.round(center.y + offset) }
  }

  const notifyBlocked = async (): Promise<void> => {
    await dialogConfirm(`已达蓝图嵌套上限（${MAX_NESTING_DEPTH} 层），无法在当前层创建子蓝图节点`, '知道了')
  }

  const handleCreate = async (type: NodeType): Promise<void> => {
    const gs = useGraphStore.getState()
    const graphId = gs.route.slice(-1)[0]
    const graph = graphId ? gs.graphs[graphId] : undefined
    if (!graph) return
    const base = type === 'blueprint' ? '新蓝图' : type === 'text' ? '新文本' : '新引用'
    // 占用集合 = 当前图节点标题 + blueprints/ 全部文件名（文件命名空间全局，跨图创建同样冲突）
    const nodeTitles = graph.nodeIds.map((id) => gs.nodes[id]?.title ?? '')
    const fileTitles = (useNovelStore.getState().tree[0]?.children ?? []).flatMap((dir) =>
      (dir.children ?? []).filter((f) => f.kind === 'blueprint').map((f) => f.name.replace(/\.blueprint\.json$/, ''))
    )
    const title = defaultTitle(base, [...nodeTitles, ...fileTitles])

    if (type === 'blueprint') {
      // ADR-12：蓝图节点承载下一层子图，当前已在第 8 层时阻止并提示
      if (gs.route.length >= MAX_NESTING_DEPTH) {
        await notifyBlocked()
        return
      }
      // 先创建子图文件 → 主动刷新（graphPaths 补齐新图，避免依赖 watcher 300ms 延迟）
      // → 再建节点（addNode 内部立即落盘，规避「hydrate 覆盖未落盘内存」竞态）
      let created: { path: string; id?: string }
      try {
        created = await window.api.fs.createFile('blueprint', title)
      } catch (err) {
        console.error('[CanvasToolbar] 创建子图文件失败:', err)
        await dialogConfirm(`子蓝图文件创建失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
        return
      }
      await useNovelStore.getState().refreshTree()
      useGraphStore.getState().addNode({
        type,
        title,
        position: centerPosition(),
        refGraphId: created.id
      })
      return
    }

    useGraphStore.getState().addNode({ type, title, position: centerPosition() })
  }

  return (
    <div className="canvas-toolbar">
      <div className="canvas-toolbar-left">
        {CREATE_BUTTONS.map((b) => (
          <button key={b.type} className="left-tool-btn canvas-create-btn" title={b.hint} onClick={() => void handleCreate(b.type)}>
            {b.label}
          </button>
        ))}
      </div>
      <div className="canvas-toolbar-right">
        <span className={`save-state ${saving ? 'saving' : dirtyCount > 0 ? 'dirty' : 'saved'}`} title={saveError ?? undefined}>
          {saving ? '保存中…' : dirtyCount > 0 ? '未保存' : '已保存'}
        </span>
        <span className="depth-indicator" title={`蓝图嵌套上限 ${MAX_NESTING_DEPTH} 层（ADR-12）`}>
          层级 {route.length}/{MAX_NESTING_DEPTH}
        </span>
        <button className="left-tool-btn canvas-resource-btn" title="打开资源库（节点/标签模板）" onClick={props.onOpenResources}>
          资源库
        </button>
      </div>
    </div>
  )
}
