/**
 * 快照服务（主进程，M5，ADR-14 评估通过后实现）：小说目录快照的创建/列表/删除/恢复
 * 设计要点：
 *   - 快照 = novelDir/.snapshots/<id>/ 的完整目录拷贝（跳过 .index/.snapshots/.git）
 *   - manifest.json 最后写入 = 完成标记（拷贝中断的残缺快照不进列表，与 .migrated 同一模式）
 *   - 恢复 = 先自动备份当前状态（唯一退路）→ 清空 blueprints/chapters/novel.json → 从快照拷回；
 *     .index/.git/其余根级文件不动（索引由打开时的增量校对自动对齐，git 历史不属应用管理）
 *   - id 单调递增（同毫秒碰撞时 +1ms），字典序 = 时间序，保留策略按最旧清理
 *
 * 作者: 李文煜
 * 日期: 2026-08-28
 *
 * 2026-08-28
 * 变更说明：
 *   1. M5 初版：创建/列表/删除/恢复 + 保留上限（MAX_SNAPSHOTS=10）+ 路径穿越防护
 */

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SnapshotInfo } from '../../shared/types'

const SNAPSHOT_DIR = '.snapshots'
const MANIFEST_NAME = 'manifest.json'
/** 保留上限：超出删最旧（防快照无限膨胀；恢复前自动备份也计入） */
const MAX_SNAPSHOTS = 10
/** 快照/恢复都不触碰的顶层目录（索引缓存可重建；快照防自嵌套；git 历史不属应用管理） */
const EXCLUDED_TOP = new Set(['.index', '.snapshots', '.git'])

/** 快照 id 合法格式（防穿越：拒绝一切含路径分隔/点号的输入） */
const SNAPSHOT_ID_RE = /^snap-\d{8}-\d{6}-\d{3}$/

/** id 单调基线：同毫秒内多次创建时 +1ms，保证 id 唯一且字典序=时间序 */
let lastIdTime = 0

function snapshotsRoot(novelDir: string): string {
  return join(novelDir, SNAPSHOT_DIR)
}

/** 生成新快照 id：snap-YYYYMMDD-HHmmss-SSS */
function newSnapshotId(): string {
  const ms = Math.max(Date.now(), lastIdTime + 1)
  lastIdTime = ms
  const d = new Date(ms)
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `snap-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`
}

/** 相对路径是否落在排除目录（按第一段判定，兼容 / 与 \ 分隔） */
function isExcluded(rel: string): boolean {
  const first = rel.split(/[\\/]/)[0] ?? ''
  return EXCLUDED_TOP.has(first)
}

/** 目录内文件总数（递归；快照计数用） */
function countFiles(dir: string): number {
  let n = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countFiles(join(dir, e.name))
    else n++
  }
  return n
}

/**
 * 顶层枚举逐项拷贝 src → dest（跳过排除目录）。
 * 不用整体 cpSync：目标是源的自子目录（.snapshots 在小说目录内）时 cpSync 会先拒绝
 * 「copy to a subdirectory of self」，即使 filter 会排除也过不了前置校验
 */
function copyTopLevel(src: string, dest: string, skip: (name: string) => boolean): void {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (skip(entry.name)) continue
    const from = join(src, entry.name)
    const to = join(dest, entry.name)
    if (entry.isDirectory()) cpSync(from, to, { recursive: true, force: true })
    else copyFileSync(from, to)
  }
}

/** 读 novel.json 标题（损坏/缺失时回退空串，快照照常创建） */
function readNovelTitle(novelDir: string): string {
  try {
    const meta = JSON.parse(readFileSync(join(novelDir, 'novel.json'), 'utf-8')) as { title?: string }
    return typeof meta.title === 'string' ? meta.title : ''
  } catch {
    return ''
  }
}

/** 创建快照：完整拷贝小说内容（排除项跳过）；manifest 最后写 = 完成标记。
 *  options.protectIds：保留策略清理时跳过的快照 id（恢复流程保护恢复源用） */
export function createSnapshot(novelDir: string, note: string, options?: { protectIds?: Set<string> }): SnapshotInfo {
  if (!existsSync(join(novelDir, 'novel.json'))) {
    throw new Error(`不是有效的小说目录（缺少 novel.json）：${novelDir}`)
  }
  const id = newSnapshotId()
  const target = join(snapshotsRoot(novelDir), id)
  mkdirSync(target, { recursive: true })
  try {
    // 顶层枚举拷贝（排除 .index/.snapshots/.git——isExcluded 按首段判定，顶层名即首段）
    copyTopLevel(novelDir, target, (name) => isExcluded(name))
    const manifest: SnapshotInfo = {
      id,
      createdAt: new Date(lastIdTime).toISOString(),
      note,
      novelTitle: readNovelTitle(novelDir),
      fileCount: countFiles(target)
    }
    // manifest 最后写入：存在即完整（中断的残缺快照无 manifest，列表不显示）
    writeFileSync(join(target, MANIFEST_NAME), JSON.stringify(manifest, null, 2), 'utf-8')
    pruneSnapshots(novelDir, options?.protectIds)
    return manifest
  } catch (err) {
    // 拷贝中断：清掉残缺目录再抛出（不留无 manifest 的孤儿占盘）
    rmSync(target, { recursive: true, force: true })
    throw err
  }
}

