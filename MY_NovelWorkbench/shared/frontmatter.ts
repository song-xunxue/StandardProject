/**
 * 章节 Markdown frontmatter 编解码（纯函数，受限 YAML 子集）
 * 支持的语法（够用且可稳定往返）：
 *   - 标量：`title: 第一章`（裸值；含空格也接受，不加引号）
 *   - 内联数组：`tags: [设定, 伏笔]`（裸值逗号分隔，自动去空白）
 *   - 块数组（- 项）兼容读取，序列化统一用内联数组
 * 不支持：嵌套对象/多行字符串/引号转义——超集需求到 M3 再评估引入完整 YAML 库
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：parse/serialize 与往返一致性
 */

export interface Frontmatter {
  title?: string
  tags?: string[]
  aliases?: string[]
}

/** 解析 `---\n...\n---\n正文` 结构；无 frontmatter 时返回空 data 与全文 */
export function parseFrontmatter(raw: string): { data: Frontmatter; content: string } {
  const normalized = raw.replace(/\r\n/g, '\n')
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(normalized)
  if (!match) return { data: {}, content: raw }
  const block = match[1]
  // 闭合 --- 后的分隔空行（若有）不进入正文
  const content = normalized.slice(match[0].length).replace(/^\n/, '')
  const data: Frontmatter = {}
  let lastKey: string | null = null
  for (const line of block.split('\n')) {
    if (line.trim() === '') continue
    // 块数组项：`- 设定`
    const listItem = /^\s+-\s*(.+)$/.exec(line)
    if (listItem && lastKey) {
      const existing = (data as Record<string, unknown>)[lastKey]
      const value = listItem[1].trim()
      if (Array.isArray(existing)) existing.push(value)
      else (data as Record<string, unknown>)[lastKey] = [value]
      continue
    }
    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (!pair) continue
    const key = pair[1]
    const rest = pair[2].trim()
    lastKey = key
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
  return { data, content }
}

/** 序列化为 `---\n...\n---\n\n正文`；已知键有序输出，未知键忽略 */
export function serializeFrontmatter(data: Frontmatter, content: string): string {
  const lines: string[] = ['---']
  if (data.title !== undefined) lines.push(`title: ${data.title}`)
  if (data.tags !== undefined && data.tags.length > 0) lines.push(`tags: [${data.tags.join(', ')}]`)
  if (data.aliases !== undefined && data.aliases.length > 0)
    lines.push(`aliases: [${data.aliases.join(', ')}]`)
  lines.push('---', '')
  return `${lines.join('\n')}\n${content}`
}
