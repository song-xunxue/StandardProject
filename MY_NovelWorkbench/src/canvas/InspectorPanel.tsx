/**
 * 属性面板（右侧 Inspector）：选中节点/边/图三态
 * 节点态：标题/标签（含新建自定义标签）/别名/prompt/summary/ref 指向/进入子图/删除
 * 边态：语义类型三选一（ADR-15）/label/删除；图态：当前图信息
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-28
 * 变更说明：
 *   1. M2 初版
 *   2. M4-B：节点态新增别名编辑（AliasEditor，审查遗留低危——此前 aliases 只能手改 JSON）
 */

import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { CSSProperties } from 'react'
import { MAX_NESTING_DEPTH } from '@shared/blueprint'
import type { BlueprintEdge, BlueprintNode, EdgeType } from '@shared/blueprint'
import type { TagDef } from '@shared/tags'
import { nextPaletteColor, tagColorOf } from '@shared/tags'
import { pathToGraph } from '@/services/graphTraversal'
import { flattenChapterFiles } from '@/services/chapterTree'
import { AliasEditor } from '@/canvas/AliasEditor'
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
    // 标签名与 frontmatter 内联数组裸值语法同限制：逗号/方括号/引号/换行会破坏 tags 往返（M2 既有缺口，M4-B 补防线）
    if (/[,[\]'"\r\n]/.test(trimmed)) {
      await dialogConfirm('标签名不能包含逗号、方括号、引号或换行（会破坏 frontmatter 往返），请换个写法', '知道了')
      return
    }
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

  /** 从标签库删除自定义标签（M4-B）：删除前统计节点引用数并提示残留表现 */
  const handleDeleteTag = async (name: string): Promise<void> => {
    const refCount = Object.values(useGraphStore.getState().nodes).filter((n) => n.tags.includes(name)).length
    const residueNote = '已贴节点保留该标签（显示为灰色），可在属性面板逐个摘除；章节 frontmatter 中手写的同名 tags 同样失去配色。'
    const message =
      refCount > 0
        ? `标签「${name}」正被 ${refCount} 个节点使用。删除后标签库不再包含它，${residueNote}确定删除？`
        : `从标签库删除自定义标签「${name}」？${residueNote}`
    const ok = await dialogConfirm(message, '删除')
    if (!ok) return
    try {
      await useNovelStore.getState().removeTag(name)
      setOpen(false)
    } catch (err) {
      console.error('[InspectorPanel] 删除标签失败:', err)
      await dialogConfirm(`标签删除失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    }
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
            // 行容器：主按钮（勾选/取消）+ 自定义标签的删除按钮（M4-B；HTML 不允许 button 嵌套）
            <div key={t.name} className="insp-tag-option-row">
              <button
                className={`insp-tag-option ${node.tags.includes(t.name) ? 'on' : ''}`}
                style={{ '--tag-color': t.color } as CSSProperties}
                onClick={() => toggleTag(t.name)}
              >
                <span className="bp-node-tag-dot" />
                {t.name}
                {t.builtin ? <span className="insp-tag-builtin">内置</span> : null}
                <span className="insp-tag-check">{node.tags.includes(t.name) ? '✓' : ''}</span>
              </button>
              {!t.builtin && (
                <button className="insp-tag-del" title="从标签库删除" onClick={() => void handleDeleteTag(t.name)}>
                  ×
                </button>
              )}
            </div>
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

  // 文本字段本地态：打字不写 store（避免每键触发画布/左栏/AI 面板全量重渲染），
  // 失焦才提交；切换选中节点时重置。标签等离散操作仍即时提交
  const [title, setTitle] = useState(node.title)
  const [prompt, setPrompt] = useState(node.prompt)
  const [summary, setSummary] = useState(node.summary)
  useEffect(() => {
    setTitle(node.title)
    setPrompt(node.prompt)
    setSummary(node.summary)
  }, [node.id])

  const commitText = (patch: Partial<Pick<BlueprintNode, 'title' | 'prompt' | 'summary'>>): void => {
    const fresh = useGraphStore.getState().nodes[node.id]
    if (!fresh) return
    const next = { ...fresh, ...patch }
    if (next.title === fresh.title && next.prompt === fresh.prompt && next.summary === fresh.summary) return
    updateNode(node.id, patch)
  }

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

  /** 别名增删：读 store 最新状态解析（dialogPrompt 异步返回后 props 快照可能过期，同 toggleTag 约定） */
  const addAlias = (alias: string): void => {
    const fresh = useGraphStore.getState().nodes[node.id]
    if (!fresh || fresh.aliases.includes(alias)) return
    updateNode(node.id, { aliases: [...fresh.aliases, alias] })
  }

  const removeAlias = (alias: string): void => {
    const fresh = useGraphStore.getState().nodes[node.id]
    if (!fresh) return
    updateNode(node.id, { aliases: fresh.aliases.filter((a) => a !== alias) })
  }

  /** ref 指向候选：全部章节（含卷内）与蓝图文件（目录节点不进候选） */
  const candidates = [
    ...flattenChapterFiles(tree).map((c) => ({
      path: c.path,
      label: c.volume ? `${c.volume}/${c.title}` : c.title,
      kind: 'chapter' as const
    })),
    ...(tree[0]?.children?.find((d) => d.path === 'blueprints')?.children ?? []).map((f) => ({
      path: f.path,
      label: f.name.replace(/\.blueprint\.json$/, ''),
      kind: 'blueprint' as const
    }))
  ]

  return (
    <div className="insp-body">
      <div className="insp-row">
        <span className={`insp-type-badge ${node.type}`}>{TYPE_LABEL[node.type]}</span>
        <input
          className="dialog-input insp-title-input"
          value={title}
          title="节点标题"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => commitText({ title })}
        />
      </div>

      <div className="insp-section">标签</div>
      <TagEditor node={node} />

      <div className="insp-section">别名（关键词兜底匹配用）</div>
      <AliasEditor values={node.aliases} onAdd={addAlias} onRemove={removeAlias} addTitle="添加节点别名" />

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
        value={prompt}
        rows={4}
        placeholder="例如：武侠文风，战斗场面多用短句；本章需回收第三章埋的伏笔"
        onChange={(e) => setPrompt(e.target.value)}
        onBlur={() => commitText({ prompt })}
      />

      <div className="insp-section">摘要卡片（50-100 字，上级链路注入用）</div>
      <textarea
        className="dialog-input insp-textarea"
        value={summary}
        rows={3}
        placeholder="该节点的压缩表示：上级蓝图链路组装上下文时以此代替全文"
        onChange={(e) => setSummary(e.target.value)}
        onBlur={() => commitText({ summary })}
      />
      <div className="insp-hint">{summary.length} 字（失焦保存）</div>

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

  // label 本地态（同节点文本字段：失焦提交，避免每键全局扩散）
  const [label, setLabel] = useState(edge.label ?? '')
  useEffect(() => {
    setLabel(edge.label ?? '')
  }, [edge.id])

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
        value={label}
        placeholder="例如：师徒关系 / 第三章埋线"
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => updateEdge(edge.id, { label: label.trim() === '' ? undefined : label })}
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
