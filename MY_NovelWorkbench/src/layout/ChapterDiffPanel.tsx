/**
 * 章节快照 diff 视图（浮层，v2-F8）：「当前磁盘正文 → 快照正文」行级对比 + 恢复入口
 * 方向约定：del=当前独有（恢复后消失，红）、add=快照独有（恢复后引入，绿）；
 * 正文两侧都经 parseFrontmatter 取 content（frontmatter 由编辑器管理，不进 diff）；
 * 长 ctx 段折叠为「⋯ 跳过 N 行」（collapseContext）
 *
 * 作者: 李文煜
 * 日期: 2026-09-17
 */

import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { collapseContext, diffLines, diffStats } from '@shared/chapterDiff'
import { parseFrontmatter } from '@shared/frontmatter'
import { useNovelStore } from '@/store/novelStore'
import { useUiStore } from '@/store/uiStore'
import { dialogConfirm } from '@/store/dialogStore'

const fmtTime = (iso: string): string => {
  const d = new Date(iso)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function ChapterDiffPanel(): ReactElement {
  const target = useUiStore((s) => s.chapterDiff)
  const close = useUiStore((s) => s.closeChapterDiff)
  const [currentContent, setCurrentContent] = useState<string | null>(null)
  const [snapContent, setSnapContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!target) return
    let disposed = false
    setCurrentContent(null)
    setSnapContent(null)
    setError(null)
    void (async () => {
      try {
        // 对比口径：两侧都取 parseFrontmatter 后的正文（编辑器保存的也是 content，
        // 磁盘当前经 readChapter、快照原文自行 parse——frontmatter 不进 diff）
        const cur = await window.api.fs.readChapter(target.path)
        const snapRaw = await window.api.fs.snapshotChapterRead(target.path, target.id)
        if (disposed) return
        setCurrentContent(cur.content)
        setSnapContent(parseFrontmatter(snapRaw).content)
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      disposed = true
    }
  }, [target])

  // Esc 关闭（浮层族统一交互）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  // diff 方向：old=当前（del=恢复后消失），new=快照（add=恢复后引入）
  const result = useMemo(() => {
    if (currentContent === null || snapContent === null) return null
    const ops = diffLines(currentContent, snapContent)
    return { ops, stats: diffStats(ops), items: collapseContext(ops, 3) }
  }, [currentContent, snapContent])

  if (!target) return <></>

  const handleRestore = async (): Promise<void> => {
    if (busy) return
    const ok = await dialogConfirm(
      `恢复「${target.title}」到 ${fmtTime(target.createdAt)} 的快照？\n当前正文将被整文件覆盖（编辑器自动重载）。`,
      '恢复'
    )
    if (!ok) return
    setBusy(true)
    try {
      await useNovelStore.getState().restoreChapterSnapshot(target.path, target.id)
      // 恢复后「当前」已变，本 diff 视图失效——关闭回到列表
      close()
    } catch (err) {
      await dialogConfirm(`恢复失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="snapshot-overlay diff-overlay" onMouseDown={close}>
      <div className="resource-panel diff-panel nokey" onMouseDown={(e) => e.stopPropagation()}>
        <div className="resource-header">
          <span>
            对比 · {target.title} · 当前 → {fmtTime(target.createdAt)} 快照
            {result ? `（+${result.stats.added} −${result.stats.removed} 行）` : ''}
          </span>
          <div className="diff-header-acts">
            <button
              className="left-tool-btn"
              title="用该快照整文件覆盖当前正文（编辑器自动重载）"
              disabled={busy || currentContent === null}
              onClick={() => void handleRestore()}
            >
              ⟲ 恢复此版本
            </button>
            <button className="resource-close" title="关闭（Esc）" onClick={close}>
              ×
            </button>
          </div>
        </div>
        {error && <div className="insp-hint">对比读取失败：{error}</div>}
        <div className="diff-body left-scroll nokey">
          {!error && !result && <div className="insp-hint">读取中…</div>}
          {result && result.stats.added === 0 && result.stats.removed === 0 && (
            <div className="insp-hint">当前正文与该快照完全一致（无差异）</div>
          )}
          {result &&
            result.items.map((item, i) =>
              item.type === 'skip' ? (
                <div key={i} className="diff-line diff-skip">
                  ⋯ 跳过 {item.count} 行未变
                </div>
              ) : (
                <div key={i} className={`diff-line diff-${item.type}`}>
                  <span className="diff-gutter">{item.type === 'add' ? '+' : item.type === 'del' ? '−' : ' '}</span>
                  <span className="diff-lineno">{item.oldLine ?? item.newLine}</span>
                  <span className="diff-text">{item.text === '' ? ' ' : item.text}</span>
                </div>
              )
            )}
        </div>
      </div>
    </div>
  )
}
