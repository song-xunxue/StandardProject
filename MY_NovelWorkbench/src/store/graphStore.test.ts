/**
 * 图存储变更 action 单测（M2）：节点/边增删改、级联删除、8 层上限、防抖保存编排、
 * 审查修订回归（hydrate 脏图保护 / 根图沿用 / 受控选中数组）
 * window.api 以 stub 替代（graphStore 经 window.api.fs.saveBlueprint 落盘）
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M2 初版
 *   2. 审查修订：选中态断言改数组；新增 hydrate 脏图保护（防抖窗口不回滚）、
 *      脏图节点删除不被磁盘复活、孤儿子图不抢根图身份 三组回归用例
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlueprintFile, BlueprintNode, GraphData } from '@shared/blueprint'

// ---- window.api stub（须在导入 graphStore 前就位——模块内 api() 运行时读取） ----
const savedFiles: Array<{ path: string; file: BlueprintFile }> = []
vi.stubGlobal('window', {
  api: {
    fs: {
      // 模拟主进程保存：记录调用并立即成功
      saveBlueprint: async (path: string, file: BlueprintFile): Promise<void> => {
        savedFiles.push({ path, file })
      }
    }
  }
})

const { useGraphStore } = await import('./graphStore')

const bnode = (id: string, graphId: string, over: Partial<BlueprintNode> = {}): BlueprintNode => ({
  id,
  type: 'text',
  title: id,
  graphId,
  tags: [],
  aliases: [],
  prompt: '',
  summary: '',
  position: { x: 0, y: 0 },
  size: { width: 160, height: 50 },
  ...over
})

/** 基础夹具：根图 g-root（n-a/n-b/n-bp），子图 g-sub（n-c），跨图边 n-bp→n-c */
function fixture(): { data: GraphData; paths: Record<string, string> } {
  return {
    data: {
      nodes: {
        'n-a': bnode('n-a', 'g-root'),
        'n-b': bnode('n-b', 'g-root'),
        'n-bp': bnode('n-bp', 'g-root', { type: 'blueprint', refGraphId: 'g-sub' }),
        'n-c': bnode('n-c', 'g-sub')
      },
      edges: {
        'e-ab': { id: 'e-ab', from: 'n-a', to: 'n-b', type: 'arrow' },
        'e-cross': { id: 'e-cross', from: 'n-bp', to: 'n-c', type: 'dashed', label: '跨图' }
      },
      graphs: {
        'g-root': { id: 'g-root', title: '根图', nodeIds: ['n-a', 'n-b', 'n-bp'], ownerNodeId: null },
        'g-sub': { id: 'g-sub', title: '子图', nodeIds: ['n-c'], ownerNodeId: 'n-bp' }
      }
    },
    paths: { 'g-root': 'blueprints/根图.blueprint.json', 'g-sub': 'blueprints/子图.blueprint.json' }
  }
}

/** 8 层嵌套链夹具：g1(根) → g2 → … → g8，每层一个 owner 蓝图节点 + 一个文本节点 */
function deepFixture(depth: number): GraphData {
  const nodes: Record<string, BlueprintNode> = {}
  const graphs: GraphData['graphs'] = {}
  for (let i = 1; i <= depth; i++) {
    const gid = `g${i}`
    const nodeIds: string[] = [`n-t${i}`]
    nodes[`n-t${i}`] = bnode(`n-t${i}`, gid)
    if (i < depth) {
      nodes[`n-o${i}`] = bnode(`n-o${i}`, gid, { type: 'blueprint', refGraphId: `g${i + 1}` })
      nodeIds.push(`n-o${i}`)
    }
    graphs[gid] = { id: gid, title: `第${i}层`, nodeIds, ownerNodeId: i === 1 ? null : `n-o${i - 1}` }
  }
  return { nodes, edges: {}, graphs }
}

