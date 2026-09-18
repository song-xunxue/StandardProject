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

 * 2026-09-17
 * 变更说明：
 *   1. v2-F13：改写预设分区——新建/编辑（PresetForm：名称+多行指令）/删除；
 *      预设的使用入口在 AI 面板「改写预设」下拉（选中替换默认改写指令）
 */

import { useCallback, useEffect, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { ReactElement } from 'react'
import type { CSSProperties } from 'react'
import { graphToStructureTemplate, nodeToTemplate, normalizeStructureTemplate, tagSetTemplate, templateToNodeDraft } from '@shared/resource'
import { sanitizeFileName } from '@shared/sanitize'
import type { ResourceTemplate } from '@shared/types'
import { tagColorOf } from '@shared/tags'
import { MAX_NESTING_DEPTH } from '@shared/blueprint'
import { useGraphStore } from '@/store/graphStore'
import { useNovelStore } from '@/store/novelStore'
import { useUiStore } from '@/store/uiStore'
import { dialogConfirm, dialogPrompt } from '@/store/dialogStore'

interface ResourceItem {
  path: string
  template: ResourceTemplate
}

/** v2-F13 改写预设编辑表单（新建/编辑共用；origName 为空=新建） */
function PresetForm(props: {
  initial: { name: string; instruction: string; origName?: string }
  onDone: () => void
  onSaved: () => Promise<void>
}): ReactElement {
  const [name, setName] = useState(props.initial.name)
  const [instruction, setInstruction] = useState(props.initial.instruction)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async (): Promise<void> => {
    if (name.trim() === '' || instruction.trim() === '') {
      setError('名称与指令均必填')
      return
    }
    try {
      await window.api.fs.saveResource({
        kind: 'rewritePreset',
        name: name.trim(),
        payload: { instruction: instruction.trim() }
      })
      // 审查修复：编辑改名时删除旧档（saveResource 按文件名落盘，不删则旧预设残留
      // 可继续选用）；文件名按主进程同一 sanitizeFileName 规则拼出
      if (props.initial.origName && props.initial.origName !== name.trim()) {
        try {
          await window.api.fs.deleteResource(`${sanitizeFileName(props.initial.origName)}.rewritePreset.json`)
        } catch {
          /* 旧档删除失败不阻断（可能被并发改名）——列表残留可手动删 */
        }
      }
      await props.onSaved()
      useUiStore.getState().bumpResourceVersion()
      props.onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="ai-provider-form">
      <input className="dialog-input" placeholder="预设名称（如 去AI味 / 口语化）" value={name} onChange={(e) => setName(e.target.value)} />
      <textarea
        className="dialog-input resource-preset-textarea"
        placeholder="改写指令全文——选中该预设时替换「改写选中」的默认指令。可写多行具体要求（如：情绪不直接点破，改用动作呈现…）"
        maxLength={8000}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
      />
      {error && <div className="insp-hint ai-error">{error}</div>}
      <div className="ai-provider-form-actions">
        <button className="left-tool-btn" onClick={() => void handleSave()}>
          保存
        </button>
        <button className="left-tool-btn" onClick={props.onDone}>
          取消
        </button>
      </div>
    </div>
  )
}

export function ResourcePanel(props: { onClose: () => void }): ReactElement {
  const rf = useReactFlow()
  const [items, setItems] = useState<ResourceItem[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  /** v2-F13：改写预设编辑表单（null=关闭；origName=编辑既有） */
  const [presetForm, setPresetForm] = useState<{ name: string; instruction: string; origName?: string } | null>(null)
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

  /** v2-F5 插入结构模板：批量建节点（从既有内容包围盒右下方网格展开）+ 按索引映射连线；
   *  蓝图节点达 8 层时跳过并提示。插入后关闭浮层并选中首个新节点（晨间审查：原先
   *  固定流坐标连续插入会重叠、且无任何可见反馈——虚拟化下视口外不渲染看似无效）。
   *  v2 二批遗留修复：改走 addNodesBatch（单次 set+单次落盘——原逐个 addNode 产生
   *  首笔部分写 + N 次全图拷贝 churn） */
  const handleInsertStructure = (tpl: ResourceTemplate): void => {
    if (tpl.kind !== 'structure') return
    const gs = useGraphStore.getState()
    const graphId = gs.route.slice(-1)[0]
    const graph = graphId ? gs.graphs[graphId] : undefined
    if (!graph) return
    const payload = normalizeStructureTemplate(tpl.payload)
    // 落点基准：既有节点包围盒右下角外（晨间审查修复：原 (base%3)*60 小偏移，连续
    // 插入同一模板时几乎完全重叠）
    const members = graph.nodeIds.map((id) => gs.nodes[id]).filter((n): n is NonNullable<typeof n> => Boolean(n))
    const maxX = members.length > 0 ? Math.max(...members.map((n) => n.position.x)) : 0
    const maxY = members.length > 0 ? Math.max(...members.map((n) => n.position.y)) : 0
    // 网格散开：每行 4 个，从既有内容右下方展开（y 行序=模板节拍序）
    const { ids } = gs.addNodesBatch(
      payload.nodes.map((n, i) => ({
        type: n.type,
        title: n.title,
        tags: [...n.tags],
        prompt: n.prompt ?? '',
        summary: n.summary ?? '',
        aliases: [...(n.aliases ?? [])],
        aiVisibility: n.aiVisibility,
        position: { x: maxX + 120 + (i % 4) * 240, y: maxY + 80 + Math.floor(i / 4) * 110 }
      })),
      payload.edges
    )
    const skippedBlueprint = ids.filter((id, i) => id === null && payload.nodes[i]?.type === 'blueprint').length
    // 反馈：选中首个新节点 + 视口跳到新骨架（晨间审查：视口外的节点被虚拟化裁剪，
    //    不 fitView 时插入看似无效）+ 关闭浮层露出画布
    const newIds = ids.filter((x): x is string => x !== null)
    const firstId = newIds[0]
    if (firstId) gs.selectNode(firstId)
    if (newIds.length > 0) {
      void rf.fitView({ nodes: newIds.map((id) => ({ id })), padding: 0.25, duration: 300, maxZoom: 1.2 })
    }
    props.onClose()
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
      // 预设类删除/保存后递增版本号（AiPanel 订阅重载——防已删预设仍可选中生效）
      useUiStore.getState().bumpResourceVersion()
      await reload()
    } catch (err) {
      console.error('[ResourcePanel] 删除资源模板失败:', err)
      await dialogConfirm(`删除失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    }
  }

  const nodeItems = items.filter((i) => i.template.kind === 'node')
  const tagSetItems = items.filter((i) => i.template.kind === 'tagSet')
  const structureItems = items.filter((i) => i.template.kind === 'structure')
  const presetItems = items.filter((i) => i.template.kind === 'rewritePreset')

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
        <button
          className="left-tool-btn"
          title="新建改写预设（v2-F13：选中后替换「改写选中」的默认指令，跨小说共享）"
          onClick={() => setPresetForm({ name: '', instruction: '' })}
        >
          新建改写预设
        </button>
      </div>

      {/* v2-F13 改写预设编辑表单（新建/编辑共用） */}
      {presetForm && (
        <PresetForm
          initial={presetForm}
          onDone={() => setPresetForm(null)}
          onSaved={reload}
        />
      )}

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

        <div className="resource-section">改写预设（{presetItems.length}）</div>
        {presetItems.length === 0 && <div className="insp-hint">暂无——「新建改写预设」自定义指令，内置「去AI味」见首次安装</div>}
        {presetItems.map(({ path, template }) =>
          template.kind === 'rewritePreset' ? (
            <div key={path} className="resource-item">
              <div className="resource-item-main">
                <div className="resource-item-name">
                  ✎ {template.name}
                </div>
                <div className="resource-preset-preview insp-hint">
                  {template.payload.instruction.replace(/\s+/g, ' ').slice(0, 80)}
                  {template.payload.instruction.length > 80 ? '…' : ''}
                </div>
              </div>
              <div className="resource-item-acts">
                <button
                  className="resource-act"
                  title="编辑指令（AI 面板「改写预设」下拉中选择使用）"
                  onClick={() => setPresetForm({ name: template.name, instruction: template.payload.instruction, origName: template.name })}
                >
                  编辑
                </button>
                <button className="resource-act danger" title="删除预设" onClick={() => void handleDelete({ path, template })}>
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
