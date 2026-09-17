/**
 * 章节文本行级 diff 纯函数（v2-F8）：快照 vs 当前磁盘内容的对比视图用
 * 自写 LCS（中文小说一段一行，行级天然对齐段落级；单章几百行 O(n·m) 可承受），
 * 不引入 npm 依赖。输出结构化操作序列（add/del/ctx + 行号），渲染层自行映射 UI
 *
 * 作者: 李文煜
 * 日期: 2026-09-17
 */

/** 单行 diff 操作：del=旧侧独有（恢复后消失）、add=新侧独有（恢复后引入）、ctx=两侧相同 */
export interface DiffOp {
  type: 'add' | 'del' | 'ctx'
  /** 旧侧行号（1 起；add 无） */
  oldLine?: number
  /** 新侧行号（1 起；del 无） */
  newLine?: number
  text: string
}

/** LCS 计算规模上限（行数乘积）：超出走「整段替换」降级（超长章防主线程卡顿） */
const MAX_LCS_PRODUCT = 4_000_000

/** 行文本归一：CRLF→LF 后按行拆分（结尾空行不计——两侧行尾换行差异不构成变更） */
function splitLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/**
 * 行级 diff：先裁掉公共前缀/后缀（快进），中段跑 LCS。
 * 超规模中段降级为「全删+全加」（结果仍正确，只是无逐行对齐）
 */
export function diffLines(oldText: string, newText: string): DiffOp[] {
  const oldLines = splitLines(oldText)
  const newLines = splitLines(newText)

  // 公共前缀
  let start = 0
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start++
  // 公共后缀（不得越过前缀）
  let endOld = oldLines.length
  let endNew = newLines.length
  while (endOld > start && endNew > start && oldLines[endOld - 1] === newLines[endNew - 1]) {
    endOld--
    endNew--
  }

  const ops: DiffOp[] = []
  // 前缀 ctx（带旧行号；ctx 行号以旧侧为锚，渲染层只需一个行号轴）
  for (let i = 0; i < start; i++) ops.push({ type: 'ctx', oldLine: i + 1, newLine: i + 1, text: oldLines[i]! })

  const midOld = oldLines.slice(start, endOld)
  const midNew = newLines.slice(start, endNew)

  if (midOld.length * midNew.length > MAX_LCS_PRODUCT) {
    // 降级：整段替换（无逐行对齐）
    midOld.forEach((text, i) => ops.push({ type: 'del', oldLine: start + i + 1, text }))
    midNew.forEach((text, i) => ops.push({ type: 'add', newLine: start + i + 1, text }))
  } else {
    // LCS DP：dp[i][j] = midOld[i:] 与 midNew[j:] 的最长公共子序列长度
    const n = midOld.length
    const m = midNew.length
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i]![j] = midOld[i] === midNew[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
      }
    }
    // 回溯产出操作序列（del 在前 add 在后——同段内先看删除再看插入）
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (midOld[i] === midNew[j]) {
        ops.push({ type: 'ctx', oldLine: start + i + 1, newLine: start + j + 1, text: midOld[i]! })
        i++
        j++
      } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
        ops.push({ type: 'del', oldLine: start + i + 1, text: midOld[i]! })
        i++
      } else {
        ops.push({ type: 'add', newLine: start + j + 1, text: midNew[j]! })
        j++
      }
    }
    while (i < n) ops.push({ type: 'del', oldLine: start + i + 1, text: midOld[i++]! })
    while (j < m) ops.push({ type: 'add', newLine: start + j + 1, text: midNew[j++]! })
  }

  // 后缀 ctx
  for (let k = 0; k < oldLines.length - endOld; k++) {
    ops.push({ type: 'ctx', oldLine: endOld + k + 1, newLine: endNew + k + 1, text: oldLines[endOld + k]! })
  }
  return ops
}

/** 增删行统计（面板标题「+N −M 行」） */
export function diffStats(ops: DiffOp[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const op of ops) {
    if (op.type === 'add') added++
    else if (op.type === 'del') removed++
  }
  return { added, removed }
}

/** 折叠渲染单元：长 ctx 段中间收为「跳过 N 行」，首尾各留 contextWindow 行 */
export type DiffRenderItem = DiffOp | { type: 'skip'; count: number }

export function collapseContext(ops: DiffOp[], contextWindow = 3): DiffRenderItem[] {
  const out: DiffRenderItem[] = []
  let i = 0
  while (i < ops.length) {
    if (ops[i]!.type !== 'ctx') {
      out.push(ops[i]!)
      i++
      continue
    }
    // 连续 ctx 段
    let j = i
    while (j < ops.length && ops[j]!.type === 'ctx') j++
    const run = ops.slice(i, j)
    if (run.length <= contextWindow * 2) {
      out.push(...run)
    } else {
      out.push(...run.slice(0, contextWindow))
      out.push({ type: 'skip', count: run.length - contextWindow * 2 })
      out.push(...run.slice(run.length - contextWindow))
    }
    i = j
  }
  return out
}
