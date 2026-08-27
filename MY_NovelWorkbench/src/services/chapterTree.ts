/**
 * 章节树工具（纯函数）：摊平含卷的章节树 + 卷名推导
 * 卷结构：chapters/卷名/章节.md（一层卷目录）；直下章节 chapters/章节.md
 * 排序：按「第N章」数字序（zh-CN 拼音序会乱序——全量审查修订）
 *
 * 作者: 李文煜
 * 日期: 2026-08-27
 *
 * 2026-08-27
 * 变更说明：
 *   1. 全量审查修订初版：统一 wikilink 三函数 / Inspector 指向候选 / 前情提要的章节视图
 */

import type { TreeNode } from '@shared/types'
import { chapterNameCompare } from '@shared/naming'

export interface ChapterFile {
  /** 相对小说目录路径（chapters/[卷/]章.md） */
  path: string
  /** 显示名（去 .md） */
  title: string
  /** 所在卷名（直下章节为 undefined） */
  volume?: string
}

/** 摊平章节树（直下 + 各卷内），按「第N章」数字序排列；忽略 blueprints 与空目录 */
export function flattenChapterFiles(tree: TreeNode[]): ChapterFile[] {
  const chDir = tree[0]?.children?.find((c) => c.kind === 'dir' && c.path === 'chapters')
  const out: ChapterFile[] = []
  for (const child of chDir?.children ?? []) {
    if (child.kind === 'chapter') {
      out.push({ path: child.path, title: child.name.replace(/\.md$/, '') })
    } else if (child.kind === 'dir') {
      for (const f of child.children ?? []) {
        if (f.kind === 'chapter') {
          out.push({ path: f.path, title: f.name.replace(/\.md$/, ''), volume: child.name })
        }
      }
    }
  }
  out.sort((a, b) => chapterNameCompare(a.title, b.title))
  return out
}

/** 章节所在卷（chapters/卷/章.md → 卷名；直下章节 → undefined） */
export function volumeOfChapter(path: string): string | undefined {
  const rest = path.replace(/^chapters\//, '')
  const slash = rest.lastIndexOf('/')
  return slash > 0 ? rest.slice(0, slash) : undefined
}
