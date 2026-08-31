/**
 * 敏感词扫描（v2-F6）：Aho-Corasick 自动机纯函数
 * 万级词库 × 十万字正文的 O(text + words) 单遍扫描（朴素 includes 是 O(text × words)，
 * 1 万词 × 10 万字 ≈ 10^9 次子串比较不可用）；命中附带上下文片段供面板展示
 *
 * 作者: 李文煜
 * 日期: 2026-08-31
 *
 * 2026-08-31
 * 变更说明：
 *   1. v2-F6 初版：buildMatcher（goto/fail/output 三表，Map 紧凑存储）+ scanSensitiveWords；
 *      词去重/空词过滤/繁简与全半角不归一（按精确字符匹配，词库侧自行准备变体）
 */

/** 一次命中：词 + 起始索引 + 前后各 12 字符的上下文片段 */
export interface SensitiveMatch {
  word: string
  index: number
  context: string
}

/** 自动机节点：goto 边 + fail 指针 + 输出（该节点结尾的词长列表） */
interface AcNode {
  next: Map<string, number>
  fail: number
  /** 以本节点结尾的模式串长度列表（同尾多词） */
  outputs: number[]
}

/** 构建敏感词匹配器（词表去重、空词过滤；同词表重复构建结果确定性一致） */
export function buildMatcher(words: string[]): (text: string) => SensitiveMatch[] {
  const clean = [...new Set(words.filter((w) => w.length > 0))]
  const nodes: AcNode[] = [{ next: new Map(), fail: 0, outputs: [] }]

  // 1. Trie 构建（goto 表）
  for (const word of clean) {
    let cur = 0
    for (const ch of word) {
      let next = nodes[cur]!.next.get(ch)
      if (next === undefined) {
        nodes.push({ next: new Map(), fail: 0, outputs: [] })
        next = nodes.length - 1
        nodes[cur]!.next.set(ch, next)
      }
      cur = next
    }
    nodes[cur]!.outputs.push(word.length)
  }

  // 2. fail 指针（BFS；根的子节点 fail=0）
  const queue: number[] = []
  for (const [, child] of nodes[0]!.next) {
    nodes[child]!.fail = 0
    queue.push(child)
  }
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const [ch, child] of nodes[cur]!.next) {
      queue.push(child)
      // 沿父节点的 fail 链找有 ch 边的祖先
      let f = nodes[cur]!.fail
      while (f !== 0 && !nodes[f]!.next.has(ch)) f = nodes[f]!.fail
      const matched = nodes[f]!.next.get(ch)
      nodes[child]!.fail = matched !== undefined && matched !== child ? matched : 0
      // fail 节点的输出并入（后缀也是词）
      nodes[child]!.outputs.push(...nodes[nodes[child]!.fail]!.outputs)
    }
  }

  // 3. 扫描函数：单遍文本，命中收集（含重叠词——fail 输出保证短后缀词也命中）
  return (text: string): SensitiveMatch[] => {
    const matches: SensitiveMatch[] = []
    let cur = 0
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!
      while (cur !== 0 && !nodes[cur]!.next.has(ch)) cur = nodes[cur]!.fail
      const next = nodes[cur]!.next.get(ch)
      cur = next !== undefined ? next : 0
      for (const len of nodes[cur]!.outputs) {
        const start = i - len + 1
        if (start < 0) continue
        matches.push({
          word: text.slice(start, start + len),
          index: start,
          context: text.slice(Math.max(0, start - 12), Math.min(text.length, start + len + 12))
        })
      }
    }
    return matches
  }
}

/** 便捷封装：一次性扫描（词表复用场景请保留 buildMatcher 返回的匹配器） */
export function scanSensitiveWords(text: string, words: string[]): SensitiveMatch[] {
  return buildMatcher(words)(text)
}
