/**
 * 章节 Markdown frontmatter 编解码（纯函数，受限 YAML 子集）
 * 支持的语法（够用且可稳定往返）：
 *   - 标量：`title: 第一章`（裸值；含空格也接受，不加引号）
 *   - 内联数组：`tags: [设定, 伏笔]`（裸值逗号分隔，自动去空白）
 *   - 块数组（- 项）兼容读取，序列化统一用内联数组
 *   - 未知键（date/status 等用户手写键）与一切非键值行（注释/含点号键/缩进续行）以原样行
 *     保留（extraLines），序列化时回写——不解析不重排，应用改写文件后用户手写内容不丢失（M4-B 修复）
 * 不支持：嵌套对象/多行字符串/引号转义——超集需求到 M3 再评估引入完整 YAML 库
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-28
 * 变更说明：
 *   1. M1 初版：parse/serialize 与往返一致性
 *   2. M4-B：未知键原样行保留（extraLines）——此前 serialize 丢弃未知键，
 *      用户手写的额外 YAML 键（date/status 等）在应用首次保存后即静默丢失
 */

export interface Frontmatter {
  title?: string
  tags?: string[]
  aliases?: string[]
  /** 未知键的原样行（含其块数组项，保持出现顺序）；序列化时在已知键之后原样回写 */
  extraLines?: string[]
}

/** 应用自管键（其余键一律走原样行保留） */
const KNOWN_KEYS = new Set(['title', 'tags', 'aliases'])

/** 解析 `---\n...\n---\n正文` 结构；无 frontmatter 时返回空 data 与全文 */
export function parseFrontmatter(raw: string): { data: Frontmatter; content: string } {
  const normalized = raw.replace(/\r\n/g, '\n')
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(normalized)
  if (!match) return { data: {}, content: raw }
  const block = match[1]
  // 闭合 --- 后的分隔空行（若有）不进入正文
  const content = normalized.slice(match[0].length).replace(/^\n/, '')
  const data: Frontmatter = {}
  let extraLines: string[] | undefined
  let lastKey: string | null = null
  for (const line of block.split('\n')) {
    if (line.trim() === '') continue
    // 块数组项：`- 设定`（未知键下的块数组项整行走原样行保留，不拆解）
    const listItem = /^\s+-\s*(.+)$/.exec(line)
    if (listItem && lastKey) {
      if (!KNOWN_KEYS.has(lastKey)) {
        ;(extraLines ??= []).push(line)
        continue
      }
      const existing = (data as Record<string, unknown>)[lastKey]
      const value = listItem[1].trim()
      if (Array.isArray(existing)) existing.push(value)
      else (data as Record<string, unknown>)[lastKey] = [value]
      continue
    }
    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (!pair) {
      // 非键值行（注释 `# x`、含点号的键 `some.key: v`、嵌套缩进续行等）原样保留，
      // 不在应用保存时静默丢弃（二次 parse 同样不匹配 pair 会再次保留，往返稳定）
      ;(extraLines ??= []).push(line)
      continue
    }
    const key = pair[1]
    const rest = pair[2].trim()
    lastKey = key
    if (!KNOWN_KEYS.has(key)) {
      // 未知键：整行原样保留（含空值行 `date:`）
      ;(extraLines ??= []).push(line)
      continue
    }
    if (rest === '') continue
    const inlineArray = /^\[(.*)\]$/.exec(rest)
    if (inlineArray) {
      const items = inlineArray[1]
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter((s) => s !== '')
      ;(data as Record<string, unknown>)[key] = items
    } else {
      ;(data as Record<string, unknown>)[key] = rest.replace(/^['"]|['"]$/g, '')
    }
  }
  if (extraLines) data.extraLines = extraLines
  return { data, content }
}

/** 序列化为 `---\n...\n---\n\n正文`；已知键有序输出，未知键原样行附后（顺序可能重排：已知键提前） */
export function serializeFrontmatter(data: Frontmatter, content: string): string {
  const lines: string[] = ['---']
  if (data.title !== undefined) lines.push(`title: ${data.title}`)
  if (data.tags !== undefined && data.tags.length > 0) lines.push(`tags: [${data.tags.join(', ')}]`)
  if (data.aliases !== undefined && data.aliases.length > 0)
    lines.push(`aliases: [${data.aliases.join(', ')}]`)
  if (data.extraLines && data.extraLines.length > 0) lines.push(...data.extraLines)
  lines.push('---', '')
  return `${lines.join('\n')}\n${content}`
}
