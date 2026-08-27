/**
 * AI 撰写面板（M3，替代 M0 的 ContextPreviewPanel）
 * 三合一：① Provider 管理（多 Provider 配置/safeStorage 密钥/连接测试，ADR-9/16）
 *        ② 撰写操作（续写=文末流式追加 / 改写=替换选中 / 中断；流式经主进程
 *          llm:chunk 推送 → StreamInserter 按帧批量写入 Tiptap，R7）
 *        ③ Context Viewer（三层预算条 / 实际组装 prompt 全文与复制 / 丢弃记录）
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M3 初版（承接 ContextPreviewPanel 的组装展示，草稿源从 DEMO_DRAFT 换成
 *      aiStore.editingDraft——正在编辑章节的真实文本）
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { Editor } from '@tiptap/core'
import type { ChatMessage, ProviderInfo } from '@shared/types'
import { assembleContext, layerBudgetsOf } from '@/services/contextAssembly'
import { StreamInserter } from '@/services/streamInsert'
import { GenerationWriter } from '@/services/generationWriter'
import { useAiStore } from '@/store/aiStore'
import { useGraphStore } from '@/store/graphStore'
import { useNovelStore } from '@/store/novelStore'
import { dialogConfirm } from '@/store/dialogStore'

const ROLE_LABEL: Record<string, string> = {
  self: '当前',
  neighbor: '直接邻居',
  ancestor: '上级蓝图',
  deep: '深层(语义加权)',
  keyword: '关键词兜底'
}

const LAYER_LABEL = ['第1层 60%', '第2层 25%', '第3层 15%']

/** 续写的用户指令正文截取（正文可能很长，只送尾部） */
const DRAFT_TAIL_CHARS = 2000

