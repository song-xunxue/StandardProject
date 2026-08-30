/**
 * 小说工作区存储单测：createTag / removeTag 标签库增删（M4-B）+ closeTabs 批量关闭与
 * 文件变更 Tab 联动（2026-08-30 审查修复：rename id 重写 / chapterFlush 前置冲刷 /
 * deleteFile 走 closeTabs / 树对账清理失效 Tab）
 * window.api 以 stub 替代（novelStore 经 window.api.fs.* 读写）
 *
 * 作者: 李文煜
 * 日期: 2026-08-28
 *
 * 2026-08-28
 * 变更说明：
 *   1. M4-B 初版：removeTag 回归（自定义标签删除 / 内置标签禁删 / 不存在标签 no-op）
 *
 * 2026-08-30
 * 变更说明：
 *   1. 体验优化批次：closeTabs 回归（激活保留/回退 fallbackId/剩余最后一个/全关清空/no-op）
 *      + 蓝图回退经 activateTab 同步画布路由（enterGraph 集成验证）
 *   2. 审查修复回归：renameFile 重写 Tab id、exchange/delete/rename 前置冲刷桥调用、
 *      deleteFile 统一回退、refreshTree 树对账
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NovelMeta, TreeNode } from '@shared/types'

// ---- window.api stub（须在导入 novelStore 前就位——模块内 api() 运行时读取） ----
const savedMetas: NovelMeta[] = []
/** readTree 的可变桩数据（按测试需要预置章节树；blueprints 目录保持空避免触发蓝图读取） */
let stubTree: TreeNode[] = []
vi.stubGlobal('window', {
  api: {
    fs: {
      // 模拟主进程 saveMeta：记录调用并原样返回
      saveMeta: async (meta: NovelMeta): Promise<NovelMeta> => {
        savedMetas.push(meta)
        return meta
      },
      readTree: async (): Promise<TreeNode[]> => stubTree,
      renameFile: async (path: string, title: string): Promise<{ path: string }> => ({
        path: path.endsWith('.md') ? `chapters/${title}.md` : `blueprints/${title}.blueprint.json`
      }),
      deleteFile: async (): Promise<void> => {},
      exchangeFiles: async (): Promise<void> => {}
    }
  }
})

const { useNovelStore } = await import('./novelStore')
const { useGraphStore } = await import('./graphStore')
const { useAiStore } = await import('./aiStore')
import type { OpenTab } from './novelStore'

const meta = (): NovelMeta => ({
  id: 'novel-1',
  title: '测试小说',
  createdAt: '2026-08-28T00:00:00.000Z',
  tagLibrary: [
    { name: '设定', color: '#4f8cff', builtin: true },
    { name: '伏笔', color: '#b48cff', builtin: true },
    { name: '武侠', color: '#ff8c6b', builtin: false }
  ]
})

beforeEach(() => {
  savedMetas.length = 0
  useNovelStore.setState({ novel: meta() })
})

describe('removeTag（M4-B）', () => {
  it('删除自定义标签：标签库移除并写回 novel.json', async () => {
    await useNovelStore.getState().removeTag('武侠')
    const novel = useNovelStore.getState().novel!
    expect(novel.tagLibrary.map((t) => t.name)).toEqual(['设定', '伏笔'])
    expect(savedMetas).toHaveLength(1)
    expect(savedMetas[0]!.tagLibrary).toHaveLength(2)
  })

  it('内置标签禁删：不落盘且标签库不变', async () => {
    await useNovelStore.getState().removeTag('伏笔')
    const novel = useNovelStore.getState().novel!
    expect(novel.tagLibrary.map((t) => t.name)).toEqual(['设定', '伏笔', '武侠'])
    expect(savedMetas).toHaveLength(0)
  })

  it('不存在的标签与未打开小说均为 no-op', async () => {
    await useNovelStore.getState().removeTag('不存在')
    expect(savedMetas).toHaveLength(0)
    useNovelStore.setState({ novel: null })
    await useNovelStore.getState().removeTag('武侠')
    expect(savedMetas).toHaveLength(0)
  })
})

describe('createTag（对偶回归）', () => {
  it('新建自定义标签写回；重名返回已有定义不再追加', async () => {
    const created = await useNovelStore.getState().createTag('言情', '#66d1c1')
    expect(created).toMatchObject({ name: '言情', builtin: false })
    const novel = useNovelStore.getState().novel!
    expect(novel.tagLibrary).toHaveLength(4)

    const again = await useNovelStore.getState().createTag('武侠', '#ffffff')
    expect(again).toMatchObject({ name: '武侠', color: '#ff8c6b' })
    expect(useNovelStore.getState().novel!.tagLibrary).toHaveLength(4)
  })
})

