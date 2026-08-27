/**
 * 命名工具（纯函数，主/渲染进程共用）：默认标题去重 + 中文序号（第N卷/第N章）
 * 排序：chapterNameCompare 按「第N章」数字序比较（zh-CN localeCompare 是拼音序，
 * 会把 第七章排在第一章前——前情提要/左栏顺序/建章序号都依赖数字序）
 *
 * 作者: 李文煜
 * 日期: 2026-08-27
 *
 * 2026-08-27
 * 变更说明：
 *   1. 全量审查修订：自 src/services/naming.ts 上移至 shared（readTree 主进程排序需要）；
 *      cnToNum 兼容阿拉伯数字（>99 章自动命名回绕不撞车）并拒绝畸形中文数字；
 *      新增 numberedKeyOf / chapterNameCompare
 */

const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

/**
 * 生成不与占用集合冲突的默认标题：base → 「base 2」→ 「base 3」…
 * （同名与带序号变体都计入占用；序号连续递增，不留空洞）
 */
export function defaultTitle(base: string, usedNames: Iterable<string>): string {
  const used = new Set(usedNames)
  let n = 1
  while (used.has(n === 1 ? base : `${base} ${n}`)) n++
  return n === 1 ? base : `${base} ${n}`
}

/** 数字 → 简体中文数字（1-99；超出回退阿拉伯数字字符串，配合 cnToNum 的阿拉伯兼容不撞车） */
export function numToCn(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99) return String(n)
  if (n < 10) return CN_DIGITS[n]!
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return (tens === 1 ? '' : CN_DIGITS[tens]) + '十' + (ones === 0 ? '' : CN_DIGITS[ones])
}

/**
 * 序号解析：简体中文数字（一~九十九）或阿拉伯数字（1 章以上）→ 数字
 * 拒绝畸形组合（'十十'/'二十十'/'零零' 等返回 null，不静默误解析）
 */
export function cnToNum(s: string): number | null {
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    return n > 0 ? n : null
  }
  if (/^[一二三四五六七八九十]+$/.test(s) !== true) return null
  if (s === '十') return 10
  if (s.length === 1) return CN_DIGITS.indexOf(s) >= 1 ? CN_DIGITS.indexOf(s) : null
  // 复合形态仅允许 X十 / X十Y（一~九十九），杜绝 '十十'/'二十十' 之类误读
  const m = /^([一二三四五六七八九])?十([一二三四五六七八九])?$/.exec(s)
  if (!m) return null
  const h = m[1] ? CN_DIGITS.indexOf(m[1]) : 1
  const o = m[2] ? CN_DIGITS.indexOf(m[2]) : 0
  return h * 10 + o
}

/**
 * 「第N卷/第N章」自动递增：在同级现有名中取最大序号 +1（无序号时从一开始）
 * existingName = 同级现有显示名（已去扩展名），unit = '卷' | '章'
 */
export function nextNumberedName(existingNames: string[], unit: '卷' | '章'): string {
  const re = new RegExp(`^第(.+?)${unit}$`)
  let max = 0
  for (const name of existingNames) {
    const m = re.exec(name.trim())
    if (!m) continue
    const n = cnToNum(m[1]!)
    if (n !== null) max = Math.max(max, n)
  }
  return `第${numToCn(max + 1)}${unit}`
}

/** 从文件名/显示名解析「第N卷/章/部」序号键（无法解析返回 null） */
export function numberedKeyOf(name: string): { n: number; unit: string } | null {
  const m = /^第(.+?)([卷章部集])$/.exec(name.trim())
  if (!m) return null
  const n = cnToNum(m[1]!)
  return n === null ? null : { n, unit: m[2]! }
}

/**
 * 章节名排序：同为可解析的「第N·同单位」按数字序；带序号者排在无序号者前；
 * 其余回退 zh-CN 字典序（序章/番外等自由命名稳定靠后）
 */
export function chapterNameCompare(a: string, b: string): number {
  const ka = numberedKeyOf(a)
  const kb = numberedKeyOf(b)
  if (ka && kb && ka.unit === kb.unit) return ka.n - kb.n
  if (ka && (!kb || ka.unit !== kb.unit)) return -1
  if (!ka && kb) return 1
  return a.localeCompare(b, 'zh-CN')
}
