/**
 * 节拍整章草稿发起浮层（v2-F16）：子图节拍序列 → 整章生成
 * 列节拍（可勾选/显示拓扑序或坐标序回退）+ 字数档位 + 目标章（当前章/新章）+
 * 单路（流式写入编辑器，仅当前章）或三路（候选预览，采纳时落盘/建章）
 *
 * 作者: 李文煜
 * 日期: 2026-09-17
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { BEAT_LENGTH_PRESETS, beatChapterMessages, maxTokensOfChars, planBeats } from '@/services/beatAssembly'
import { estimateTokens } from '@/services/contextAssembly'
import { ancestorNodesOf } from '@/services/graphTraversal'
import { flattenChapterFiles, volumeOfChapter } from '@/services/chapterTree'
import { assembleRecap, recapConfigOf } from '@/services/recapAssembly'
import { nextNumberedName } from '@shared/naming'
import { StreamInserter } from '@/services/streamInsert'
import { GenerationWriter } from '@/services/generationWriter'
import { useAiStore } from '@/store/aiStore'
import { useGraphStore } from '@/store/graphStore'
import { useNovelStore } from '@/store/novelStore'
import { useUiStore } from '@/store/uiStore'
import { dialogConfirm } from '@/store/dialogStore'

export function BeatLauncher(): ReactElement {
  const target = useUiStore((s) => s.beatLauncher)
  const close = useUiStore((s) => s.closeBeatLauncher)
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const graphs = useGraphStore((s) => s.graphs)
  const editingDraft = useAiStore((s) => s.editingDraft)
  const generation = useAiStore((s) => s.generation)
  const multiGen = useAiStore((s) => s.multiGen)

  // 勾选集（默认全选）；字数档位；目标章模式；路数
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [lengthIdx, setLengthIdx] = useState(1)
  const [targetMode, setTargetMode] = useState<'current' | 'new'>('current')
  const [lanes, setLanes] = useState<1 | 3>(3)
  const [launching, setLaunching] = useState(false)
  /** 单路模式的流式写入器（生命周期随本浮层，收尾口径与 AiPanel 一致） */
  const inserterRef = useRef<StreamInserter | null>(null)
  const writerRef = useRef<GenerationWriter | null>(null)
  const [singlePathDone, setSinglePathDone] = useState(false)

  const data = useMemo(() => ({ nodes, edges, graphs }), [nodes, edges, graphs])
  const plan = useMemo(() => (target ? planBeats(data, target.graphId) : null), [data, target])

  // 切换目标子图时重置勾选为全选（不随节点拖动/属性变更重算而重置）
  useEffect(() => {
    const p = useGraphStore.getState()
    const t = useUiStore.getState().beatLauncher
    if (t) setChecked(new Set(planBeats({ nodes: p.nodes, edges: p.edges, graphs: p.graphs }, t.graphId).beats.map((b) => b.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.graphId])

  // 上级设定链：子图宿主蓝图节点 + 其各级祖先（自内向外）
  const ancestors = useMemo(() => {
    if (!target) return []
    const ownerNodeId = graphs[target.graphId]?.ownerNodeId
    if (!ownerNodeId) return []
    const owner = nodes[ownerNodeId]
    if (!owner) return []
    return [owner, ...ancestorNodesOf(data, owner.id)]
      .filter((n) => n.summary !== '' || n.title !== '')
      .map((n) => ({ title: n.title, summary: n.summary }))
  }, [data, graphs, nodes, target])

  // 目标章解析（tree 订阅——采纳建章后新章序号随之更新）
  const tree = useNovelStore((s) => s.tree)
  const chapters = useMemo(() => flattenChapterFiles(tree), [tree])
  const currentChapter = editingDraft
    ? { path: editingDraft.path, title: editingDraft.path.split('/').pop()?.replace(/\.md$/, '') ?? '' }
    : null
  const newChapterTitle = useMemo(
    () => nextNumberedName(chapters.map((c) => c.title), '章'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapters.length]
  )
  const newChapterVolume = chapters.length > 0 ? volumeOfChapter(chapters[chapters.length - 1]!.path) : undefined
  const newChapterPath = `chapters/${newChapterVolume ? `${newChapterVolume}/` : ''}${newChapterTitle}.md`
  // 当前无编辑章时目标只能选新章
  const effectiveTargetMode = currentChapter === null ? 'new' : targetMode

  const selectedBeats = useMemo(
    () => (plan ? plan.beats.filter((b) => checked.has(b.id)) : []),
    [plan, checked]
  )
  /** 新章目标只支持三路（采纳时建章）；单路流式需编辑器就绪 */
  const effectiveLanes: 1 | 3 = effectiveTargetMode === 'new' ? 3 : lanes
  const lengthChars = BEAT_LENGTH_PRESETS[lengthIdx]?.chars ?? 4000
  const targetTitle = effectiveTargetMode === 'current' ? (currentChapter?.title ?? newChapterTitle) : newChapterTitle
  const targetPath = effectiveTargetMode === 'current' ? currentChapter?.path ?? newChapterPath : newChapterPath

  // 估算 token（不含前情——发起时按目标章位置现算）
  const estimated = useMemo(() => {
    if (selectedBeats.length === 0) return 0
    const msgs = beatChapterMessages({
      beats: selectedBeats.map((b) => ({ title: b.title, prompt: b.prompt, summary: b.summary })),
      ancestors,
      recap: '',
      targetTitle,
      lengthChars
    })
    return msgs.reduce((s, m) => s + estimateTokens(m.content), 0)
  }, [selectedBeats, ancestors, targetTitle, lengthChars])

  // Esc 关闭（浮层族统一交互；单路生成进行中不响应 Esc——用停止按钮）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !launching) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, launching])

  /** 单路收尾：冲刷挂起批次并按 markdown 重排（与 AiPanel 收尾同口径） */
  useEffect(() => {
    if (generation === null && writerRef.current) {
      const writer = writerRef.current
      writerRef.current = null
      if (inserterRef.current) {
        if (useAiStore.getState().generationError) inserterRef.current.abort()
        else inserterRef.current.close()
        inserterRef.current = null
      }
      writer.finalize()
      setSinglePathDone(true)
    }
  }, [generation])

  /** 卸载收尾：单路生成中进行中关闭浮层 → 中断并 finalize 已生成部分 */
  useEffect(() => {
    return () => {
      const ai = useAiStore.getState()
      if (ai.generation !== null) void ai.stopGeneration()
      if (writerRef.current) {
        inserterRef.current?.close()
        inserterRef.current = null
        writerRef.current.finalize()
        writerRef.current = null
      }
    }
  }, [])

  if (!target || !plan) return <></>

  const busy = generation !== null || multiGen?.running === true || launching

  /** 组装前情提要（按目标章位置：当前章取其前 N 章；新章取全本尾 N 章） */
  const buildRecap = async (): Promise<string> => {
    try {
      const all = flattenChapterFiles(useNovelStore.getState().tree)
      const idx = effectiveTargetMode === 'current' ? all.findIndex((c) => c.path === targetPath) : all.length
      if (idx <= 0) return ''
      const cfg = recapConfigOf(useNovelStore.getState().novel)
      const prev = all.slice(Math.max(0, idx - cfg.chapters), idx)
      const sources: Array<{ title: string; content: string }> = []
      for (const p of prev) {
        const doc = await window.api.fs.readChapter(p.path)
        sources.push({ title: doc.title, content: doc.content })
      }
      return assembleRecap(sources, cfg)
    } catch (err) {
      console.error('[BeatLauncher] 前情提要读取失败:', err)
      return ''
    }
  }

  const handleLaunch = async (): Promise<void> => {
    if (busy || selectedBeats.length === 0) return
    setLaunching(true)
    try {
      const recap = await buildRecap()
      const messages = beatChapterMessages({
        beats: selectedBeats.map((b) => ({ title: b.title, prompt: b.prompt, summary: b.summary })),
        ancestors,
        recap,
        targetTitle,
        lengthChars
      })
      const maxTokens = maxTokensOfChars(lengthChars)
      if (effectiveLanes === 3) {
        // 三路：候选区预览（chapterDraft 会话不依赖编辑器；采纳时确保目标章就绪/建章）
        await useAiStore.getState().startMultiGeneration(3, messages, {
          kind: 'chapterDraft',
          originPath: targetPath,
          originLabel: targetTitle,
          targetTitle,
          maxTokens
        })
        close()
      } else {
        // 单路：流式写入目标章编辑器（仅当前章目标；光标处生长，finalize 按 markdown 重排）
        const ai = useAiStore.getState()
        const editor = ai.chapterEditor
        if (!editor || ai.editingDraft?.path !== targetPath) {
          await dialogConfirm('单路生成需要先打开目标章节（或改用三路模式——可在采纳时自动建章）', '知道了')
          return
        }
        const writer = new GenerationWriter(() => useAiStore.getState().chapterEditor)
        writerRef.current = writer
        inserterRef.current = new StreamInserter((batch) => writer.applyBatch(batch))
        await ai.startGeneration(
          'continue',
          messages,
          (delta) => inserterRef.current?.push(delta),
          { maxTokens }
        )
        // 浮层保持挂载承载写入器生命周期；生成结束由上方收尾 effect 关闭
      }
    } catch (err) {
      await dialogConfirm(`整章生成发起失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
      inserterRef.current?.abort()
      inserterRef.current = null
      if (writerRef.current) {
        writerRef.current.finalize()
        writerRef.current = null
      }
    } finally {
      setLaunching(false)
    }
  }

  // 单路完成后自动关闭浮层（已 finalize，正文落进编辑器）
  useEffect(() => {
    if (singlePathDone) close()
  }, [singlePathDone, close])

  const toggle = (id: string): void => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="snapshot-overlay" onMouseDown={() => !busy && close()}>
      <div className="resource-panel beat-launcher nokey" onMouseDown={(e) => e.stopPropagation()}>
        <div className="resource-header">
          <span>
            节拍整章草稿 · {graphs[target.graphId]?.title ?? '子图'}（{selectedBeats.length}/{plan.beats.length} 拍）
          </span>
          <button className="resource-close" title="关闭（Esc）" disabled={busy} onClick={close}>
            ×
          </button>
        </div>

        <div className="resource-list left-scroll beat-list">
          {plan.beats.length === 0 && (
            <div className="insp-hint">子图内没有文本节拍节点——先用结构模板或手工节点搭节拍序列（箭头连线=顺序）</div>
          )}
          {plan.beats.map((b, i) => (
            <label key={b.id} className={`beat-item${checked.has(b.id) ? '' : ' off'}`}>
              <input type="checkbox" checked={checked.has(b.id)} onChange={() => toggle(b.id)} disabled={busy} />
              <span className="beat-item-idx">{i + 1}</span>
              <span className="beat-item-title">{b.title}</span>
              {b.summary !== '' && <span className="beat-item-summary insp-hint">{b.summary.slice(0, 40)}</span>}
            </label>
          ))}
          {plan.neverBeats.length > 0 && (
            <div className="insp-hint ai-unlinked">
              ⚠ {plan.neverBeats.length} 个节拍已设「AI 永不注入」被排除：
              {plan.neverBeats.map((b) => b.title).join('、')}
            </div>
          )}
          {plan.supporting.length > 0 && (
            <div className="insp-hint">另有 {plan.supporting.length} 个引用/蓝图节点作为支撑（不参与节拍序）</div>
          )}
          <div className="insp-hint">
            节拍顺序：{plan.usedTopo ? '按箭头连线拓扑序（并列按画布位置）' : '无箭头连线或成环，按画布 y 坐标序'}
          </div>
        </div>

        <div className="beat-form">
          <label className="recap-config-field">
            篇幅
            <select className="dialog-input" value={lengthIdx} disabled={busy} onChange={(e) => setLengthIdx(Number(e.target.value))}>
              {BEAT_LENGTH_PRESETS.map((p, i) => (
                <option key={p.chars} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="recap-config-field">
            目标章
            <select
              className="dialog-input"
              value={effectiveTargetMode}
              disabled={busy || currentChapter === null}
              onChange={(e) => setTargetMode(e.target.value as 'current' | 'new')}
            >
              {currentChapter && <option value="current">当前章（{currentChapter.title}）</option>}
              <option value="new">新建 {newChapterTitle}</option>
            </select>
          </label>
          <label className="recap-config-field">
            路数
            <select
              className="dialog-input"
              value={effectiveLanes}
              disabled={busy || effectiveTargetMode === 'new'}
              onChange={(e) => setLanes(Number(e.target.value) === 1 ? 1 : 3)}
            >
              <option value={3}>三路候选（推荐，可挑选）</option>
              <option value={1} disabled={effectiveTargetMode === 'new'}>
                单路流式（仅当前章）
              </option>
            </select>
          </label>
          {effectiveTargetMode === 'new' && (
            <div className="insp-hint">新章目标：三路模式在采纳时自动建章（不产废弃空章）；单路不支持新章</div>
          )}
        </div>

        <div className="ai-provider-form-actions">
          <span className="insp-hint" style={{ alignSelf: 'center', flex: 1 }}>
            {selectedBeats.length > 0 ? `预计输入 ≈${estimated} tokens · 生成上限 ${maxTokensOfChars(lengthChars)}` : '请至少勾选一拍'}
          </span>
          <button className="left-tool-btn" onClick={close} disabled={busy}>
            取消
          </button>
          <button
            className="left-tool-btn"
            disabled={busy || selectedBeats.length === 0}
            title="按勾选节拍生成整章草稿"
            onClick={() => void handleLaunch()}
          >
            {busy && generation !== null ? '生成中…' : launching ? '准备中…' : '生成'}
          </button>
        </div>
      </div>
    </div>
  )
}
