/**
 * 快照服务单测（M5）：创建（排除项/完成标记/计数）/ 列表（排序·残缺跳过）/
 * 删除（穿越防护）/ 保留上限 / 恢复（内容回滚·非应用文件保留·自动备份）
 * 纯 node 文件操作（服务不依赖 electron），临时目录隔离
 *
 * 作者: 李文煜
 * 日期: 2026-08-28
 *
 * 2026-08-28
 * 变更说明：
 *   1. M5 初版
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSnapshot, deleteSnapshot, listSnapshots, restoreSnapshot } from './snapshotService'

let novelDir = ''

/** 标准小说目录：novel.json + 1 蓝图 + 2 章节（其一在卷内） + .git/.index 干扰目录 */
function makeNovel(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-snap-'))
  writeFileSync(join(dir, 'novel.json'), JSON.stringify({ id: 's-1', title: '快照测试小说', tagLibrary: [] }), 'utf-8')
  mkdirSync(join(dir, 'blueprints'), { recursive: true })
  mkdirSync(join(dir, 'chapters', '第一卷'), { recursive: true })
  writeFileSync(
    join(dir, 'blueprints', '主蓝图.blueprint.json'),
    JSON.stringify({ id: 'g-1', title: '主蓝图', nodes: [], edges: [] }),
    'utf-8'
  )
  writeFileSync(join(dir, 'chapters', '第01章.md'), '---\ntitle: 第01章\n---\n\n第一章正文。\n', 'utf-8')
  writeFileSync(join(dir, 'chapters', '第一卷', '第02章.md'), '---\ntitle: 第02章\n---\n\n第二章正文。\n', 'utf-8')
  // 排除项：不应进入快照
  mkdirSync(join(dir, '.git'), { recursive: true })
  writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/master', 'utf-8')
  mkdirSync(join(dir, '.index'), { recursive: true })
  writeFileSync(join(dir, '.index', 'index.db'), 'fake-db', 'utf-8')
  return dir
}

beforeEach(() => {
  novelDir = makeNovel()
})

afterEach(() => {
  rmSync(novelDir, { recursive: true, force: true })
})

describe('createSnapshot / listSnapshots', () => {
  it('创建完整快照：排除 .index/.snapshots/.git，manifest 最后写入，fileCount 正确', () => {
    const info = createSnapshot(novelDir, '第一份')
    expect(info.note).toBe('第一份')
    expect(info.novelTitle).toBe('快照测试小说')
    expect(info.fileCount).toBe(4) // novel.json + 蓝图 + 2 章节
    const snapDir = join(novelDir, '.snapshots', info.id)
    expect(existsSync(join(snapDir, 'manifest.json'))).toBe(true)
    expect(existsSync(join(snapDir, 'novel.json'))).toBe(true)
    expect(existsSync(join(snapDir, 'chapters', '第一卷', '第02章.md'))).toBe(true)
    expect(existsSync(join(snapDir, '.git'))).toBe(false)
    expect(existsSync(join(snapDir, '.index'))).toBe(false)
  })

  it('列表新→旧排序；无 manifest 的残缺目录跳过', () => {
    const a = createSnapshot(novelDir, 'A')
    const b = createSnapshot(novelDir, 'B')
    // 手造残缺快照目录（模拟拷贝中断）：无 manifest 不应出现在列表
    mkdirSync(join(novelDir, '.snapshots', 'snap-20990101-000000-000'), { recursive: true })
    const list = listSnapshots(novelDir)
    expect(list.map((s) => s.id)).toEqual([b.id, a.id])
    expect(list.some((s) => s.id === 'snap-20990101-000000-000')).toBe(false)
  })

  it('同毫秒连续创建不撞 id（单调 +1ms）', () => {
    const ids = new Set(Array.from({ length: 5 }, () => createSnapshot(novelDir, '').id))
    expect(ids.size).toBe(5)
  })
})

describe('deleteSnapshot', () => {
  it('删除指定快照目录；非法 id（穿越/未知格式/不存在）拒绝', () => {
    const info = createSnapshot(novelDir, '')
    deleteSnapshot(novelDir, info.id)
    expect(existsSync(join(novelDir, '.snapshots', info.id))).toBe(false)
    expect(() => deleteSnapshot(novelDir, '../' + info.id)).toThrow()
    expect(() => deleteSnapshot(novelDir, 'hack')).toThrow()
    expect(() => deleteSnapshot(novelDir, 'snap-20990101-000000-000')).toThrow() // 不存在
  })
})

