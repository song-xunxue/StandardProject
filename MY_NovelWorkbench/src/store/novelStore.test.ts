/**
 * 小说工作区标签库单测（M4-B）：createTag / removeTag 增删与内置标签禁删
 * window.api 以 stub 替代（novelStore 经 window.api.fs.saveMeta 写回 novel.json）
 *
 * 作者: 李文煜
 * 日期: 2026-08-28
 *
 * 2026-08-28
 * 变更说明：
 *   1. M4-B 初版：removeTag 回归（自定义标签删除 / 内置标签禁删 / 不存在标签 no-op）
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NovelMeta } from '@shared/types'

// ---- window.api stub（须在导入 novelStore 前就位——模块内 api() 运行时读取） ----
const savedMetas: NovelMeta[] = []
vi.stubGlobal('window', {
  api: {
    fs: {
      // 模拟主进程 saveMeta：记录调用并原样返回
      saveMeta: async (meta: NovelMeta): Promise<NovelMeta> => {
        savedMetas.push(meta)
        return meta
      }
    }
  }
})

const { useNovelStore } = await import('./novelStore')

const meta = (): NovelMeta => ({
  id: 'novel-1',
  title: '测试小说',
  createdAt: '2026-08-28T00:00:00.000Z',
  tagLibrary: [
    { name: '设定', color: '#4f8cff', builtin: true },
    { name: '伏笔', color: '#b48cff', builtin: true },
    { name: '武侠', color: '#ff8c6b', builtin: false }
  ]
})

beforeEach(() => {
  savedMetas.length = 0
  useNovelStore.setState({ novel: meta() })
})

describe('removeTag（M4-B）', () => {
  it('删除自定义标签：标签库移除并写回 novel.json', async () => {
    await useNovelStore.getState().removeTag('武侠')
    const novel = useNovelStore.getState().novel!
    expect(novel.tagLibrary.map((t) => t.name)).toEqual(['设定', '伏笔'])
    expect(savedMetas).toHaveLength(1)
    expect(savedMetas[0]!.tagLibrary).toHaveLength(2)
  })

  it('内置标签禁删：不落盘且标签库不变', async () => {
    await useNovelStore.getState().removeTag('伏笔')
    const novel = useNovelStore.getState().novel!
    expect(novel.tagLibrary.map((t) => t.name)).toEqual(['设定', '伏笔', '武侠'])
    expect(savedMetas).toHaveLength(0)
  })

  it('不存在的标签与未打开小说均为 no-op', async () => {
    await useNovelStore.getState().removeTag('不存在')
    expect(savedMetas).toHaveLength(0)
    useNovelStore.setState({ novel: null })
    await useNovelStore.getState().removeTag('武侠')
    expect(savedMetas).toHaveLength(0)
  })
})

describe('createTag（对偶回归）', () => {
  it('新建自定义标签写回；重名返回已有定义不再追加', async () => {
    const created = await useNovelStore.getState().createTag('言情', '#66d1c1')
    expect(created).toMatchObject({ name: '言情', builtin: false })
    const novel = useNovelStore.getState().novel!
    expect(novel.tagLibrary).toHaveLength(4)

    const again = await useNovelStore.getState().createTag('武侠', '#ffffff')
    expect(again).toMatchObject({ name: '武侠', color: '#ff8c6b' })
    expect(useNovelStore.getState().novel!.tagLibrary).toHaveLength(4)
  })
})
