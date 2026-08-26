/**
 * 章节编辑器（M3 Tiptap 版）：Markdown 正文编辑 + [[wikilink]] 补全/悬浮预览/跳转
 * 保留 M1 的保存骨架：600ms 防抖落盘（saveChapter）+ 卸载冲刷 + dirty 状态；
 * 编辑中文本同步发布到 aiStore.editingDraft（上下文组装的草稿来源，替换 DEMO_DRAFT）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：读取章节 → 本地编辑态 → 600ms 防抖保存；标题/标签/别名存 frontmatter
 *   2. M3：重写为 Tiptap v3（StarterKit + Markdown 双向 + Placeholder + Wikilink）；
 *      正文经 editor.getMarkdown() 序列化落盘，加载经 setContent(contentType markdown)
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { Placeholder } from '@tiptap/extension-placeholder'
import type { ChapterDoc } from '@shared/types'
import { Wikilink } from './extensions/Wikilink'
import type { WikilinkItem, WikilinkPreview } from './extensions/Wikilink'
import { useGraphStore } from '@/store/graphStore'
import { useNovelStore } from '@/store/novelStore'
import { useAiStore } from '@/store/aiStore'

const SAVE_DEBOUNCE_MS = 600
/** 编辑草稿发布节流（上下文面板重组装的频率上限） */
const DRAFT_PUBLISH_MS = 300

/** v3 的 getMarkdown 由 Markdown 扩展运行时挂载 */
type MarkdownEditor = NonNullable<ReturnType<typeof useEditor>> & { getMarkdown?: () => string }

