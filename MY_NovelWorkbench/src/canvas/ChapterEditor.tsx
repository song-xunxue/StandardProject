/**
 * 章节编辑器（M1 最小版）：标题 + 正文 textarea，防抖自动保存
 * M3 将替换为 Tiptap（[[wikilink]] 补全 / 流式插入）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：读取章节 → 本地编辑态 → 600ms 防抖保存；标题/标签/别名存 frontmatter
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { ChapterDoc } from '@shared/types'

const SAVE_DEBOUNCE_MS = 600

export function ChapterEditor({ path }: { path: string }): ReactElement {
  const [doc, setDoc] = useState<ChapterDoc | null>(null)
  const [dirty, setDirty] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docRef = useRef<ChapterDoc | null>(null)

  // 加载章节
  useEffect(() => {
    let cancelled = false
    setDoc(null)
    window.api.fs
      .readChapter(path)
      .then((loaded) => {
        if (!cancelled) {
          setDoc(loaded)
          setDirty(false)
        }
      })
      .catch((err: unknown) => console.error('[ChapterEditor] 读取章节失败:', err))
    return () => {
      cancelled = true
    }
  }, [path])

  // 防抖保存（doc 引用走 ref，避免闭包旧值）
  useEffect(() => {
    docRef.current = doc
  }, [doc])

  const scheduleSave = (next: ChapterDoc): void => {
    setDoc(next)
    setDirty(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const current = docRef.current
      if (!current) return
      window.api.fs
        .saveChapter(current.path, current)
        .then(() => setDirty(false))
        .catch((err: unknown) => console.error('[ChapterEditor] 保存失败:', err))
    }, SAVE_DEBOUNCE_MS)
  }

  // 卸载时冲刷未落盘的防抖编辑（切 Tab/关 Tab 丢最后 600ms 内容）
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        const pending = docRef.current
        if (pending) {
          void window.api.fs.saveChapter(pending.path, pending).catch((err: unknown) =>
            console.error('[ChapterEditor] 卸载冲刷保存失败:', err)
          )
        }
      }
    },
    []
  )

  if (!doc) {
    return <div className="placeholder-editor">正在加载章节…</div>
  }

  return (
    <div className="chapter-editor">
      <div className="chapter-meta">
        <input
          className="chapter-title"
          value={doc.title}
          onChange={(e) => scheduleSave({ ...doc, title: e.target.value })}
          placeholder="章节标题"
        />
        <span className={`chapter-status${dirty ? ' saving' : ''}`}>{dirty ? '保存中…' : '已保存'}</span>
      </div>
      <textarea
        className="chapter-body left-scroll"
        value={doc.content}
        onChange={(e) => scheduleSave({ ...doc, content: e.target.value })}
        placeholder="在此创作正文…（[[双链]] 与 AI 辅助将在 M3 提供）"
        spellCheck={false}
      />
      <div className="chapter-hint">{doc.path}</div>
    </div>
  )
}
