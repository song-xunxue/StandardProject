/**
 * 导出服务单测（v2-F18）：scope 展开与 readTree 同序 / TXT/MD 落盘（BOM/原子覆盖）/
 * 穿越与空范围拒绝 / Pandoc fake runner（成功/非零退出/元数据透传）
 * electron 的 app.getPath 以 vi.mock 注入临时目录（statsService.test 同款）
 *
 * 作者: 李文煜
 * 日期: 2026-09-24
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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
  defaultExportName,
  parsePandocVersion,
  resolveExportChapters,
  runExport,
  setPandocRunnerForTest
} from './exportService'
import type { PandocRunner } from './exportService'

let novelDir = ''
let outDir = ''

function makeNovel(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-export-'))
  mkdirSync(join(dir, 'blueprints'), { recursive: true })
  mkdirSync(join(dir, 'chapters', '第一卷'), { recursive: true })
  writeFileSync(join(dir, 'novel.json'), JSON.stringify({ id: 't', title: '导出测试书', tagLibrary: [] }), 'utf-8')
  const chapter = (name: string, dir: string, title: string, body: string): void => {
    writeFileSync(join(dir, name), `---\ntitle: ${title}\ntags: []\naliases: []\n---\n\n${body}\n`, 'utf-8')
  }
  chapter('第02章.md', join(dir, 'chapters', '第一卷'), '夜雨', '雨下了整夜，[[林越]]未眠。')
  chapter('第01章.md', join(dir, 'chapters', '第一卷'), '初入宗门', '少年推开山门。')
  chapter('第10章.md', join(dir, 'chapters'), '北上', '车马北上。') // 直下章节（未分卷）
  chapter('第03章.md', join(dir, 'chapters', '第一卷'), '山雨', '山雨欲来。')
  return dir
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'export-root-'))
  novelDir = makeNovel()
  outDir = mkdtempSync(join(tmpdir(), 'export-out-'))
  openNovel(novelDir)
})

afterEach(() => {
  setPandocRunnerForTest(null)
  rmSync(root, { recursive: true, force: true })
  rmSync(novelDir, { recursive: true, force: true })
  rmSync(outDir, { recursive: true, force: true })
})

const opts = { bom: true, wikilinkMode: 'strip' as const, chapterTitles: true }

describe('resolveExportChapters（scope 展开与排序）', () => {
  it('all：卷内「第N章」数字序 + 直下章（title 为文件名 stem——frontmatter title 在 runExport 层替换）', () => {
    const all = resolveExportChapters({ kind: 'all' })
    expect(all.map((c) => c.title)).toEqual(['第01章', '第02章', '第03章', '第10章'])
    expect(all[0]!.volume).toBe('第一卷')
    expect(all[3]!.volume).toBeUndefined()
  })

  it("volumes：按卷过滤（''=未分卷直下章）", () => {
    const direct = resolveExportChapters({ kind: 'volumes', volumes: [''] })
    expect(direct.map((c) => c.title)).toEqual(['第10章'])
    const vol1 = resolveExportChapters({ kind: 'volumes', volumes: ['第一卷'] })
    expect(vol1).toHaveLength(3)
  })

  it('chapters：按路径集过滤并保持 readTree 序', () => {
    const picked = resolveExportChapters({ kind: 'chapters', paths: ['chapters/第10章.md', 'chapters/第一卷/第01章.md'] })
    expect(picked.map((c) => c.title)).toEqual(['第01章', '第10章'])
  })
})

describe('runExport（TXT/MD 落盘）', () => {
  it('TXT 全本：BOM 头 + 章标题行 + wikilink 剥除 + 章数/字数统计', async () => {
    const target = join(outDir, 'book.txt')
    const result = await runExport(target, { format: 'txt', scope: { kind: 'all' }, options: opts, metaTitle: '导出测试书', author: '' })
    const buf = readFileSync(target)
    expect(buf.subarray(0, 3).toString('hex')).toBe('efbbbf') // UTF-8 BOM
    const text = buf.toString('utf-8')
    expect(text).toContain('《导出测试书》')
    expect(text).toContain('【第一卷】')
    expect(text).toContain('初入宗门')
    expect(text).toContain('林越未眠')
    expect(text).not.toContain('[[')
    expect(result.chapters).toBe(4)
    expect(result.chars).toBeGreaterThan(0)
  })

  it('BOM 关闭：无三字节头', async () => {
    const target = join(outDir, 'nobom.txt')
    await runExport(target, { format: 'txt', scope: { kind: 'all' }, options: { ...opts, bom: false }, metaTitle: '书', author: '' })
    expect(readFileSync(target).subarray(0, 3).toString('hex')).not.toBe('efbbbf')
  })

  it('MD：卷 #/章 ##/双链保留（keep）', async () => {
    const target = join(outDir, 'book.md')
    await runExport(target, {
      format: 'md',
      scope: { kind: 'all' },
      options: { bom: false, wikilinkMode: 'keep', chapterTitles: true },
      metaTitle: '导出测试书',
      author: ''
    })
    const text = readFileSync(target, 'utf-8')
    expect(text).toContain('# 导出测试书')
    expect(text).toContain('## 夜雨')
    expect(text).toContain('[[林越]]')
  })

  it('原子覆盖：目标已存在时整体替换，无 .tmp 残留', async () => {
    const target = join(outDir, 'again.txt')
    writeFileSync(target, '旧内容', 'utf-8')
    await runExport(target, { format: 'txt', scope: { kind: 'all' }, options: opts, metaTitle: '书', author: '' })
    expect(readFileSync(target, 'utf-8')).not.toContain('旧内容')
    expect(readdirSync(outDir).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('空范围拒绝（清晰报错）', async () => {
    await expect(
      runExport(join(outDir, 'x.txt'), { format: 'txt', scope: { kind: 'volumes', volumes: ['不存在的卷'] }, options: opts, metaTitle: '书', author: '' })
    ).rejects.toThrow('没有章节')
  })

  it('frontmatter title 为准（手改 title 后导出随 title 而非文件名）', async () => {
    const target = join(outDir, 't.txt')
    await runExport(target, { format: 'txt', scope: { kind: 'chapters', paths: ['chapters/第10章.md'] }, options: opts, metaTitle: '书', author: '' })
    expect(readFileSync(target, 'utf-8')).toContain('北上') // frontmatter title，非文件名「第10章」
  })

  it('CRLF 无 frontmatter 的外部导入章节：段落按空行分隔、无孤立 \\r（审查修复回归）', async () => {
    // Windows 编辑器典型产物：CRLF + 无 frontmatter（F15/F18 的主场景）
    writeFileSync(join(novelDir, 'chapters', '第20章.md'), '第一段。\r\n\r\n第二段。\r\n\r\n第三段。', 'utf-8')
    const target = join(outDir, 'crlf.txt')
    const result = await runExport(target, {
      format: 'txt',
      scope: { kind: 'chapters', paths: ['chapters/第20章.md'] },
      options: opts,
      metaTitle: '书',
      author: ''
    })
    expect(result.chapters).toBe(1)
    const text = readFileSync(target, 'utf-8')
    expect(text).toContain('第一段。\r\n\r\n第二段。\r\n\r\n第三段。') // 段间单空行
    expect(text).not.toMatch(/\r[^\n]/) // 无孤立 \r（原先整章坍缩单段并残留 \r）
  })
})

describe('Pandoc 链路（fake runner）', () => {
  it('版本解析：pandoc.exe 3.1.11 → 3.1.11；乱输入 → null', () => {
    expect(parsePandocVersion('pandoc.exe 3.1.11.1')).toBe('3.1.11.1')
    expect(parsePandocVersion('pandoc 2.19.2')).toBe('2.19.2')
    expect(parsePandocVersion('什么都不是')).toBeNull()
  })

  it('docx：发布态覆写（标题必开/剥双链）+ 元数据透传 + 目标文件由 runner 产出', async () => {
    const calls: Array<{ args: string[]; cwd: string }> = []
    const fake: PandocRunner = async (args, cwd) => {
      calls.push({ args, cwd })
      // 模拟 pandoc 产出目标文件（真实环境由 pandoc -o 写出）
      const outIdx = args.indexOf('-o')
      writeFileSync(args[outIdx + 1]!, 'PK fake docx', 'utf-8')
      return { code: 0, stderr: '' }
    }
    setPandocRunnerForTest(fake)
    const target = join(outDir, 'book.docx')
    const result = await runExport(target, {
      format: 'docx',
      scope: { kind: 'all' },
      options: { bom: false, wikilinkMode: 'keep', chapterTitles: false }, // 故意 keep/false——发布态应覆写
      metaTitle: '导出测试书',
      author: '李文煜'
    })
    expect(result.chapters).toBe(4)
    expect(readFileSync(target, 'utf-8')).toContain('PK fake docx')
    const flat = calls[0]!.args.join(' ')
    expect(flat).toContain('-t docx')
    expect(flat).toContain('title=导出测试书')
    expect(flat).toContain('author=李文煜')
    expect(flat).toContain('lang=zh-CN')
    // 中间件 md 已按发布态生成（标题必开+剥双链），且执行后清理
    const mdArg = calls[0]!.args[calls[0]!.args.length - 1]!
    expect(mdArg.endsWith('merged.md')).toBe(true)
    expect(readdirSync(calls[0]!.cwd)).toEqual([]) // unlinkSync 清理生效
  })

  it('非零退出：回传 stderr 首行', async () => {
    setPandocRunnerForTest(async () => ({ code: 2, stderr: 'Error: unknown option --x\nsecond line' }))
    await expect(
      runExport(join(outDir, 'bad.epub'), { format: 'epub', scope: { kind: 'all' }, options: opts, metaTitle: '书', author: '' })
    ).rejects.toThrow('Pandoc 转换失败（exit 2）：Error: unknown option --x')
  })
})

describe('defaultExportName', () => {
  it('书名清洗 + 扩展名（全角冒号 Windows 文件名合法保留）', () => {
    expect(defaultExportName('我的书：第一册', 'txt')).toBe('我的书：第一册.txt')
    expect(defaultExportName('书', 'epub')).toBe('书.epub')
  })
})
