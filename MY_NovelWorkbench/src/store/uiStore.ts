/**
 * UI 浮层状态存储（zustand，v2-F8/F16）：跨组件唤起的浮层（TabBar/画布发起 → App 根挂载）
 * 章节快照列表浮层、diff 对比浮层、节拍整章发起浮层的开合状态；
 * LeftPanel footer 的既有浮层仍走组件局部 state
 *
 * 作者: 李文煜
 * 日期: 2026-09-17
 */

import { create } from 'zustand'

/** 章节快照列表浮层目标 */
export interface ChapterSnapTarget {
  path: string
  title: string
}

/** diff 对比浮层目标（对比「当前磁盘 vs 指定快照」） */
export interface ChapterDiffTarget extends ChapterSnapTarget {
  id: string
  createdAt: string
}

interface UiState {
  /** 章节快照浮层（null=关闭） */
  chapterSnapPanel: ChapterSnapTarget | null
  openChapterSnap: (target: ChapterSnapTarget) => void
  closeChapterSnap: () => void
  /** diff 浮层（null=关闭）；打开时列表浮层保持（恢复/关闭后回到列表） */
  chapterDiff: ChapterDiffTarget | null
  openChapterDiff: (target: ChapterDiffTarget) => void
  closeChapterDiff: () => void
  /** v2-F16 节拍整章发起浮层（null=关闭）；graphId=节拍子图 */
  beatLauncher: { graphId: string } | null
  openBeatLauncher: (graphId: string) => void
  closeBeatLauncher: () => void
  /** 资源库版本计数（审查修复：资源库保存/删除改写预设后递增——AiPanel 订阅重载
   *  预设列表，防已删预设仍显示/仍可选中生效） */
  resourceVersion: number
  bumpResourceVersion: () => void
}

export const useUiStore = create<UiState>()((set) => ({
  chapterSnapPanel: null,
  openChapterSnap: (target) => set({ chapterSnapPanel: target }),
  closeChapterSnap: () => set({ chapterSnapPanel: null, chapterDiff: null }),
  chapterDiff: null,
  openChapterDiff: (target) => set({ chapterDiff: target }),
  closeChapterDiff: () => set({ chapterDiff: null }),
  beatLauncher: null,
  openBeatLauncher: (graphId) => set({ beatLauncher: { graphId } }),
  closeBeatLauncher: () => set({ beatLauncher: null }),
  resourceVersion: 0,
  bumpResourceVersion: () => set((s) => ({ resourceVersion: s.resourceVersion + 1 }))
}))
