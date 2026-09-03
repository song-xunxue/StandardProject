/**
 * 快照面板（浮层，M5）：小说目录快照的创建 / 列表 / 恢复 / 删除（ADR-14）
 * 恢复语义：当前内容自动备份 → 清空蓝图/章节/novel.json → 快照拷回；
 * .index/.git 不受影响（索引由打开时增量校对自动对齐）
 *
 * 作者: 李文煜
 * 日期: 2026-08-28
 *
 * 2026-08-28
 * 变更说明：
 *   1. M5 初版（左栏 footer「快照」入口唤起）
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { SnapshotInfo } from '@shared/types'
import { useNovelStore } from '@/store/novelStore'
import { dialogConfirm, dialogPrompt } from '@/store/dialogStore'

/** createdAt(ISO) → 本地「MM-DD HH:mm:ss」展示 */
const fmtTime = (iso: string): string => {
  const d = new Date(iso)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function SnapshotPanel(props: { onClose: () => void }): ReactElement {
  const [items, setItems] = useState<SnapshotInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const restoreSnapshot = useNovelStore((s) => s.restoreSnapshot)

  const reload = useCallback(async (): Promise<void> => {
    try {
      setItems(await window.api.fs.snapshotList())
      setLoadError(null)
    } catch (err) {
      console.error('[SnapshotPanel] 读取快照列表失败:', err)
      setLoadError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // Esc 关闭（晨间批次：浮层族统一交互——遮罩点关 + Esc 关）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  /** 创建快照（备注可选；取消输入框=null 中止） */
  const handleCreate = async (): Promise<void> => {
    if (busy) return
    const note = await dialogPrompt('创建快照', '备注（可留空）', '')
    if (note === null) return
    setBusy(true)
    try {
      await window.api.fs.snapshotCreate(note)
      await reload()
    } catch (err) {
      await dialogConfirm(`快照创建失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    } finally {
      setBusy(false)
    }
  }

  /** 恢复快照：当前内容会先自动备份（保留策略内占一个名额） */
  const handleRestore = async (info: SnapshotInfo): Promise<void> => {
    if (busy) return
    const ok = await dialogConfirm(
      `恢复到 ${fmtTime(info.createdAt)} 的快照？\n当前内容会先自动备份为「恢复前自动备份」快照。`,
      '恢复'
    )
    if (!ok) return
    setBusy(true)
    try {
      await restoreSnapshot(info.id)
      await reload()
    } catch (err) {
      console.error('[SnapshotPanel] 恢复失败:', err)
      await dialogConfirm(`恢复失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (info: SnapshotInfo): Promise<void> => {
    if (busy) return
    const ok = await dialogConfirm(`删除快照「${fmtTime(info.createdAt)} ${info.note}」？此操作不可撤销。`, '删除')
    if (!ok) return
    setBusy(true)
    try {
      await window.api.fs.snapshotDelete(info.id)
      await reload()
    } catch (err) {
      await dialogConfirm(`删除失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="snapshot-overlay" onMouseDown={props.onClose}>
      <div className="resource-panel snapshot-panel nokey" onMouseDown={(e) => e.stopPropagation()}>
        <div className="resource-header">
          <span>快照（{items.length}/10 · 新→旧）</span>
          <button className="resource-close" title="关闭（Esc）" onClick={props.onClose}>
            ×
          </button>
        </div>
        <div className="resource-actions">
          <button className="left-tool-btn" title="把当前小说内容完整存为一份快照" disabled={busy} onClick={() => void handleCreate()}>
            + 创建快照
          </button>
        </div>
        {loadError && <div className="insp-hint">快照列表读取失败：{loadError}</div>}
        <div className="resource-list left-scroll">
          {items.length === 0 && !loadError && (
            <div className="insp-hint">暂无快照——创建后在关键节点随时可回滚（不含 .git 与索引缓存）</div>
          )}
          {items.map((info) => (
            <div key={info.id} className="resource-item">
              <div className="resource-item-main">
                <div className="resource-item-name">
                  {fmtTime(info.createdAt)}
                  {info.note && <span className="snap-note"> {info.note}</span>}
                </div>
                <div className="resource-item-tags">{info.fileCount} 个文件{info.note ? '' : ' · 无备注'}</div>
              </div>
              <div className="resource-item-acts">
                <button className="resource-act" title="恢复到该快照（当前内容先自动备份）" disabled={busy} onClick={() => void handleRestore(info)}>
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
