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
 *   3. M4-B：新增 removeTag（删除自定义标签；仅删库不动节点——节点残留标签渲染回退灰色，可手动摘除）
 *
 * 2026-08-28
 * 变更说明：
 *   1. M5：新增 restoreSnapshot（快照恢复的前序编排：落盘挂起编辑→清草稿→关 Tab
 *      卸载章节编辑器（触发其卸载冲刷保存）→ 等 IPC 到达顺序 → 主进程恢复 → 复用 openNovel 水合）
 *
 * 2026-08-30
 * 变更说明：
 *   1. 体验优化批次：新增 closeTabs 批量关闭（Tab 右键菜单「关闭其他/关闭右侧/关闭所有」底座）；
 *      closeTab 改为委托 closeTabs——顺带修复激活蓝图 Tab 被关后画布路由停留于已关蓝图的隐患
 *      （回退 Tab 为蓝图时经 activateTab 同步 enterGraph）
 *   2. 审查修复（五维工作流确认项）：
 *      - exchangeFiles/deleteFile/renameFile 经 aiStore.chapterFlush 前置冲刷挂起编辑
 *        （防卸载冲刷用旧内存内容覆盖交换结果/复活已删除文件——含 1 项 high 数据丢失）
 *      - deleteFile 关联 Tab 改走 closeTabs（激活回退方向与路由同步对齐）
 *      - renameFile 同步重写 Tab id（id 内嵌路径，不重写则旧名复用时产生重复 key）
 *      - watcher/refreshTree 树对账：清理指向已不存在文件的 Tab（外部删除场景）
 *      - restoreSnapshot 关全部 Tab 统一走 closeTabs 单一入口
 */

import { create } from 'zustand'
import type { NovelMeta, RecentNovel, TreeNode } from '@shared/types'
import type { TagDef } from '@shared/tags'
import { hydrateGraphData } from '@shared/blueprintCodec'
import type { BlueprintFile } from '@shared/types'
import { useGraphStore } from './graphStore'
import { useAiStore } from './aiStore'

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
  /** 章节内容版本：交换/重排后递增，驱动已挂载的 ChapterEditor 重挂载重读（防旧缓冲回写覆盖交换结果） */
  chapterReloadSeq: number
  /** 初始化：读最近列表并订阅目录变化 */
  init: () => Promise<void>
  /** 新建小说（目录由对话框选择） */
  createNovel: (dir: string, title: string) => Promise<void>
  /** 打开小说并水合 */
  openNovel: (dir: string) => Promise<void>
  /** 恢复快照：前序落盘/清态后交主进程换内容，再复用 openNovel 全套水合（M5） */
  restoreSnapshot: (id: string) => Promise<void>
  /** 刷新文件树 + 重新水合图数据；传入变更蓝图清单时走增量合并（watcher 推送路径） */
  refreshTree: (changedBlueprints?: string[]) => Promise<void>
  /** 创建蓝图/章节文件（章节可指定卷目录名） */
  createFile: (kind: 'blueprint' | 'chapter', title: string, volume?: string) => Promise<void>
  /** 新建卷（chapters 下一层目录） */
  createVolume: (name: string) => Promise<void>
  /** 交换两个文件位置（文件名互换=内容对调；章节拖动排序用） */
  exchangeFiles: (pathA: string, pathB: string) => Promise<void>
  /** 重命名文件（并同步 Tab） */
  renameFile: (path: string, title: string) => Promise<void>
  /** 删除文件（并同步 Tab） */
  deleteFile: (path: string) => Promise<void>
  /** 新建自定义标签（写回 novel.json 并更新本地元信息）；重名返回已有定义 */
  createTag: (name: string, color: string) => Promise<TagDef | null>
  /** 删除自定义标签（内置标签禁删——全局图谱伏笔分析等硬依赖）；已贴节点的残留标签不动（回退灰色） */
  removeTag: (name: string) => Promise<void>
  /** 打开 Tab（已打开则激活） */
  openTab: (kind: OpenTab['kind'], path: string, title?: string) => void
  /** 激活 Tab；蓝图 Tab 同步画布路由到该蓝图（Tab 栏点击与左栏树点击切换都走这里） */
  activateTab: (id: string) => void
  closeTab: (id: string) => void
  /** 批量关闭 Tab（Tab 右键菜单「关闭其他/关闭右侧/关闭所有」的公共底座）：
   *  激活 Tab 被关时回退 fallbackId（不存在于剩余集合时取剩余最后一个，无可回退则 null）；
   *  回退目标为蓝图时经 activateTab 同步画布路由，避免画布停留在已关闭的蓝图内 */
  closeTabs: (ids: string[], fallbackId?: string) => void
}

