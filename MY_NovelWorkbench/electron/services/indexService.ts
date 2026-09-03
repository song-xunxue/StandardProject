/**
 * SQLite 索引服务（主进程，M1 v1）
 * 表结构（PROJECT_PLAN.md 3.2）：nodes / edges / tags / file_state（增量判定）
 * 更新策略：文件 mtime+size 变更才重解析；「重建索引」全量兜底
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：蓝图/章节文件索引、增量跳过、全量重建、统计
 *
 * 2026-08-28
 * 变更说明：
 *   1. M5：新增 syncIndex 增量校对——打开小说不再全量重建（清表会把 mtime+size
 *      基线一并清空，第二次打开仍重读全部文件）；基线跨会话生效，未变文件零重读，
 *      全量 rebuildIndex 保留给「重建索引」命令兜底
 *   2. M5：indexChapter 长章节只读头部 64KB 提取 frontmatter（闭合符未在头部
 *      出现时回退全文读，容错超长 frontmatter）；indexBlueprint/indexChapter
 *      返回是否实际重建（syncIndex 统计用）
 *
 * 2026-08-31
 * 变更说明：
 *   1. v2-P1 内容哈希变更检测：file_state 增加 hash 列（sha1 前 16 位）——mtime/size
 *      变化触发后先比对内容哈希，内容未变（如 touch/复制保留时间戳被打乱）只刷新
 *      基线不重解析（Notion per-span xxHash 思路的文件级实现）。章节为取哈希改读
 *      全文（读是廉价 IO，跳过的 parse 才是贵操作）；等长替换的中后部内容变化
 *      因此不再漏检
 */

import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { currentNovel } from './novelService'
import { readTree } from './fileService'
import { parseFrontmatter } from '../../shared/frontmatter'
import type { BlueprintFile } from '../../shared/types'

type DB = Database.Database

let db: DB | null = null

/** 内容哈希（sha1 前 16 位，十六进制）：文件级变更检测用 */
function contentHash(text: string): string {
  return createHash('sha1').update(text, 'utf-8').digest('hex').slice(0, 16)
}

