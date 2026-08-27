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
 */

import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { currentNovel } from './novelService'
import { readTree } from './fileService'
import { parseFrontmatter } from '../../shared/frontmatter'
import type { BlueprintFile } from '../../shared/types'

type DB = Database.Database

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

/** 索引单个蓝图文件：替换该文件的节点与关联边；文件已删除时清理残留 */
export function indexBlueprint(path: string): void {
  const database = openDb()
  const novel = currentNovel()!
  const st = statOrNull(novel.dir, path)
  if (!st || !needsReindex(database, path, st)) return
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
}

/** 索引单个章节文件：节点 id 采用章节相对路径；文件已删除时清理残留 */
export function indexChapter(path: string): void {
  const database = openDb()
  const novel = currentNovel()!
  const st = statOrNull(novel.dir, path)
  if (!st || !needsReindex(database, path, st)) return
  const { data } = parseFrontmatter(readFileSync(join(novel.dir, path), 'utf-8'))
  const upsert = database.prepare(
    'INSERT OR REPLACE INTO nodes (id, path, type, tags, mtime, hash) VALUES (?, ?, ?, ?, ?, ?)'
  )
  upsert.run(path, path, 'chapter', JSON.stringify(data.tags ?? []), Math.round(st.mtimeMs), `${st.size}`)
  markIndexed(database, path, st)
}

/** 全量重建：清空后按当前文件树索引（「重建索引」命令 / 删除 .index/ 后自动） */
export function rebuildIndex(): { nodes: number; edges: number } {
  const database = openDb()
  database.exec('DELETE FROM nodes; DELETE FROM edges; DELETE FROM file_state;')
  // 深度优先遍历（卷目录递归下钻——chapters/卷/章.md 也是章节）
  const walk = (nodes: Array<{ path: string; kind: string; children?: unknown[] }>): void => {
    for (const n of nodes) {
      if (n.kind === 'blueprint') indexBlueprint(n.path)
      else if (n.kind === 'chapter') indexChapter(n.path)
      else if (n.kind === 'dir' && Array.isArray(n.children)) walk(n.children as Parameters<typeof walk>[0])
    }
  }
  const tree = readTree()
  for (const root of tree) {
    walk((root.children ?? []) as Parameters<typeof walk>[0])
  }
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
