/**
 * 索引服务单测（M5）：syncIndex 增量校对（基线零重读/变更重索引/删除清理）+
 * 长章节头部读取（frontmatter 在文件头，>64KB 正文不整读；超长 frontmatter 回退全文）
 * electron 的 app.getPath 以 vi.mock 注入临时目录（环境隔离，不触碰真实 userData）
 *
 * 作者: 李文煜
 * 日期: 2026-08-28
 *
 * 2026-08-28
 * 变更说明：
 *   1. M5 初版
 *
 * 2026-08-31
 * 变更说明：
 *   1. v2-P1 内容哈希回归：touch 不重索引 / 等长替换必重索引 / 数据随重解析更新 /
 *      旧库无 hash 列迁移可用
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let root = ''
vi.mock('electron', () => ({
  app: {
    // getPath('userData') → 临时根目录（recent.json 等应用级文件落于此）
    getPath: (_name: string) => root
  }
}))

import { openNovel } from './novelService'
import { closeIndex, rebuildIndex, syncIndex } from './indexService'
import Database from 'better-sqlite3'

/** 直读索引库验证 tags 落库内容（WAL 支持多连接并发读） */
function chapterTagsFromDb(): string[] {
  const db = new Database(join(novelDir, '.index', 'index.db'), { readonly: true })
  try {
    const row = db.prepare("SELECT tags FROM nodes WHERE type = 'chapter'").get() as { tags: string }
    return JSON.parse(row.tags)
  } finally {
    db.close()
  }
}

/** 每个用例独立的小说目录（novel.json 最小合法结构） */
let novelDir = ''
function makeNovel(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-index-'))
  mkdirSync(join(dir, 'blueprints'), { recursive: true })
  mkdirSync(join(dir, 'chapters'), { recursive: true })
  writeFileSync(join(dir, 'novel.json'), JSON.stringify({ id: 'test-id', title: '测试小说', tagLibrary: [] }), 'utf-8')
  return dir
}

/** 最小合法蓝图文件（2 节点 1 边） */
function writeBlueprint(): void {
  writeFileSync(
    join(novelDir, 'blueprints', '主蓝图.blueprint.json'),
    JSON.stringify({
      id: 'g-1',
      title: '主蓝图',
      nodes: [
        { id: 'n-1', type: 'text', title: '节点一', tags: ['设定'], position: { x: 0, y: 0 }, size: { width: 160, height: 50 } },
        { id: 'n-2', type: 'text', title: '节点二', tags: [], position: { x: 300, y: 0 }, size: { width: 160, height: 50 } }
      ],
      edges: [{ id: 'e-1', from: 'n-1', to: 'n-2', type: 'arrow' }]
    }),
    'utf-8'
  )
}

function writeChapter(name: string, body: string): void {
  writeFileSync(
    join(novelDir, 'chapters', name),
    `---\ntitle: ${name.replace('.md', '')}\ntags: [伏笔]\naliases: []\n---\n\n${body}\n`,
    'utf-8'
  )
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'novel-idxroot-'))
  novelDir = makeNovel()
  openNovel(novelDir)
})

afterEach(() => {
  closeIndex()
  rmSync(root, { recursive: true, force: true })
  rmSync(novelDir, { recursive: true, force: true })
})

describe('syncIndex 增量校对（M5 冷启动路径）', () => {
  it('首次建立基线：全部文件入索引，changed 计数与文件数一致', () => {
    writeBlueprint()
    writeChapter('第01章.md', '第一章正文内容。')
    const stats = syncIndex()
    // 蓝图 2 节点 + 章节 1 节点
    expect(stats.nodes).toBe(3)
    expect(stats.edges).toBe(1)
    expect(stats.changed).toBe(2)
    expect(stats.removed).toBe(0)
  })

  it('第二次校对零重读：mtime+size 未变，changed=0（原全量 rebuildIndex 的回归对照）', () => {
    writeBlueprint()
    writeChapter('第01章.md', '第一章正文内容。')
    syncIndex()
    const again = syncIndex()
    expect(again.changed).toBe(0)
    expect(again.removed).toBe(0)
    expect(again.nodes).toBe(3)
  })

  it('文件内容变更（size 变化）触发增量重索引', () => {
    writeChapter('第01章.md', '第一章正文内容。')
    syncIndex()
    writeChapter('第01章.md', '第一章正文内容大幅扩写之后的版本，字数明显增加。')
    const stats = syncIndex()
    expect(stats.changed).toBe(1)
    expect(stats.nodes).toBe(1)
  })

  it('外部删除文件后校对清理残留（节点与边一并删除）', () => {
    writeBlueprint()
    writeChapter('第01章.md', '第一章正文内容。')
    syncIndex()
    unlinkSync(join(novelDir, 'blueprints', '主蓝图.blueprint.json'))
    const stats = syncIndex()
    expect(stats.removed).toBe(1)
    // 蓝图 2 节点 + 其 1 条边被清理，仅剩章节节点
    expect(stats.nodes).toBe(1)
    expect(stats.edges).toBe(0)
  })
})