function openDb(): DB {
  if (db) return db
  const novel = currentNovel()
  if (!novel) throw new Error('尚未打开小说')
  const indexDir = join(novel.dir, '.index')
  if (!existsSync(indexDir)) mkdirSync(indexDir, { recursive: true })
  db = new Database(join(indexDir, 'index.db'))
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY, path TEXT NOT NULL, type TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]', mtime INTEGER NOT NULL, hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY, source_id TEXT NOT NULL, target_id TEXT NOT NULL,
      type TEXT NOT NULL, anchor TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
    CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
    CREATE TABLE IF NOT EXISTS tags (
      name TEXT PRIMARY KEY, color TEXT, builtin INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS file_state (
      path TEXT PRIMARY KEY, mtime INTEGER NOT NULL, size INTEGER NOT NULL, hash TEXT
    );
  `)
  // v2-P1 迁移：旧库 file_state 无 hash 列时补列（已存在则忽略报错）
  try {
    db.exec('ALTER TABLE file_state ADD COLUMN hash TEXT')
  } catch {
    /* 列已存在 */
  }
  return db
}

/** 关闭并重置（切换小说时调用） */
export function closeIndex(): void {
  db?.close()
  db = null
}

/** 文件是否需要重索引（st 由调用方 stat 一次后传入，避免双 stat 竞态；mtime 取整毫秒）。
 *  v2-P1：mtime/size 变化只触发「哈希复核」——返回 'same' 表示内容未变（调用方刷新
 *  基线即可），'changed' 表示需要重索引，'skip' 表示 stat 层面未变直接过。
 *  hash 基线缺失（v2-P1 之前的旧库行）视为基线不完整：强制重建一次以回填哈希 */
function reindexState(
  database: DB,
  path: string,
  st: { mtimeMs: number; size: number }
): 'skip' | 'same' | 'changed' {
  const row = database.prepare('SELECT mtime, size, hash FROM file_state WHERE path = ?').get(path) as
    | { mtime: number; size: number; hash: string | null }
    | undefined
  if (!row) return 'changed'
  if (row.hash === null) return 'changed' // 旧库迁移：无哈希基线，重建一次回填
  if (row.mtime === Math.round(st.mtimeMs) && row.size === st.size) return 'skip'
  return 'same' // mtime/size 变了但是否真变内容由哈希复核（调用方读取文件后调用 hashUnchanged）
}

/** v2-P1：内容哈希复核——与基线一致则刷新 mtime/size 基线并返回 true（跳过重解析） */
function hashUnchanged(database: DB, path: string, st: { mtimeMs: number; size: number }, text: string): boolean {
  const row = database.prepare('SELECT hash FROM file_state WHERE path = ?').get(path) as { hash: string | null } | undefined
  const hash = contentHash(text)
  if (row && row.hash === hash) {
    markIndexed(database, path, st, hash)
    return true
  }
  return false
}

function markIndexed(database: DB, path: string, st: { mtimeMs: number; size: number }, hash?: string): void {
  database
    .prepare('INSERT OR REPLACE INTO file_state (path, mtime, size, hash) VALUES (?, ?, ?, ?)')
    .run(path, Math.round(st.mtimeMs), st.size, hash ?? null)
}

/** 删除文件的全部索引条目（节点 + 两端命中的边 + file_state）——删除/重命名残留清理 */
export function removePath(path: string): void {
  const database = openDb()
  const tx = database.transaction(() => {
    const oldIds = (database.prepare('SELECT id FROM nodes WHERE path = ?').all(path) as Array<{ id: string }>).map(
      (r) => r.id
    )
    const removeEdge = database.prepare('DELETE FROM edges WHERE source_id = ? OR target_id = ?')
    for (const id of oldIds) removeEdge.run(id, id)
    database.prepare('DELETE FROM nodes WHERE path = ?').run(path)
    database.prepare('DELETE FROM file_state WHERE path = ?').run(path)
  })
  tx()
}

/** stat 一次：文件已删除（ENOENT）时清理索引条目并返回 null */
function statOrNull(novelDir: string, path: string): { mtimeMs: number; size: number } | null {
  try {
    return statSync(join(novelDir, path))
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      removePath(path)
      return null
    }
    throw err
  }
}

/** 读文件头部（至多 FRONTMATTER_HEAD_BYTES 字节）：v2-P1 起 indexChapter 改读全文
 *  取哈希，此函数无调用方已移除；常量留作单章节尺寸参考注释 */
// （readHead 已于 2026-08-31 v2-P1 移除——哈希复核需要全文内容）

/** 索引单个蓝图文件：替换该文件的节点与关联边；文件已删除时清理残留。
 *  返回是否实际重建（未变跳过/哈希未变/已删除清理均返回 false） */
export function indexBlueprint(path: string): boolean {
  const database = openDb()
  const novel = currentNovel()!
  const st = statOrNull(novel.dir, path)
  if (!st) return false
  const state = reindexState(database, path, st)
  if (state === 'skip') return false
  const raw = readFileSync(join(novel.dir, path), 'utf-8')
  if (state === 'same' && hashUnchanged(database, path, st, raw)) return false
  const file = JSON.parse(raw) as BlueprintFile
  const hash = contentHash(raw)

  const replaceTx = database.transaction(() => {
    const oldIds = (database.prepare('SELECT id FROM nodes WHERE path = ?').all(path) as Array<{ id: string }>).map((r) => r.id)
    const removeNode = database.prepare('DELETE FROM nodes WHERE id = ?')
    for (const id of oldIds) removeNode.run(id)
    // 边按 from 端归属保存，但清理时两端命中都删（避免跨图边悬挂）
    const removeEdge = database.prepare('DELETE FROM edges WHERE source_id = ? OR target_id = ?')
    for (const id of oldIds) removeEdge.run(id, id)
    const insertNode = database.prepare(
      'INSERT OR REPLACE INTO nodes (id, path, type, tags, mtime, hash) VALUES (?, ?, ?, ?, ?, ?)'
    )
    for (const n of file.nodes ?? []) {
      insertNode.run(n.id, path, n.type, JSON.stringify(n.tags ?? []), Math.round(st.mtimeMs), hash)
    }
    const insertEdge = database.prepare(
      'INSERT OR REPLACE INTO edges (id, source_id, target_id, type, anchor) VALUES (?, ?, ?, ?, NULL)'
    )
    for (const e of file.edges ?? []) {
      insertEdge.run(e.id, e.from, e.to, e.type)
    }
    markIndexed(database, path, st, hash)
  })
  replaceTx()
  return true
}

/** 索引单个章节文件：节点 id 采用章节相对路径；文件已删除时清理残留。
 *  返回是否实际重建；v2-P1 起读全文取内容哈希（mtime/size 变但内容未变只刷基线
 *  不重解析——读是廉价 IO，跳过的 frontmatter 解析才是贵操作） */
export function indexChapter(path: string): boolean {
  const database = openDb()
  const novel = currentNovel()!
  const st = statOrNull(novel.dir, path)
  if (!st) return false
  const state = reindexState(database, path, st)
  if (state === 'skip') return false
  const raw = readFileSync(join(novel.dir, path), 'utf-8')
  if (state === 'same' && hashUnchanged(database, path, st, raw)) return false
  const { data } = parseFrontmatter(raw)
  const hash = contentHash(raw) // 单次计算复用（晨间审查：原先对同一文本算两次 sha1）
  const upsert = database.prepare(
    'INSERT OR REPLACE INTO nodes (id, path, type, tags, mtime, hash) VALUES (?, ?, ?, ?, ?, ?)'
  )
  upsert.run(path, path, 'chapter', JSON.stringify(data.tags ?? []), Math.round(st.mtimeMs), hash)
  markIndexed(database, path, st, hash)
  return true
}

/** 文件树条目（readTree 深度优先遍历用） */
type TreeEntry = { path: string; kind: string; children?: unknown[] }

/** 深度优先遍历当前文件树，对每个蓝图/章节文件调用 visit（卷目录递归下钻——chapters/卷/章.md 也是章节） */
function walkFiles(visit: (path: string, kind: 'blueprint' | 'chapter') => void): void {
  const walk = (entries: TreeEntry[]): void => {
    for (const n of entries) {
      if (n.kind === 'blueprint' || n.kind === 'chapter') visit(n.path, n.kind)
      else if (n.kind === 'dir' && Array.isArray(n.children)) walk(n.children as TreeEntry[])
    }
  }
  for (const root of readTree()) {
    walk((root.children ?? []) as TreeEntry[])
  }
}

/**
 * 增量校对（M5 冷启动路径）：以当前文件树为准，仅重索引 mtime+size 变化的文件，
 * 并清理已不在树中的路径残留。与 rebuildIndex 的区别是不清表——基线跨会话生效，
 * 第二次打开同一本小说时未变文件零重读（stat + 一条 SELECT 直接过）
 */
export function syncIndex(): { nodes: number; edges: number; changed: number; removed: number } {
  const database = openDb()
  let changed = 0
  const current: string[] = []
  walkFiles((path, kind) => {
    current.push(path)
    if (kind === 'blueprint' ? indexBlueprint(path) : indexChapter(path)) changed++
  })
  // file_state 中已不在文件树的路径 = 外部删除/重命名的残留，清理其节点与边
  const currentSet = new Set(current)
  const stale = (database.prepare('SELECT path FROM file_state').all() as Array<{ path: string }>)
    .map((r) => r.path)
    .filter((p) => !currentSet.has(p))
  let removed = 0
  for (const p of stale) {
    removePath(p)
    removed++
  }
  return { ...indexStats(), changed, removed }
}

/** 全量重建：清空后按当前文件树索引（「重建索引」命令 / 删除 .index/ 后自动） */
export function rebuildIndex(): { nodes: number; edges: number } {
  // 强制重开连接：运行中 .index/ 被外部删除时旧句柄指向已消失的文件，重建须落在新库上
  closeIndex()
  const database = openDb()
  database.exec('DELETE FROM nodes; DELETE FROM edges; DELETE FROM file_state;')
  walkFiles((path, kind) => {
    if (kind === 'blueprint') indexBlueprint(path)
    else indexChapter(path)
  })
  return indexStats()
}

/** 索引统计 */
export function indexStats(): { nodes: number; edges: number; lastBuiltAt: string | null } {
  const database = openDb()
  const nodes = (database.prepare('SELECT COUNT(*) AS c FROM nodes').get() as { c: number }).c
  const edges = (database.prepare('SELECT COUNT(*) AS c FROM edges').get() as { c: number }).c
  const last = database.prepare('SELECT MAX(mtime) AS m FROM nodes').get() as { m: number | null }
  return {
    nodes,
    edges,
    lastBuiltAt: last?.m ? new Date(last.m).toISOString() : null
  }
}
