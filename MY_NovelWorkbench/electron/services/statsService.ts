/**
 * 码字统计服务（v2-F7，主进程）：每日总字数快照 + 连续天数 + 近期趋势
 * 存储：小说目录 writing-stats.json（随小说走，不进文件树与索引）
 * 结构：{ chapterChars: Record<章节路径, 字数>, days: Record<YYYY-MM-DD, 当日最后总字数> }
 * 口径：正文去空白字符数（中文网文习惯）；日增 = 今日总量 − 上一记录日总量
 *
 * 作者: 李文煜
 * 日期: 2026-08-31
 *
 * 2026-08-31
 * 变更说明：
 *   1. v2-F7 初版：initStats（openNovel 全量对账——新章入账/删除清账/外部编辑入当日）、
 *      recordChapterSave（saveChapter 钩子）、removeChapterStats（deleteFile 钩子）、
 *      getWritingStats（今日新增/总字数/连续天数/近 14 天）
 */

import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { currentNovel } from './novelService'
import { parseFrontmatter } from '../../shared/frontmatter'

/** 面板展示的天数 */
const RECENT_DAYS = 14

interface StatsFile {
  chapterChars: Record<string, number>
  days: Record<string, number>
}

/** 写作统计视图（渲染层面板展示） */
export interface WritingStatsView {
  /** 今日新增字数（今日总量 − 上一记录日总量；首个记录日为全量） */
  todayGain: number
  /** 当前总字数 */
  totalChars: number
  /** 连续码字天数（今日有增量则含今日，否则从昨日回溯；当日增量>0 记一天） */
  streakDays: number
  /** 近 N 天：日期、当日总量、对前一日增量 */
  recent: Array<{ date: string; total: number; gain: number }>
}

/** 本地时区日期串（YYYY-MM-DD）——统计按作者本地日切分 */
function dateStrOf(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function statsPath(): string {
  return join(currentNovel()!.dir, 'writing-stats.json')
}

/** 正文字数：去空白字符（空格/换行/制表等不计） */
export function countChars(content: string): number {
  return content.replace(/\s/g, '').length
}

function loadStats(): StatsFile {
  try {
    const parsed = JSON.parse(readFileSync(statsPath(), 'utf-8')) as Partial<StatsFile>
    return {
      chapterChars: typeof parsed.chapterChars === 'object' && parsed.chapterChars !== null ? parsed.chapterChars : {},
      days: typeof parsed.days === 'object' && parsed.days !== null ? parsed.days : {}
    }
  } catch {
    return { chapterChars: {}, days: {} }
  }
}

function saveStats(stats: StatsFile): void {
  // tmp+rename 原子写（晨间审查修复）：days 是不可重建的历史记录，直写半途崩溃会被
  // loadStats 的容错静默吞掉导致连续天数/趋势整体清零
  const abs = statsPath()
  const tmp = `${abs}.tmp`
  writeFileSync(tmp, JSON.stringify(stats), 'utf-8')
  renameSync(tmp, abs)
}

/** 遍历 chapters/（含一层卷目录）的全部章节相对路径 */
function chapterPaths(): string[] {
  const chDir = join(currentNovel()!.dir, 'chapters')
  if (!existsSync(chDir)) return []
  const out: string[] = []
  const listDir = (dir: string, prefix: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith('.md')) out.push(`${prefix}${e.name}`)
      else if (e.isDirectory()) listDir(join(dir, e.name), `${prefix}${e.name}/`)
    }
  }
  listDir(chDir, 'chapters/')
  return out
}

/** 记录当日总量（保存文件原子性：tmp+rename 过度——统计文件小且可重建，直写可接受） */
function stampToday(stats: StatsFile): void {
  const total = Object.values(stats.chapterChars).reduce((s, n) => s + n, 0)
  stats.days[dateStrOf(new Date())] = total
}

/**
 * 全量对账（openNovel 时调用）：以当前章节文件为准入账——
 * 新章（外部创建/首次使用）读取字数入账、已删章节清账，随后记当日总量。
 * 外部编辑器写入的增量因此计入当日（口径：可见即当日产出）
 */