// ---- closeTabs（2026-08-30 体验优化：Tab 右键菜单批量关闭底座） ----

/** 造 Tab：蓝图/章节各按序号生成确定性 id 与路径 */
const bpTab = (n: number): OpenTab => ({ id: `blueprint:blueprints/蓝图${n}.blueprint.json`, kind: 'blueprint', path: `blueprints/蓝图${n}.blueprint.json`, title: `蓝图${n}` })
const chTab = (n: number): OpenTab => ({ id: `chapter:chapters/第${n}章.md`, kind: 'chapter', path: `chapters/第${n}章.md`, title: `第${n}章` })

/** 铺最小图数据（蓝图 n ↔ 图 gn 双张，均顶层）：验证回退激活蓝图时 enterGraph 路由同步 */
const seedGraphs = (n: number): void => {
  useGraphStore.setState({
    graphs: Object.fromEntries(
      Array.from({ length: n }, (_, i) => [`g${i + 1}`, { id: `g${i + 1}`, title: `蓝图${i + 1}`, nodeIds: [], ownerNodeId: null }])
    ),
    graphPaths: Object.fromEntries(
      Array.from({ length: n }, (_, i) => [`g${i + 1}`, `blueprints/蓝图${i + 1}.blueprint.json`])
    ),
    route: ['g1'],
    nodes: {},
    edges: {}
  })
}

/** 桩树：根目录（meta）+ 空 blueprints + chapters 直下若干章 */
const treeOf = (chapterPaths: string[]): TreeNode[] => [
  {
    kind: 'meta',
    name: '测试小说',
    path: 'novel.json',
    children: [
      { kind: 'dir', name: 'blueprints', path: 'blueprints', children: [] },
      {
        kind: 'dir',
        name: 'chapters',
        path: 'chapters',
        children: chapterPaths.map((p) => ({ kind: 'chapter' as const, name: p.split('/').pop() ?? p, path: p }))
      }
    ]
  }
]

describe('closeTabs（Tab 右键菜单底座）', () => {
  beforeEach(() => {
    useNovelStore.setState({ tabs: [], activeTabId: null })
    useGraphStore.setState({ graphs: {}, graphPaths: {}, route: [], nodes: {}, edges: {} })
  })

  it('批量移除目标 Tab；激活 Tab 未被关时激活态保持不变', () => {
    useNovelStore.setState({ tabs: [bpTab(1), chTab(1), chTab(2)], activeTabId: chTab(1).id })
    useNovelStore.getState().closeTabs([bpTab(1).id, chTab(2).id])
    const s = useNovelStore.getState()
    expect(s.tabs.map((t) => t.id)).toEqual([chTab(1).id])
    expect(s.activeTabId).toBe(chTab(1).id)
  })

  it('关闭其他（fallbackId）：激活 Tab 被关时回退到目标 Tab', () => {
    useNovelStore.setState({ tabs: [bpTab(1), chTab(1), chTab(2)], activeTabId: chTab(2).id })
    // 「关闭其他」保留 ch1：关闭 bp1 与激活中的 ch2，fallback 指向 ch1
    useNovelStore.getState().closeTabs([bpTab(1).id, chTab(2).id], chTab(1).id)
    const s = useNovelStore.getState()
    expect(s.tabs.map((t) => t.id)).toEqual([chTab(1).id])
    expect(s.activeTabId).toBe(chTab(1).id)
  })

  it('激活被关且无 fallback：回退剩余最后一个 Tab；全部关闭则为空', () => {
    useNovelStore.setState({ tabs: [bpTab(1), chTab(1), chTab(2)], activeTabId: chTab(2).id })
    useNovelStore.getState().closeTabs([chTab(2).id])
    expect(useNovelStore.getState().activeTabId).toBe(chTab(1).id)

    // 关闭所有：tabs 清空、激活置空（内容区回落占位提示）
    useNovelStore.getState().closeTabs([bpTab(1).id, chTab(1).id])
    const s = useNovelStore.getState()
    expect(s.tabs).toEqual([])
    expect(s.activeTabId).toBeNull()
  })

  it('回退目标为蓝图时同步画布路由（activateTab→enterGraph 集成）', () => {
    seedGraphs(2)
    // tabs=[蓝图1, 蓝图2, 第9章]，激活第9章（画布路由停在蓝图1）；对蓝图2「关闭右侧」
    useNovelStore.setState({ tabs: [bpTab(1), bpTab(2), chTab(9)], activeTabId: chTab(9).id })
    useNovelStore.getState().closeTabs([chTab(9).id], bpTab(2).id)
    expect(useNovelStore.getState().activeTabId).toBe(bpTab(2).id)
    // 路由从 g1 切到 g2：画布不再停留在未激活的蓝图里
    expect(useGraphStore.getState().route).toEqual(['g2'])
  })

  it('传入均未打开的 id 为 no-op（tabs 引用不变）；fallback 不在剩余集合时忽略', () => {
    useNovelStore.setState({ tabs: [bpTab(1), chTab(1)], activeTabId: chTab(1).id })
    const before = useNovelStore.getState().tabs
    useNovelStore.getState().closeTabs(['blueprint:blueprints/不存在.blueprint.json'])
    expect(useNovelStore.getState().tabs).toBe(before)

    // fallbackId 指向同样被关的 Tab：忽略，走「剩余最后一个」回退
    useNovelStore.setState({ tabs: [bpTab(1), bpTab(2), chTab(1)], activeTabId: bpTab(1).id })
    useNovelStore.getState().closeTabs([bpTab(1).id, bpTab(2).id], bpTab(2).id)
    expect(useNovelStore.getState().activeTabId).toBe(chTab(1).id)
  })
})