const api = (): typeof window.api => {
  if (typeof window === 'undefined' || !window.api) throw new Error('window.api 不可用（需在 Electron 中运行）')
  return window.api
}

/** 目录变化订阅句柄（模块级：StrictMode 下 Effect 双调用也只注册一次） */
let unsubscribeNovelChanged: (() => void) | null = null

/** 从树节点提取标题（去扩展名） */
const titleOf = (name: string): string => name.replace(/\.blueprint\.json$/, '').replace(/\.md$/, '')

/**
 * 树对账：清理指向树中已不存在文件的 Tab（外部删除/移动场景，审查修复）。
 * 激活 Tab 被清掉时经 closeTabs 统一回退（蓝图回退同步画布路由）。
 * 注：激活中的章节编辑器若有 600ms 内未落盘编辑，卸载冲刷会把文件重建（编辑不丢，属可接受边缘）
 */
function reconcileTabs(get: () => NovelState, tree: TreeNode[]): void {
  const alive = new Set<string>()
  const walk = (nodes: TreeNode[]): void => {
    for (const n of nodes) {
      if (n.kind === 'blueprint' || n.kind === 'chapter') alive.add(n.path)
      if (n.children) walk(n.children)
    }
  }
  walk(tree)
  const dead = get()
    .tabs.filter((t) => !alive.has(t.path))
    .map((t) => t.id)
  if (dead.length > 0) get().closeTabs(dead)
}