export function initStats(): void {
  if (!currentNovel()) return
  const stats = loadStats()
  const live = new Set(chapterPaths())
  // 清理已删章节的旧账
  for (const path of Object.keys(stats.chapterChars)) {
    if (!live.has(path)) delete stats.chapterChars[path]
  }
  // 新章入账（尚未记录过的）
  for (const path of live) {
    if (stats.chapterChars[path] !== undefined) continue
    try {
      const { content } = parseFrontmatter(readFileSync(join(currentNovel()!.dir, path), 'utf-8'))
      stats.chapterChars[path] = countChars(content)
    } catch {
      /* 单章读取失败不阻断对账 */
    }
  }
  stampToday(stats)
  // 对账也可能刷新当日总量（外部编辑/新章入账），统一落盘一次
  saveStats(stats)
}

/** 章节保存钩子：更新该章字数并记当日总量 */
export function recordChapterSave(path: string, content: string): void {
  if (!currentNovel()) return
  const stats = loadStats()
  stats.chapterChars[path] = countChars(content)
  stampToday(stats)
  saveStats(stats)
}

/** 章节删除钩子：清账并记当日总量 */
export function removeChapterStats(path: string): void {
  if (!currentNovel()) return
  const stats = loadStats()
  if (stats.chapterChars[path] === undefined) return
  delete stats.chapterChars[path]
  stampToday(stats)
  saveStats(stats)
}

/** 章节重命名钩子（晨间审查修复）：chapterChars 按路径记账，键随文件名迁移——
 *  不迁移则会话内新旧键并存（总字数双计），下次 openNovel 对账又把旧键整章计入当日 */
export function renameChapterStats(oldPath: string, newPath: string): void {
  if (!currentNovel()) return
  const stats = loadStats()
  if (stats.chapterChars[oldPath] === undefined) return
  stats.chapterChars[newPath] = stats.chapterChars[oldPath]!
  delete stats.chapterChars[oldPath]
  saveStats(stats)
}

/** 章节交换钩子（exchangeFiles 文件名互换=内容对调）：两键的账值随之互换 */
export function exchangeChapterStats(pathA: string, pathB: string): void {
  if (!currentNovel()) return
  const stats = loadStats()
  const a = stats.chapterChars[pathA]
  const b = stats.chapterChars[pathB]
  if (a === undefined && b === undefined) return
  if (a !== undefined) stats.chapterChars[pathB] = a
  else delete stats.chapterChars[pathB]
  if (b !== undefined) stats.chapterChars[pathA] = b
  else delete stats.chapterChars[pathA]
  saveStats(stats)
}

/** 面板数据：今日新增 / 总字数 / 连续天数 / 近 N 天趋势 */
export function getWritingStats(): WritingStatsView {
  const stats = loadStats()
  const totalChars = Object.values(stats.chapterChars).reduce((s, n) => s + n, 0)
  const dayKeys = Object.keys(stats.days).sort()
  const today = dateStrOf(new Date())

  // 日增量序列（对上一记录日）
  const gains = new Map<string, number>()
  let prev = 0
  for (const key of dayKeys) {
    gains.set(key, stats.days[key]! - prev)
    prev = stats.days[key]!
  }
  const todayGain = gains.get(today) ?? 0

  // 连续天数：今日有增量从今日起算，否则从昨日（今天还没写不算断）
  let streak = 0
  const cursor = new Date()
  if ((gains.get(today) ?? 0) <= 0) cursor.setDate(cursor.getDate() - 1)
  while (true) {
    const key = dateStrOf(cursor)
    if ((gains.get(key) ?? 0) > 0) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    } else break
  }

  // 近 N 天（含今日；无记录的日期总量沿用「窗口起点前最后一个记录日」的总量——晨间
  // 审查修复：原实现误取「最近一个记录日」的总量，新用户前 13 天会显示今天的字数）
  const recent: WritingStatsView['recent'] = []
  const dayCursor = new Date()
  dayCursor.setDate(dayCursor.getDate() - (RECENT_DAYS - 1))
  const windowStart = dateStrOf(dayCursor)
  let carry = 0
  for (const key of dayKeys) {
    if (key >= windowStart) break
    carry = stats.days[key]!
  }
  for (let i = 0; i < RECENT_DAYS; i++) {
    const key = dateStrOf(dayCursor)
    if (stats.days[key] !== undefined) carry = stats.days[key]!
    recent.push({ date: key, total: carry, gain: gains.get(key) ?? 0 })
    dayCursor.setDate(dayCursor.getDate() + 1)
  }

  return { todayGain, totalChars, streakDays: streak, recent }
}
