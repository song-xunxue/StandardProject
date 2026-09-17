/**
 * 生成消息组装纯函数（v2 二批自 AiPanel.buildMessages 抽出，便于单测）
 * system = 上下文全文 + 前情提要块；user = 指令 + 正文。
 * v2-F13：改写预设指令为替换式（非叠加）——避免与默认改写指令互相矛盾
 *
 * 作者: 李文煜
 * 日期: 2026-09-17
 */

import type { ChatMessage } from '@shared/types'

export const CONTINUE_INSTRUCTION =
  '请紧接上文自然续写，保持人称、时态与文风一致，与前情提要中的情节保持连贯，直接输出正文，不要任何说明或标题。'

export const REWRITE_INSTRUCTION =
  '请改写下面选中的文字，保持情节事实不变、提升文笔，直接输出改写后的正文，不要任何说明。'

export interface GenerateMessagesInput {
  mode: 'continue' | 'rewrite'
  /** assembleContext 输出全文（system 主体） */
  contextText: string
  /** 前情提要正文（空串=不注入该块） */
  recap: string
  /** 前情提要注入头（含档位说明，recap 非空时使用） */
  recapHeader: string
  /** user 消息正文（续写=正文尾部；改写=选中文本） */
  body: string
  /** v2-F13 改写预设指令：替换默认改写指令（空白视为未选，回落默认） */
  rewriteInstruction?: string
}

/** 组装 ChatMessage[]（AiPanel 的续写/改写/三路续写共用同一口径） */
export function buildGenerateMessages(input: GenerateMessagesInput): ChatMessage[] {
  const preset = input.rewriteInstruction?.trim() ?? ''
  const instruction = input.mode === 'continue' ? CONTINUE_INSTRUCTION : preset !== '' ? preset : REWRITE_INSTRUCTION
  const systemParts = [input.contextText || '（上下文为空：请在蓝图中先组织节点与连线）']
  if (input.recap !== '') systemParts.push(`${input.recapHeader}\n${input.recap}`)
  return [
    { role: 'system', content: systemParts.join('\n\n') },
    { role: 'user', content: `${instruction}\n\n${input.body}` }
  ]
}
