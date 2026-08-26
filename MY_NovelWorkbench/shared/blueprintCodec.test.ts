/**
 * 蓝图文件编解码单测
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：graphId 剥离/回填、水合 owner 推导、导出边归属、孤儿边归属
 *   2. M2：ref 节点 refTarget 字段往返一致性
 *   3. M2 审查修订：外部手编文件的缺字段节点归一化、非法节点/边跳过不阻断
 */

import { describe, expect, it } from 'vitest'
import { exportBlueprintFile, hydrateGraphData, parseBlueprintFile } from './blueprintCodec'
import type { BlueprintFile, BlueprintFileNode } from './types'

const fnode = (id: string, over: Partial<BlueprintFileNode> = {}): Omit<BlueprintFileNode, 'graphId'> => ({
  id,
  type: 'text',
  title: id,
  refGraphId: undefined,
  tags: [],
  aliases: [],
  prompt: '',
  summary: `${id}摘要`,
  position: { x: 0, y: 0 },
  size: { width: 150, height: 50 },
  ...over
})

const files = (): BlueprintFile[] => [
  {
    id: 'g-root',
    title: '内容',
    nodes: [fnode('n-world', { type: 'blueprint', refGraphId: 'g-world' }), fnode('n-outline', { type: 'blueprint', refGraphId: 'g-outline' })],
    edges: [{ id: 'e-root', from: 'n-world', to: 'n-outline', type: 'line' }]
  },
  {
    id: 'g-world',
    title: '世界观',
    nodes: [fnode('n-power', { tags: ['设定'] }), fnode('n-vol1', {})],
    // 跨图边：g-world 的 n-power → g-outline 的节点（本用例中目标不存在，作孤儿边处理）
    edges: [{ id: 'e-orphan', from: 'n-power', to: 'ghost', type: 'arrow', label: '参考' }]
  },
  { id: 'g-outline', title: '大纲', nodes: [fnode('n-arc')], edges: [] }
]

describe('parseBlueprintFile', () => {
  it('节点回填 graphId 为文件 id', () => {
    const parsed = parseBlueprintFile(files()[1]!)
    expect(parsed.nodes.every((n) => n.graphId === 'g-world')).toBe(true)
  })
})

describe('hydrateGraphData', () => {
  it('nodeIds 按 graphId 归属；ownerNodeId 由父文件 refGraphId 推导', () => {
    const data = hydrateGraphData(files())
    expect(data.graphs['g-root']!.nodeIds).toEqual(['n-world', 'n-outline'])
    expect(data.graphs['g-world']!.nodeIds).toEqual(['n-power', 'n-vol1'])
    expect(data.graphs['g-world']!.ownerNodeId).toBe('n-world')
    expect(data.graphs['g-outline']!.ownerNodeId).toBe('n-outline')
    expect(data.graphs['g-root']!.ownerNodeId).toBeNull()
  })
})

describe('exportBlueprintFile', () => {
  it('导出剥离 graphId；本图边完整保留', () => {
    const data = hydrateGraphData(files())
    const root = exportBlueprintFile(data, 'g-root')
    expect(root?.nodes.map((n) => n.id)).toEqual(['n-world', 'n-outline'])
    expect(root?.nodes.every((n) => !('graphId' in n))).toBe(true)
    expect(root?.edges.map((e) => e.id)).toEqual(['e-root'])
  })

  it('孤儿边（from 端缺失）按 to 端归属导出', () => {
    const data = hydrateGraphData(files())
    // ghost 节点不存在，e-orphan 的 from=n-power ∈ g-world —— 属 from 端归属，应随 g-world 导出
    const world = exportBlueprintFile(data, 'g-world')
    expect(world?.edges.map((e) => e.id)).toContain('e-orphan')
  })

  it('水合 → 导出 → 再水合 往返一致', () => {
    const data = hydrateGraphData(files())
    const reFiles = ['g-root', 'g-world', 'g-outline'].map((id) => exportBlueprintFile(data, id)!) as BlueprintFile[]
    const round = hydrateGraphData(reFiles)
    expect(round.nodes).toEqual(data.nodes)
    expect(round.graphs['g-world']!.ownerNodeId).toBe('n-world')
  })

  it('M2：边 label 与 ref 节点 refTarget 往返保留', () => {
    const withRef: BlueprintFile[] = [
      {
        id: 'g-root',
        title: '内容',
        nodes: [
          fnode('n-bp', { type: 'blueprint', refGraphId: 'g-sub' }),
          fnode('n-ch', { type: 'ref', refTarget: 'chapters/第01章.md', tags: ['伏笔'] })
        ],
        edges: [
          { id: 'e-1', from: 'n-bp', to: 'n-ch', type: 'dashed', label: '跨章呼应' },
          { id: 'e-2', from: 'n-bp', to: 'n-ch', type: 'arrow' }
        ]
      },
      { id: 'g-sub', title: '子图', nodes: [], edges: [] }
    ]
    const data = hydrateGraphData(withRef)
    expect(data.nodes['n-ch']!.refTarget).toBe('chapters/第01章.md')
    const reFiles = ['g-root', 'g-sub'].map((id) => exportBlueprintFile(data, id)!) as BlueprintFile[]
    expect(reFiles[0]!.nodes.find((n) => n.id === 'n-ch')!.refTarget).toBe('chapters/第01章.md')
    // label 保留；无 label 的边序列化后不带 label 字段
    const labels = reFiles[0]!.edges.map((e) => e.label)
    expect(labels).toEqual(['跨章呼应', undefined])
    const round = hydrateGraphData(reFiles)
    expect(round.nodes['n-ch']!.refTarget).toBe('chapters/第01章.md')
    expect(round.edges['e-1']!.label).toBe('跨章呼应')
  })
})

describe('字段归一化（M2 审查修订：外部手编文件容错）', () => {
  // 故意构造缺字段/非法条目的坏文件（模拟运行时外部数据，绕过静态类型）
  const badFile = {
    id: 'g-bad',
    title: '坏文件',
    nodes: [
      { id: 'n-ok', type: 'text', title: '完整节点' },
      { id: 'n-min', type: 'text' }, // 缺 tags/position/size/prompt/summary
      { type: 'text' }, // 缺 id → 跳过
      { id: 'n-weird', type: 'unknown' }, // 非法 type → 跳过
      { id: 'proxy:fake', type: 'text' } // 占用保留前缀 → 跳过
    ],
    edges: [
      { id: 'e-ok', from: 'n-ok', to: 'n-min', type: 'arrow' },
      { id: 'e-bad', from: 'n-ok', to: 'ghost', type: 'whatever' }, // 非法 type → 跳过
      { id: 'e-labeled', from: 'n-min', to: 'n-ok', type: 'line', label: '' } // 空 label → 归一为无
    ]
  } as unknown as BlueprintFile

  it('缺字段节点补默认值；非法节点/边跳过不阻断', () => {
    const data = hydrateGraphData([badFile as BlueprintFile])
    expect(Object.keys(data.nodes).sort()).toEqual(['n-min', 'n-ok'])
    // 缺省字段归一化——渲染层（node.tags.length 等）不再抛错
    expect(data.nodes['n-min']).toMatchObject({
      id: 'n-min',
      title: 'n-min', // 缺 title 回退 id
      tags: [],
      aliases: [],
      prompt: '',
      summary: '',
      position: { x: 0, y: 0 },
      size: { width: 160, height: 50 }
    })
    expect(Object.keys(data.edges).sort()).toEqual(['e-labeled', 'e-ok'])
    expect(data.edges['e-labeled']!.label).toBeUndefined()
  })
})
