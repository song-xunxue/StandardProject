/**
 * 资源库模板纯函数单测（M2）
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M2 初版：nodeToTemplate / templateToNodeDraft / tagSetTemplate / isResourceTemplate
 */

import { describe, expect, it } from 'vitest'
import { graphToStructureTemplate, isResourceTemplate, normalizeStructureTemplate, nodeToTemplate, tagSetTemplate, templateToNodeDraft } from './resource'
import type { BlueprintNode, GraphData } from './blueprint'
import type { StructureTemplatePayload } from './types'

const node = (over: Partial<BlueprintNode> = {}): BlueprintNode => ({
  id: 'n-x',
  type: 'text',
  title: '人物：林晚照',
  graphId: 'g-root',
  refGraphId: 'g-sub',
  refTarget: 'chapters/第01章.md',
  tags: ['设定', '伏笔'],
  aliases: ['晚照'],
  prompt: '冷面刀客，话少',
  summary: '女主角，背负灭门之仇',
  content: '正文……',
  position: { x: 100, y: 200 },
  size: { width: 160, height: 60 },
  ...over
})

describe('nodeToTemplate / templateToNodeDraft', () => {
  it('模板剥离 id/graphId/position/refGraphId/refTarget/content，保留业务字段', () => {
    const tpl = nodeToTemplate(node())
    expect(tpl).toEqual({
      type: 'text',
      title: '人物：林晚照',
      tags: ['设定', '伏笔'],
      aliases: ['晚照'],
      prompt: '冷面刀客，话少',
      summary: '女主角，背负灭门之仇',
      size: { width: 160, height: 60 }
    })
  })

  it('草稿字段可安全变更（深拷贝，不回写原节点）', () => {
    const src = node()
    const tpl = nodeToTemplate(src)
    tpl.tags.push('新标签')
    tpl.size.width = 999
    expect(src.tags).toEqual(['设定', '伏笔'])
    expect(src.size.width).toBe(160)
  })

  it('templateToNodeDraft 产物补 id/graphId/position 后即为合法节点字段', () => {
    const draft = templateToNodeDraft(nodeToTemplate(node({ type: 'blueprint' })))
    const full: BlueprintNode = { ...draft, id: 'n-new', graphId: 'g-other', position: { x: 0, y: 0 } }
    expect(full.type).toBe('blueprint')
    expect(full.refGraphId).toBeUndefined()
    expect(full.refTarget).toBeUndefined()
  })
})

describe('tagSetTemplate', () => {
  it('构造标签组模板（快照拷贝）', () => {
    const tags = ['设定', '伏笔']
    const tpl = tagSetTemplate('核心设定组', tags)
    tags.push('污染')
    expect(tpl).toEqual({ kind: 'tagSet', name: '核心设定组', payload: { tags: ['设定', '伏笔'] } })
  })
})

describe('isResourceTemplate', () => {
  it('合法 node / tagSet 模板通过校验', () => {
    expect(isResourceTemplate({ kind: 'node', name: 'x', payload: nodeToTemplate(node()) })).toBe(true)
    expect(isResourceTemplate({ kind: 'tagSet', name: 'x', payload: { tags: [] } })).toBe(true)
  })

  it('缺名称 / 未知 kind / 缺字段 / 非法标签项 均拒绝', () => {
    expect(isResourceTemplate(null)).toBe(false)
    expect(isResourceTemplate({ kind: 'node', name: '', payload: nodeToTemplate(node()) })).toBe(false)
    expect(isResourceTemplate({ kind: 'other', name: 'x', payload: {} })).toBe(false)
    expect(isResourceTemplate({ kind: 'node', name: 'x', payload: { ...nodeToTemplate(node()), prompt: 1 } })).toBe(false)
    expect(isResourceTemplate({ kind: 'tagSet', name: 'x', payload: { tags: ['ok', 3] } })).toBe(false)
  })
})

describe('结构模板（v2-F5）', () => {
  const structure = (over: Partial<StructureTemplatePayload> = {}): StructureTemplatePayload => ({
    nodes: [
      { type: 'text', title: '开端', tags: ['大纲'], prompt: '', summary: '' },
      { type: 'text', title: '转折', tags: ['伏笔'], prompt: '', summary: '' }
    ],
    edges: [{ from: 0, to: 1, type: 'arrow' }],
    ...over
  })

  it('合法 structure 模板通过校验；空节点/越界索引/非法类型拒绝', () => {
    expect(isResourceTemplate({ kind: 'structure', name: '三幕', payload: structure() })).toBe(true)
    expect(isResourceTemplate({ kind: 'structure', name: 'x', payload: structure({ nodes: [] }) })).toBe(false)
    expect(isResourceTemplate({ kind: 'structure', name: 'x', payload: structure({ edges: [{ from: 0, to: 9, type: 'arrow' }] }) })).toBe(false)
    expect(
      isResourceTemplate({
        kind: 'structure',
        name: 'x',
        payload: structure({ nodes: [{ type: 'other' as never, title: 'a', tags: [] }] })
      })
    ).toBe(false)
  })

  it('normalizeStructureTemplate：损坏字段静默修正（prompt/summary 补空、越界边剔除）', () => {
    const normalized = normalizeStructureTemplate({
      nodes: [
        { type: 'text', title: 'a', tags: ['设定'] },
        { type: 'text', title: 'b', tags: [] as string[] }
      ],
      edges: [
        { from: 0, to: 1, type: 'arrow' },
        { from: 0, to: 5, type: 'line' }
      ]
    })
    expect(normalized.nodes[0]).toMatchObject({ prompt: '', summary: '' })
    expect(normalized.edges).toHaveLength(1)
  })

  it('graphToStructureTemplate：整图压骨架（索引映射正确、跨图边跳过、同向重复边去重）', () => {
    const data: GraphData = {
      nodes: {
        a: { ...node({ id: 'a' }), graphId: 'g-1' },
        b: { ...node({ id: 'b', title: '外部节点' }), graphId: 'g-other' },
        c: { ...node({ id: 'c' }), graphId: 'g-1' }
      },
      edges: {
        // 同图边（应保留为索引边）
        e1: { id: 'e1', from: 'a', to: 'c', type: 'arrow' },
        // 跨图边（c→b，b 不在 g-1，应跳过）
        e2: { id: 'e2', from: 'c', to: 'b', type: 'dashed' },
        // 同方向重复（应去重保第一条）
        e3: { id: 'e3', from: 'a', to: 'c', type: 'line' }
      },
      graphs: {
        'g-1': { id: 'g-1', title: 'T', nodeIds: ['a', 'c'], ownerNodeId: null },
        'g-other': { id: 'g-other', title: 'O', nodeIds: ['b'], ownerNodeId: null }
      }
    }
    const tpl = graphToStructureTemplate(data, 'g-1')!
    expect(tpl.nodes.map((n) => n.title)).toEqual(['人物：林晚照', '人物：林晚照'])
    expect(tpl.edges).toEqual([{ from: 0, to: 1, type: 'arrow' }])
    // 空图返回 null
    expect(graphToStructureTemplate({ nodes: {}, edges: {}, graphs: { 'g-1': { id: 'g-1', title: 'T', nodeIds: [], ownerNodeId: null } } }, 'g-1')).toBeNull()
  })
})
