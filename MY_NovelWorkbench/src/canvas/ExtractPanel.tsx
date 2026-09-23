/**
 * 拆书冷启动浮层（v2-F15）：存量小说 → LLM 逐章抽取实体 → 人工确认 → 批量入库
 * 左列=章节进度（待抽/抽取中/完成/失败可重试）；右列=候选实体（勾选+行内编辑
 * name/别名/类型，与既有节点同名默认不勾）；入库=按目标图（既有蓝图或新建「拆书」）
 * 走 addNodesBatch 单笔落盘，类别映射为自定义标签（createTag 幂等）
 *
 * 作者: 李文煜
 * 日期: 2026-09-23
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { EXTRACT_TYPES, entityKeyOf, matchExistingNodes } from '@shared/extract'
import type { ExtractType } from '@shared/extract'
import { flattenChapterFiles } from '@/services/chapterTree'
import { useExtractStore } from '@/store/extractStore'
import { useNovelStore } from '@/store/novelStore'
import { useGraphStore } from '@/store/graphStore'
import { dialogConfirm } from '@/store/dialogStore'
import type { AddNodeInput } from '@/store/graphStore'

/** 类型 → 自定义标签色板（入库时 createTag 用） */
const TYPE_COLORS: Record<ExtractType, string> = {
  人物: '#6c9ef8',
  地点: '#7ec98f',
  势力: '#e0a868',
  物品: '#c8a2f0',
  事件: '#e06c5e'
}

/** 新建拆书蓝图选项值 */
const NEW_GRAPH = '__new__'

const STATUS_LABEL: Record<string, string> = {
  pending: '待抽',
  extracting: '抽取中…',
  done: '完成',
  failed: '失败'
}

