/**
 * 码字统计服务单测（v2-F7）：对账入账/保存入账/删除清账/日增与连续天数/近14天视图
 * electron 的 app.getPath 以 vi.mock 注入临时目录（环境隔离）
 *
 * 作者: 李文煜
 * 日期: 2026-08-31
 *
 * 2026-08-31
 * 变更说明：
 *   1. v2-F7 初版
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let root = ''
vi.mock('electron', () => ({
  app: {
    getPath: (_name: string) => root
  }
}))

import { openNovel } from './novelService'
import { countChars, exchangeChapterStats, getWritingStats, initStats, recordChapterSave, removeChapterStats, renameChapterStats } from './statsService'

let novelDir = ''
function makeNovel(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-stats-'))
  mkdirSync(join(dir, 'blueprints'), { recursive: true })
  mkdirSync(join(dir, 'chapters'), { recursive: true })
  writeFileSync(join(dir, 'novel.json'), JSON.stringify({ id: 'test-id', title: '统计测试', tagLibrary: [] }), 'utf-8')
  return dir
}

function writeChapter(name: string, body: string): void {
  writeFileSync(join(novelDir, 'chapters', name), `---\ntitle: ${name.replace('.md', '')}\ntags: []\naliases: []\n---\n\n${body}\n`, 'utf-8')
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'stats-root-'))
  novelDir = makeNovel()
  openNovel(novelDir) // openNovel 内部触发 initStats 对账
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(novelDir, { recursive: true, force: true })
})

describe('countChars（口径）', () => {
  it('去空白计数：空格/换行/制表不计', () => {
    expect(countChars('你好 世界\n\n再会')).toBe(6)
    expect(countChars('a b\tc')).toBe(3)
    expect(countChars('')).toBe(0)
  })
})

describe('对账与入账（v2-F7）', () => {
  it('openNovel 对账：既有章节全部入账，日增=首次全量', () => {
    writeChapter('第01章.md', '第一章正文十个字')
    writeChapter('第02章.md', '第二章正文十个字')
    openNovel(novelDir) // 重新打开触发再次对账
    const view = getWritingStats()
    expect(view.totalChars).toBe(countChars('第一章正文十个字') + countChars('第二章正文十个字'))
    expect(view.todayGain).toBe(view.totalChars) // 首个记录日
  })

  it('保存入账：字数变化反映到今日增量与总量', () => {
    writeChapter('第01章.md', '十个字的正文')
    openNovel(novelDir)
    const before = getWritingStats()
    recordChapterSave('chapters/第01章.md', '十个字的正文再加五个字')
    const after = getWritingStats()
    expect(after.totalChars - before.totalChars).toBe(5)
    expect(after.todayGain).toBe(after.totalChars)
  })

  it('删除清账：章节字数移出总量', () => {
    writeChapter('第01章.md', '第一章十个字')
    writeChapter('第02章.md', '第二章十个字')
    openNovel(novelDir)
    const withTwo = getWritingStats()
    removeChapterStats('chapters/第02章.md')
    const withOne = getWritingStats()
    expect(withOne.totalChars).toBe(withTwo.totalChars - countChars('第二章十个字'))
  })

  it('连续天数：当日有增量为 1；近 14 天视图含今日与正确总量', () => {
    writeChapter('第01章.md', '今日写的字')
    openNovel(novelDir)
    const view = getWritingStats()
    expect(view.streakDays).toBeGreaterThanOrEqual(1)
    expect(view.recent).toHaveLength(14)
    expect(view.recent[13]!.total).toBe(view.totalChars) // 末位=今日
    expect(view.recent[13]!.gain).toBe(view.todayGain)
  })

  it('无任何章节：全零不崩溃', () => {
    const view = getWritingStats()
    expect(view.totalChars).toBe(0)
    expect(view.todayGain).toBe(0)
    expect(view.streakDays).toBe(0)
    expect(view.recent.every((r) => r.total === 0 && r.gain === 0)).toBe(true)
  })
})

describe('晨间审查修复回归', () => {
  it('重命名章节：统计键随文件名迁移（不双计、重启不负增量）', () => {
    writeChapter('第01章.md', '十个字的正文')
    openNovel(novelDir)
    renameChapterStats('chapters/第01章.md', 'chapters/序章.md')
    const view = getWritingStats()
    expect(view.totalChars).toBe(countChars('十个字的正文')) // 无双计
    // 旧键不再存在（下次对账不会把旧键清出负增量）——以重命名后继续保存新路径稳定验证
    recordChapterSave('chapters/序章.md', '十个字的正文再加字')
    expect(getWritingStats().totalChars).toBe(countChars('十个字的正文再加字'))
  })

  it('交换章节：账值随内容对调', () => {
    writeChapter('第01章.md', '短文')
    writeChapter('第02章.md', '这一章的字数明显更多一些')
    openNovel(novelDir)
    exchangeChapterStats('chapters/第01章.md', 'chapters/第02章.md')
    // 直接读文件验证键值互换
    const raw = JSON.parse(readFileSync(join(novelDir, 'writing-stats.json'), 'utf-8')) as { chapterChars: Record<string, number> }
    expect(raw.chapterChars['chapters/第01章.md']).toBe(countChars('这一章的字数明显更多一些'))
    expect(raw.chapterChars['chapters/第02章.md']).toBe(countChars('短文'))
  })

  it('近 14 天窗口前段：无记录日显示 0 而非今日总量（carry 初值修复）', () => {
    writeChapter('第01章.md', '今日首写')
    openNovel(novelDir)
    const view = getWritingStats()
    expect(view.recent).toHaveLength(14)
    // 只有今天一条记录：前 13 天应全部为 0（原先错误显示今天的总量）
    expect(view.recent.slice(0, 13).every((r) => r.total === 0 && r.gain === 0)).toBe(true)
    expect(view.recent[13]!.total).toBe(countChars('今日首写'))
  })
})
