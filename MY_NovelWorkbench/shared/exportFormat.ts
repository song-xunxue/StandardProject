/**
 * 导出格式化纯函数（v2-F18）：TXT/MD 拼装、wikilink 清洗、Markdown 记号纯文文化
 * 格式依据：晋江实证「段落间空行分段、段首缩进由平台自动渲染」（不加全角空格）；
 * TXT 粘贴档默认无章标题行（标题进平台独立输入框）；MD 档保留双链回归 Obsidian 生态
 *
 * 作者: 李文煜
 * 日期: 2026-09-24
 */

/** 导出格式（epub/docx 走可选 Pandoc，由 md 中间件转换） */
export type ExportFormat = 'txt' | 'md' | 'epub' | 'docx'

/**
 * 导出范围：主进程 readTree 即时展开（不信任渲染层树——watcher 300ms 防抖可能滞后）。
 * volumes 为卷目录名集合；'' 表示「未分卷直下章」
 */
export type ExportScope =
  | { kind: 'all' }
  | { kind: 'volumes'; volumes: string[] }
  | { kind: 'chapters'; paths: string[] }

/** 导出选项（渲染层浮层收集；epub/docx 由服务层覆写为发布态） */
export interface ExportOptions {
  /** TXT：UTF-8 写 BOM（Windows 记事本/旧编辑器兼容） */
  bom: boolean
  /** wikilink 处理：strip=[[目标]]→目标（发布稿）；keep=原样保留（Obsidian 回流） */
  wikilinkMode: 'strip' | 'keep'
  /** 章标题行（TXT「第N章 标题」/ MD「## 标题」）——粘贴档可关（标题进平台独立输入框） */
  chapterTitles: boolean
}

/** 待拼装章节源（服务层从磁盘读出后传入） */
export interface ExportChapterSource {
  title: string
  volume?: string
  content: string
}

/** wikilink 模式（与 Wikilink.ts 的 markdownTokenizer 同口径：无管道形式，长度上限一致） */
const WIKILINK_RE = /\[\[([^\[\]\n]{1,120})\]\]/g

/** 剥除 wikilink 双括号保留内文：[[林越]] → 林越 */
export function stripWikilinks(text: string): string {
  return text.replace(WIKILINK_RE, '$1')
}

/**
 * Markdown 记号纯文文化（TXT 发布稿用）：标题前缀/强调/行内代码/链接降级为纯文本，
 * 段落结构保持（列表符号与引用符保留——网文正文罕见，剥了反而破坏作者原意）
 */
export function plainizeMarkdown(text: string): string {
  return text
    .replace(WIKILINK_RE, '$1') // [[x]] → x（发布稿必剥——平台会把双括号原样显示给读者）
    .replace(/^#{1,6}\s+/gm, '') // 标题行 → 纯文本行
    .replace(/(\*\*|__)(.+?)\1/g, '$2') // 粗体
    .replace(/(\*|_)([^*_\n]+?)\1/g, '$2') // 斜体
    .replace(/`([^`\n]+)`/g, '$1') // 行内代码
    .replace(/\[([^\[\]\n]*)\]\(([^()\n]*)\)/g, '$1') // 链接 [文字](url) → 文字
}

/** 统一换行：TXT 用 \r\n（Windows 记事本/网文后台粘贴友好），MD 用 \n */
function toCrlf(text: string): string {
  return text.replace(/\r?\n/g, '\r\n')
}

/**
 * TXT 全文拼装：可选书名行 + 卷分隔行（【卷名】）+ 章节块（标题行+空行+正文）；
 * 段间单空行（\n\n=一个空行）、块间双空行（\n\n\n）；正文经 Markdown 记号纯文文化
 */
export function assembleTxt(
  meta: { title: string },
  chapters: ExportChapterSource[],
  options: ExportOptions
): string {
  const blocks: string[] = []
  // 书名行仅在全本多章时给出（单章粘贴档直接正文）
  if (chapters.length > 1) blocks.push(`《${meta.title}》`)
  let lastVolume: string | undefined | null = null
  for (const ch of chapters) {
    if (ch.volume !== lastVolume && chapters.length > 1) {
      blocks.push(ch.volume === undefined ? '' : `【${ch.volume}】`)
      lastVolume = ch.volume
    }
    const body = options.wikilinkMode === 'strip' ? plainizeMarkdown(ch.content) : ch.content
    const paras = body.split(/\n{2,}/).map((p) => p.replace(/\n/g, ''))
    const chapterBlock = options.chapterTitles ? [ch.title, ...paras] : paras
    blocks.push(chapterBlock.join('\n\n'))
  }
  return toCrlf(blocks.join('\n\n\n') + '\r\n')
}

/**
 * MD 全文拼装：卷 `#`、章 `##`（Pandoc 按 ## 自动分章——EPUB/DOCX 直接受益）；
 * 正文原样（不清洗记号）；wikilink 按 options（默认 keep 回归 Obsidian）
 */
export function assembleMd(
  meta: { title: string },
  chapters: ExportChapterSource[],
  options: ExportOptions
): string {
  const lines: string[] = [`# ${meta.title}`, '']
  let lastVolume: string | undefined | null = null
  for (const ch of chapters) {
    if (ch.volume !== lastVolume) {
      lines.push(ch.volume === undefined ? '' : `# ${ch.volume}`, '')
      lastVolume = ch.volume
    }
    if (options.chapterTitles) lines.push(`## ${ch.title}`, '')
    const body = options.wikilinkMode === 'strip' ? stripWikilinks(ch.content) : ch.content
    lines.push(body.trimEnd(), '')
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`
}

/** 导出结果（ipc 返回渲染层提示用） */
export interface ExportResult {
  /** 落盘绝对路径 */
  path: string
  /** 导出章数 */
  chapters: number
  /** 正文去空白字数（countChars 口径，与码字统计一致） */
  chars: number
}
