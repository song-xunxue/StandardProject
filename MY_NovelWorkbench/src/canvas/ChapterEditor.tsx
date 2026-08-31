/**
 * 章节编辑器（M3 Tiptap 版）：Markdown 正文编辑 + [[wikilink]] 补全/悬浮预览/跳转
 * 保留 M1 的保存骨架：600ms 防抖落盘（saveChapter）+ 卸载冲刷 + dirty 状态；
 * 编辑中文本同步发布到 aiStore.editingDraft（上下文组装的草稿来源，替换 DEMO_DRAFT）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-28
 * 变更说明：
 *   1. M1 初版：读取章节 → 本地编辑态 → 600ms 防抖保存；标题/标签/别名存 frontmatter
 *   2. M3：重写为 Tiptap v3（StarterKit + Markdown 双向 + Placeholder + Wikilink）；
 *      正文经 editor.getMarkdown() 序列化落盘，加载经 setContent(contentType markdown)
 *   3. M4-B：元信息区新增别名编辑（AliasEditor）；标题/别名共用 scheduleMetaSave 防抖
 *      （元信息变更不发布草稿——正文未变）
 *
 * 2026-08-30
 * 变更说明：
 *   1. 审查修复/性能批次：
 *      - markdown 序列化缓存（ProseMirror doc 不可变，引用未变直接复用上次结果——
 *        消除草稿发布 300ms + 防抖保存 600ms 的重复全文序列化）
 *      - 注册 aiStore.chapterFlush 冲刷桥（交换/删除/重命名章节前的落盘钩子）
 *      - 卸载时中断进行中的 AI 生成（面板未挂载时此前无人中断，token 白烧且输出全损）
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
import { AliasEditor } from '@/canvas/AliasEditor'
import { useGraphStore } from '@/store/graphStore'
import { useNovelStore } from '@/store/novelStore'
import { useAiStore } from '@/store/aiStore'
import { flattenChapterFiles } from '@/services/chapterTree'

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

  /** wikilink 候选：图节点标题 + 章节文件名（含卷内，query 过滤，最多 12 条） */
  const wikilinkItems = (query: string): WikilinkItem[] => {
    const gs = useGraphStore.getState()
    const q = query.toLowerCase()
    const fromNodes: WikilinkItem[] = Object.values(gs.nodes)
      .filter((n) => n.title.toLowerCase().includes(q))
      .slice(0, 12)
      .map((n) => ({ target: n.title, kind: 'node' as const, label: n.title }))
    const fromChapters: WikilinkItem[] = flattenChapterFiles(useNovelStore.getState().tree)
      .filter((c) => c.title.toLowerCase().includes(q))
      .slice(0, 6)
      .map((c) => ({ target: c.title, kind: 'chapter' as const, label: c.volume ? `${c.volume}/${c.title}` : c.title }))
    return [...fromNodes, ...fromChapters].slice(0, 12)
  }

  /** wikilink 悬浮预览：节点取 summary/prompt，章节（含卷内）仅标题 */
  const wikilinkLookup = (target: string): WikilinkPreview | null => {
    const node = Object.values(useGraphStore.getState().nodes).find((n) => n.title === target)
    if (node) {
      const description = node.summary || node.prompt || `类型：${node.type}`
      return { title: node.title, description: description.slice(0, 120) }
    }
    const isChapter = flattenChapterFiles(useNovelStore.getState().tree).some((c) => c.title === target)
    return isChapter ? { title: target, description: '章节正文' } : null
  }

  /** wikilink 点击跳转：节点 → 打开所属蓝图并选中；章节（含卷内）→ 打开正文 Tab */
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
    const chapter = flattenChapterFiles(useNovelStore.getState().tree).find((c) => c.title === target)
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

  /** 取当前 markdown 全文（v3 运行时挂载的 getMarkdown）。
   *  序列化缓存（性能批次）：ProseMirror 文档不可变，doc 引用未变时直接复用上次结果——
   *  草稿发布（300ms）与防抖保存（600ms）两条路径不再各自全文序列化 */
  const mdCacheRef = useRef<{ doc: unknown; text: string } | null>(null)
  const markdownOf = (): string => {
    const docNow = editor?.state.doc
    if (docNow && mdCacheRef.current && mdCacheRef.current.doc === docNow) return mdCacheRef.current.text
    const text = (editor as MarkdownEditor | null)?.getMarkdown?.() ?? ''
    mdCacheRef.current = docNow ? { doc: docNow, text } : null
    return text
  }

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

  // 编辑器实例登记（AI 面板流式写入用）+ 冲刷桥注册 + 卸载冲刷未保存编辑
  useEffect(() => {
    if (!editor) return
    // 换章/重挂载即中断进行中的生成（M5 审查修复）：generationWriter 实时取
    // chapterEditor，不中断的话旧会话的流式分块会写进新章节并随防抖保存持久化。
    // 先 stop 再登记——stop 内部先同步置 generation=null（迟到分块按 requestId 丢弃，
    // finalize 落在 editor=null 窗口），已生成部分保留在原章节的卸载冲刷里
    const ai = useAiStore.getState()
    if (ai.generation !== null) void ai.stopGeneration()
    setChapterEditor(editor)
    // 冲刷桥（审查修复）：交换/删除/重命名等文件系统变更前的「立即落盘挂起编辑」入口。
    // 关键在清掉 timerRef——防抖定时器为空时，本组件卸载清理不会再次持久化，
    // 从而避免旧内存内容覆盖交换/重命名后的文件或复活已删除文件
    const flush = async (paths?: string[]): Promise<void> => {
      if (paths && !paths.includes(path)) return
      if (timerRef.current === null) return
      clearTimeout(timerRef.current)
      timerRef.current = null
      await persist()
    }
    useAiStore.setState({ chapterFlush: flush })
    return () => {
      // 卸载即中断生成（审查修复）：面板未挂载时此前无人中断——主进程 fetch 持续烧 token
      // 而流式输出因编辑器已销毁全部丢弃。挂载侧的 stop 仍保留（双保险，幂等）。
      // v2-F3：多候选同样卸载即停（采纳目标编辑器已不在）
      const cur = useAiStore.getState()
      if (cur.generation !== null) void cur.stopGeneration()
      if (cur.multiGen?.running) void cur.stopMultiGeneration()
      if (cur.chapterFlush === flush) useAiStore.setState({ chapterFlush: null })
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

  /** 元信息变更（标题/别名）的防抖落盘：不发布草稿（正文未变，无需重组装上下文） */
  const scheduleMetaSave = (): void => {
    setDirty(true)
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void persist()
    }, SAVE_DEBOUNCE_MS)
  }

  const updateTitle = (title: string): void => {
    setDoc((prev) => (prev ? { ...prev, title } : prev))
    scheduleMetaSave()
  }

  /** 别名增删（setDoc 函数式更新取最新态，AliasEditor 异步回调后闭包快照不参与计算） */
  const addAlias = (alias: string): void => {
    setDoc((prev) => (prev && !prev.aliases.includes(alias) ? { ...prev, aliases: [...prev.aliases, alias] } : prev))
    scheduleMetaSave()
  }

  const removeAlias = (alias: string): void => {
    setDoc((prev) => (prev ? { ...prev, aliases: prev.aliases.filter((a) => a !== alias) } : prev))
    scheduleMetaSave()
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
      <div className="chapter-aliases">
        <span className="chapter-aliases-label">别名</span>
        <AliasEditor values={doc.aliases} onAdd={addAlias} onRemove={removeAlias} addTitle="添加章节别名" />
      </div>
      <EditorContent editor={editor} className="chapter-body" />
      <div className="chapter-hint">[[ 触发双链补全 · 悬浮可预览 · 点击跳转 · 自动保存</div>
    </div>
  )
}