export function ExtractPanel(props: { onClose: () => void }): ReactElement {
  const chapters = useExtractStore((s) => s.chapters)
  const candidates = useExtractStore((s) => s.candidates)
  const running = useExtractStore((s) => s.running)
  const start = useExtractStore((s) => s.start)
  const stop = useExtractStore((s) => s.stop)
  const retryFailed = useExtractStore((s) => s.retryFailed)
  const updateCandidate = useExtractStore((s) => s.updateCandidate)
  const removeCandidate = useExtractStore((s) => s.removeCandidate)
  const reset = useExtractStore((s) => s.reset)

  const tree = useNovelStore((s) => s.tree)
  const graphs = useGraphStore((s) => s.graphs)
  const nodes = useGraphStore((s) => s.nodes)

  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [inserting, setInserting] = useState(false)
  const [targetGraph, setTargetGraph] = useState<string>(NEW_GRAPH)
  /** 已见候选键（区分「新实体默认勾选」与「用户手动取消」——取消过的不再自动补勾） */
  const seenKeysRef = useRef<Set<string>>(new Set())

  // 挂载时按文件树准备章节任务（候选/进度重置）
  useEffect(() => {
    useExtractStore.getState().prepare(flattenChapterFiles(tree))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 与既有节点（全部图）同名/同别名命中——防重复入库的标记 */
  const matched = useMemo(() => matchExistingNodes(candidates, Object.values(nodes)), [candidates, nodes])
  // 候选推进（跨章合并追加）时：首见且未与既有节点同名的默认勾选
  useEffect(() => {
    const known = seenKeysRef.current
    const additions: string[] = []
    for (const e of candidates) {
      const key = entityKeyOf(e.name)
      if (known.has(key)) continue
      known.add(key)
      if (!matched.has(key)) additions.push(key)
    }
    if (additions.length === 0) return
    setChecked((prev) => {
      const next = new Set(prev)
      for (const k of additions) next.add(k)
      return next
    })
  }, [candidates, matched])

  // Esc 关闭（浮层族统一交互；running 中只提供停止按钮）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      const t = e.target
      if (t instanceof HTMLElement && (t.tagName === 'SELECT' || t.tagName === 'OPTION' || t.tagName === 'INPUT')) return
      if (!running && !inserting) props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, inserting, props])

  const doneCount = chapters.filter((c) => c.status === 'done').length
  const failedCount = chapters.filter((c) => c.status === 'failed').length
  const busy = running || inserting

  const handleClose = async (): Promise<void> => {
    if (candidates.length > 0) {
      const go = await dialogConfirm('未入库的候选实体将丢失，确定关闭拆书？', '放弃并关闭')
      if (!go) return
    }
    reset()
    props.onClose()
  }

  const handleStart = async (): Promise<void> => {
    try {
      await start()
    } catch (err) {
      await dialogConfirm(`抽取发起失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    }
  }

  const toggle = (key: string): void => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /** 确认入库：类别标签（幂等）→ 目标图（可选新建「拆书」蓝图）→ addNodesBatch 单笔落盘 */
  const handleInsert = async (): Promise<void> => {
    const picked = candidates.filter((e) => checked.has(entityKeyOf(e.name)))
    if (picked.length === 0 || busy) return
    setInserting(true)
    try {
      // 1. 类别 → 自定义标签（createTag 幂等：已存在返回既有定义）
      const ns = useNovelStore.getState()
      for (const type of new Set(picked.map((e) => e.type))) {
        await ns.createTag(type, TYPE_COLORS[type])
      }
      // 2. 目标图：既有蓝图或新建「拆书」（先建文件 → refreshTree 补 graphPaths → 再批量插）
      let graphId: string | null = targetGraph
      if (targetGraph === NEW_GRAPH) {
        const created = await window.api.fs.createFile('blueprint', '拆书')
        await ns.refreshTree()
        graphId = created.id ?? Object.entries(useGraphStore.getState().graphPaths).find(([, p]) => p === created.path)?.[0] ?? null
        if (!graphId) throw new Error('新建拆书蓝图失败（未取得图 id）')
        setTargetGraph(graphId)
      }
      // 3. 落点：既有内容包围盒右下网格展开（ResourcePanel 结构模板插入同款）
      const gs = useGraphStore.getState()
      const graph = gs.graphs[graphId]
      if (!graph) throw new Error('目标蓝图不存在')
      const members = graph.nodeIds.map((id) => gs.nodes[id]).filter((n): n is NonNullable<typeof n> => Boolean(n))
      const maxX = members.length > 0 ? Math.max(...members.map((n) => n.position.x)) : 0
      const maxY = members.length > 0 ? Math.max(...members.map((n) => n.position.y)) : 0
      const inputs: AddNodeInput[] = picked.map((e, i) => ({
        type: 'text',
        title: e.name,
        tags: [e.type],
        aliases: [...e.aliases],
        prompt: '',
        summary: e.summary,
        position: { x: maxX + 120 + (i % 4) * 240, y: maxY + 80 + Math.floor(i / 4) * 110 },
        graphId
      }))
      const { ids } = gs.addNodesBatch(inputs)
      const inserted = ids.filter((id) => id !== null).length
      await dialogConfirm(
        `已入库 ${inserted} 个节点 → 蓝图「${gs.graphs[graphId]?.title ?? '拆书'}」（左侧双击打开查看；已自动创建类别标签）`,
        '完成'
      )
      reset()
      props.onClose()
    } catch (err) {
      await dialogConfirm(`入库失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    } finally {
      setInserting(false)
    }
  }

  const graphOptions = Object.entries(graphs)

  return (
    <div className="snapshot-overlay" onMouseDown={() => !busy && void handleClose()}>
      <div className="resource-panel extract-panel nokey" onMouseDown={(e) => e.stopPropagation()}>
        <div className="resource-header">
          <span>
            拆书冷启动 · {chapters.length} 章（完成 {doneCount}
            {failedCount > 0 ? ` / 失败 ${failedCount}` : ''}） · 候选 {candidates.length} 实体
          </span>
          <button className="resource-close" title="关闭（Esc）" disabled={busy} onClick={() => void handleClose()}>
            ×
          </button>
        </div>

        <div className="extract-body">
          <div className="extract-chapters left-scroll">
            {chapters.length === 0 && <div className="insp-hint">没有章节可抽取（先在章节目录导入正文）</div>}
            {chapters.map((c) => (
              <div key={c.path} className={`extract-chapter${c.status === 'extracting' ? ' extracting' : ''}`}>
                <span className="extract-chapter-title" title={`${c.volume ? `${c.volume}/` : ''}${c.title}${c.error ? `\n${c.error}` : ''}`}>
                  {c.volume ? `${c.volume}/` : ''}
                  {c.title}
                </span>
                <span
                  className={`extract-chapter-status ${c.status === 'failed' ? 'failed' : c.status === 'done' ? 'done' : ''}`}
                >
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
              </div>
            ))}
          </div>

          <div className="extract-candidates left-scroll">
            {candidates.length === 0 && (
              <div className="insp-hint">
                候选实体将在这里出现——抽取由 LLM 逐章进行，同名/别名自动合并；
                {'　'}与既有节点同名的默认不勾选（可强制勾选合并入库）
              </div>
            )}
            {candidates.map((e, i) => {
              const key = entityKeyOf(e.name)
              const isMatched = matched.has(key)
              return (
                <div key={`${key}#${i}`} className={`extract-candidate${checked.has(key) ? '' : ' off'}`}>
                  <label className="extract-candidate-check">
                    <input type="checkbox" checked={checked.has(key)} onChange={() => toggle(key)} disabled={busy} />
                  </label>
                  <input
                    className="dialog-input extract-name"
                    value={e.name}
                    disabled={busy}
                    onChange={(ev) => updateCandidate(i, { name: ev.target.value })}
                  />
                  <select
                    className="dialog-input extract-type"
                    value={e.type}
                    disabled={busy}
                    onChange={(ev) => updateCandidate(i, { type: ev.target.value as ExtractType })}
                  >
                    {EXTRACT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  {isMatched && (
                    <span className="extract-matched" title="已存在同名/同别名的节点——默认不勾选，可强制入库">
                      已有同名
                    </span>
                  )}
                  <button className="extract-remove" title="移除该候选" disabled={busy} onClick={() => removeCandidate(i)}>
                    ×
                  </button>
                  <input
                    className="dialog-input extract-aliases"
                    placeholder="别名（、分隔）"
                    value={e.aliases.join('、')}
                    disabled={busy}
                    onChange={(ev) =>
                      updateCandidate(i, {
                        aliases: ev.target.value
                          .split(/[,，、]/)
                          .map((a) => a.trim())
                          .filter((a) => a !== '')
                      })
                    }
                  />
                  <input
                    className="dialog-input extract-summary"
                    placeholder="一句话概括（可编辑）"
                    value={e.summary}
                    disabled={busy}
                    onChange={(ev) => updateCandidate(i, { summary: ev.target.value })}
                  />
                </div>
              )
            })}
          </div>
        </div>

        <div className="beat-form">
          <label className="recap-config-field">
            目标蓝图
            <select className="dialog-input" value={targetGraph} disabled={busy} onChange={(e) => setTargetGraph(e.target.value)}>
              <option value={NEW_GRAPH}>新建「拆书」蓝图</option>
              {graphOptions.map(([gid, g]) => (
                <option key={gid} value={gid}>
                  {g.title || gid}
                </option>
              ))}
            </select>
          </label>
          <span className="insp-hint" style={{ alignSelf: 'center', flex: 1 }}>
            入库单笔落盘；类别自动创建自定义标签（{EXTRACT_TYPES.join('、')}）
          </span>
        </div>

        <div className="ai-provider-form-actions">
          <span className="insp-hint" style={{ alignSelf: 'center', flex: 1 }}>
            候选未入库前仅存内存，关闭浮层即丢失；失败章可重试，中断保留已完成部分
          </span>
          {failedCount > 0 && !running && (
            <button className="left-tool-btn" disabled={busy} onClick={() => void retryFailed()}>
              重试失败章（{failedCount}）
            </button>
          )}
          {running ? (
            <button className="left-tool-btn" onClick={stop}>
              ■ 停止
            </button>
          ) : (
            <button
              className="left-tool-btn"
              disabled={busy || chapters.length === 0 || chapters.every((c) => c.status !== 'pending')}
              title="逐章抽取实体（LLM 调用次数=章数）"
              onClick={() => void handleStart()}
            >
              {chapters.some((c) => c.status === 'done') ? '继续抽取' : '开始抽取'}
            </button>
          )}
          <button
            className="left-tool-btn"
            disabled={busy || checked.size === 0}
            title={`勾选 ${checked.size} 个候选入库`}
            onClick={() => void handleInsert()}
          >
            {inserting ? '入库中…' : `入库（${checked.size}）`}
          </button>
        </div>
      </div>
    </div>
  )
}
