/**
 * 小说工作区存储（zustand）：元信息 / 文件树 / Tab / 最近列表
 * 全部文件操作经 window.api.fs（IPC → 主进程服务），渲染层不直接触碰文件系统
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：init/创建/打开小说、树刷新+图水合、Tab 管理、文件 CRUD、变化订阅
 *   2. M2：新增 createTag（自定义标签写入 novel.json 标签库）
 */

import { create } from 'zustand'
import type { NovelMeta, RecentNovel, TreeNode } from '@shared/types'
import type { TagDef } from '@shared/tags'
import { hydrateGraphData } from '@shared/blueprintCodec'
import type { BlueprintFile } from '@shared/types'
import { useGraphStore } from './graphStore'

/** 打开的文件 Tab */
export interface OpenTab {
  id: string
  kind: 'blueprint' | 'chapter'
  path: string
  title: string
}

interface NovelState {
  novel: NovelMeta | null
  recents: RecentNovel[]
  tree: TreeNode[]
  tabs: OpenTab[]
  activeTabId: string | null
  /** 初始化：读最近列表并订阅目录变化 */
  init: () => Promise<void>
  /** 新建小说（目录由对话框选择） */
  createNovel: (dir: string, title: string) => Promise<void>
  /** 打开小说并水合 */
  openNovel: (dir: string) => Promise<void>
  /** 刷新文件树 + 重新水合图数据 */
  refreshTree: () => Promise<void>
  /** 创建蓝图/章节文件 */
  createFile: (kind: 'blueprint' | 'chapter', title: string) => Promise<void>
  /** 重命名文件（并同步 Tab） */
  renameFile: (path: string, title: string) => Promise<void>
  /** 删除文件（并同步 Tab） */
  deleteFile: (path: string) => Promise<void>
  /** 新建自定义标签（写回 novel.json 并更新本地元信息）；重名返回已有定义 */
  createTag: (name: string, color: string) => Promise<TagDef | null>
  /** 打开 Tab（已打开则激活） */
  openTab: (kind: OpenTab['kind'], path: string, title?: string) => void
  closeTab: (id: string) => void
}

const api = (): typeof window.api => {
  if (typeof window === 'undefined' || !window.api) throw new Error('window.api 不可用（需在 Electron 中运行）')
  return window.api
}

/** 目录变化订阅句柄（模块级：StrictMode 下 Effect 双调用也只注册一次） */
let unsubscribeNovelChanged: (() => void) | null = null

/** 从树节点提取标题（去扩展名） */
const titleOf = (name: string): string => name.replace(/\.blueprint\.json$/, '').replace(/\.md$/, '')

export const useNovelStore = create<NovelState>()((set, get) => ({
  novel: null,
  recents: [],
  tree: [],
  tabs: [],
  activeTabId: null,

  init: async () => {
    try {
      const recents = await api().fs.recentNovels()
      set({ recents })
    } catch (err) {
      console.error('[novelStore] 读取最近列表失败:', err)
    }
    // 订阅主进程推送的目录变化（模块级单次注册，防 StrictMode 重复订阅）
    if (!unsubscribeNovelChanged) {
      unsubscribeNovelChanged = api().onNovelChanged((tree) => {
        set({ tree })
        void get().refreshTree()
      })
    }
  },

  createNovel: async (dir, title) => {
    const meta = await api().fs.createNovel(dir, title)
    set({ novel: meta })
    await get().refreshTree()
    await refreshRecents(set)
  },

  openNovel: async (dir) => {
    // 切换前落盘旧小说的挂起编辑（防抖窗口内的属性/位置变更），否则会被新小说水合冲掉
    await useGraphStore.getState().flushDirty()
    const meta = await api().fs.openNovel(dir)
    set({ novel: meta, tabs: [], activeTabId: null })
    await get().refreshTree()
    await refreshRecents(set)
    // 默认打开第一张蓝图（树的第一层是 blueprints/chapters 两个目录节点，需下钻一层）
    const firstBlueprint = (get().tree[0]?.children ?? []).flatMap((c) => c.children ?? []).find((c) => c.kind === 'blueprint')
    if (firstBlueprint) get().openTab('blueprint', firstBlueprint.path)
  },

  refreshTree: async () => {
    if (!get().novel) return
    try {
      const tree = await api().fs.readTree()
      set({ tree })
      // 读取全部蓝图文件 → 水合全局图数据
      const blueprints: TreeNode[] =
        tree[0]?.children?.find((c) => c.kind === 'dir' && c.path === 'blueprints')?.children ?? []
      const files: BlueprintFile[] = []
      const paths: Record<string, string> = {}
      for (const bp of blueprints) {
        try {
          const file = await api().fs.readBlueprint(bp.path)
          files.push(file)
          paths[file.id] = bp.path
        } catch (err) {
          console.error(`[novelStore] 蓝图解析失败 ${bp.path}:`, err)
        }
      }
      useGraphStore.getState().hydrate(hydrateGraphData(files), paths)
    } catch (err) {
      console.error('[novelStore] 刷新文件树失败:', err)
    }
  },

  createFile: async (kind, title) => {
    const created = await api().fs.createFile(kind, title)
    await get().refreshTree()
    get().openTab(kind, created.path, title)
  },

  renameFile: async (path, title) => {
    const { path: newPath } = await api().fs.renameFile(path, title)
    set({
      tabs: get().tabs.map((t) => (t.path === path ? { ...t, path: newPath, title } : t))
    })
    await get().refreshTree()
  },

  deleteFile: async (path) => {
    await api().fs.deleteFile(path)
    const tabs = get().tabs.filter((t) => t.path !== path)
    const activeTabId = tabs.find((t) => t.id === get().activeTabId) ? get().activeTabId : (tabs[0]?.id ?? null)
    set({ tabs, activeTabId })
    await get().refreshTree()
  },

  createTag: async (name, color) => {
    const novel = get().novel
    if (!novel) return null
    const exists = novel.tagLibrary.find((t) => t.name === name)
    if (exists) return exists
    const tagLibrary = [...novel.tagLibrary, { name, color, builtin: false }]
    const meta = await api().fs.saveMeta({ ...novel, tagLibrary })
    set({ novel: meta })
    return meta.tagLibrary.find((t) => t.name === name) ?? null
  },

  openTab: (kind, path, title) => {
    const existing = get().tabs.find((t) => t.path === path)
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }
    const tab: OpenTab = {
      id: `${kind}:${path}`,
      kind,
      path,
      title: title ?? titleOf(path.split('/').pop() ?? path)
    }
    set({ tabs: [...get().tabs, tab], activeTabId: tab.id })
  },

  closeTab: (id) => {
    const tabs = get().tabs.filter((t) => t.id !== id)
    const activeTabId = get().activeTabId === id ? (tabs[tabs.length - 1]?.id ?? null) : get().activeTabId
    set({ tabs, activeTabId })
  }
}))

async function refreshRecents(set: (partial: Partial<NovelState>) => void): Promise<void> {
  try {
    set({ recents: await api().fs.recentNovels() })
  } catch {
    /* 最近列表失败不阻塞主流程 */
  }
}
