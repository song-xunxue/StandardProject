/**
 * 敏感词面板（浮层，v2-F6）：按站点词库检测当前章/全本，命中聚合展示 + 一键跳转章节
 * 词库：userData/sensitive-words（跨小说共享，txt 每行一词导入）；扫描 shared/sensitiveScan
 * （AC 自动机，万级词库 × 十万字 O(text+words)）；纯本地检测不出网
 *
 * 作者: 李文煜
 * 日期: 2026-08-31
 *
 * 2026-08-31
 * 变更说明：
 *   1. v2-F6 初版（左栏 footer「敏感词」入口唤起）
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { Wordbank } from '@shared/types'
import { buildMatcher } from '@shared/sensitiveScan'
import { useNovelStore } from '@/store/novelStore'
import { useAiStore } from '@/store/aiStore'
import { flattenChapterFiles } from '@/services/chapterTree'
import { dialogConfirm, dialogPrompt } from '@/store/dialogStore'

/** 按词聚合的命中视图 */
interface HitEntry {
  word: string
  count: number
  /** 章节 → 出现次数 */
  chapters: Array<{ path: string; title: string; count: number; sample: string }>
}

export function SensitivePanel(props: { onClose: () => void }): ReactElement {
  const [banks, setBanks] = useState<Wordbank[]>([])
  const [activeBank, setActiveBank] = useState<string>('')
  const [hits, setHits] = useState<HitEntry[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanNote, setScanNote] = useState<string | null>(null)
  const tree = useNovelStore((s) => s.tree)

  const reload = useCallback(async (): Promise<void> => {
    try {
      const list = await window.api.wordbank.list()
      setBanks(list)
      setActiveBank((cur) => (list.some((b) => b.name === cur) ? cur : (list[0]?.name ?? '')))
    } catch (err) {
      console.error('[SensitivePanel] 词库列表读取失败:', err)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const bank = useMemo(() => banks.find((b) => b.name === activeBank) ?? null, [banks, activeBank])

  /** 扫描入口：scope=current 当前章（编辑器实时内容）/ all 全本（逐章读文件） */
  const runScan = async (scope: 'current' | 'all'): Promise<void> => {
    if (!bank || bank.words.length === 0 || scanning) return
    setScanning(true)
    setHits(null)
    setScanNote(null)
    try {
      const matcher = buildMatcher(bank.words)
      const byWord = new Map<string, HitEntry>()
      const collect = (path: string, title: string, text: string): void => {
        for (const m of matcher(text)) {
          let entry = byWord.get(m.word)
          if (!entry) {
            entry = { word: m.word, count: 0, chapters: [] }
            byWord.set(m.word, entry)
          }
          entry.count++
          const ch = entry.chapters.find((c) => c.path === path)
          if (ch) ch.count++
          else entry.chapters.push({ path, title, count: 1, sample: m.context })
        }
      }
      if (scope === 'current') {
        const draft = useAiStore.getState().editingDraft
        const ns = useNovelStore.getState()
        const active = ns.tabs.find((t) => t.id === ns.activeTabId)
        if (draft && active?.kind === 'chapter' && draft.path === active.path) {
          collect(active.path, active.title, draft.text)
        } else if (active?.kind === 'chapter') {
          const doc = await window.api.fs.readChapter(active.path)
          collect(active.path, doc.title, doc.content)
        } else {
          setScanNote('当前没有打开的章节 Tab——请先打开章节，或使用「全本检测」')
          return
        }
      } else {
        const chapters = flattenChapterFiles(tree)
        for (const ch of chapters) {
          const doc = await window.api.fs.readChapter(ch.path)
          collect(ch.path, ch.title, doc.content)
        }
      }
      const result = [...byWord.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'zh-CN'))
      setHits(result)
      setScanNote(
        result.length === 0
          ? `未检出命中（词库「${bank.name}」共 ${bank.words.length} 词）`
          : `检出 ${result.length} 个词、共 ${result.reduce((s, e) => s + e.count, 0)} 处`
      )
    } catch (err) {
      setScanNote(`检测失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setScanning(false)
    }
  }

  /** 新建词库（空库，配合导入使用） */
  const handleCreate = async (): Promise<void> => {
    const name = await dialogPrompt('新建词库', '库名（如：起点 / 晋江 / 番茄）', '')
    if (name === null || name.trim() === '') return
    try {
      await window.api.wordbank.save(name.trim(), [])
      await reload()
      setActiveBank(name.trim())
    } catch (err) {
      await dialogConfirm(`创建失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    }
  }

  /** 导入 txt（每行一词；新建导入=覆盖，已有库可选择并入） */
  const handleImport = async (merge: boolean): Promise<void> => {
    if (!bank) return
    try {
      const imported = await window.api.wordbank.importTxt(bank.name, merge)
      if (imported === null) return // 用户取消文件选择
      await reload()
      await dialogConfirm(`已导入「${imported.name}」：共 ${imported.words.length} 词`, '知道了')
    } catch (err) {
      await dialogConfirm(`导入失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!bank) return
    const ok = await dialogConfirm(`删除词库「${bank.name}」（${bank.words.length} 词）？`, '删除')
    if (!ok) return
    await window.api.wordbank.remove(bank.name)
    await reload()
  }

  /** 命中章节点击 → 打开对应章节 Tab */
  const openChapter = (path: string): void => {
    useNovelStore.getState().openTab('chapter', path)
  }

  return (
    <div className="snapshot-overlay" onMouseDown={props.onClose}>
      <div className="resource-panel nokey sensitive-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="resource-header">
          <span className="resource-title">敏感词检测</span>
          <button className="resource-close" title="关闭" onClick={props.onClose}>
            ×
          </button>
        </div>

        {/* 词库选择与管理 */}
        <div className="ai-provider-row">
          <select
            className="dialog-input ai-provider-select"
            value={activeBank}
            onChange={(e) => {
              setActiveBank(e.target.value)
              setHits(null)
            }}
            title="按投稿站点组织的词库（userData/sensitive-words，跨小说共享）"
          >
            {banks.length === 0 && <option value="">（尚无词库——请新建并导入）</option>}
            {banks.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}（{b.words.length} 词）
              </option>
            ))}
          </select>
          <button className="resource-act" title="新建空词库" onClick={() => void handleCreate()}>
            ＋
          </button>
          <button className="resource-act" title="导入 txt 词库（每行一词，覆盖当前库）" disabled={!bank} onClick={() => void handleImport(false)}>
            ⇩
          </button>
          <button className="resource-act" title="并入 txt（与当前库去重合并）" disabled={!bank} onClick={() => void handleImport(true)}>
            ⇩+
          </button>
          <button className="resource-act danger" title="删除当前词库" disabled={!bank} onClick={() => void handleDelete()}>
            ×
          </button>
        </div>

        {/* 检测操作 */}
        <div className="ai-actions">
          <button className="left-tool-btn" disabled={!bank || bank.words.length === 0 || scanning} onClick={() => void runScan('current')}>
            {scanning ? '检测中…' : '检测当前章'}
          </button>
          <button className="left-tool-btn" disabled={!bank || bank.words.length === 0 || scanning} onClick={() => void runScan('all')}>
            全本检测
          </button>
        </div>
        {scanNote && <div className="insp-hint">{scanNote}</div>}

        {/* 命中列表：按词聚合，展开章节分布 */}
        {hits !== null && hits.length > 0 && (
          <div className="sensitive-hits">
            {hits.map((h) => (
              <div key={h.word} className="sensitive-hit">
                <div className="sensitive-hit-head">
                  <span className="sensitive-hit-word">{h.word}</span>
                  <span className="sensitive-hit-count">{h.count} 处 · {h.chapters.length} 章</span>
                </div>
                {h.chapters.map((c) => (
                  <button key={c.path} type="button" className="sensitive-hit-chapter" title={c.sample} onClick={() => openChapter(c.path)}>
                    {c.title}（{c.count}）<span className="sensitive-hit-sample">…{c.sample}…</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="insp-hint stats-note">
          纯本地检测（词库与正文均不出网）。词库不内置具体词条——从你常用的站点词库 txt 导入（每行一词）。
        </div>
      </div>
    </div>
  )
}
