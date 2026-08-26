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
import { isResourceTemplate, nodeToTemplate, tagSetTemplate, templateToNodeDraft } from './resource'
import type { BlueprintNode } from './blueprint'

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
