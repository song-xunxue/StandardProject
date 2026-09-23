/**
 * 导出服务（v2-F18，主进程）：范围展开（readTree 单一真相排序）→ 逐章读取 →
 * TXT/MD 纯函数拼装 → tmp+rename 原子落盘；EPUB/DOCX 经可选 Pandoc（md 中间件，
 * 发布态覆写：wikilink 剥除 + 章标题必开）。Pandoc 检测结果会话级缓存。
 * 依赖约束：仅 node:fs/node:path/node:child_process/node:os + 本仓 shared 纯模块
 * （保存对话框在 ipc 层——保持本服务可在无 electron 环境下单测，对齐 snapshotService 隔离声明）
 *
 * 作者: 李文煜
 * 日期: 2026-09-24
 */

import { execFile, spawn } from 'node:child_process'
import { mkdtempSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { currentNovel } from './novelService'
import { readChapter, readTree } from './fileService'
import { sanitizeFileName } from '../../shared/sanitize'
import { assembleMd, assembleTxt } from '../../shared/exportFormat'
import type { ExportChapterSource, ExportFormat, ExportOptions, ExportResult, ExportScope } from '../../shared/exportFormat'
import { countChars } from '../../shared/textMetrics'
import type { ChapterDoc, TreeNode } from '../../shared/types'

/** 从文件树摊平章节（readTree 排序=「第N章」数字序单一真相，与左栏/交换排序同源） */
function flattenTree(tree: TreeNode[]): Array<{ path: string; title: string; volume?: string }> {
  const chDir = tree[0]?.children?.find((c) => c.kind === 'dir' && c.path === 'chapters')
  const out: Array<{ path: string; title: string; volume?: string }> = []
  for (const child of chDir?.children ?? []) {
    if (child.kind === 'chapter') {
      out.push({ path: child.path, title: child.name.replace(/\.md$/, '') })
    } else if (child.kind === 'dir') {
      for (const f of child.children ?? []) {
        if (f.kind === 'chapter') {
          out.push({ path: f.path, title: f.name.replace(/\.md$/, ''), volume: child.name })
        }
      }
    }
  }
  return out
}

/** 展开 scope → 有序章节清单（volumes 中 ''=未分卷直下章） */
export function resolveExportChapters(scope: ExportScope): Array<{ path: string; title: string; volume?: string }> {
  const all = flattenTree(readTree())
  if (scope.kind === 'all') return all
  if (scope.kind === 'volumes') {
    const wanted = new Set(scope.volumes)
    return all.filter((c) => wanted.has(c.volume ?? ''))
  }
  const wanted = new Set(scope.paths)
  return all.filter((c) => wanted.has(c.path))
}

/** 导出执行载荷（ipc 层收齐保存路径后调用） */
export interface ExportRunInput {
  format: ExportFormat
  scope: ExportScope
  options: ExportOptions
  /** 书名（novel.json title） */
  metaTitle: string
  /** 作者（EPUB/DOCX 元数据；可空） */
  author: string
}

/**
 * 执行导出到指定绝对路径：逐章 readChapter（frontmatter 天然剥除——ChapterDoc.content
 * 即正文）→ 纯函数拼装 → tmp+rename 原子落盘；epub/docx 先拼 md 中间件再 Pandoc 转换。
 * async：Pandoc 子进程等待需事件循环（Atomics.wait 式同步阻塞会死锁主进程）
 */
export async function runExport(targetPath: string, input: ExportRunInput): Promise<ExportResult> {
  const novel = currentNovel()
  if (!novel) throw new Error('尚未打开小说')
  const chapters = resolveExportChapters(input.scope)
  if (chapters.length === 0) throw new Error('所选范围内没有章节')

  const sources: ExportChapterSource[] = []
  let chars = 0
  for (const ch of chapters) {
    let doc: ChapterDoc
    try {
      doc = readChapter(ch.path)
    } catch (err) {
      throw new Error(`读取 ${ch.path} 失败：${err instanceof Error ? err.message : String(err)}`)
    }
    // 章标题以 frontmatter title 为准（手改 title 后导出随 title；readChapter 内含 stem 回退）
    sources.push({ title: doc.title || ch.title, volume: ch.volume, content: doc.content })
    chars += countChars(doc.content)
  }

  if (input.format === 'epub' || input.format === 'docx') {
    // 发布态覆写：wikilink 剥除（平台会把双括号原样显示给读者；也绕开 Pandoc 2.x
    // 不识别 wikilink 的版本差异）+ 章标题必开（Pandoc 按 ## 分章）
    const md = assembleMd(
      { title: input.metaTitle },
      sources,
      { ...input.options, wikilinkMode: 'strip', chapterTitles: true }
    )
    return convertWithPandoc(targetPath, md, input, sources.length, chars)
  }

  const content =
    input.format === 'txt'
      ? assembleTxt({ title: input.metaTitle }, sources, input.options)
      : assembleMd({ title: input.metaTitle }, sources, input.options)
  const tmp = `${targetPath}.tmp`
  // TXT BOM：显式 uFEFF 转义（UTF-8 写出即 EF BB BF 三字节头，Windows 记事本兼容）
  writeFileSync(tmp, input.format === 'txt' && input.options.bom ? '\uFEFF' + content : content, 'utf-8')
  renameSync(tmp, targetPath)
  return { path: targetPath, chapters: sources.length, chars }
}

// ---- Pandoc 可选链路 ----

/** 会话级缓存（浮层打开时探测一次，本次会话不重试） */
let pandocCache: { available: boolean; version: string | null } | null = null

/** 版本解析纯函数（stdout 首行 'pandoc.exe 3.1.11' → '3.1.11'；乱输入 → null） */
export function parsePandocVersion(stdout: string): string | null {
  const m = stdout.match(/pandoc(?:\.exe)?\s+v?([\d.]+)/i)
  return m?.[1] ?? null
}

/** 探测 Pandoc（execFile 不带 shell——Windows 下 .cmd/.bat 包装会 ENOENT，走降级提示） */
export function detectPandoc(): Promise<{ available: boolean; version: string | null }> {
  if (pandocCache) return Promise.resolve(pandocCache)
  return new Promise((resolve) => {
    execFile('pandoc', ['--version'], { timeout: 5000, encoding: 'utf-8' }, (err, stdout) => {
      const result = err
        ? { available: false, version: null }
        : { available: true, version: parsePandocVersion(String(stdout)) }
      pandocCache = result
      resolve(result)
    })
  })
}

/** Pandoc 转换执行器（可注入 fake runner 供单测——CI 无 pandoc 时全走 fake） */
export type PandocRunner = (args: string[], cwd: string) => Promise<{ code: number; stderr: string }>

/** 默认执行器：spawn 参数数组（不经 shell 拼接，中文路径安全）+ 60s 超时 kill */
export const defaultPandocRunner: PandocRunner = (args, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn('pandoc', args, { cwd, windowsHide: true })
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Pandoc 转换超时（60 秒）'))
    }, 60_000)
    child.stderr?.on('data', (d) => {
      if (stderr.length < 4000) stderr += String(d)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stderr })
    })
  })

