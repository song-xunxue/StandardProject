/**
 * 场景节拍→整章草稿组装纯函数（v2-F16）
 * 节拍序 = 子图内 arrow 边拓扑序（ADR-15 顺序语义），并列拍按画布 y/x 稳定排序；
 * 无 arrow 边或成环时整体回退 y/x 坐标序（addEdge 不拒环，必须容环）。
 * F1「永不注入」节拍不进 prompt（与三层组装同一铁律），由 UI 提示缺失
 *
 * 作者: 李文煜
 * 日期: 2026-09-17
 */

import type { ChatMessage } from '@shared/types'
import type { BlueprintNode, GraphData } from '@/types/blueprint'

/** 字数档位（UI 下拉与 maxTokens 推导共用） */
export const BEAT_LENGTH_PRESETS: Array<{ label: string; chars: number }> = [
  { label: '短章 ~2500 字', chars: 2500 },
  { label: '标准 ~4000 字', chars: 4000 },
  { label: '长章 ~6000 字', chars: 6000 }
]

/** 生成上限推导：中文约 1 token≈0.75-1 字，取 1.2 倍字数留裕量（上限宽松无害——按指令自然收束） */
export function maxTokensOfChars(chars: number): number {
  return Math.ceil(chars * 1.2)
}

/** 节拍规划结果 */
export interface BeatPlan {
  /** 排序后的节拍节点（不含 never 与非 text 成员） */
  beats: BlueprintNode[]
  /** 「永不注入」被过滤的节拍（UI 提示缺失用） */
  neverBeats: BlueprintNode[]
  /** true=arrow 拓扑序；false=回退画布 y/x 坐标序（无 arrow 边或成环） */
  usedTopo: boolean
  /** 子图内 ref/blueprint 成员（支撑信息，不作为节拍） */
  supporting: BlueprintNode[]
}

/** 按画布位置稳定排序（y 主序=x 行序直觉：结构模板插入的网格布局行序即节拍序） */
const byPosition = (a: BlueprintNode, b: BlueprintNode): number =>
  a.position.y - b.position.y || a.position.x - b.position.x || a.id.localeCompare(b.id)

/** 规划子图节拍：排序 + never 过滤 + 支撑成员分流 */
export function planBeats(data: GraphData, graphId: string): BeatPlan {
  const graph = data.graphs[graphId]
  const empty: BeatPlan = { beats: [], neverBeats: [], usedTopo: false, supporting: [] }
  if (!graph) return empty
  const members = graph.nodeIds.map((id) => data.nodes[id]).filter((n): n is BlueprintNode => Boolean(n))
  const textMembers = members.filter((n) => n.type === 'text')
  const neverBeats = textMembers.filter((n) => n.aiVisibility === 'never')
  const active = textMembers.filter((n) => n.aiVisibility !== 'never')
  const supporting = members.filter((n) => n.type !== 'text')

  // 子图内 arrow 边（同向去重——手工/模板可产生多条同向 arrow）
  const activeIds = new Set(active.map((n) => n.id))
  const indeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const n of active) {
    indeg.set(n.id, 0)
    adj.set(n.id, [])
  }
  let arrowCount = 0
  for (const e of Object.values(data.edges)) {
    if (e.type !== 'arrow' || e.from === e.to) continue
    if (!activeIds.has(e.from) || !activeIds.has(e.to)) continue
    if (adj.get(e.from)!.includes(e.to)) continue
    adj.get(e.from)!.push(e.to)
    indeg.set(e.to, indeg.get(e.to)! + 1)
    arrowCount++
  }

  // 无 arrow 边：直接回退坐标序
  if (arrowCount === 0) {
    return { beats: [...active].sort(byPosition), neverBeats, usedTopo: false, supporting }
  }

  // Kahn 拓扑排序：ready 池按画布位置稳定取最小（并列/分支拍按布局序展开）
  const ready = active.filter((n) => indeg.get(n.id) === 0).sort(byPosition)
  const ordered: BlueprintNode[] = []
  while (ready.length > 0) {
    const node = ready.shift()!
    ordered.push(node)
    for (const to of adj.get(node.id) ?? []) {
      const left = indeg.get(to)! - 1
      indeg.set(to, left)
      if (left === 0) {
        const target = data.nodes[to]
        if (target) {
          // 有序插入（n 小，线性扫描足够）
          let at = 0
          while (at < ready.length && byPosition(ready[at]!, target) <= 0) at++
          ready.splice(at, 0, target)
        }
      }
    }
  }
  // 成环（部分节点入度永不清零）：整体回退坐标序——容环是硬要求
  if (ordered.length !== active.length) {
    return { beats: [...active].sort(byPosition), neverBeats, usedTopo: false, supporting }
  }
  return { beats: ordered, neverBeats, usedTopo: true, supporting }
}

/** 上级设定摘要卡：自内向外各级蓝图（含子图宿主）的 title+summary */
export interface BeatAncestor {
  title: string
  summary: string
}

export interface BeatChapterInput {
  beats: Array<{ title: string; prompt: string; summary: string }>
  /** 上级蓝图链（含子图宿主节点，自内向外；可空） */
  ancestors: BeatAncestor[]
  /** 前情提要正文（可空串=不注入） */
  recap: string
  /** 目标章标题（如 第03章） */
  targetTitle: string
  /** 期望正文字数 */
  lengthChars: number
}

/**
 * 组装整章草稿的 ChatMessage：不走 assembleContext 三层预算——BFS 分层语义与
 * 「按节拍顺序讲完一章」不匹配（节拍是用户显式指定的顺序结构，全部入选）
 */
export function beatChapterMessages(input: BeatChapterInput): ChatMessage[] {
  const systemParts: string[] = []
  if (input.ancestors.length > 0) {
    const cards = input.ancestors.map((a) => `【${a.title}】${a.summary || '（无摘要）'}`).join('\n')
    systemParts.push(`【上层设定】（本章所属的各级蓝图设定，情节不得违背）\n${cards}`)
  }
  const beatBlocks = input.beats
    .map((b, i) => {
      const lines = [`第${i + 1}拍 · ${b.title}`]
      if (b.summary !== '') lines.push(b.summary)
      if (b.prompt !== '') lines.push(`（创作要求：${b.prompt}）`)
      return lines.join('\n')
    })
    .join('\n\n')
  systemParts.push(`【本章节拍设定】（按序展开的剧情节拍）\n${beatBlocks}`)

  const userParts = [
    `请为「${input.targetTitle}」写一篇完整的章节草稿：按下列节拍顺序展开剧情，逐拍自然衔接，一气呵成。`,
    input.beats.map((b, i) => `${i + 1}. ${b.title}${b.summary !== '' ? `——${b.summary}` : ''}`).join('\n')
  ]
  if (input.recap !== '') {
    userParts.push(`【前情提要】（本章之前的情节，须保持连贯）\n${input.recap}`)
  }
  userParts.push(`总字数约 ${input.lengthChars} 字。直接输出正文，不要章节标题、节拍编号、说明或任何元信息。`)

  return [
    { role: 'system', content: systemParts.join('\n\n') },
    { role: 'user', content: userParts.join('\n\n') }
  ]
}