export const useNovelStore = create<NovelState>()((set, get) => ({
  novel: null,
  recents: [],
  tree: [],
  tabs: [],
  activeTabId: null,
  chapterReloadSeq: 0,

  init: async () => {
    try {
      const recents = await api().fs.recentNovels()
      set({ recents })
    } catch (err) {
      console.error('[novelStore] 读取最近列表失败:', err)
    }
    // 订阅主进程推送的目录变化（模块级单次注册，防 StrictMode 重复订阅）
    if (!unsubscribeNovelChanged) {
      unsubscribeNovelChanged = api().onNovelChanged((payload) => {
        set({ tree: payload.tree })
        // 外部删除对账：Tab 不得指向已不存在的文件（否则点击无响应/下次保存复活旧文件）
        reconcileTabs(get, payload.tree)
        // 增量：只重读变更的蓝图文件并入图数据（未变图保持引用，画布不整体重渲）
        const changedBlueprints = payload.changed.filter((p) => p.startsWith('blueprints/') && p.endsWith('.blueprint.json'))
        void get().refreshTree(changedBlueprints)
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
    // 同步清除旧小说的编辑草稿（否则旧正文泄漏进新小说的上下文组装与目标判定）
    useAiStore.getState().setDraft(null)
    const meta = await api().fs.openNovel(dir)
    set({ novel: meta, tabs: [], activeTabId: null })
    await get().refreshTree()
    await refreshRecents(set)
    // 默认打开第一张蓝图（树的第一层是 blueprints/chapters 两个目录节点，需下钻一层）
    const firstBlueprint = (get().tree[0]?.children ?? []).flatMap((c) => c.children ?? []).find((c) => c.kind === 'blueprint')
    if (firstBlueprint) get().openTab('blueprint', firstBlueprint.path)
  },

  restoreSnapshot: async (id) => {
    const dir = get().novel?.dir
    if (!dir) return
    // 前序与 openNovel 相同，但必须在主进程替换文件【之前】完成：
    // 1. 蓝图属性/位置的防抖挂起写盘
    await useGraphStore.getState().flushDirty()
    // 落盘存在失败（脏集合非空）则中止恢复（M5 审查修复）：残留脏图会经 hydrate 的
    // 「脏图保护」用恢复前内存版顶掉磁盘恢复结果，且后续防抖重试还会把旧内容写回
    const dirtyLeft = useGraphStore.getState().dirtyGraphIds
    if (dirtyLeft.length > 0) {
      throw new Error('部分蓝图尚未保存成功，请稍后重试恢复（避免未落盘内容覆盖恢复结果）')
    }
    // 2. 清 AI 草稿（防旧正文在恢复后参与上下文组装）
    useAiStore.getState().setDraft(null)
    // 3. 关全部 Tab（统一走 closeTabs 单一入口）：章节编辑器卸载会冲刷其 600ms 防抖保存（旧内容先落盘，恢复随后覆盖）
    get().closeTabs(get().tabs.map((t) => t.id))
    // 4. 等冲刷保存的 IPC 先于恢复指令到达主进程（invoke 到达顺序=发送顺序，150ms 裕量）
    await new Promise((r) => setTimeout(r, 150))
    await api().fs.snapshotRestore(id)
    // 5. 复用完整打开流程：flush 空转 → IPC openNovel（主进程已重开监听）→ 全量水合 → 开第一张蓝图
    await get().openNovel(dir)
  },

  refreshTree: async (changedBlueprints) => {
    if (!get().novel) return
    try {
      const tree = await api().fs.readTree()
      set({ tree })
      reconcileTabs(get, tree)
      const blueprints: TreeNode[] =
        tree[0]?.children?.find((c) => c.kind === 'dir' && c.path === 'blueprints')?.children ?? []
      const treePaths = new Set(blueprints.map((bp) => bp.path))

      if (changedBlueprints) {
        // 增量：只读变更蓝图 → mergeRefresh（未变图保持对象引用）
        const changedSet = new Set(changedBlueprints)
        const files: BlueprintFile[] = []
        const paths: Record<string, string> = {}
        for (const bp of blueprints) {
          if (!changedSet.has(bp.path)) continue
          try {
            const file = await api().fs.readBlueprint(bp.path)
            files.push(file)
            paths[file.id] = bp.path
          } catch (err) {
            console.error(`[novelStore] 蓝图解析失败 ${bp.path}:`, err)
          }
        }
        useGraphStore.getState().mergeRefresh(files, paths, treePaths)
        return
      }

      // 全量：读取全部蓝图文件 → 水合全局图数据
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

  createFile: async (kind, title, volume) => {
    const created = await api().fs.createFile(kind, title, volume)
    await get().refreshTree()
    get().openTab(kind, created.path, title)
  },

  createVolume: async (name) => {
    await api().fs.createVolume(name)
    await get().refreshTree()
  },

  exchangeFiles: async (pathA, pathB) => {
    // 前置冲刷挂起编辑（审查 high 修复）：清掉编辑器防抖定时器后，重挂载的卸载冲刷
    // 不再触发——否则旧内存正文会写回交换后的路径，静默吞掉对方章节的内容
    await useAiStore.getState().chapterFlush?.([pathA, pathB])
    await api().fs.exchangeFiles(pathA, pathB)
    await get().refreshTree()
    // 内容随文件对调：递增版本号驱动已打开的章节编辑器重挂载重读，
    // 否则编辑器内存旧正文会在 600ms 防抖保存时写回、静默吞掉交换进来的内容
    set((s) => ({ chapterReloadSeq: s.chapterReloadSeq + 1 }))
  },

  renameFile: async (path, title) => {
    // 前置冲刷：最新编辑随旧文件落盘后随重命名走；同时防止卸载冲刷把旧路径文件写回复活
    await useAiStore.getState().chapterFlush?.([path])
    const { path: newPath } = await api().fs.renameFile(path, title)
    set((s) => {
      const renamed = s.tabs.find((t) => t.path === path)
      return {
        // id 同步重写（id 内嵌路径，审查修复）：否则旧名被新文件复用时产生重复 Tab key，
        // closeTabs 按 id 过滤会一次误关两个 Tab
        tabs: s.tabs.map((t) => (t.path === path ? { ...t, id: `${t.kind}:${newPath}`, path: newPath, title } : t)),
        activeTabId: renamed && s.activeTabId === renamed.id ? `${renamed.kind}:${newPath}` : s.activeTabId
      }
    })
    await get().refreshTree()
    // 引用随迁：指向旧路径的 ref 节点更新为新路径（否则重命名一章会悄悄打断章节↔蓝图串联）
    const gs = useGraphStore.getState()
    for (const n of Object.values(gs.nodes)) {
      if (n.type === 'ref' && n.refTarget === path) gs.updateNode(n.id, { refTarget: newPath })
    }
  },

  deleteFile: async (path) => {
    // 前置冲刷：清掉防抖定时器，防止随后的卸载冲刷对已删除路径 writeFileSync 复活旧文件
    await useAiStore.getState().chapterFlush?.([path])
    await api().fs.deleteFile(path)
    // 关联 Tab 统一走 closeTabs（审查修复）：回退方向与路由同步和手动关闭一致（经 activateTab）
    const ids = get()
      .tabs.filter((t) => t.path === path)
      .map((t) => t.id)
    if (ids.length > 0) get().closeTabs(ids)
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

  removeTag: async (name) => {
    const novel = get().novel
    if (!novel) return
    const tag = novel.tagLibrary.find((t) => t.name === name)
    // 内置标签禁删（GlobalGraphView 未回收伏笔分析硬编码依赖「伏笔」等内置标签）
    if (!tag || tag.builtin) return
    const tagLibrary = novel.tagLibrary.filter((t) => t.name !== name)
    const meta = await api().fs.saveMeta({ ...novel, tagLibrary })
    set({ novel: meta })
  },

  openTab: (kind, path, title) => {
    const existing = get().tabs.find((t) => t.path === path)
    if (existing) {
      get().activateTab(existing.id)
      return
    }
    const tab: OpenTab = {
      id: `${kind}:${path}`,
      kind,
      path,
      title: title ?? titleOf(path.split('/').pop() ?? path)
    }
    set({ tabs: [...get().tabs, tab] })
    get().activateTab(tab.id)
  },

  activateTab: (id) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab) return
    set({ activeTabId: id })
    // 蓝图 Tab：画布路由同步到该蓝图（否则画布停留在先前的子图，Tab 切换无视觉响应）
    if (tab.kind === 'blueprint') {
      const gs = useGraphStore.getState()
      const gid = Object.entries(gs.graphPaths).find(([, p]) => p === tab.path)?.[0]
      if (gid && gs.route[gs.route.length - 1] !== gid) gs.enterGraph(gid)
    }
  },

  closeTab: (id) => {
    get().closeTabs([id])
  },

  closeTabs: (ids, fallbackId) => {
    const closeSet = new Set(ids)
    const before = get().tabs
    const tabs = before.filter((t) => !closeSet.has(t.id))
    if (tabs.length === before.length) return // 传入 id 均不在打开集合：no-op
    const activeId = get().activeTabId
    if (activeId === null || !closeSet.has(activeId)) {
      // 激活 Tab 未被关：只裁剪集合，激活态与画布路由均不受影响
      set({ tabs })
      return
    }
    // 激活 Tab 被关：回退 fallbackId → 剩余最后一个 → 无（全部关闭）
    const fallback =
      fallbackId !== undefined && tabs.some((t) => t.id === fallbackId)
        ? fallbackId
        : (tabs[tabs.length - 1]?.id ?? null)
    set({ tabs, activeTabId: fallback })
    // 回退目标为蓝图时同步画布路由（activateTab 内含 enterGraph；章节/空回退无副作用）
    if (fallback !== null) get().activateTab(fallback)
  }
}))

async function refreshRecents(set: (partial: Partial<NovelState>) => void): Promise<void> {
  try {
    set({ recents: await api().fs.recentNovels() })
  } catch {
    /* 最近列表失败不阻塞主流程 */
  }
}
