/**
 * 资源库面板（浮层）：节点模板 / 标签组模板 / 结构模板（v2-F5）的保存与插入
 * M4-B 起存储于全局目录 userData/resources/*.json（跨小说共享，FR-08）；
 * 列表为打开时拉取 + 保存/删除后本地刷新（不依赖 watcher 推送）
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-28
 * 变更说明：
 *   1. M2 初版
 *   2. M4-B：存储迁全局目录（跨小说）；面板标题标注「跨小说」，模板标签不在当前小说标签库时回退灰色
 *
 * 2026-09-01
 * 变更说明：
 *   1. v2-F5：结构模板分区——插入=当前图批量建节点+连线（网格散开防重叠）；
 *      「存当前图为结构模板」把整图压成可复用骨架（跨图边跳过）
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { CSSProperties } from 'react'
import { graphToStructureTemplate, nodeToTemplate, normalizeStructureTemplate, tagSetTemplate, templateToNodeDraft } from '@shared/resource'
import type { ResourceTemplate } from '@shared/types'
import { tagColorOf } from '@shared/tags'
import { MAX_NESTING_DEPTH } from '@shared/blueprint'
import { useGraphStore } from '@/store/graphStore'
import { useNovelStore } from '@/store/novelStore'
import { dialogConfirm, dialogPrompt } from '@/store/dialogStore'

interface ResourceItem {
  path: string
  template: ResourceTemplate
}

export function ResourcePanel(props: { onClose: () => void }): ReactElement {
  const [items, setItems] = useState<ResourceItem[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  // 数组化受控选中取首个
  const selectedNode = useGraphStore((s) => {
    const id = s.selectedNodeIds[0]
    return id ? s.nodes[id] : undefined
  })
  const tagLibrary = useNovelStore((s) => s.novel?.tagLibrary ?? [])

  const reload = useCallback(async (): Promise<void> => {
    try {
      setItems(await window.api.fs.listResources())
      setLoadError(null)
    } catch (err) {
      console.error('[ResourcePanel] 读取资源库失败:', err)
      setLoadError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /** 保存选中节点为节点模板（剥 id/坐标/子图指向，插入时重新生成） */
  const handleSaveNode = async (): Promise<void> => {
    if (!selectedNode) return
    const name = await dialogPrompt('保存节点模板', '模板名称', selectedNode.title)
    if (name === null || name.trim() === '') return
    try {
      await window.api.fs.saveResource({ kind: 'node', name: name.trim(), payload: nodeToTemplate(selectedNode) })
      await reload()
    } catch (err) {
      console.error('[ResourcePanel] 保存节点模板失败:', err)
      await dialogConfirm(`保存失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    }
  }

  /** 保存选中节点当前标签集合为标签组模板 */
  const handleSaveTagSet = async (): Promise<void> => {
    if (!selectedNode || selectedNode.tags.length === 0) return
    const name = await dialogPrompt('保存标签组模板', '模板名称', selectedNode.tags.join('-'))
    if (name === null || name.trim() === '') return
    try {
      await window.api.fs.saveResource(tagSetTemplate(name.trim(), selectedNode.tags))
      await reload()
    } catch (err) {
      console.error('[ResourcePanel] 保存标签组模板失败:', err)
      await dialogConfirm(`保存失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    }
  }

  /** 插入节点模板：新 id + 画布内偏移落点（graphStore.addNode 内部立即落盘）；蓝图模板在 8 层被拒时提示 */
  const handleInsert = (tpl: ResourceTemplate): void => {
    if (tpl.kind !== 'node') return
    const gs = useGraphStore.getState()
    const graphId = gs.route.slice(-1)[0]
    const graph = graphId ? gs.graphs[graphId] : undefined
    if (!graph) return
    const draft = templateToNodeDraft(tpl.payload)
    const count = graph.nodeIds.length
    const id = gs.addNode({
      ...draft,
      position: { x: 80 + (count % 5) * 60, y: 80 + (count % 5) * 48 }
    })
    if (id === null && draft.type === 'blueprint') {
      void dialogConfirm(`已达蓝图嵌套上限（${MAX_NESTING_DEPTH} 层），无法插入蓝图类型模板`, '知道了')
    }
  }

  /** 应用标签组模板到选中节点（覆盖其标签集合） */
  const handleApplyTagSet = (tpl: ResourceTemplate): void => {
    if (tpl.kind !== 'tagSet') return
    const gs = useGraphStore.getState()
    const targetId = gs.selectedNodeIds[0]
    if (!targetId) return
    gs.updateNode(targetId, { tags: [...tpl.payload.tags] })
  }

  /** v2-F5 插入结构模板：批量建节点（网格散开防重叠）+ 按索引映射连线；蓝图节点达 8 层时跳过并提示 */
  const handleInsertStructure = (tpl: ResourceTemplate): void => {
    if (tpl.kind !== 'structure') return
    const gs = useGraphStore.getState()
    const graphId = gs.route.slice(-1)[0]
    const graph = graphId ? gs.graphs[graphId] : undefined
    if (!graph) return
    const payload = normalizeStructureTemplate(tpl.payload)
    const base = graph.nodeIds.length
    const idOf: Array<string | null> = []
    let skippedBlueprint = 0
    payload.nodes.forEach((n, i) => {
      // 网格散开：每行 4 个，新节点排在既有节点右下方，避免与画布现有内容重叠
      const col = i % 4
      const row = Math.floor(i / 4)
      const id = gs.addNode({
        type: n.type,
        title: n.title,
        tags: [...n.tags],
        prompt: n.prompt ?? '',
        summary: n.summary ?? '',
        position: { x: 120 + (base % 3) * 60 + col * 240, y: 100 + row * 110 }
      })
      idOf.push(id)
      if (id === null && n.type === 'blueprint') skippedBlueprint++
    })
    for (const e of payload.edges) {
      const from = idOf[e.from]
      const to = idOf[e.to]
      if (from && to) gs.addEdge(from, to, e.type)
    }
    if (skippedBlueprint > 0) {
      void dialogConfirm(
        `已达蓝图嵌套上限（${MAX_NESTING_DEPTH} 层），已跳过 ${skippedBlueprint} 个蓝图类型节点（可插入后手动改为文本类型）`,
        '知道了'
      )
    }
  }

  /** v2-F5 存当前图为结构模板（整图压成骨架：跨图边与端点不在本图的边跳过） */
  const handleSaveStructure = async (): Promise<void> => {
    const gs = useGraphStore.getState()
    const graphId = gs.route.slice(-1)[0]
    const graph = graphId ? gs.graphs[graphId] : undefined
    if (!graph || graph.nodeIds.length === 0) return
    const name = await dialogPrompt('存当前图为结构模板', '模板名称', graph.title)
    if (name === null || name.trim() === '') return
    const payload = graphToStructureTemplate({ nodes: gs.nodes, edges: gs.edges, graphs: gs.graphs }, graphId)
    if (!payload) return
    try {
      await window.api.fs.saveResource({ kind: 'structure', name: name.trim(), payload })
      await reload()
    } catch (err) {
      console.error('[ResourcePanel] 保存结构模板失败:', err)
      await dialogConfirm(`保存失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    }
  }

  const handleDelete = async (item: ResourceItem): Promise<void> => {
    const ok = await dialogConfirm(`删除资源模板「${item.template.name}」？`, '删除')
    if (!ok) return
    try {
      await window.api.fs.deleteResource(item.path)
      await reload()
    } catch (err) {
      console.error('[ResourcePanel] 删除资源模板失败:', err)
      await dialogConfirm(`删除失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    }
  }

  const nodeItems = items.filter((i) => i.template.kind === 'node')
  const tagSetItems = items.filter((i) => i.template.kind === 'tagSet')
  const structureItems = items.filter((i) => i.template.kind === 'structure')

  return (
    <div className="resource-panel">
      <div className="resource-header">
        <span>资源库（跨小说共享）</span>
        <button className="resource-close" title="关闭" onClick={props.onClose}>
          ×
        </button>
      </div>

      <div className="resource-actions">
        <button
          className="left-tool-btn"
          disabled={!selectedNode}
          title={selectedNode ? '将选中节点存为可复用模板' : '先在画布选中一个节点'}
          onClick={() => void handleSaveNode()}
        >
          存为节点模板
        </button>
        <button
          className="left-tool-btn"
          disabled={!selectedNode || selectedNode.tags.length === 0}
          title={selectedNode ? '将选中节点当前的标签集合存为模板' : '先选中带标签的节点'}
          onClick={() => void handleSaveTagSet()}
        >
          存为标签组
        </button>
        <button
          className="left-tool-btn"
          title="把当前画布整图压成可复用骨架（节点+连线结构，v2-F5）"
          onClick={() => void handleSaveStructure()}
        >
          存当前图为结构模板
        </button>
      </div>

      {loadError && <div className="insp-hint">资源库读取失败：{loadError}</div>}

      {/* 可滚动列表容器：模板多时可滚动访问底部条目 */}
      <div className="resource-list left-scroll">
        <div className="resource-section">节点模板（{nodeItems.length}）</div>
        {nodeItems.length === 0 && <div className="insp-hint">暂无——选中节点后可保存为模板</div>}
        {nodeItems.map(({ path, template }) =>
          template.kind === 'node' ? (
            <div key={path} className="resource-item">
              <div className="resource-item-main">
                <div className="resource-item-name">
                  {template.payload.type === 'blueprint' ? '◆ ' : template.payload.type === 'ref' ? '§ ' : ''}
                  {template.name}
                </div>
                {template.payload.tags.length > 0 && (
                  <div className="resource-item-tags">
                    {template.payload.tags.map((t) => (
                      <span key={t} className="bp-node-tag" style={{ '--tag-color': tagColorOf(tagLibrary, t) ?? '#9da0a8' } as CSSProperties}>
                        <span className="bp-node-tag-dot" />
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="resource-item-acts">
                <button className="resource-act" title="插入到当前画布（视口内落点）" onClick={() => handleInsert(template)}>
                  插入
                </button>
                <button className="resource-act danger" title="删除模板" onClick={() => void handleDelete({ path, template })}>
                  ×
                </button>
              </div>
            </div>
          ) : null
        )}

        <div className="resource-section">标签组模板（{tagSetItems.length}）</div>
        {tagSetItems.length === 0 && <div className="insp-hint">暂无——选中带标签的节点可保存标签组</div>}
        {tagSetItems.map(({ path, template }) =>
          template.kind === 'tagSet' ? (
            <div key={path} className="resource-item">
              <div className="resource-item-main">
                <div className="resource-item-name">{template.name}</div>
                <div className="resource-item-tags">
                  {template.payload.tags.map((t) => (
                    <span key={t} className="bp-node-tag" style={{ '--tag-color': tagColorOf(tagLibrary, t) ?? '#9da0a8' } as CSSProperties}>
                      <span className="bp-node-tag-dot" />
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="resource-item-acts">
                <button
                  className="resource-act"
                  title="应用到选中节点（覆盖其标签）"
                  disabled={!selectedNode}
                  onClick={() => handleApplyTagSet(template)}
                >
                  应用
                </button>
                <button className="resource-act danger" title="删除模板" onClick={() => void handleDelete({ path, template })}>
                  ×
                </button>
              </div>
            </div>
          ) : null
        )}

        <div className="resource-section">结构模板（{structureItems.length}）</div>
        {structureItems.length === 0 && <div className="insp-hint">暂无——可「存当前图为结构模板」，内置三幕/英雄之旅/救猫咪见首次安装</div>}
        {structureItems.map(({ path, template }) =>
          template.kind === 'structure' ? (
            <div key={path} className="resource-item">
              <div className="resource-item-main">
                <div className="resource-item-name">
                  ⌗ {template.name}
                  <span className="insp-hint" style={{ marginLeft: 8 }}>
                    {template.payload.nodes.length} 节点 · {template.payload.edges.length} 连线
                  </span>
                </div>
                {template.payload.nodes[0] && template.payload.nodes[0].tags.length > 0 && (
                  <div className="resource-item-tags">
                    {template.payload.nodes[0].tags.slice(0, 4).map((t) => (
                      <span key={t} className="bp-node-tag" style={{ '--tag-color': tagColorOf(tagLibrary, t) ?? '#9da0a8' } as CSSProperties}>
                        <span className="bp-node-tag-dot" />
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="resource-item-acts">
                <button className="resource-act" title="在当前画布批量生成骨架（节点+连线）" onClick={() => handleInsertStructure(template)}>
                  插入
                </button>
                <button className="resource-act danger" title="删除模板" onClick={() => void handleDelete({ path, template })}>
                  ×
                </button>
              </div>
            </div>
          ) : null
        )}
      </div>
    </div>
  )
}
