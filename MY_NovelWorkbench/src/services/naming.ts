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
