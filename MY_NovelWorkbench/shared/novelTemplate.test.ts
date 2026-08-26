/**
 * 小说目录模板单测
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：文件清单完整性 / JSON 可解析 / 引用一致性
 */

import { describe, expect, it } from 'vitest'
import { builtinTagLibrary, novelFileMap } from './novelTemplate'
import type { NovelMeta, BlueprintFile } from './types'

describe('novelFileMap', () => {
  it('包含标准目录结构：novel.json / .gitignore / 三张蓝图', () => {
    const files = novelFileMap('novel-1', '测试小说')
    expect(Object.keys(files).sort()).toEqual(
      ['.gitignore', 'blueprints/内容.blueprint.json', 'blueprints/世界观.blueprint.json', 'blueprints/大纲.blueprint.json', 'novel.json'].sort()
    )
  })

  it('novel.json 可解析且含内置标签库', () => {
    const files = novelFileMap('novel-1', '测试小说')
    const meta = JSON.parse(files['novel.json']!) as NovelMeta
    expect(meta.id).toBe('novel-1')
    expect(meta.title).toBe('测试小说')
    expect(meta.tagLibrary.map((t) => t.name)).toEqual(['设定', '伏笔', '大纲', '世界观'])
    expect(builtinTagLibrary().every((t) => t.builtin)).toBe(true)
  })

  it('.gitignore 忽略 .index/（验收标准：自动生成）', () => {
    expect(novelFileMap('n', 't')['.gitignore']).toContain('.index/')
  })

  it('根图两个蓝图节点的 refGraphId 与子图文件 id 一一对应', () => {
    const files = novelFileMap('n', 't')
    const root = JSON.parse(files['blueprints/内容.blueprint.json']!) as BlueprintFile
    const world = JSON.parse(files['blueprints/世界观.blueprint.json']!) as BlueprintFile
    const outline = JSON.parse(files['blueprints/大纲.blueprint.json']!) as BlueprintFile
    const refs = root.nodes.map((n) => n.refGraphId).sort()
    expect(refs).toEqual([world.id, outline.id].sort())
    // 子图初始为空
    expect(world.nodes).toHaveLength(0)
    expect(outline.nodes).toHaveLength(0)
  })
})
