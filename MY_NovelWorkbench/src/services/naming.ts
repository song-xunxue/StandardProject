/**
 * 命名工具（纯函数）：默认标题生成（含全局占用去重）
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M2 审查修订初版：修复 defaultTitle 不计同名基数导致第二次创建蓝图节点
 *      必然与既有文件重名的问题；占用集合须含「当前图节点标题 + blueprints/
 *      全部文件名」（文件命名空间是全局的，跨图创建同样会冲突）
 */

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

// ---- 中文序号（第N章/第N卷 自动递增） ----

const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

/** 数字 → 简体中文数字（1-99：一/十/十二/二十/二十三） */
export function numToCn(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99) return String(n)
  if (n < 10) return CN_DIGITS[n]!
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return (tens === 1 ? '' : CN_DIGITS[tens]) + '十' + (ones === 0 ? '' : CN_DIGITS[ones])
}

/** 简体中文数字 → 数字（一~九十九；不匹配返回 null） */
export function cnToNum(s: string): number | null {
  if (!/^[一二三四五六七八九十]+$/.test(s)) return null
  if (s === '十') return 10
  const idx = s.indexOf('十')
  if (idx === -1) return s.length === 1 ? CN_DIGITS.indexOf(s) : null
  const head = s.slice(0, idx)
  const tail = s.slice(idx + 1)
  const h = head === '' ? 1 : CN_DIGITS.indexOf(head)
  const o = tail === '' ? 0 : CN_DIGITS.indexOf(tail)
  if (h < 0 || o < 0) return null
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
