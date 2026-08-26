/**
 * 渲染进程全局类型：window.api 类型声明（与 electron/preload.ts 保持一致）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. 初版：声明 preload 暴露的 versions 信息
 *   2. M1：fs 通道与目录变化订阅的完整类型（复用 shared 契约类型）
 */

import type { BlueprintFile, ChapterDoc, NovelMeta, RecentNovel, TreeNode } from '@shared/types'

export interface Api {
  versions: {
    chrome: string
    node: string
    electron: string
  }
  fs: {
    pickDirectory: () => Promise<string | null>
    createNovel: (dir: string, title: string) => Promise<NovelMeta>
    openNovel: (dir: string) => Promise<NovelMeta>
    recentNovels: () => Promise<RecentNovel[]>
    readTree: () => Promise<TreeNode[]>
    readBlueprint: (path: string) => Promise<BlueprintFile>
    saveBlueprint: (path: string, file: BlueprintFile) => Promise<void>
    readChapter: (path: string) => Promise<ChapterDoc>
    saveChapter: (path: string, doc: ChapterDoc) => Promise<void>
    createFile: (kind: 'blueprint' | 'chapter', title: string) => Promise<{ path: string; id?: string }>
    renameFile: (path: string, title: string) => Promise<{ path: string }>
    deleteFile: (path: string) => Promise<void>
    rebuildIndex: () => Promise<{ nodes: number; edges: number }>
    indexStats: () => Promise<{ nodes: number; edges: number; lastBuiltAt: string | null }>
  }
  onNovelChanged: (callback: (tree: TreeNode[]) => void) => () => void
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