describe('保留上限（MAX_SNAPSHOTS=10）', () => {
  it('第 11 份创建后最旧快照被清理', () => {
    const ids: string[] = []
    for (let i = 0; i < 11; i++) ids.push(createSnapshot(novelDir, `第${i + 1}份`).id)
    const list = listSnapshots(novelDir)
    expect(list.length).toBe(10)
    expect(list.some((s) => s.id === ids[0])).toBe(false) // 最旧被清
    expect(list.some((s) => s.id === ids[10])).toBe(true) // 最新保留
  })
})

describe('restoreSnapshot', () => {
  it('恢复回滚应用内容：改掉的章节还原、删掉的蓝图回来、快照后新增的章节消失', () => {
    const snap = createSnapshot(novelDir, '存档点')
    // 快照后三处变更
    writeFileSync(join(novelDir, 'chapters', '第01章.md'), '---\ntitle: 第01章\n---\n\n被改坏的内容。\n', 'utf-8')
    // 文件级删除用 unlinkSync：本机 Node 24.11.1 的 rmSync 删中文文件名单文件会硬崩 worker
    unlinkSync(join(novelDir, 'blueprints', '主蓝图.blueprint.json'))
    writeFileSync(join(novelDir, 'chapters', '第99章.md'), '---\ntitle: 第99章\n---\n\n快照之后新写的。\n', 'utf-8')

    restoreSnapshot(novelDir, snap.id)

    expect(readFileSync(join(novelDir, 'chapters', '第01章.md'), 'utf-8')).toContain('第一章正文')
    expect(existsSync(join(novelDir, 'blueprints', '主蓝图.blueprint.json'))).toBe(true)
    expect(existsSync(join(novelDir, 'chapters', '第99章.md'))).toBe(false)
    expect(existsSync(join(novelDir, 'chapters', '第一卷', '第02章.md'))).toBe(true)
  })

  it('恢复保留 .git 与 .index；恢复前自动备份存在且可再次恢复（退路验证）', () => {
    const snap = createSnapshot(novelDir, '存档点')
    writeFileSync(join(novelDir, 'chapters', '第01章.md'), '---\ntitle: 第01章\n---\n\n改动。\n', 'utf-8')
    restoreSnapshot(novelDir, snap.id)

    // 非应用管理的内容不动
    expect(existsSync(join(novelDir, '.git', 'HEAD'))).toBe(true)
    expect(existsSync(join(novelDir, '.index', 'index.db'))).toBe(true)
    // 自动备份：其中版本含「改动。」，从它可再恢复回来
    const backup = listSnapshots(novelDir).find((s) => s.note === '恢复前自动备份')
    expect(backup).toBeDefined()
    restoreSnapshot(novelDir, backup!.id)
    expect(readFileSync(join(novelDir, 'chapters', '第01章.md'), 'utf-8')).toContain('改动。')
  })

  it('恢复时快照目录内容不含 manifest（manifest 不落回小说目录）', () => {
    const snap = createSnapshot(novelDir, '')
    restoreSnapshot(novelDir, snap.id)
    expect(existsSync(join(novelDir, 'manifest.json'))).toBe(false)
  })

  it('审查回归：10 份上限时恢复最旧快照不被 prune 删掉（protectIds 保护恢复源）', () => {
    const ids: string[] = []
    for (let i = 0; i < 10; i++) ids.push(createSnapshot(novelDir, `第${i + 1}份`).id)
    // 改动内容后恢复「最旧」那份：自动备份成为第 11 份，prune 若不保护恢复源，
    // 最旧目录被删 → 清空内容后拷回 ENOENT → 小说被清空且恢复失败
    writeFileSync(join(novelDir, 'chapters', '第01章.md'), '---\ntitle: 第01章\n---\n\n改动。\n', 'utf-8')
    const oldest = ids[0]!
    expect(() => restoreSnapshot(novelDir, oldest)).not.toThrow()
    expect(readFileSync(join(novelDir, 'chapters', '第01章.md'), 'utf-8')).toContain('第一章正文')
    // 恢复源在恢复后仍保留（未被 prune），且自动备份存在
    expect(existsSync(join(novelDir, '.snapshots', oldest))).toBe(true)
    expect(listSnapshots(novelDir).some((s) => s.note === '恢复前自动备份')).toBe(true)
  })
})
