/**
 * 属性面板（右侧 Inspector）：选中节点/边/图三态
 * 节点态：标题/标签（含新建自定义标签）/prompt/summary/ref 指向/进入子图/删除
 * 边态：语义类型三选一（ADR-15）/label/删除；图态：当前图信息
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M2 初版
 */

import { useState } from 'react'
import type { ReactElement } from 'react'
import type { CSSProperties } from 'react'
import { MAX_NESTING_DEPTH } from '@shared/blueprint'
import type { BlueprintEdge, BlueprintNode, EdgeType } from '@shared/blueprint'
import type { TagDef } from '@shared/tags'
import { nextPaletteColor, tagColorOf } from '@shared/tags'
import { pathToGraph } from '@/services/graphTraversal'
import { useGraphStore } from '@/store/graphStore'
import { useNovelStore } from '@/store/novelStore'
import { dialogConfirm, dialogPrompt } from '@/store/dialogStore'

/** 类型显示名与默认强调色（无标签时的类型色） */
const TYPE_LABEL: Record<BlueprintNode['type'], string> = { blueprint: '蓝图', text: '文本', ref: '引用' }

/** 语义连线三型说明（ADR-15：箭头=因果/顺序，直线=并列关联，虚线=参考/伏笔） */
const EDGE_TYPES: Array<{ value: EdgeType; label: string; hint: string }> = [
  { value: 'arrow', label: '箭头·顺序', hint: '因果/顺序：展开、前后文推进（上下文权重最高）' },
  { value: 'line', label: '直线·关联', hint: '并列关联：同类设定互指（上下文权重中）' },
  { value: 'dashed', label: '虚线·参考', hint: '参考/伏笔：弱关联、跨章呼应（上下文权重低）' }
]