export function ChapterEditor(props: { path: string }): ReactElement {
  const { path } = props
  const [doc, setDoc] = useState<ChapterDoc | null>(null)
  const [dirty, setDirty] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const docRef = useRef<ChapterDoc | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setDraft = useAiStore((s) => s.setDraft)
  const setChapterEditor = useAiStore((s) => s.setChapterEditor)

  // doc 同步到 ref（persist 闭包取最新）
  useEffect(() => {
    docRef.current = doc
  }, [doc])

  /** wikilink 候选：图节点标题 + 章节文件名（按 query 过滤，最多 12 条） */
  const wikilinkItems = (query: string): WikilinkItem[] => {
    const gs = useGraphStore.getState()
    const q = query.toLowerCase()
    const fromNodes: WikilinkItem[] = Object.values(gs.nodes)
      .filter((n) => n.title.toLowerCase().includes(q))
      .slice(0, 12)
      .map((n) => ({ target: n.title, kind: 'node' as const, label: n.title }))
    const fromChapters: WikilinkItem[] = (useNovelStore.getState().tree[0]?.children ?? [])
      .flatMap((dir) => (dir.children ?? []).filter((f) => f.kind === 'chapter'))
      .map((f) => ({ target: f.name.replace(/\.md$/, ''), kind: 'chapter' as const, label: f.name.replace(/\.md$/, '') }))
      .filter((c) => c.label.toLowerCase().includes(q))
      .slice(0, 6)
    return [...fromNodes, ...fromChapters].slice(0, 12)
  }

  /** wikilink 悬浮预览：节点取 summary/prompt，章节仅标题 */
  const wikilinkLookup = (target: string): WikilinkPreview | null => {
    const node = Object.values(useGraphStore.getState().nodes).find((n) => n.title === target)
    if (node) {
      const description = node.summary || node.prompt || `类型：${node.type}`
      return { title: node.title, description: description.slice(0, 120) }
    }
    const isChapter = (useNovelStore.getState().tree[0]?.children ?? []).some((dir) =>
      (dir.children ?? []).some((f) => f.name.replace(/\.md$/, '') === target)
    )
    return isChapter ? { title: target, description: '章节正文' } : null
  }

  /** wikilink 点击跳转：节点 → 打开所属蓝图并选中；章节 → 打开正文 Tab */
  const wikilinkNavigate = (target: string): void => {
    const gs = useGraphStore.getState()
    const node = Object.values(gs.nodes).find((n) => n.title === target)
    if (node) {
      gs.enterGraph(node.graphId)
      gs.selectNode(node.id)
      const bpPath = gs.graphPaths[node.graphId]
      if (bpPath) useNovelStore.getState().openTab('blueprint', bpPath)
      return
    }
    const chapter = (useNovelStore.getState().tree[0]?.children ?? [])
      .flatMap((dir) => (dir.children ?? []).filter((f) => f.kind === 'chapter'))
      .find((f) => f.name.replace(/\.md$/, '') === target)
    if (chapter) useNovelStore.getState().openTab('chapter', chapter.path)
  }

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Placeholder.configure({ placeholder: '开始创作正文…输入 [[ 唤起双链补全' }),
      Wikilink.configure({ items: wikilinkItems, lookup: wikilinkLookup, onNavigate: wikilinkNavigate })
    ],
    content: '',
    editorProps: { attributes: { class: 'chapter-tiptap', spellcheck: 'false' } }
  })

  /** 取当前 markdown 全文（v3 运行时挂载的 getMarkdown） */
  const markdownOf = (): string => (editor as MarkdownEditor | null)?.getMarkdown?.() ?? ''

  /** 保存（frontmatter 元数据 + 编辑器 markdown），成功后清 dirty */
  const persist = async (): Promise<void> => {
    const current = docRef.current
    if (!current) return
    try {
      await window.api.fs.saveChapter(current.path, { ...current, content: markdownOf() })
      setDirty(false)
    } catch (err) {
      console.error('[ChapterEditor] 章节保存失败:', err)
    }
  }

  /** 防抖保存 + 节流发布草稿 */
  const scheduleSave = (): void => {
    setDirty(true)
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void persist()
    }, SAVE_DEBOUNCE_MS)
    if (draftTimerRef.current === null) {
      draftTimerRef.current = setTimeout(() => {
        draftTimerRef.current = null
        setDraft({ path, text: markdownOf() })
      }, DRAFT_PUBLISH_MS)
    }
  }

  // 编辑事件 → 防抖保存
  useEffect(() => {
    if (!editor) return
    const handler = (): void => scheduleSave()
    editor.on('update', handler)
    return () => {
      editor.off('update', handler)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // 加载章节（切路径重载；markdown 须显式 contentType 声明才走解析路径）
  useEffect(() => {
    let disposed = false
    setDoc(null)
    setLoadError(null)
    void (async () => {
      try {
        const loaded = await window.api.fs.readChapter(path)
        if (disposed) return
        setDoc(loaded)
        // emitUpdate:false——加载不得触发 update（否则打开即标脏并回写文件，
        // 且 markdown 往返非恒等会静默改写磁盘内容——审查修复）
        editor?.commands.setContent(loaded.content, { contentType: 'markdown', emitUpdate: false } as never)
        setDraft({ path, text: loaded.content })
      } catch (err) {
        console.error('[ChapterEditor] 章节读取失败:', err)
        if (!disposed) setLoadError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      disposed = true
    }
  }, [path, editor])

  // 编辑器实例登记（AI 面板流式写入用）+ 卸载冲刷未保存编辑
  useEffect(() => {
    if (!editor) return
    setChapterEditor(editor)
    return () => {
      setChapterEditor(null)
      // 章节关闭后草稿同步清除（避免 Context Viewer 继续以旧章节为组装目标/草稿源）
      setDraft(null)
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        void persist()
      }
      if (draftTimerRef.current !== null) {
        clearTimeout(draftTimerRef.current)
        draftTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  const updateTitle = (title: string): void => {
    setDoc((prev) => (prev ? { ...prev, title } : prev))
    setDirty(true)
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void persist()
    }, SAVE_DEBOUNCE_MS)
  }

  if (loadError) {
    return (
      <div className="chapter-editor">
        <div className="chapter-hint">章节读取失败：{loadError}</div>
      </div>
    )
  }
  if (!doc) {
    return (
      <div className="chapter-editor">
        <div className="chapter-hint">加载中…</div>
      </div>
    )
  }

  return (
    <div className="chapter-editor left-scroll">
      <div className="chapter-meta">
        <input className="chapter-title" value={doc.title} title="章节标题" onChange={(e) => updateTitle(e.target.value)} />
        <span className={`chapter-status ${dirty ? '' : 'saved'}`}>{dirty ? '未保存' : '已保存'}</span>
      </div>
      <EditorContent editor={editor} className="chapter-body" />
      <div className="chapter-hint">[[ 触发双链补全 · 悬浮可预览 · 点击跳转 · 自动保存</div>
    </div>
  )
}
