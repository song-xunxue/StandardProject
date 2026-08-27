/**
 * 章节树工具单测（全量审查补测）：摊平含卷的章节树 + 卷名推导
 *
 * 作者: 李文煜
 * 日期: 2026-08-27
 *
 * 2026-08-27
 * 变更说明：
 *   1. 全量审查修订初版
 */

import { describe, expect, it } from 'vitest'
import type { TreeNode } from '@shared/types'
import { flattenChapterFiles, volumeOfChapter } from './chapterTree'

const chapter = (name: string, path: string): TreeNode => ({ name, path, kind: 'chapter' })
const volume = (name: string, children: TreeNode[]): TreeNode => ({ name, path: `chapters/${name}`, kind: 'dir', children })

function treeOf(children: TreeNode[]): TreeNode[] {
  return [
    { name: '小说', path: '', kind: 'meta', children: [{ name: 'blueprints', path: 'blueprints', kind: 'dir', children: [] }, { name: 'chapters', path: 'chapters', kind: 'dir', children }] }
  ]
}

describe('flattenChapterFiles', () => {
  it('摊平直下 + 卷内章节，按「第N章」数字序排列，标注卷名', () => {
    const tree = treeOf([
      volume('第一卷', [chapter('第二章.md', 'chapters/第一卷/第二章.md'), chapter('第一章.md', 'chapters/第一卷/第一章.md')]),
      chapter('第三章.md', 'chapters/第三章.md'),
      volume('第二卷', [chapter('第十一章.md', 'chapters/第二卷/第十一章.md')])
    ])
    const all = flattenChapterFiles(tree)
    expect(all.map((c) => c.title)).toEqual(['第一章', '第二章', '第三章', '第十一章'])
    expect(all[0]).toMatchObject({ path: 'chapters/第一卷/第一章.md', volume: '第一卷' })
    expect(all[2].path).toBe('chapters/第三章.md')
    expect(all[2].volume).toBeUndefined()
    expect(all[3]).toMatchObject({ volume: '第二卷' })
  })

  it('空树 / 无章节 / 忽略 blueprints 与空卷', () => {
    expect(flattenChapterFiles([])).toEqual([])
    expect(flattenChapterFiles(treeOf([]))).toEqual([])
    expect(flattenChapterFiles(treeOf([volume('空卷', [])]))).toEqual([])
  })
})

describe('volumeOfChapter', () => {
  it('直下章节 → undefined；卷内 → 卷名', () => {
    expect(volumeOfChapter('chapters/第一章.md')).toBeUndefined()
    expect(volumeOfChapter('chapters/第一卷/第一章.md')).toBe('第一卷')
  })
})