describe('内容哈希变更检测（v2-P1）', () => {
  it('touch 场景：mtime 变但内容未变 → 只刷基线不重解析（changed=0）', () => {
    writeChapter('第01章.md', '第一章正文内容。')
    syncIndex()
    // 重写同内容：mtime 变化、size 与内容不变（旧 mtime+size 判定会误判为需重索引）
    writeChapter('第01章.md', '第一章正文内容。')
    const stats = syncIndex()
    expect(stats.changed).toBe(0)
    expect(stats.nodes).toBe(1)
  })

  it('等长内容替换（mtime 与 size 均变但真实变更）→ 正常重索引并更新数据', () => {
    writeChapter('第01章.md', '第一章正文：甲甲甲。')
    syncIndex()
    // 等长替换 '甲'→'乙'：内容真变，必须重解析
    writeChapter('第01章.md', '第一章正文：乙乙乙。')
    const stats = syncIndex()
    expect(stats.changed).toBe(1)
  })

  it('内容变更后 frontmatter 数据随之更新（重解析确实发生）', () => {
    writeChapter('第01章.md', '第一章正文内容。')
    syncIndex()
    expect(chapterTagsFromDb()).toEqual(['伏笔'])
    // 重写：tags 改为「大纲」（内容与哈希变化）
    writeFileSync(
      join(novelDir, 'chapters', '第01章.md'),
      '---\ntitle: 第01章\ntags: [大纲]\naliases: []\n---\n\n第一章正文内容。\n',
      'utf-8'
    )
    syncIndex()
    expect(chapterTagsFromDb()).toEqual(['大纲'])
  })

  it('旧库迁移：无 hash 列的既有 file_state 表可正常补列并回填哈希基线', () => {
    // 模拟旧库：手动删列不可行，改为直接建旧结构表再跑 syncIndex（openDb 的 ALTER 补列）
    writeChapter('第01章.md', '第一章正文内容。')
    syncIndex()
    closeIndex()
    // 以旧 schema 重建 file_state（丢 hash 列），模拟 v2-P1 之前的库
    const db = new Database(join(novelDir, '.index', 'index.db'))
    db.exec('CREATE TABLE file_state_old (path TEXT PRIMARY KEY, mtime INTEGER NOT NULL, size INTEGER NOT NULL)')
    db.exec("INSERT INTO file_state_old SELECT path, mtime, size FROM file_state")
    db.exec('DROP TABLE file_state; ALTER TABLE file_state_old RENAME TO file_state')
    db.close()
    // 重新打开（触发 ALTER 补列）：哈希基线缺失 → 强制重建一次回填（changed=1，一次性成本）
    const stats = syncIndex()
    expect(stats.changed).toBe(1)
    expect(stats.nodes).toBe(1)
    // 基线建立后：同内容 touch 借哈希跳过
    writeChapter('第01章.md', '第一章正文内容。')
    expect(syncIndex().changed).toBe(0)
  })
})

describe('indexChapter 头部读取（M5 长章节优化）', () => {
  it('超过 64KB 的长章节正确解析 frontmatter（只读头部路径）', () => {
    // 20 万字节正文（约 6.7 万汉字），远超 64KB 头部上限
    const body = '长街灯火明明灭灭。'.repeat(20000)
    writeChapter('长章.md', body)
    const stats = syncIndex()
    expect(stats.nodes).toBe(1)
    // tags 正确落库，证明 frontmatter 从头部 64KB 正确解析
    expect(chapterTagsFromDb()).toEqual(['伏笔'])
  })

  it('frontmatter 超过 64KB（病态超长）时回退全文读仍正确解析', () => {
    // 构造 >64KB 的 frontmatter：extraLines 风格的注释行堆叠（parseFrontmatter 原样保留不报错）
    const hugeComment = '# ' + '注'.repeat(200)
    const extraLines = Array.from({ length: 400 }, (_, i) => `${hugeComment} ${i}`).join('\n')
    writeFileSync(
      join(novelDir, 'chapters', '超长元信息.md'),
      `---\ntitle: 超长元信息\ntags: [设定]\n${extraLines}\n---\n\n正文。\n`,
      'utf-8'
    )
    const stats = syncIndex()
    expect(stats.nodes).toBe(1)
  })
})

describe('rebuildIndex 全量重建（保留兜底语义）', () => {
  it('清空后按文件树重建，与 syncIndex 结果一致', () => {
    writeBlueprint()
    writeChapter('第01章.md', '第一章正文内容。')
    syncIndex()
    const rebuilt = rebuildIndex()
    expect(rebuilt.nodes).toBe(3)
    expect(rebuilt.edges).toBe(1)
    // 重建后基线同样生效：紧随的增量校对零重读
    expect(syncIndex().changed).toBe(0)
  })
})
