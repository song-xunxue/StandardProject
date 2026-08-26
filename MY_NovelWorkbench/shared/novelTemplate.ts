/**
 * 小说目录模板（纯函数）：新建小说时生成的标准文件清单
 * 结构见 PROJECT_PLAN.md 3.2：novel.json / .gitignore / blueprints / chapters
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：根图（内容）+ 世界观/大纲两张子图 + 内置标签库
 */

import type { NovelMeta } from './types'

/** 内置标签库（PRD FR-07：设定/伏笔/大纲/世界观） */
export function builtinTagLibrary(): NovelMeta['tagLibrary'] {
  return [
    { name: '设定', color: '#6c9ef8', builtin: true },
    { name: '伏笔', color: '#c8a2f0', builtin: true },
    { name: '大纲', color: '#7ec98f', builtin: true },
    { name: '世界观', color: '#e0a868', builtin: true }
  ]
}

/**
 * 新建小说的标准文件清单（相对路径 → 文件内容）
 * 根图 g-root 含两个蓝图节点（n-world/n-outline），分别指向子图 g-world/g-outline
 */
export function novelFileMap(novelId: string, title: string): Record<string, string> {
  const meta: NovelMeta = {
    id: novelId,
    title,
    createdAt: new Date(0).toISOString(), // 占位：主进程写入时替换为真实时间
    tagLibrary: builtinTagLibrary()
  }
  const rootBlueprint = {
    id: 'g-root',
    title: '内容',
    nodes: [
      {
        id: 'n-world',
        type: 'blueprint',
        title: '世界观蓝图',
        refGraphId: 'g-world',
        tags: ['世界观'],
        aliases: [],
        prompt: '维护本书世界观设定的总纲',
        summary: '世界观设定的组织画布',
        position: { x: 0, y: 120 },
        size: { width: 150, height: 50 }
      },
      {
        id: 'n-outline',
        type: 'blueprint',
        title: '大纲蓝图',
        refGraphId: 'g-outline',
        tags: ['大纲'],
        aliases: [],
        prompt: '分卷大纲的组织画布',
        summary: '以卷为单位的剧情推进结构',
        position: { x: 0, y: 300 },
        size: { width: 150, height: 50 }
      }
    ],
    edges: [{ id: 'e-root', from: 'n-world', to: 'n-outline', type: 'line', label: '并列' }]
  }
  const emptyGraph = (id: string, graphTitle: string): object => ({
    id,
    title: graphTitle,
    nodes: [],
    edges: []
  })
  return {
    'novel.json': JSON.stringify(meta, null, 2),
    '.gitignore': '# 本文件由 MY_NovelWorkbench 自动生成\n.index/\n',
    'blueprints/内容.blueprint.json': JSON.stringify(rootBlueprint, null, 2),
    'blueprints/世界观.blueprint.json': JSON.stringify(emptyGraph('g-world', '世界观'), null, 2),
    'blueprints/大纲.blueprint.json': JSON.stringify(emptyGraph('g-outline', '大纲'), null, 2)
  }
}