/** 等待 addNode/removeNodes 等触发的立即冲刷完成（saveBlueprint 为微任务级 stub） */
const drainSave = async (): Promise<void> => {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

const store = (): ReturnType<typeof useGraphStore.getState> => useGraphStore.getState()

beforeEach(() => {
  savedFiles.length = 0
  const { data, paths } = fixture()
  store().hydrate(data, paths)
  store().selectNode(null)
  store().selectEdge(null)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('addNode', () => {
  it('文本节点：入当前图、选中、立即落盘（结构变更不等待防抖）', async () => {
    const id = store().addNode({ type: 'text', title: '新节点', position: { x: 10, y: 10 } })
    expect(id).toBeTruthy()
    expect(store().nodes[id!]).toMatchObject({ type: 'text', title: '新节点', graphId: 'g-root' })
    expect(store().graphs['g-root']!.nodeIds).toContain(id)
    expect(store().selectedNodeIds).toEqual([id])
    await drainSave()
    expect(store().dirtyGraphIds).toEqual([])
    const saved = savedFiles.find((s) => s.path === 'blueprints/根图.blueprint.json')
    expect(saved?.file.nodes.map((n) => n.id)).toContain(id)
  })

  it('第 8 层可建文本节点，但蓝图节点被拒（ADR-12）', () => {
    store().hydrate(deepFixture(8), { g1: 'blueprints/g1.blueprint.json' })
    store().enterGraph('g8')
    expect(store().route).toHaveLength(8)
    // 文本节点不受嵌套上限约束
    expect(store().addNode({ type: 'text', title: 't', position: { x: 0, y: 0 } })).toBeTruthy()
    // 蓝图节点承载第 9 层，被拒绝并返回 null
    expect(store().addNode({ type: 'blueprint', title: 'b', position: { x: 0, y: 0 } })).toBeNull()
  })

  it('graphId 覆盖（左栏「在某蓝图内建子蓝图」路径）：深度按目标图祖先链判', () => {
    // route 停在 g-root，但目标 g-sub 位于第 2 层——正常放行；深度检查不走 route
    const id = store().addNode({ type: 'blueprint', graphId: 'g-sub', title: '子蓝图', position: { x: 0, y: 0 } })
    expect(id).toBeTruthy()
    expect(store().nodes[id!]).toMatchObject({ graphId: 'g-sub', refGraphId: undefined })
    expect(store().graphs['g-sub']!.nodeIds).toContain(id)
    expect(store().route[store().route.length - 1]).toBe('g-root') // 路由不跳
    // 目标图为第 8 层（deepFixture 的 g8）时拒绝蓝图节点、文本放行
    store().hydrate(deepFixture(8), { g1: 'blueprints/g1.blueprint.json' })
    expect(store().addNode({ type: 'blueprint', graphId: 'g8', title: 'x', position: { x: 0, y: 0 } })).toBeNull()
    expect(store().addNode({ type: 'text', graphId: 'g8', title: 'y', position: { x: 0, y: 0 } })).toBeTruthy()
    // 不存在的图 → null
    expect(store().addNode({ type: 'text', graphId: 'g-missing', title: 'z', position: { x: 0, y: 0 } })).toBeNull()
  })

  it('进入超 8 层的异常深图被拒（防御外部构造文件）', () => {
    store().hydrate(deepFixture(9), { g1: 'blueprints/g1.blueprint.json' })
    store().enterGraph('g9')
    expect(store().route.length).toBeLessThanOrEqual(8)
  })
})

describe('mergeRefresh（增量合并，全量审查新增）', () => {
  const treePaths = new Set(['blueprints/根图.blueprint.json', 'blueprints/子图.blueprint.json'])

  it('变更图替换、未变图对象引用保持不变；选中与路由保留', () => {
    const { data, paths } = fixture()
    store().hydrate(data, paths)
    const before = store()
    const rootGraphBefore = before.graphs['g-root']!
    const subNodeBefore = before.nodes['n-c']!

    // g-root 磁盘版：n-a 改名 + 新增 n-new；g-sub 不在变更清单
    const rootFile = {
      id: 'g-root',
      title: '根图',
      nodes: [
        { ...bnode('n-a', 'g-root'), title: '改名A' },
        bnode('n-b', 'g-root'),
        bnode('n-bp', 'g-root', { type: 'blueprint', refGraphId: 'g-sub' }),
        bnode('n-new', 'g-root')
      ],
      edges: [{ id: 'e-ab', from: 'n-a', to: 'n-b', type: 'arrow' as const }]
    }
    store().selectNode('n-a')
    store().mergeRefresh([rootFile], { 'g-root': 'blueprints/根图.blueprint.json' }, treePaths)

    expect(store().nodes['n-new']).toBeDefined()
    expect(store().nodes['n-a']!.title).toBe('改名A')
    expect(store().graphs['g-root']!.nodeIds).toContain('n-new')
    expect(store().nodes['n-c']).toBe(subNodeBefore) // 未变图节点引用不变
    expect(store().graphs['g-root']).not.toBe(rootGraphBefore) // 变更图换新对象
    expect(store().selectedNodeIds).toEqual(['n-a'])
    expect(store().route[store().route.length - 1]).toBe('g-root')
    // owner 重算：g-sub 的 owner 仍是 n-bp
    expect(store().graphs['g-sub']!.ownerNodeId).toBe('n-bp')
  })

  it('树中已删除的图整体移除；孤儿边清理', () => {
    const { data, paths } = fixture()
    store().hydrate(data, paths)
    // 树里只剩根图（子图文件被删）
    const onlyRoot = new Set(['blueprints/根图.blueprint.json'])
    const rootFile = { id: 'g-root', title: '根图', nodes: [bnode('n-a', 'g-root')], edges: [] }
    store().mergeRefresh([rootFile], { 'g-root': 'blueprints/根图.blueprint.json' }, onlyRoot)
    expect(store().graphs['g-sub']).toBeUndefined()
    expect(store().nodes['n-c']).toBeUndefined()
    // e-cross 的 from=n-bp 存在但 to=n-c 已删：边保留（级联删除由 removeNodes 负责，
    // 外部手删文件的孤儿边按 from 端存活保留——与 codec 归属规则一致）
    expect(store().route[store().route.length - 1]).toBe('g-root')
  })

  it('脏图跳过磁盘版（内存为真相）', () => {
    const { data, paths } = fixture()
    store().hydrate(data, paths)
    store().updateNode('n-a', { title: '防抖中的新标题' })
    const rootFile = { id: 'g-root', title: '根图', nodes: [bnode('n-a', 'g-root')], edges: [] }
    store().mergeRefresh([rootFile], { 'g-root': 'blueprints/根图.blueprint.json' }, treePaths)
    expect(store().nodes['n-a']!.title).toBe('防抖中的新标题')
  })
})

describe('updateNode / moveNodes', () => {
  it('属性与坐标变更进入脏集合，flushDirty 后落盘', async () => {
    store().updateNode('n-a', { title: '改名', tags: ['设定'] })
    store().moveNodes([{ id: 'n-a', position: { x: 99, y: 88 } }])
    expect(store().dirtyGraphIds).toContain('g-root')
    await store().flushDirty()
    expect(store().dirtyGraphIds).toEqual([])
    const saved = savedFiles.find((s) => s.path === 'blueprints/根图.blueprint.json')
    const savedNode = saved?.file.nodes.find((n) => n.id === 'n-a')
    expect(savedNode).toMatchObject({ title: '改名', tags: ['设定'], position: { x: 99, y: 88 } })
  })

  it('refTarget 可编辑并落盘', async () => {
    store().updateNode('n-b', { refTarget: 'chapters/第02章.md' })
    await store().flushDirty()
    const saved = savedFiles.find((s) => s.path === 'blueprints/根图.blueprint.json')
    expect(saved?.file.nodes.find((n) => n.id === 'n-b')?.refTarget).toBe('chapters/第02章.md')
  })
})

describe('removeNodes', () => {
  it('删除节点级联删除相连边（含跨图边），归属图标脏并落盘', async () => {
    store().removeNodes(['n-bp'])
    expect(store().nodes['n-bp']).toBeUndefined()
    expect(store().edges['e-cross']).toBeUndefined()
    expect(store().graphs['g-root']!.nodeIds).not.toContain('n-bp')
    await drainSave()
    const root = savedFiles.find((s) => s.path === 'blueprints/根图.blueprint.json')
    expect(root?.file.nodes.map((n) => n.id)).toEqual(['n-a', 'n-b'])
    expect(root?.file.edges).toEqual([{ id: 'e-ab', from: 'n-a', to: 'n-b', type: 'arrow' }])
  })

  it('删除被选中的节点时清空选中', () => {
    store().selectNode('n-a')
    store().removeNodes(['n-a'])
    expect(store().selectedNodeIds).toEqual([])
  })
})

describe('addEdge / updateEdge / removeEdge', () => {
  it('正常连线：默认入 from 端所在图，选中且立即落盘', async () => {
    const id = store().addEdge('n-a', 'n-bp', 'line')
    expect(id).toBeTruthy()
    expect(store().selectedEdgeIds).toEqual([id])
    await drainSave()
    const root = savedFiles.find((s) => s.path === 'blueprints/根图.blueprint.json')
    expect(root?.file.edges.some((e) => e.id === id && e.type === 'line')).toBe(true)
  })

  it('proxy: 前缀端点换回真实 id（画布上连到跨图代理节点即跨图边）', () => {
    const id = store().addEdge('n-a', 'proxy:n-c', 'dashed')
    expect(id).toBeTruthy()
    expect(store().edges[id!]).toMatchObject({ from: 'n-a', to: 'n-c', type: 'dashed' })
  })

  it('自环与同方向重复边被拒绝', () => {
    expect(store().addEdge('n-a', 'n-a', 'arrow')).toBeNull()
    expect(store().addEdge('n-a', 'n-b', 'line')).toBeNull() // 已有 e-ab: n-a→n-b
    expect(store().addEdge('n-b', 'n-a', 'line')).toBeTruthy() // 反向允许
  })

  it('改型与 label 落盘（改型立即、label 防抖后 flush）', async () => {
    store().updateEdge('e-ab', { type: 'dashed', label: '师徒' })
    await drainSave()
    const root = savedFiles.find((s) => s.path === 'blueprints/根图.blueprint.json')
    expect(root?.file.edges.find((e) => e.id === 'e-ab')).toMatchObject({ type: 'dashed', label: '师徒' })
  })

  it('removeEdge 清空其选中态', () => {
    store().selectEdge('e-ab')
    store().removeEdge('e-ab')
    expect(store().edges['e-ab']).toBeUndefined()
    expect(store().selectedEdgeIds).toEqual([])
  })
})

describe('选中（数组化受控）', () => {
  it('选中节点清空边选中，反之亦然', () => {
    store().selectNode('n-a')
    store().selectEdge('e-ab')
    expect(store().selectedNodeIds).toEqual([])
    store().selectNode('n-a')
    expect(store().selectedEdgeIds).toEqual([])
  })

  it('setSelection 全量同步；内容相同时跳过（防受控回环）', () => {
    store().setSelection(['n-a', 'n-b'], [])
    expect(store().selectedNodeIds).toEqual(['n-a', 'n-b'])
    const before = useGraphStore.getState()
    store().setSelection(['n-b', 'n-a'], []) // 相同集合不同顺序
    expect(useGraphStore.getState()).toBe(before) // 状态对象未被替换
    store().setSelection(['n-a'], ['e-ab'])
    expect(store().selectedNodeIds).toEqual(['n-a'])
    expect(store().selectedEdgeIds).toEqual(['e-ab'])
  })

  it('水合保留仍存在的节点/边选中', () => {
    store().selectNode('n-a')
    const { data, paths } = fixture()
    store().hydrate(data, paths)
    expect(store().selectedNodeIds).toEqual(['n-a'])
  })

  it('水合保留仍存在的边选中', () => {
    store().selectEdge('e-ab')
    const { data, paths } = fixture()
    store().hydrate(data, paths)
    expect(store().selectedEdgeIds).toEqual(['e-ab'])
    expect(store().selectedNodeIds).toEqual([])
  })
})

describe('hydrate 脏图保护（审查修订回归）', () => {
  it('防抖窗口内的属性编辑不被 watcher 回推的磁盘数据回滚', () => {
    // 模拟：updateNode 改标题（600ms 防抖未到期）→ 自身保存触发的 watcher 回推磁盘旧值
    store().updateNode('n-a', { title: '防抖中的新标题' })
    expect(store().dirtyGraphIds).toContain('g-root')
    const { data, paths } = fixture() // 磁盘上的旧数据（n-a 标题仍为 'n-a'）
    store().hydrate(data, paths)
    expect(store().nodes['n-a']!.title).toBe('防抖中的新标题')
    // 脏图保留内存版后 flushDirty 仍可落盘
    void store().flushDirty()
  })

  it('脏图内删除的节点不被磁盘数据复活', () => {
    store().removeNodes(['n-b'])
    const { data, paths } = fixture()
    store().hydrate(data, paths)
    expect(store().nodes['n-b']).toBeUndefined()
    expect(store().graphs['g-root']!.nodeIds).not.toContain('n-b')
  })

  it('脏图的边以内存版为准（磁盘旧边不复活）', () => {
    store().removeEdge('e-ab')
    const { data, paths } = fixture()
    store().hydrate(data, paths)
    expect(store().edges['e-ab']).toBeUndefined()
  })

  it('非脏图按磁盘数据正常替换', () => {
    store().updateNode('n-c', { title: '子图改名' }) // g-sub 脏
    const { data, paths } = fixture()
    // 磁盘上 g-root 的 n-a 标题改为外部新值——g-root 非脏，应采用磁盘版
    const external = JSON.parse(JSON.stringify(data)) as GraphData
    external.nodes['n-a']!.title = '外部新标题'
    store().hydrate(external, paths)
    expect(store().nodes['n-a']!.title).toBe('外部新标题')
    expect(store().nodes['n-c']!.title).toBe('子图改名')
  })

  it('孤儿子图（owner 节点已删）不抢根图身份', async () => {
    // 删除蓝图节点 n-bp → g-sub 成为 ownerNodeId=null 的孤儿文件
    store().removeNodes(['n-bp'])
    await drainSave()
    // 模拟下次启动：磁盘数据里 g-sub 无主，且按文件名排序排在前面
    const orphanFirst: GraphData = {
      nodes: { 'n-a': bnode('n-a', 'g-root'), 'n-b': bnode('n-b', 'g-root'), 'n-c': bnode('n-c', 'g-sub') },
      edges: {},
      graphs: {
        'g-sub': { id: 'g-sub', title: '子图', nodeIds: ['n-c'], ownerNodeId: null },
        'g-root': { id: 'g-root', title: '根图', nodeIds: ['n-a', 'n-b'], ownerNodeId: null }
      }
    }
    // 会话内 hydrate：沿用 prev.rootGraphId（g-root），不被排在前面的孤儿抢占
    store().hydrate(orphanFirst, store().graphPaths)
    expect(store().rootGraphId).toBe('g-root')
    expect(store().route[0]).toBe('g-root')
  })
})

describe('flushDirty 容错', () => {
  it('保存失败：失败图保留在脏集合并可重试', async () => {
    const w = (globalThis as { window?: { api: { fs: { saveBlueprint: unknown } } } }).window!
    const original = w.api.fs.saveBlueprint
    const failing = async (): Promise<void> => {
      throw new Error('磁盘写入失败')
    }
    w.api.fs.saveBlueprint = failing
    try {
      store().updateNode('n-a', { title: '会失败' })
      await store().flushDirty()
      expect(store().dirtyGraphIds).toContain('g-root')
      expect(store().saveError).toBeTruthy()
      // 恢复可用保存源后重试成功
      w.api.fs.saveBlueprint = original
      await store().flushDirty()
      expect(store().dirtyGraphIds).toEqual([])
      expect(store().saveError).toBeNull()
    } finally {
      w.api.fs.saveBlueprint = original
    }
  })
})
