/**
 * 拆书抽取纯函数（v2-F15）：LLM 输出容错解析 / 跨章去重合并 / 与既有节点匹配 /
 * 超长章节切窗——全部无环境依赖（主进程/渲染层/单测通用）
 * 哲学对齐 blueprintCodec.normalizeNode：坏条目跳过不阻断，截断丢尾不炸
 *
 * 作者: 李文煜
 * 日期: 2026-09-23
 */

import type { BlueprintNode } from './blueprint'

/** 抽取实体类型（入库时映射为同名自定义标签） */
export const EXTRACT_TYPES = ['人物', '地点', '势力', '物品', '事件'] as const
export type ExtractType = (typeof EXTRACT_TYPES)[number]

/** 类型漂移/未识别时的兜底桶（与内置标签「设定」语义对齐） */
const FALLBACK_TYPE: ExtractType = '人物'

/** 抽取实体（LLM 输出归一化后的中间形态；入库时映射 AddNodeInput）。
 *  id 为会话内稳定标识（首见时生成、跨章合并随首见实体存续）——审查修复：
 *  React 行 key 与勾选集原先用 name 派生键，行内改名会导致输入框每键失焦
 *  （key 变化=DOM 重建）与勾选状态失真 */
export interface ExtractedEntity {
  id: string
  name: string
  aliases: string[]
  type: ExtractType
  summary: string
}

/** 单章切窗上限（对齐 contextAssembly.KEYWORD_SCAN_TAIL_CHARS 量级；超长章分窗多次抽取后合并） */
export const EXTRACT_WINDOW_CHARS = 20000

const NAME_MAX = 40
const ALIAS_MAX_COUNT = 8
const ALIAS_MAX_LEN = 30
const SUMMARY_MAX = 200

/** 归一化匹配键：去全部空白 + 英文转小写（称谓大小写变体合并） */
export function entityKeyOf(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase()
}

/** 实体 id 会话内自增序号（唯一即可，无需跨会话稳定——候选未入库前仅存内存） */
let entityIdSeq = 0

/** 条目归一化：字段类型漂移纠正 + 长度钳制；无效条目（无名）返回 null */
function normalizeEntity(raw: unknown): ExtractedEntity | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.name !== 'string') return null
  const name = r.name.trim().slice(0, NAME_MAX)
  if (name === '') return null
  // aliases 容错：字符串→单元素；数组过滤非字符串；去重去自名
  let aliases: string[]
  if (typeof r.aliases === 'string') aliases = [r.aliases]
  else if (Array.isArray(r.aliases)) aliases = r.aliases.filter((a): a is string => typeof a === 'string')
  else aliases = []
  const key = entityKeyOf(name)
  aliases = [
    ...new Set(
      aliases
        .map((a) => a.trim().slice(0, ALIAS_MAX_LEN))
        .filter((a) => a !== '' && entityKeyOf(a) !== key)
    )
  ].slice(0, ALIAS_MAX_COUNT)
  const type = EXTRACT_TYPES.includes(r.type as ExtractType) ? (r.type as ExtractType) : FALLBACK_TYPE
  const summary = typeof r.summary === 'string' ? r.summary.trim().slice(0, SUMMARY_MAX) : ''
  return { id: `ent-${++entityIdSeq}`, name, aliases, type, summary }
}

/**
 * 从截断文本里抢救完整对象（max_tokens 用尽时 JSON 未闭合）：括号栈扫描
 * （字符串内的括号不计），捕获任意层级**自身闭合**的对象并逐个独立解析——
 * 实体对象通常嵌在未闭合的 {"entities":[ 外层包装内，只抓顶层会颗粒无收；
 * 外层包装闭合时也会被捕获，但其无 name 字段会在归一化时被丢弃，无副作用
 */
function salvageObjects(text: string): unknown[] {
  const out: unknown[] = []
  const starts: number[] = []
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') {
      starts.push(i)
    } else if (ch === '}') {
      const start = starts.pop()
      if (start !== undefined) {
        try {
          out.push(JSON.parse(text.slice(start, i + 1)))
        } catch {
          /* 单个对象语法坏 → 跳过该对象不阻断 */
        }
      }
    }
  }
  return out
}

/**
 * 解析 LLM 抽取输出 → 实体列表。容错链：
 * 剥 ```json 围栏与前后噪声 → 整体 JSON.parse → 失败则按对象级抢救（截断丢尾）；
 * 期望形态 {"entities":[...]} 或直接 [...]；条目级坏数据跳过
 */
export function parseExtractOutput(text: string): ExtractedEntity[] {
  const trimmed = text.trim()
  if (trimmed === '') return []
  // 剥围栏/噪声：定位首个 { 或 [ 与末个 } 或 ]
  const firstObj = trimmed.indexOf('{')
  const firstArr = trimmed.indexOf('[')
  let start = -1
  if (firstObj >= 0 && (firstArr < 0 || firstObj < firstArr)) start = firstObj
  else if (firstArr >= 0) start = firstArr
  if (start < 0) return []
  const lastObj = trimmed.lastIndexOf('}')
  const lastArr = trimmed.lastIndexOf(']')
  const end = Math.max(lastObj, lastArr)
  if (end <= start) return salvageEntities(trimmed.slice(start))
  let data: unknown
  try {
    data = JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    // 截断（末对象未闭合）→ 对象级抢救
    return salvageEntities(trimmed.slice(start))
  }
  return entitiesFrom(data)
}

