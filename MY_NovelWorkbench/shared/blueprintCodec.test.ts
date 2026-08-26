/**
 * 蓝图文件编解码单测
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：graphId 剥离/回填、水合 owner 推导、导出边归属、孤儿边归属
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
    edges: [{ id: 'e-orphan', from: 'n-power', to: 'ghost', type: 'arrow' }]
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
})
