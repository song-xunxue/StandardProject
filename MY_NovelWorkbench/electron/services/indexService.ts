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
 */

import Database from 'better-sqlite3'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { currentNovel } from './novelService'
import { readTree } from './fileService'
import { parseFrontmatter } from '../../shared/frontmatter'
import type { BlueprintFile } from '../../shared/types'

type DB = Database.Database

/** 章节索引头部读取上限：frontmatter 在文件头，10 万字长章节不必整读（M5 性能） */
const FRONTMATTER_HEAD_BYTES = 64 * 1024

let db: DB | null = null

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
      path TEXT PRIMARY KEY, mtime INTEGER NOT NULL, size INTEGER NOT NULL
    );
  `)
  return db
}

/** 关闭并重置（切换小说时调用） */
export function closeIndex(): void {
  db?.close()
  db = null
}

/** 文件是否需要重索引（st 由调用方 stat 一次后传入，避免双 stat 竞态；mtime 取整毫秒） */
function needsReindex(database: DB, path: string, st: { mtimeMs: number; size: number }): boolean {
  const row = database.prepare('SELECT mtime, size FROM file_state WHERE path = ?').get(path) as
    | { mtime: number; size: number }
    | undefined
  return !row || row.mtime !== Math.round(st.mtimeMs) || row.size !== st.size
}

function markIndexed(database: DB, path: string, st: { mtimeMs: number; size: number }): void {
  database
    .prepare('INSERT OR REPLACE INTO file_state (path, mtime, size) VALUES (?, ?, ?)')
    .run(path, Math.round(st.mtimeMs), st.size)
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

/** 读文件头部（至多 FRONTMATTER_HEAD_BYTES 字节）：indexChapter 只需 frontmatter */
function readHead(novelDir: string, path: string): string {
  const fd = openSync(join(novelDir, path), 'r')
  try {
    const buf = Buffer.alloc(FRONTMATTER_HEAD_BYTES)
    // readSync：从位置 0 读至多 HEAD_BYTES 字节进缓冲区，返回实际读取数（文件更小时即全文）
    const bytes = readSync(fd, buf, 0, FRONTMATTER_HEAD_BYTES, 0)
    return buf.subarray(0, bytes).toString('utf-8')
  } finally {
    closeSync(fd)
  }
}

/** 索引单个蓝图文件：替换该文件的节点与关联边；文件已删除时清理残留。
 *  返回是否实际重建（未变跳过/已删除清理均返回 false） */
export function indexBlueprint(path: string): boolean {
  const database = openDb()
  const novel = currentNovel()!
  const st = statOrNull(novel.dir, path)
  if (!st || !needsReindex(database, path, st)) return false
  const file = JSON.parse(readFileSync(join(novel.dir, path), 'utf-8')) as BlueprintFile

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
      insertNode.run(n.id, path, n.type, JSON.stringify(n.tags ?? []), Math.round(st.mtimeMs), `${st.size}`)
    }
    const insertEdge = database.prepare(
      'INSERT OR REPLACE INTO edges (id, source_id, target_id, type, anchor) VALUES (?, ?, ?, ?, NULL)'
    )
    for (const e of file.edges ?? []) {
      insertEdge.run(e.id, e.from, e.to, e.type)
    }
    markIndexed(database, path, st)
  })
  replaceTx()
  return true
}

/** 索引单个章节文件：节点 id 采用章节相对路径；文件已删除时清理残留。
 *  返回是否实际重建；正文只读头部（frontmatter 在文件头，长章节不必整读） */
export function indexChapter(path: string): boolean {
  const database = openDb()
  const novel = currentNovel()!
  const st = statOrNull(novel.dir, path)
  if (!st || !needsReindex(database, path, st)) return false
  let raw = readHead(novel.dir, path)
  // 头部未出现闭合 ---（病态超长 frontmatter）时回退全文读，保证解析正确
  if (st.size > FRONTMATTER_HEAD_BYTES && !/^---\n[\s\S]*?\n---\n?/.test(raw.replace(/\r\n/g, '\n'))) {
    raw = readFileSync(join(novel.dir, path), 'utf-8')
  }
  const { data } = parseFrontmatter(raw)
  const upsert = database.prepare(
    'INSERT OR REPLACE INTO nodes (id, path, type, tags, mtime, hash) VALUES (?, ?, ?, ?, ?, ?)'
  )
  upsert.run(path, path, 'chapter', JSON.stringify(data.tags ?? []), Math.round(st.mtimeMs), `${st.size}`)
  markIndexed(database, path, st)
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