/** 从已解析的 JSON 值提取实体数组（支持 {entities:[...]} 包装与裸数组） */
function entitiesFrom(data: unknown): ExtractedEntity[] {
  const list = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null && Array.isArray((data as Record<string, unknown>).entities)
      ? ((data as Record<string, unknown>).entities as unknown[])
      : []
  const out: ExtractedEntity[] = []
  for (const item of list) {
    const e = normalizeEntity(item)
    if (e) out.push(e)
  }
  return out
}

/** 截断文本的对象级抢救（salvageObjects + 归一化） */
function salvageEntities(text: string): ExtractedEntity[] {
  const out: ExtractedEntity[] = []
  for (const obj of salvageObjects(text)) {
    const e = normalizeEntity(obj)
    if (e) out.push(e)
  }
  return out
}

/**
 * 跨章/跨窗合并：name 精确等值或别名表互相命中即并（中文称谓变体靠模型对齐 +
 * 已知名单回灌；**不做单向包含合并**——「张三丰」⊇「张真人」无别名关系时保持
 * 两个实体，避免误并）。合并规则：别名并集、summary 取最长、type 取首见
 */
export function mergeExtractedEntities(lists: ExtractedEntity[][]): ExtractedEntity[] {
  const merged: ExtractedEntity[] = []
  /** name 键与别名键 → merged 下标 */
  const keyIndex = new Map<string, number>()
  const indexOfEntity = (e: ExtractedEntity): number => {
    const keys = [entityKeyOf(e.name), ...e.aliases.map(entityKeyOf)]
    for (const k of keys) {
      const hit = keyIndex.get(k)
      if (hit !== undefined) return hit
    }
    return -1
  }
  for (const list of lists) {
    for (const e of list) {
      const hit = indexOfEntity(e)
      if (hit >= 0) {
        const target = merged[hit]!
        // 别名并集（保序去重，排除已作 name 的键）
        const nameKey = entityKeyOf(target.name)
        const seen = new Set([nameKey, ...target.aliases.map(entityKeyOf)])
        for (const a of e.aliases) {
          const ak = entityKeyOf(a)
          if (!seen.has(ak)) {
            target.aliases.push(a)
            seen.add(ak)
            keyIndex.set(ak, hit)
          }
        }
        if (e.name !== target.name && !seen.has(entityKeyOf(e.name))) {
          // 同实体的另一称谓作名出现（别名命中合并）：并入别名
          target.aliases.push(e.name)
          keyIndex.set(entityKeyOf(e.name), hit)
        }
        if (e.summary.length > target.summary.length) target.summary = e.summary
        merged[hit] = target
      } else {
        merged.push({ ...e, aliases: [...e.aliases] })
        const idx = merged.length - 1
        keyIndex.set(entityKeyOf(e.name), idx)
        for (const a of e.aliases) keyIndex.set(entityKeyOf(a), idx)
      }
    }
  }
  return merged
}

/**
 * 与既有图节点匹配（标题精确等值 or 任一别名表互含）：返回 实体name键 → 节点 id。
 * 匹配到的候选在确认面板默认不勾选（防重复入库），用户可强制勾选
 */
export function matchExistingNodes(
  entities: ExtractedEntity[],
  nodes: BlueprintNode[]
): Map<string, string> {
  /** 节点侧键 → 节点 id */
  const nodeKeys = new Map<string, string>()
  for (const n of nodes) {
    if (!n.title) continue
    for (const k of [n.title, ...n.aliases]) {
      const key = entityKeyOf(k)
      if (key !== '' && !nodeKeys.has(key)) nodeKeys.set(key, n.id)
    }
  }
  const out = new Map<string, string>()
  for (const e of entities) {
    for (const k of [e.name, ...e.aliases]) {
      const hit = nodeKeys.get(entityKeyOf(k))
      if (hit !== undefined) {
        out.set(entityKeyOf(e.name), hit)
        break
      }
    }
  }
  return out
}

/**
 * 超长章节切窗：≤maxChars 原样单窗；超长按段落边界（\n\n）累积切窗；
 * 单段超窗硬切。首尾信息损失靠「已知名单回灌 + 跨窗合并」兜底
 */
export function splitChapterWindows(content: string, maxChars = EXTRACT_WINDOW_CHARS): string[] {
  if (content.length <= maxChars) return content === '' ? [] : [content]
  const paragraphs = content.split(/\n\n+/)
  const windows: string[] = []
  let buf = ''
  for (const p of paragraphs) {
    if (p.length > maxChars) {
      // 超长单段：先落当前缓冲，再硬切该段
      if (buf !== '') {
        windows.push(buf)
        buf = ''
      }
      for (let i = 0; i < p.length; i += maxChars) windows.push(p.slice(i, i + maxChars))
      continue
    }
    if (buf === '') buf = p
    else if (buf.length + p.length + 2 <= maxChars) buf += `\n\n${p}`
    else {
      windows.push(buf)
      buf = p
    }
  }
  if (buf !== '') windows.push(buf)
  return windows
}
