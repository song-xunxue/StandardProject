/**
 * 章节快照面板（浮层，v2-F8）：单章快照的创建 / 列表 / 恢复 / 删除 + 对比入口
 * 存储形态：.snapshots/chapters/<章路径base64>/（每章独立 20 份，与全本快照隔离）
 * 入口：TabBar 章节 Tab 右键「章节快照与对比」（浮层族统一遮罩点关 + Esc）
 *
 * 作者: 李文煜
 * 日期: 2026-09-17
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { ChapterSnapshotInfo } from '@shared/types'
import { MAX_CHAPTER_SNAPSHOTS } from '@shared/types'
import { useNovelStore } from '@/store/novelStore'
import { useUiStore } from '@/store/uiStore'
import { dialogConfirm, dialogPrompt } from '@/store/dialogStore'

/** createdAt(ISO) → 本地「MM-DD HH:mm:ss」展示（与 SnapshotPanel 同口径） */
const fmtTime = (iso: string): string => {
  const d = new Date(iso)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function ChapterSnapshotPanel(): ReactElement {
  const target = useUiStore((s) => s.chapterSnapPanel)
  const close = useUiStore((s) => s.closeChapterSnap)
  const openDiff = useUiStore((s) => s.openChapterDiff)
  const [items, setItems] = useState<ChapterSnapshotInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    if (!target) return
    try {
      setItems(await window.api.fs.snapshotChapterList(target.path))
      setLoadError(null)
    } catch (err) {
      console.error('[ChapterSnapshotPanel] 读取章节快照列表失败:', err)
      setLoadError(err instanceof Error ? err.message : String(err))
    }
  }, [target])

  useEffect(() => {
    void reload()
  }, [reload])

  // Esc 关闭（浮层族统一交互）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  if (!target) return <></>

  const handleCreate = async (): Promise<void> => {
    if (busy) return
    const note = await dialogPrompt(`创建章节快照（${target.title}）`, '备注（可留空）', '')
    if (note === null) return
    setBusy(true)
    try {
      await useNovelStore.getState().createChapterSnapshot(target.path, note)
      await reload()
    } catch (err) {
      await dialogConfirm(`快照创建失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    } finally {
      setBusy(false)
    }
  }

  const handleRestore = async (info: ChapterSnapshotInfo): Promise<void> => {
    if (busy) return
    const ok = await dialogConfirm(
      `把「${target.title}」恢复到 ${fmtTime(info.createdAt)} 的快照？\n当前正文将被整文件覆盖（编辑器自动重载）。`,
      '恢复'
    )
    if (!ok) return
    setBusy(true)
    try {
      await useNovelStore.getState().restoreChapterSnapshot(target.path, info.id)
      await reload()
    } catch (err) {
      console.error('[ChapterSnapshotPanel] 恢复失败:', err)
      await dialogConfirm(`恢复失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (info: ChapterSnapshotInfo): Promise<void> => {
    if (busy) return
    const ok = await dialogConfirm(`删除章节快照「${fmtTime(info.createdAt)} ${info.note}」？此操作不可撤销。`, '删除')
    if (!ok) return
    setBusy(true)
    try {
      await window.api.fs.snapshotChapterDelete(target.path, info.id)
      await reload()
    } catch (err) {
      await dialogConfirm(`删除失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="snapshot-overlay" onMouseDown={close}>
      <div className="resource-panel snapshot-panel nokey" onMouseDown={(e) => e.stopPropagation()}>
        <div className="resource-header">
          <span>
            章节快照 · {target.title}（{items.length}/{MAX_CHAPTER_SNAPSHOTS} · 新→旧）
          </span>
          <button className="resource-close" title="关闭（Esc）" onClick={close}>
            ×
          </button>
        </div>
        <div className="resource-actions">
          <button
            className="left-tool-btn"
            title="把该章当前正文存为一份快照（自动先保存未落盘编辑）"
            disabled={busy}
            onClick={() => void handleCreate()}
          >
            + 创建本章快照
          </button>
        </div>
        {loadError && <div className="insp-hint">章节快照列表读取失败：{loadError}</div>}
        <div className="resource-list left-scroll">
          {items.length === 0 && !loadError && (
            <div className="insp-hint">暂无快照——大改/采纳 AI 生成前存一份，随时可回滚单章</div>
          )}
          {items.map((info) => (
            <div key={info.id} className="resource-item">
              <div className="resource-item-main">
                <div className="resource-item-name">
                  {fmtTime(info.createdAt)}
                  {info.note && <span className="snap-note"> {info.note}</span>}
                </div>
                <div className="resource-item-tags">
                  正文 {info.chars} 字{info.note ? '' : ' · 无备注'}
                </div>
              </div>
              <div className="resource-item-acts">
                <button
                  className="resource-act"
                  title="与当前正文对比（行级 diff）"
                  disabled={busy}
                  onClick={() => openDiff({ path: target.path, title: target.title, id: info.id, createdAt: info.createdAt })}
                >
                  ≣ 对比
                </button>
                <button className="resource-act" title="恢复到该快照（整文件覆盖）" disabled={busy} onClick={() => void handleRestore(info)}>
                  ⟲
                </button>
                <button className="resource-act danger" title="删除快照" disabled={busy} onClick={() => void handleDelete(info)}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