/** —— 标签编辑器：chips + 下拉勾选 + 新建自定义标签 —— */
function TagEditor(props: { node: BlueprintNode }): ReactElement {
  const { node } = props
  const tagLibrary = useNovelStore((s) => s.novel?.tagLibrary ?? [])
  const [open, setOpen] = useState(false)

  /** 始终读 store 最新状态（异步回调后闭包可能过期） */
  const toggleTag = (name: string): void => {
    const fresh = useGraphStore.getState().nodes[node.id]
    if (!fresh) return
    const has = fresh.tags.includes(name)
    useGraphStore.getState().updateNode(node.id, {
      tags: has ? fresh.tags.filter((t) => t !== name) : [...fresh.tags, name]
    })
  }

  const handleCreate = async (): Promise<void> => {
    const name = await dialogPrompt('新建标签', '标签名称')
    if (name === null || name.trim() === '') return
    const trimmed = name.trim()
    if (!tagLibrary.some((t) => t.name === trimmed)) {
      // 自定义标签色按已有自定义标签数轮转色板（shared/tags.ts）
      const color = nextPaletteColor(tagLibrary.filter((t) => !t.builtin).length)
      try {
        const created = await useNovelStore.getState().createTag(trimmed, color)
        if (!created) return
      } catch (err) {
        console.error('[InspectorPanel] 新建标签失败:', err)
        await dialogConfirm(`标签写入失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
        return
      }
    }
    toggleTag(trimmed)
    setOpen(false)
  }

  return (
    <div className="insp-tags">
      <div className="insp-tags-chips">
        {node.tags.length === 0 && <span className="insp-hint">无标签（标签决定节点着色）</span>}
        {node.tags.map((name) => {
          const color = tagColorOf(tagLibrary, name)
          return (
            <span key={name} className="bp-node-tag insp-tag-chip" style={{ '--tag-color': color ?? '#9da0a8' } as CSSProperties}>
              <span className="bp-node-tag-dot" />
              {name}
              <button className="insp-tag-remove" title="移除标签" onClick={() => toggleTag(name)}>
                ×
              </button>
            </span>
          )
        })}
        <button className="insp-tag-add" onClick={() => setOpen((v) => !v)}>
          + 标签
        </button>
      </div>
      {open && (
        <div className="insp-tag-menu">
          {tagLibrary.map((t: TagDef) => (
            <button
              key={t.name}
              className={`insp-tag-option ${node.tags.includes(t.name) ? 'on' : ''}`}
              style={{ '--tag-color': t.color } as CSSProperties}
              onClick={() => toggleTag(t.name)}
            >
              <span className="bp-node-tag-dot" />
              {t.name}
              {t.builtin ? <span className="insp-tag-builtin">内置</span> : null}
              <span className="insp-tag-check">{node.tags.includes(t.name) ? '✓' : ''}</span>
            </button>
          ))}
          <button className="insp-tag-option insp-tag-new" onClick={() => void handleCreate()}>
            + 新建自定义标签…
          </button>
        </div>
      )}
    </div>
  )
}

/** —— 节点态 —— */
function NodeInspector(props: { node: BlueprintNode }): ReactElement {
  const { node } = props
  const updateNode = useGraphStore((s) => s.updateNode)
  const tree = useNovelStore((s) => s.tree)

  /** 进入子图：已挂子图直接进入（含 8 层上限校验）；未挂（资源模板插入等）则先创建子图再挂接 */
  const handleEnter = async (): Promise<void> => {
    const gs = useGraphStore.getState()
    if (node.refGraphId) {
      const path = pathToGraph({ nodes: gs.nodes, edges: gs.edges, graphs: gs.graphs }, node.refGraphId)
      if (path.length > MAX_NESTING_DEPTH) {
        await dialogConfirm(`已达蓝图嵌套上限（${MAX_NESTING_DEPTH} 层），无法进入更深层子图`, '知道了')
        return
      }
      gs.enterGraph(node.refGraphId)
      return
    }
    // 未挂子图：创建子图文件 → 刷新 → 挂接并立即落盘 → 进入
    let created: { path: string; id?: string }
    try {
      created = await window.api.fs.createFile('blueprint', node.title)
    } catch (err) {
      console.error('[InspectorPanel] 创建子图文件失败:', err)
      await dialogConfirm(`子蓝图文件创建失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
      return
    }
    await useNovelStore.getState().refreshTree()
    useGraphStore.getState().updateNode(node.id, { refGraphId: created.id })
    void useGraphStore.getState().flushDirty()
    if (created.id) useGraphStore.getState().enterGraph(created.id)
  }

  const handleDelete = async (): Promise<void> => {
    const ok = await dialogConfirm(`删除节点「${node.title}」？相连的边将一并删除（子图文件保留，可在文件树中管理）`, '删除')
    if (!ok) return
    useGraphStore.getState().removeNodes([node.id])
  }

  /** ref 指向候选：文件树中的章节与蓝图文件（kind 取文件节点自身，目录节点恒为 'dir'） */
  const candidates = (tree[0]?.children ?? []).flatMap((dir) =>
    (dir.children ?? []).map((f) => ({ path: f.path, label: f.name, kind: f.kind }))
  )

  return (
    <div className="insp-body">
      <div className="insp-row">
        <span className={`insp-type-badge ${node.type}`}>{TYPE_LABEL[node.type]}</span>
        <input
          className="dialog-input insp-title-input"
          value={node.title}
          title="节点标题"
          onChange={(e) => updateNode(node.id, { title: e.target.value })}
        />
      </div>

      <div className="insp-section">标签</div>
      <TagEditor node={node} />

      {node.type === 'ref' && (
        <>
          <div className="insp-section">指向</div>
          <select
            className="dialog-input insp-select"
            value={node.refTarget ?? ''}
            onChange={(e) => updateNode(node.id, { refTarget: e.target.value === '' ? undefined : e.target.value })}
          >
            <option value="">（未选择指向）</option>
            {candidates.map((c) => (
              <option key={c.path} value={c.path}>
                {c.kind === 'chapter' ? '正文' : '蓝图'} · {c.label}
              </option>
            ))}
          </select>
          <div className="insp-hint">双击引用节点可打开指向的正文/蓝图</div>
        </>
      )}

      {node.type === 'blueprint' && (
        <>
          <div className="insp-section">子图</div>
          <button className="left-tool-btn insp-action-btn" onClick={() => void handleEnter()}>
            {node.refGraphId ? '进入子图' : '创建并进入子图'}
          </button>
          {!node.refGraphId && <div className="insp-hint">该节点暂未挂子图（如来自资源模板插入）</div>}
        </>
      )}

      <div className="insp-section">提示词（写作要求/文风约束）</div>
      <textarea
        className="dialog-input insp-textarea"
        value={node.prompt}
        rows={4}
        placeholder="例如：武侠文风，战斗场面多用短句；本章需回收第三章埋的伏笔"
        onChange={(e) => updateNode(node.id, { prompt: e.target.value })}
      />

      <div className="insp-section">摘要卡片（50-100 字，上级链路注入用）</div>
      <textarea
        className="dialog-input insp-textarea"
        value={node.summary}
        rows={3}
        placeholder="该节点的压缩表示：上级蓝图链路组装上下文时以此代替全文"
        onChange={(e) => updateNode(node.id, { summary: e.target.value })}
      />
      <div className="insp-hint">{node.summary.length} 字</div>

      <div className="insp-footer">
        <button className="insp-danger-btn" onClick={() => void handleDelete()}>
          删除节点
        </button>
      </div>
    </div>
  )
}

/** —— 边态 —— */
function EdgeInspector(props: { edge: BlueprintEdge }): ReactElement {
  const { edge } = props
  const updateEdge = useGraphStore((s) => s.updateEdge)
  const nodes = useGraphStore((s) => s.nodes)

  const handleDelete = async (): Promise<void> => {
    const ok = await dialogConfirm('删除这条连线？', '删除')
    if (!ok) return
    useGraphStore.getState().removeEdge(edge.id)
  }

  const from = nodes[edge.from]
  const to = nodes[edge.to]

  return (
    <div className="insp-body">
      <div className="insp-edge-title">语义连线</div>
      <div className="insp-hint">
        {from?.title ?? edge.from} → {to?.title ?? edge.to}
      </div>

      <div className="insp-section">类型（ADR-15 语义映射）</div>
      <div className="insp-edge-types">
        {EDGE_TYPES.map((t) => (
          <button
            key={t.value}
            className={`insp-edge-type-btn ${edge.type === t.value ? 'on' : ''}`}
            title={t.hint}
            onClick={() => updateEdge(edge.id, { type: t.value })}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="insp-section">连线说明（label）</div>
      <input
        className="dialog-input"
        value={edge.label ?? ''}
        placeholder="例如：师徒关系 / 第三章埋线"
        onChange={(e) => updateEdge(edge.id, { label: e.target.value.trim() === '' ? undefined : e.target.value })}
      />

      <div className="insp-footer">
        <button className="insp-danger-btn" onClick={() => void handleDelete()}>
          删除连线
        </button>
      </div>
    </div>
  )
}

/** —— 图态（未选中任何节点/边） —— */
function GraphInspector(): ReactElement {
  const route = useGraphStore((s) => s.route)
  const graphId = route[route.length - 1]
  const graph = useGraphStore((s) => (graphId ? s.graphs[graphId] : undefined))
  const edgeCount = useGraphStore((s) => Object.keys(s.edges).length)

  if (!graph) return <div className="insp-body insp-hint">当前无打开的蓝图</div>
  return (
    <div className="insp-body">
      <div className="insp-edge-title">{graph.title}</div>
      <div className="insp-hint">
        节点 {graph.nodeIds.length} 个 · 全局边 {edgeCount} 条 · 层级 {route.length}/{MAX_NESTING_DEPTH}
      </div>
      <div className="insp-section">操作提示</div>
      <ul className="insp-tips">
        <li>拖拽节点端口到另一节点创建连线（默认箭头型）</li>
        <li>拖到 ↗ 虚线代理节点上可创建跨图连线</li>
        <li>选中节点/边后按 Delete 键删除</li>
        <li>双击 ◆ 蓝图节点进入子图，面包屑可回退</li>
      </ul>
    </div>
  )
}

/** 属性面板入口：按选中态分发（数组化受控选中取首个） */
export function InspectorPanel(): ReactElement {
  const node = useGraphStore((s) => {
    const id = s.selectedNodeIds[0]
    return id ? s.nodes[id] : undefined
  })
  const edge = useGraphStore((s) => {
    const id = s.selectedEdgeIds[0]
    return id ? s.edges[id] : undefined
  })

  return (
    <div className="inspector-panel">
      <div className="insp-header">属性</div>
      {node ? <NodeInspector node={node} /> : edge ? <EdgeInspector edge={edge} /> : <GraphInspector />}
    </div>
  )
}
