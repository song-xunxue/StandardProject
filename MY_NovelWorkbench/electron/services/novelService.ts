/**
 * 小说目录服务（主进程）：创建 / 打开 / 最近列表 / 当前小说状态
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：标准目录模板落盘、novel.json 校验、recent.json 维护（userData）
 *   2. M2：新增 readMeta/saveMeta（标签库等元信息的渲染层读写）
 *   3. M4-B：打开小说时触发旧 resources/ 目录幂等迁移入全局资源库（resourceService）
 */

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { builtinTagLibrary, novelFileMap } from '../../shared/novelTemplate'
import { sanitizeFileName } from '../../shared/sanitize'
import { migrateLegacyResources } from './resourceService'
import { initStats } from './statsService'
import type { NovelMeta, RecentNovel } from '../../shared/types'

/** 当前打开的小说（模块级状态，主进程单例） */
let current: { dir: string; meta: NovelMeta } | null = null

export function currentNovel(): { dir: string; meta: NovelMeta } | null {
  return current
}

function recentPath(): string {
  return join(app.getPath('userData'), 'recent.json')
}

/** 读取最近列表：损坏/结构不符时静默降级为空（不阻断打开流程） */
function loadRecent(): RecentNovel[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(recentPath(), 'utf-8'))
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is RecentNovel =>
        typeof r === 'object' && r !== null && typeof (r as RecentNovel).dir === 'string' && typeof (r as RecentNovel).title === 'string'
    )
  } catch {
    return []
  }
}

function touchRecent(dir: string, title: string): void {
  try {
    const list = loadRecent().filter((r) => r.dir !== dir)
    list.unshift({ dir, title, openedAt: new Date().toISOString() })
    // 临时文件 + rename 原子写，避免崩溃时留下半写 JSON
    const target = recentPath()
    const tmp = `${target}.tmp`
    writeFileSync(tmp, JSON.stringify(list.slice(0, 10), null, 2), 'utf-8')
    renameSync(tmp, target)
  } catch (err) {
    console.error('[novelService] 最近列表写入失败（忽略）:', err)
  }
}

/** 创建小说：parentDir 下生成同名目录并写入标准模板 */
export function createNovel(parentDir: string, title: string): NovelMeta {
  const dir = join(parentDir, sanitizeFileName(title))
  if (existsSync(join(dir, 'novel.json'))) {
    throw new Error(`目录已存在小说：${dir}`)
  }
  const id = randomUUID()
  const files = novelFileMap(id, title)
  const meta: NovelMeta = {
    id,
    title,
    createdAt: new Date().toISOString(),
    tagLibrary: JSON.parse(files['novel.json']!).tagLibrary
  }
  files['novel.json'] = JSON.stringify(meta, null, 2)
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content, 'utf-8')
  }
  return openNovel(dir)
}

/** 打开小说：校验 novel.json，登记最近列表 */
export function openNovel(dir: string): NovelMeta {
  const metaPath = join(dir, 'novel.json')
  if (!existsSync(metaPath)) {
    throw new Error(`不是有效的小说目录（缺少 novel.json）：${dir}`)
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as NovelMeta
  if (!meta.id || !meta.title) {
    throw new Error(`novel.json 结构不完整：${dir}`)
  }
  // M1 早期目录迁移：无 tagLibrary 字段时回填内置标签库（否则 M2 标签系统对其不可用）
  if (!Array.isArray(meta.tagLibrary)) {
    meta.tagLibrary = builtinTagLibrary()
  }
  // M4-B 数据迁移：旧小说目录内 resources/ 幂等搬入全局资源库（内部逐文件容错，不阻断打开）
  migrateLegacyResources(dir)
  current = { dir, meta: { ...meta, dir } }
  // v2-F7：打开时全量对账码字统计（新章入账/删除清账/外部编辑计入当日；失败不阻断打开）。
  // 必须在 current 赋值之后——statsService 经 currentNovel() 取小说目录
  try {
    initStats()
  } catch (err) {
    console.error('[statsService] 打开小说统计对账失败:', err)
  }
  touchRecent(dir, meta.title)
  return current.meta
}

/** 最近打开列表（新→旧） */
export function recentNovels(): RecentNovel[] {
  return loadRecent()
}

/** 读取当前小说元信息（novel.json，含标签库） */
export function readMeta(): NovelMeta {
  if (!current) throw new Error('尚未打开小说')
  return current.meta
}

/** 保存元信息：校验后原子写回 novel.json，并同步模块级 current（dir 运行时字段不落盘） */
export function saveMeta(meta: NovelMeta): NovelMeta {
  if (!current) throw new Error('尚未打开小说')
  if (!meta.id || !meta.title || !Array.isArray(meta.tagLibrary)) {
    throw new Error('novel.json 结构不完整（缺少 id/title/tagLibrary）')
  }
  const { dir: _dir, ...onDisk } = meta
  const target = join(current.dir, 'novel.json')
  const tmp = `${target}.tmp`
  writeFileSync(tmp, JSON.stringify(onDisk, null, 2), 'utf-8')
  renameSync(tmp, target)
  current = { dir: current.dir, meta: { ...onDisk, dir: current.dir } }
  return current.meta
}