describe('文件变更的 Tab 联动（2026-08-30 审查修复）', () => {
  beforeEach(() => {
    stubTree = []
    useNovelStore.setState({ tabs: [], activeTabId: null })
    useGraphStore.setState({ graphs: {}, graphPaths: {}, route: [], nodes: {}, edges: {} })
    useAiStore.setState({ chapterFlush: null, generation: null, generationError: null })
  })

  it('renameFile 同步重写 Tab id 与激活态（旧名复用不再产生重复 key）', async () => {
    stubTree = treeOf(['chapters/序章.md'])
    useNovelStore.setState({ tabs: [chTab(1)], activeTabId: chTab(1).id })
    await useNovelStore.getState().renameFile('chapters/第1章.md', '序章')
    const s = useNovelStore.getState()
    expect(s.tabs[0]).toMatchObject({ id: 'chapter:chapters/序章.md', path: 'chapters/序章.md', title: '序章' })
    expect(s.activeTabId).toBe('chapter:chapters/序章.md')
  })

  it('exchangeFiles/deleteFile/renameFile 经 chapterFlush 桥前置冲刷（按路径过滤）；未注册不崩溃', async () => {
    const calls: Array<string[] | undefined> = []
    useAiStore.setState({
      chapterFlush: async (paths) => {
        calls.push(paths)
      }
    })
    await useNovelStore.getState().exchangeFiles('chapters/第1章.md', 'chapters/第2章.md')
    expect(calls).toEqual([['chapters/第1章.md', 'chapters/第2章.md']])

    await useNovelStore.getState().deleteFile('chapters/第1章.md')
    expect(calls[1]).toEqual(['chapters/第1章.md'])

    await useNovelStore.getState().renameFile('chapters/第1章.md', '序章')
    expect(calls[2]).toEqual(['chapters/第1章.md'])

    // 无挂载编辑器（未注册冲刷桥）时文件操作正常完成
    useAiStore.setState({ chapterFlush: null })
    await expect(useNovelStore.getState().exchangeFiles('chapters/第1章.md', 'chapters/第2章.md')).resolves.toBeUndefined()
  })

  it('deleteFile 关联 Tab 走 closeTabs 回退：激活蓝图被删时激活落到剩余最后一个', async () => {
    stubTree = treeOf(['chapters/第1章.md'])
    useNovelStore.setState({ tabs: [bpTab(1), chTab(1)], activeTabId: bpTab(1).id })
    await useNovelStore.getState().deleteFile('blueprints/蓝图1.blueprint.json')
    const s = useNovelStore.getState()
    expect(s.tabs.map((t) => t.id)).toEqual([chTab(1).id])
    expect(s.activeTabId).toBe(chTab(1).id)
  })

  it('refreshTree 树对账：清理指向已不存在文件的 Tab（外部删除场景），激活回退', async () => {
    stubTree = treeOf(['chapters/第2章.md'])
    useNovelStore.setState({ tabs: [chTab(1), chTab(2)], activeTabId: chTab(1).id })
    await useNovelStore.getState().refreshTree()
    const s = useNovelStore.getState()
    expect(s.tabs.map((t) => t.id)).toEqual([chTab(2).id])
    expect(s.activeTabId).toBe(chTab(2).id)
  })
})
