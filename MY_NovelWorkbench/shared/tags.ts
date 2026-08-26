/**
 * 标签工具（纯函数）：标签库解析 / 节点主色 / 自定义标签色板轮转
 * 标签库存储于 novel.json 的 NovelMeta.tagLibrary（内置四标签见 novelTemplate.ts）
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M2 初版：tagColorOf / nodeAccentColor / nextPaletteColor
 */

import type { BlueprintNode } from './blueprint'
import type { NovelMeta } from './types'

/** 标签定义（NovelMeta.tagLibrary 数组元素） */
export type TagDef = NovelMeta['tagLibrary'][number]

/**
 * 自定义标签轮转色板（与内置四标签色错开：#6c9ef8/#c8a2f0/#7ec98f/#e0a868）
 * 新建自定义标签时按已有自定义标签数量取模分配，保证早期标签颜色稳定
 */
export const TAG_PALETTE = ['#e07a7a', '#7ec9c9', '#b5a86f', '#9a8fe0', '#e0c268', '#6fb8c9', '#d98fc9', '#8fb573']

/** 查标签颜色：库中有则返回其色，未入库标签返回 undefined（按无色处理） */
export function tagColorOf(library: TagDef[], name: string): string | undefined {
  return library.find((t) => t.name === name)?.color
}

/**
 * 节点主色（决定节点边框与强调条）：取第一个已入库标签的颜色；
 * 无标签（或标签全部不在库中）返回 undefined，由调用方回退到类型默认色
 */
export function nodeAccentColor(library: TagDef[], node: Pick<BlueprintNode, 'tags'>): string | undefined {
  for (const name of node.tags) {
    const color = tagColorOf(library, name)
    if (color) return color
  }
  return undefined
}

/** 新建自定义标签的分配色：按现有自定义标签数量轮转色板 */
export function nextPaletteColor(customTagCount: number): string {
  return TAG_PALETTE[customTagCount % TAG_PALETTE.length]!
}