/** —— Provider 编辑表单 —— */
function ProviderForm(props: { initial: ProviderInfo | null; onDone: () => void }): ReactElement {
  const saveProvider = useAiStore((s) => s.saveProvider)
  const [name, setName] = useState(props.initial?.name ?? '')
  const [baseURL, setBaseURL] = useState(props.initial?.baseURL ?? '')
  const [model, setModel] = useState(props.initial?.model ?? '')
  const [apiKey, setApiKey] = useState('')
  const [isDefault, setIsDefault] = useState(props.initial?.isDefault ?? false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 「保存并测试」生成的新 id 记账：避免后续再点「保存」时以空 id 重复新建（审查修复）
  const [savedId, setSavedId] = useState<string | null>(null)

  const buildConfig = (): Omit<ProviderInfo, 'hasKey'> => ({
    id: savedId ?? props.initial?.id ?? '',
    name: name.trim(),
    baseURL: baseURL.trim().replace(/\/+$/, ''),
    model: model.trim(),
    isDefault
  })

  const handleSave = async (): Promise<void> => {
    if (!name.trim() || !baseURL.trim() || !model.trim()) {
      setError('名称 / Base URL / 模型均必填')
      return
    }
    try {
      await saveProvider(buildConfig(), apiKey === '' ? undefined : apiKey)
      props.onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleTest = async (): Promise<void> => {
    // 先保存再测试（测试按已保存的 id 走主进程，密钥在主进程加密后才可测）
    if (!name.trim() || !baseURL.trim() || !model.trim()) {
      setError('名称 / Base URL / 模型均必填')
      return
    }
    setError(null)
    setTesting(true)
    setTestResult(null)
    try {
      const saved = await window.api.provider.save(buildConfig(), apiKey === '' ? undefined : apiKey)
      setSavedId(saved.id)
      const result = await useAiStore.getState().testProvider(saved.id)
      setTestResult(result.ok ? `✓ ${result.message}` : `✗ ${result.message}`)
      await useAiStore.getState().loadProviders()
    } catch (err) {
      setTestResult(`✗ ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="ai-provider-form">
      <input className="dialog-input" placeholder="名称（如 DeepSeek / 本地 Ollama）" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="dialog-input" placeholder="Base URL（如 https://api.deepseek.com）" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} />
      <input className="dialog-input" placeholder="模型名（如 deepseek-chat / qwen2.5:14b）" value={model} onChange={(e) => setModel(e.target.value)} />
      <input
        className="dialog-input"
        type="password"
        placeholder={props.initial?.hasKey ? 'API Key（留空=保留已存密钥）' : 'API Key（Ollama 可留空）'}
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
      />
      <label className="ai-provider-default">
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        设为默认 Provider
      </label>
      {error && <div className="insp-hint ai-error">{error}</div>}
      <div className="ai-provider-form-actions">
        <button className="left-tool-btn" onClick={() => void handleTest()} disabled={testing}>
          {testing ? '测试中…' : '保存并测试'}
        </button>
        <button className="left-tool-btn" onClick={() => void handleSave()}>
          保存
        </button>
        <button className="left-tool-btn" onClick={props.onDone}>
          取消
        </button>
      </div>
      {testResult && <div className="insp-hint">{testResult}</div>}
    </div>
  )
}

export function AiPanel(): ReactElement {
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const graphs = useGraphStore((s) => s.graphs)
  const route = useGraphStore((s) => s.route)
  const selectedNodeId = useGraphStore((s) => s.selectedNodeIds[0] ?? null)
  const providers = useAiStore((s) => s.providers)
  const activeProviderId = useAiStore((s) => s.activeProviderId)
  const setActiveProvider = useAiStore((s) => s.setActiveProvider)
  const loadProviders = useAiStore((s) => s.loadProviders)
  const deleteProvider = useAiStore((s) => s.deleteProvider)
  const generation = useAiStore((s) => s.generation)
  const generationError = useAiStore((s) => s.generationError)
  const editingDraft = useAiStore((s) => s.editingDraft)
  const chapterEditor = useAiStore((s) => s.chapterEditor)
  const hasChapterTab = useNovelStore((s) => s.tabs.some((t) => t.kind === 'chapter'))

  const [editingProvider, setEditingProvider] = useState<'none' | 'new' | ProviderInfo['id']>('none')
  const [showPrompt, setShowPrompt] = useState(false)
  const inserterRef = useRef<StreamInserter | null>(null)
  const writerRef = useRef<GenerationWriter | null>(null)

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  /** 组装目标：ref 指向当前编辑章节的节点 → 选中节点 → 当前图首节点 → 任意节点 */
  const targetId = useMemo(() => {
    if (editingDraft) {
      const refNode = Object.values(nodes).find((n) => n.type === 'ref' && n.refTarget === editingDraft.path)
      if (refNode) return refNode.id
    }
    if (selectedNodeId && nodes[selectedNodeId]) return selectedNodeId
    const currentGraph = route.length > 0 ? graphs[route[route.length - 1]!] : undefined
    const first = currentGraph?.nodeIds.find((id) => nodes[id])
    return first ?? Object.keys(nodes)[0] ?? ''
  }, [editingDraft, nodes, selectedNodeId, route, graphs])

  /** 上下文组装（草稿 = 正在编辑章节的真实文本） */
  const result = useMemo(
    () => assembleContext({ nodes, edges, graphs }, targetId, { draft: editingDraft?.text ?? '' }),
    [nodes, edges, graphs, targetId, editingDraft?.text]
  )
  const target = nodes[targetId]
  const promptFullText = useMemo(() => result.segments.map((s) => s.text).join('\n\n'), [result.segments])

  /** 生成结束/出错时收尾：冲刷或丢弃挂起批次，再让写入器按 markdown 重排生成区 */
  useEffect(() => {
    if (generation === null && writerRef.current) {
      const writer = writerRef.current
      writerRef.current = null
      if (inserterRef.current) {
        if (generationError) inserterRef.current.abort()
        else inserterRef.current.close()
        inserterRef.current = null
      }
      // 失败/中断也保留已生成部分并重排（写入器内部有编辑器销毁防护）
      writer.finalize()
    }
  }, [generation, generationError])

  /** 生成中章节被关闭/切换（编辑器注销）：中断生成，避免 token 白烧与写入已销毁实例 */
  useEffect(() => {
    if (generation !== null && !chapterEditor) {
      void useAiStore.getState().stopGeneration()
    }
  }, [generation, chapterEditor])

  /** 组装消息（system=上下文全文；user=指令+正文） */
  const buildMessages = (mode: 'continue' | 'rewrite', selectedText: string): ChatMessage[] => {
    const instruction =
      mode === 'continue'
        ? '请紧接上文自然续写，保持人称、时态与文风一致，直接输出正文，不要任何说明或标题。'
        : '请改写下面选中的文字，保持情节事实不变、提升文笔，直接输出改写后的正文，不要任何说明。'
    const body = mode === 'continue' ? (editingDraft?.text ?? '').slice(-DRAFT_TAIL_CHARS) : selectedText
    return [
      { role: 'system', content: promptFullText || '（上下文为空：请在蓝图中先组织节点与连线）' },
      { role: 'user', content: `${instruction}\n\n${body}` }
    ]
  }

  /** 无章节编辑器挂载时（如在蓝图页打开 AI 面板）：切换到最近章节 Tab 并等待编辑器与内容就绪 */
  const ensureChapterEditor = async (): Promise<Editor | null> => {
    const ns = useNovelStore.getState()
    const chapterTabs = ns.tabs.filter((t) => t.kind === 'chapter')
    if (chapterTabs.length === 0) {
      await dialogConfirm('续写/改写需要先打开一个章节正文（在左侧文件树点击章节文件）', '知道了')
      return null
    }
    const active = ns.tabs.find((t) => t.id === ns.activeTabId)
    const target = active?.kind === 'chapter' ? active : chapterTabs[chapterTabs.length - 1]!
    if (target.id !== ns.activeTabId) ns.openTab('chapter', target.path)
    for (let i = 0; i < 30; i++) {
      const ed = useAiStore.getState().chapterEditor
      if (ed && useAiStore.getState().editingDraft?.path === target.path) return ed
      await new Promise((r) => setTimeout(r, 100))
    }
    return useAiStore.getState().chapterEditor
  }

  const handleGenerate = async (mode: 'continue' | 'rewrite'): Promise<void> => {
    const editor = chapterEditor ?? (await ensureChapterEditor())
    if (!editor) return
    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, '\n')
    if (mode === 'rewrite' && selectedText.trim() === '') {
      await dialogConfirm('改写需要先在正文中选中一段文字', '知道了')
      return
    }
    // 写入器：实时取编辑器实例（切 Tab 销毁防护）；改写模式首批落地才删选区
    const writer = new GenerationWriter(() => useAiStore.getState().chapterEditor)
    if (mode === 'rewrite') writer.beginRewrite({ from, to })
    writerRef.current = writer
    inserterRef.current = new StreamInserter((batch) => writer.applyBatch(batch))
    try {
      await useAiStore.getState().startGeneration(mode, buildMessages(mode, selectedText), (delta) => {
        inserterRef.current?.push(delta)
      })
    } catch (err) {
      console.error('[AiPanel] 生成发起失败:', err)
      inserterRef.current?.abort()
      inserterRef.current = null
      writer.finalize()
      writerRef.current = null
    }
  }

  const activeProvider = providers.find((p) => p.id === activeProviderId) ?? null
  const editingProviderObj = editingProvider !== 'none' && editingProvider !== 'new' ? (providers.find((p) => p.id === editingProvider) ?? null) : null

  const handleCopyPrompt = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(promptFullText)
    } catch (err) {
      console.error('[AiPanel] 复制失败:', err)
    }
  }

  const handleDeleteProvider = async (id: string): Promise<void> => {
    const ok = await dialogConfirm('删除该 AI Provider 配置？（密钥一并删除）', '删除')
    if (!ok) return
    try {
      await deleteProvider(id)
    } catch (err) {
      await dialogConfirm(`删除失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    }
  }

  return (
    <div className="ctx-panel left-scroll ai-panel">
      <div className="ctx-header">
        <div className="ctx-title">AI 撰写</div>
        <div className="ctx-target">{target ? `上下文目标：${target.title}` : '无上下文目标'}</div>
      </div>

      {/* Provider 管理 */}
      <div className="ctx-budget">
        <div className="ai-provider-row">
          <select
            className="dialog-input ai-provider-select"
            value={activeProviderId ?? ''}
            onChange={(e) => setActiveProvider(e.target.value)}
            title="当前使用的 AI Provider"
          >
            {providers.length === 0 && <option value="">（未配置 Provider）</option>}
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.model}
                {p.hasKey ? '' : ' · 无密钥'}
              </option>
            ))}
          </select>
          <button className="resource-act" title="新增 Provider" onClick={() => setEditingProvider('new')}>
            ＋
          </button>
          <button
            className="resource-act"
            title="编辑当前 Provider"
            disabled={!activeProvider}
            onClick={() => activeProvider && setEditingProvider(activeProvider.id)}
          >
            ✎
          </button>
          <button
            className="resource-act danger"
            title="删除当前 Provider"
            disabled={!activeProvider}
            onClick={() => activeProvider && void handleDeleteProvider(activeProvider.id)}
          >
            ×
          </button>
        </div>
        {(editingProvider === 'new' || editingProviderObj) && (
          <ProviderForm initial={editingProvider === 'new' ? null : editingProviderObj} onDone={() => setEditingProvider('none')} />
        )}
      </div>

      {/* 撰写操作 */}
      <div className="ctx-budget">
        <div className="ai-actions">
          <button
            className="left-tool-btn"
            disabled={generation !== null || !activeProviderId}
            title={chapterEditor ? '在正文末尾流式续写' : hasChapterTab ? '自动切换到最近的章节正文续写' : '需要先创建并打开一个章节正文'}
            onClick={() => void handleGenerate('continue')}
          >
            ✍ 续写
          </button>
          <button
            className="left-tool-btn"
            disabled={generation !== null || !activeProviderId}
            title="改写正文中选中的文字（无编辑器时自动切换到最近章节）"
            onClick={() => void handleGenerate('rewrite')}
          >
            ⟳ 改写选中
          </button>
          <button
            className="left-tool-btn"
            disabled={generation === null}
            title="中断当前生成"
            onClick={() => void useAiStore.getState().stopGeneration()}
          >
            ■ 停止
          </button>
        </div>
        {generation && <div className="insp-hint ai-streaming">生成中…（流式写入正文）</div>}
        {generationError && <div className="insp-hint ai-error">生成失败：{generationError}</div>}
      </div>

      {/* Context Viewer：三层预算（行容器 ctx-budget-row / 轨道 ctx-budget-bar，对齐 M0 样式） */}
      <div className="ctx-budget">
        {result.layerTokens.map((used, i) => {
          const budget = layerBudgetsOf()[i]!
          const pct = budget > 0 ? Math.min(100, (used / budget) * 100) : 0
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
          合计 {result.totalTokens} / {result.totalBudget} tokens · 预算命中率{' '}
          {result.totalBudget > 0 ? `${Math.min(100, Math.round((result.totalTokens / result.totalBudget) * 100))}%` : '—'}
          {editingDraft ? ' · 草稿来源：编辑中章节' : ' · 草稿来源：无'}
        </div>
      </div>

      {/* 组装片段 */}
      <div className="ctx-segments">
        {result.segments.map((seg, i) => (
          <div key={`${seg.nodeId}-${i}`} className={`ctx-seg layer-${seg.layer}`}>
            <div className="ctx-seg-head">
              <span>
                L{seg.layer} · {seg.title}
              </span>
              <span className="ctx-seg-role">
                {ROLE_LABEL[seg.role] ?? seg.role} · {seg.tokens}t
              </span>
            </div>
            <div className="ctx-seg-text">{seg.text}</div>
          </div>
        ))}
      </div>

      {/* prompt 全文 */}
      <div className="ctx-budget">
        <div className="ai-prompt-actions">
          <button className="left-tool-btn" onClick={() => setShowPrompt((v) => !v)}>
            {showPrompt ? '收起' : '展开'}实际发送的 Prompt 全文
          </button>
          <button className="left-tool-btn" onClick={() => void handleCopyPrompt()} disabled={promptFullText === ''}>
            复制
          </button>
        </div>
        {showPrompt && <pre className="ai-prompt-fulltext">{promptFullText || '（空）'}</pre>}
      </div>

      {/* 丢弃记录 */}
      {result.dropped.length > 0 && (
        <div className="ctx-dropped">
          <div className="ctx-dropped-title">未注入（{result.dropped.length}）</div>
          {result.dropped.map((d, i) => (
            <div key={i} className="ctx-dropped-item">
              {d.title} — {d.reason === 'truncated' ? '已截断' : '超层预算'}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
