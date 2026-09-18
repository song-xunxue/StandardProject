/**
 * 多候选会话组件（v2-F3 抽出为独立组件，v2-F16 扩展 chapterDraft 采纳）
 * 三栏流式预览 + 逐路采纳。两种会话：
 *   - continue（F3 续写候选）：编辑器在原章才可采纳（originPath 跨章校验）
 *   - chapterDraft（F16 节拍整章）：不依赖编辑器预览；采纳时确保目标章打开——
 *     目标章不存在则此刻建章（采纳时才建章，不产废弃空章），建章后编辑器就绪再写入
 *
 * 作者: 李文煜
 * 日期: 2026-09-17
 */

import type { ReactElement } from 'react'
import { useAiStore } from '@/store/aiStore'
import { useNovelStore } from '@/store/novelStore'
import { flattenChapterFiles, volumeOfChapter } from '@/services/chapterTree'
import { nextNumberedName } from '@shared/naming'
import { dialogConfirm } from '@/store/dialogStore'

export function MultiCandidates(): ReactElement {
  const multiGen = useAiStore((s) => s.multiGen)
  if (!multiGen) return <></>

  const isDraft = multiGen.kind === 'chapterDraft'

  /** 确保 chapterDraft 的目标章编辑器就绪：已存在→等打开；不存在→此刻建章（返回实际路径） */
  const ensureDraftChapter = async (): Promise<string | null> => {
    const ns = useNovelStore.getState()
    const ai = useAiStore.getState()
    const mg = ai.multiGen
    if (!mg) return null
    const target = mg.originPath
    // 无预定路径（发起时既无当前章也没算出新章名）：按尾章序号建新章
    const chapters = flattenChapterFiles(ns.tree)
    const exists = target !== undefined && chapters.some((c) => c.path === target)
    if (!exists) {
      const title = mg.targetTitle ?? nextNumberedName(chapters.map((c) => c.title), '章')
      // 沿用尾章所在卷（无章节时直下 chapters/）
      const volume = chapters.length > 0 ? volumeOfChapter(chapters[chapters.length - 1]!.path) : undefined
      try {
        // createFile 内部已 refreshTree + openTab 并返回实际落盘路径（可能与预定名不同）
        return await ns.createFile('chapter', title, volume)
      } catch (err) {
        await dialogConfirm(`目标章节创建失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
        return null
      }
    }
    // 已存在：若未打开则激活它的 Tab（或最近章节 Tab 兜底）
    const tab = ns.tabs.find((t) => t.kind === 'chapter' && t.path === target)
    if (tab && ns.activeTabId !== tab.id) ns.openTab('chapter', target)
    else if (!tab) ns.openTab('chapter', target)
    return target
  }

  /** 等编辑器与目标章草稿就绪（AiPanel.ensureChapterEditor 同款轮询）。
   *  审查修复：只认 editingDraft.path === targetPath——编辑器「已注册未加载」窗口
   *  （readChapter 在途、editingDraft 尚为 null）插入会被 setContent(emitUpdate:false)
   *  整体覆盖，整章草稿静默丢失 */
  const waitForEditor = async (targetPath: string): Promise<boolean> => {
    for (let i = 0; i < 30; i++) {
      const ai = useAiStore.getState()
      if (ai.chapterEditor && ai.editingDraft?.path === targetPath) return true
      await new Promise((r) => setTimeout(r, 100))
    }
    return false
  }

  /** 采纳一路候选：写入目标章（markdown 重排口径，与 GenerationWriter.finalize 一致） */
  const handleAdopt = async (index: number): Promise<void> => {
    const ai = useAiStore.getState()
    const mg = ai.multiGen
    const cand = mg?.candidates[index]
    if (!mg || !cand) return
    if (cand.text.trim() === '') return

    if (isDraft) {
      // chapterDraft：确保目标章就绪后写入（不存在则此刻建章）
      const targetPath = await ensureDraftChapter()
      if (targetPath === null) return
      const editor = useAiStore.getState().chapterEditor
      if (!editor || (await waitForEditor(targetPath)) === false) {
        await dialogConfirm('目标章节加载超时——候选已保留，请打开目标章节后重试采纳', '知道了')
        return
      }
      const ed = useAiStore.getState().chapterEditor
      if (!ed) {
        await dialogConfirm('正文编辑器已不在（章节被关闭或切换）——请重新打开目标章节后再采纳', '知道了')
        return
      }
      ed.chain()
        .focus()
        .insertContentAt(ed.state.selection.to, `${cand.text.trim()}\n\n`, { contentType: 'markdown' } as never)
        .run()
      await useAiStore.getState().dismissMultiGeneration()
      return
    }

    // continue（F3 旧语义）：编辑器在且在原章才可采纳（晨间审查修复口径）
    const editor = ai.chapterEditor
    if (!editor) {
      await dialogConfirm('正文编辑器已不在（章节被关闭或切换）——请重新打开原章节后再采纳', '知道了')
      return
    }
    const draft = ai.editingDraft
    if (draft && draft.text.trim() !== '' && mg.originPath && draft.path !== mg.originPath) {
      await dialogConfirm(`候选是「${mg.originLabel ?? mg.originPath}」的续写，当前正在编辑其他章节——请切回原章节后再采纳`, '知道了')
      return
    }
    editor
      .chain()
      .focus()
      .insertContentAt(editor.state.selection.to, `${cand.text.trim()}\n\n`, { contentType: 'markdown' } as never)
      .run()
    await useAiStore.getState().dismissMultiGeneration()
  }

  return (
    <div className="ai-candidates nokey">
      <div className="ai-candidates-head">
        <span className="ai-candidates-title">
          {isDraft ? `整章草稿候选${multiGen.targetTitle ? `（${multiGen.targetTitle}）` : ''}` : '三路候选（挑一个方向）'}
        </span>
        <span className="insp-hint">{multiGen.running ? '生成中…' : '已结束'}</span>
        {multiGen.running && (
          <button className="left-tool-btn" title="中断未完成的路（保留已生成文本）" onClick={() => void useAiStore.getState().stopMultiGeneration()}>
            全停
          </button>
        )}
        <button className="left-tool-btn" title="放弃全部候选" onClick={() => void useAiStore.getState().dismissMultiGeneration()}>
          放弃
        </button>
      </div>
      <div className="ai-candidates-cols">
        {multiGen.candidates.map((cand, i) => (
          <div key={cand.requestId} className={`ai-candidate${cand.error ? ' error' : ''}`}>
            <div className="ai-candidate-head">
              <span className="ai-candidate-label">{cand.label}</span>
              <span className="insp-hint">{cand.error ?? (cand.done ? `${cand.text.length} 字` : '流式中…')}</span>
            </div>
            <pre className="ai-candidate-text left-scroll">{cand.text !== '' ? cand.text : cand.error ? '' : '等待输出…'}</pre>
            <button
              className="left-tool-btn"
              disabled={cand.text.trim() === ''}
              title={isDraft ? '采纳此路为整章草稿（写入目标章；目标章不存在时自动建章）' : '在正文光标处插入此路文本'}
              onClick={() => void handleAdopt(i)}
            >
              采纳此路
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