/** 读取单个快照的 manifest（目录无 manifest 时返回 null = 残缺/进行中，调用方跳过） */
function readManifest(snapDir: string): SnapshotInfo | null {
  try {
    const info = JSON.parse(readFileSync(join(snapDir, MANIFEST_NAME), 'utf-8')) as SnapshotInfo
    if (typeof info.id !== 'string' || typeof info.createdAt !== 'string') return null
    return { id: info.id, createdAt: info.createdAt, note: info.note ?? '', novelTitle: info.novelTitle ?? '', fileCount: info.fileCount ?? 0 }
  } catch {
    return null
  }
}

/** 快照列表（新 → 旧）；残缺目录（无 manifest）跳过 */
export function listSnapshots(novelDir: string): SnapshotInfo[] {
  const root = snapshotsRoot(novelDir)
  if (!existsSync(root)) return []
  const infos: SnapshotInfo[] = []
  for (const name of readdirSync(root, { withFileTypes: true })) {
    if (!name.isDirectory()) continue
    const info = readManifest(join(root, name.name))
    if (info) infos.push(info)
  }
  return infos.sort((a, b) => (a.id < b.id ? 1 : -1))
}

/** 校验快照 id 格式并返回其目录（不存在/残缺时抛错） */
function requireSnapshotDir(novelDir: string, id: string): string {
  if (!SNAPSHOT_ID_RE.test(id)) throw new Error(`非法快照 id：${id}`)
  const dir = join(snapshotsRoot(novelDir), id)
  if (!readManifest(dir)) throw new Error(`快照不存在或不完整：${id}`)
  return dir
}

/** 删除快照 */
export function deleteSnapshot(novelDir: string, id: string): void {
  const dir = requireSnapshotDir(novelDir, id)
  rmSync(dir, { recursive: true, force: true })
}

/** 保留策略：超出上限删最旧（id 字典序 = 时间序）；protectIds 内的 id 免删
 *  （恢复流程传入恢复源——自动备份成为第 11 份时最旧的恰是恢复目标，删了就恢复中断） */
function pruneSnapshots(novelDir: string, protectIds?: Set<string>): void {
  const root = snapshotsRoot(novelDir)
  if (!existsSync(root)) return
  const ids = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && SNAPSHOT_ID_RE.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse()
  for (const id of ids.slice(MAX_SNAPSHOTS)) {
    if (protectIds?.has(id)) continue
    rmSync(join(root, id), { recursive: true, force: true })
  }
}

/**
 * 恢复快照：当前内容先自动备份 → 清空应用管理的内容（blueprints/chapters/novel.json）
 * → 从快照拷回。.index/.snapshots/.git/其余根级文件不动。
 * 调用方（ipc 层）负责在调用前 stopWatching + closeIndex（释放 SQLite 句柄、防事件风暴），
 * 恢复后走 openNovel + startWatching 增量校对对齐索引
 */
export function restoreSnapshot(novelDir: string, id: string): void {
  const snapDir = requireSnapshotDir(novelDir, id)
  // 1. 自动备份当前状态：恢复中断/误恢复时的唯一退路。
  //    protectIds 保护恢复源：已有 10 份时备份成为第 11 份，prune 删的「最旧」
  //    恰可能是本次要恢复的目标——不保护则清空内容后拷回时源已不在（M5 审查修复）
  createSnapshot(novelDir, '恢复前自动备份', { protectIds: new Set([id]) })
  // 2. 清空应用管理的内容（保留 .index/.snapshots/.git 与用户自放的其他文件）。
  //    文件级删除用 unlinkSync：本机 Node 24.11.1 的 rmSync 删非 ASCII 文件名的单文件会硬崩进程
  //    （目录级 recursive rmSync 与 ASCII 文件不受影响，见 2026-08-28 M5 排障记录）
  rmSync(join(novelDir, 'blueprints'), { recursive: true, force: true })
  rmSync(join(novelDir, 'chapters'), { recursive: true, force: true })
  unlinkSync(join(novelDir, 'novel.json'))
  // 3. 快照内容逐项拷回（manifest 不拷；同为顶层枚举——快照目录在小说目录内，整体 cpSync 会被拒）
  // 晨间审查修复：writing-stats.json 是累积写作日志（连续天数/趋势不可重建），
  // 不随内容回滚——快照里的旧版统计拷回会清掉快照点之后的码字记录
  copyTopLevel(snapDir, novelDir, (name) => name === MANIFEST_NAME || name === 'writing-stats.json')
}
