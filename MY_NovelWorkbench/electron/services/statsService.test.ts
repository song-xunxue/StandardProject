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

 * 2026-09-23
 * 变更说明：
 *   1. v2 三批遗留修复：快照恢复统计对账用例组（内容回退重算/days 保留/键集镜像/
 *      卷目录/负增量链路）
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
import {
  countChars,
  exchangeChapterStats,
  getWritingStats,
  initStats,
  recomputeChapterChars,
  recordChapterSave,
  removeChapterStats,
  renameChapterStats
} from './statsService'

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

describe('快照恢复统计对账（v2 三批遗留修复）', () => {
  /** 直写 writing-stats.json 模拟「恢复前的旧账本」（恢复不迁移统计文件） */
  function seedStats(chapterChars: Record<string, number>, days: Record<string, number>): void {
    writeFileSync(join(novelDir, 'writing-stats.json'), JSON.stringify({ chapterChars, days }), 'utf-8')
  }

  it('缺陷现状固化：initStats 跳过既有键——内容回退后仅靠 openNovel 对账不自愈', () => {
    writeChapter('第01章.md', '这是恢复后的短版本正文')
    // 模拟恢复前账本：同一章存在但记的是恢复前（更长的）字数
    seedStats({ 'chapters/第01章.md': 9999 }, { '2026-09-01': 5000 })
    openNovel(novelDir) // 恢复后水合会跑 initStats——实证此路径不校正既有键
    expect(getWritingStats().totalChars).toBe(9999)
  })

  it('修复链路（生产时序）：recompute 在 openNovel 前 → 总量与当日戳均以校正后值落账', () => {
    writeChapter('第01章.md', '这是恢复后的短版本正文')
    seedStats({ 'chapters/第01章.md': 9999 }, { '2026-09-01': 5000 })
    recomputeChapterChars() // ipc 编排：恢复成功后、openNovel 前
    openNovel(novelDir) // initStats→stampToday 以校正后总量覆盖今日
    const view = getWritingStats()
    expect(view.totalChars).toBe(countChars('这是恢复后的短版本正文'))
    // 今日总量=校正后字数（非 9999）→ 次日日增基线正确
    expect(view.recent[13]!.total).toBe(countChars('这是恢复后的短版本正文'))
    expect(view.todayGain).toBe(countChars('这是恢复后的短版本正文') - 5000) // 对上一记录日的负差
  })

  it('重算后 days 历史原样保留（发生过的事不随内容回滚）', () => {
    writeChapter('第01章.md', '正文十个字')
    seedStats({}, { '2026-09-01': 5000, '2026-09-02': 8000 })
    recomputeChapterChars()
    const raw = JSON.parse(readFileSync(join(novelDir, 'writing-stats.json'), 'utf-8')) as {
      chapterChars: Record<string, number>
      days: Record<string, number>
    }
    expect(raw.days).toEqual({ '2026-09-01': 5000, '2026-09-02': 8000 })
    expect(raw.chapterChars['chapters/第01章.md']).toBe(countChars('正文十个字'))
  })

  it('键集整体镜像当前文件树：死键清除、复活/新增章按磁盘内容入账', () => {
    writeChapter('第01章.md', '保留章正文')
    seedStats({ 'chapters/第01章.md': 100, 'chapters/已删章.md': 50 }, {})
    // 模拟恢复后文件树变化：新增一章、账本里的已删章在磁盘不存在
    writeChapter('第02章.md', '恢复带回的旧章')
    recomputeChapterChars()
    const raw = JSON.parse(readFileSync(join(novelDir, 'writing-stats.json'), 'utf-8')) as {
      chapterChars: Record<string, number>
    }
    expect(Object.keys(raw.chapterChars).sort()).toEqual(['chapters/第01章.md', 'chapters/第02章.md'])
    expect(raw.chapterChars['chapters/第01章.md']).toBe(countChars('保留章正文'))
    expect(raw.chapterChars['chapters/第02章.md']).toBe(countChars('恢复带回的旧章'))
  })

  it('卷目录章节同样参与重算（chapterPaths 含一层卷）', () => {
    mkdirSync(join(novelDir, 'chapters', '第一卷'), { recursive: true })
    writeFileSync(
      join(novelDir, 'chapters', '第一卷', '第01章.md'),
      '---\ntitle: 第01章\ntags: []\naliases: []\n---\n\n卷内正文。',
      'utf-8'
    )
    seedStats({}, {})
    recomputeChapterChars()
    const raw = JSON.parse(readFileSync(join(novelDir, 'writing-stats.json'), 'utf-8')) as {
      chapterChars: Record<string, number>
    }
    expect(raw.chapterChars['chapters/第一卷/第01章.md']).toBe(countChars('卷内正文。'))
  })
})