/** 测试注入点（默认 defaultPandocRunner） */
let pandocRunner: PandocRunner = defaultPandocRunner

/** 单测注入 fake runner（null 恢复默认） */
export function setPandocRunnerForTest(runner: PandocRunner | null): void {
  pandocRunner = runner ?? defaultPandocRunner
  pandocCache = null
}

/** md 中间件 → Pandoc → 目标路径；临时文件 ASCII 目录名 + unlinkSync 清理（本机 Node 非 ASCII 坑） */
async function convertWithPandoc(
  targetPath: string,
  md: string,
  input: ExportRunInput,
  chapters: number,
  chars: number
): Promise<ExportResult> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'novel-export-'))
  const mdPath = join(tmpDir, 'merged.md')
  writeFileSync(mdPath, md, 'utf-8')
  try {
    const done = await pandocRunner(
      [
        '-f',
        'markdown',
        '-t',
        input.format === 'epub' ? 'epub' : 'docx',
        '-o',
        targetPath,
        '--metadata',
        `title=${input.metaTitle}`,
        '--metadata',
        `author=${input.author}`,
        '--metadata',
        'lang=zh-CN',
        mdPath
      ],
      tmpDir
    )
    if (done.code !== 0) {
      throw new Error(`Pandoc 转换失败（exit ${done.code}）：${done.stderr.split('\n')[0] ?? ''}`)
    }
    return { path: targetPath, chapters, chars }
  } finally {
    try {
      unlinkSync(mdPath)
    } catch {
      /* 清理失败不阻断（tmp 目录由系统清理） */
    }
  }
}

/** 导出默认文件名（书名清洗 + 扩展名；sanitizeFileName 中文保留） */
export function defaultExportName(metaTitle: string, format: ExportFormat): string {
  const ext = format === 'epub' ? 'epub' : format === 'docx' ? 'docx' : format === 'txt' ? 'txt' : 'md'
  return `${sanitizeFileName(metaTitle || basename(currentNovel()?.dir ?? 'novel'))}.${ext}`
}
