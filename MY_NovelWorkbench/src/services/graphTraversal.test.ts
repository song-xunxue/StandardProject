/**
 * 图遍历纯函数直接单测（pathToGraph / ancestorNodesOf）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M0 审查修订新增：正常链 / 成环脏数据 / 空数据的直接覆盖
 */

import { describe, expect, it } from 'vitest'
import { ancestorNodesOf, pathToGraph } from './graphTraversal'
import type { GraphData } from '@/types/blueprint'

/** 夹具：g-root → g-a → g-a2 三层嵌套 */
function fixture(): GraphData {
  return {
    nodes: {
      'bp-a': {
        id: 'bp-a',
        type: 'blueprint',
        title: '蓝图A',
        graphId: 'g-root',
        refGraphId: 'g-a',
        tags: [],
        aliases: [],
        prompt: '',
        summary: 'A',
        position: { x: 0, y: 0 },
        size: { width: 150, height: 50 }
      },
      'bp-a2': {
        id: 'bp-a2',
        type: 'blueprint',
        title: '蓝图A2',
        graphId: 'g-a',
        refGraphId: 'g-a2',
        tags: [],
        aliases: [],
        prompt: '',
        summary: 'A2',
        position: { x: 0, y: 0 },
        size: { width: 150, height: 50 }
      },
      leaf: {
        id: 'leaf',
        type: 'text',
        title: '叶子',
        graphId: 'g-a2',
        tags: [],
        aliases: [],
        prompt: '',
        summary: '叶子',
        position: { x: 0, y: 0 },
        size: { width: 150, height: 50 }
      }
    },
    edges: {},
    graphs: {
      'g-root': { id: 'g-root', title: '根', nodeIds: ['bp-a'], ownerNodeId: null },
      'g-a': { id: 'g-a', title: 'A', nodeIds: ['bp-a2'], ownerNodeId: 'bp-a' },
      'g-a2': { id: 'g-a2', title: 'A2', nodeIds: ['leaf'], ownerNodeId: 'bp-a2' }
    }
  }
}

describe('pathToGraph', () => {
  it('根图 → 深层图的完整祖先路径（自根向内）', () => {
    expect(pathToGraph(fixture(), 'g-a2')).toEqual(['g-root', 'g-a', 'g-a2'])
    expect(pathToGraph(fixture(), 'g-root')).toEqual(['g-root'])
  })

  it('图不存在返回空数组', () => {
    expect(pathToGraph(fixture(), 'g-x')).toEqual([])
  })

  it('owner 链成环（脏数据）不死循环，返回截断路径', () => {
    const data = fixture()
    // g-a2 的拥有节点挂回 g-root，同时 g-root…构造 g-a ↔ g-a2 互指
    data.graphs['g-a']!.ownerNodeId = 'bp-a2'
    const result = pathToGraph(data, 'g-a2')
    // 不挂起且为有限数组即通过；路径自 g-a2 起截断
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeLessThanOrEqual(3)
  })
})

describe('ancestorNodesOf', () => {
  it('叶子节点的上级蓝图链自内向外', () => {
    const chain = ancestorNodesOf(fixture(), 'leaf').map((n) => n.id)
    expect(chain).toEqual(['bp-a2', 'bp-a'])
  })

  it('根图节点无上级，返回空', () => {
    expect(ancestorNodesOf(fixture(), 'bp-a')).toEqual([])
  })

  it('节点不存在返回空；成环脏数据不死循环', () => {
    expect(ancestorNodesOf(fixture(), 'ghost')).toEqual([])
    const data = fixture()
    data.graphs['g-a']!.ownerNodeId = 'bp-a2'
    const chain = ancestorNodesOf(data, 'leaf')
    expect(chain.length).toBeLessThanOrEqual(3)
  })
})

// ---------- M3 补齐：幽灵 owner / 图缺失分支 ----------

describe('脏数据防御（M3 补齐）', () => {
  it('幽灵 ownerNodeId（owner 节点不存在）：pathToGraph 停在该图，ancestorNodesOf 停止回溯', () => {
    const data = fixture()
    data.graphs['g-a']!.ownerNodeId = 'ghost-owner' // 指向不存在的节点
    expect(pathToGraph(data, 'g-a')).toEqual(['g-a']) // 不抛错、不回到根（幽灵 owner 处链断）
    // leaf ∈ g-a2（owner bp-a2 有效）→ g-a（owner 幽灵）→ 断：链只到 bp-a2
    expect(ancestorNodesOf(data, 'leaf').map((n) => n.id)).toEqual(['bp-a2'])
  })

  it('节点的 graphId 无对应图：ancestorNodesOf 按 null 处理（停止回溯）', () => {
    const data = fixture()
    data.nodes['orphan'] = { ...data.nodes['leaf']!, id: 'orphan', graphId: 'g-missing' }
    expect(ancestorNodesOf(data, 'orphan')).toEqual([])
    // pathToGraph 对不存在的图返回空（M0 既定语义）
    expect(pathToGraph(data, 'g-missing')).toEqual([])
  })
})
