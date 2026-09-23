/**
 * 拆书抽取 prompt 组装（v2-F15）：逐章实体抽取的消息构造与生成上限
 * 已知实体名单回灌（跨章对齐称谓，减少同实体多名）；每章输出上限固定 4096
 * （实体条目短，10-20 个实体×200 字摘要远小于上限；截断由 parseExtractOutput 对象级抢救兜底）
 *
 * 作者: 李文煜
 * 日期: 2026-09-23
 */

import type { ChatMessage } from '@shared/types'
import type { ExtractedEntity } from '@shared/extract'
import { EXTRACT_TYPES } from '@shared/extract'

/** 每章抽取调用的输出 token 上限 */
export const EXTRACT_MAX_TOKENS = 4096

export interface ExtractChapterInput {
  /** 章节标题（第N章 形态，注入正文标记） */
  title: string
  /** 章节正文（切窗后的单窗文本） */
  content: string
  /** 已抽取实体（跨章合并累计——回灌供模型对齐称谓，减少重复实体） */
  knownEntities: ExtractedEntity[]
}

const SYSTEM_PROMPT = `你是一名小说资料库编辑，任务是从章节正文中抽取值得建档的实体。
只输出严格 JSON，不要输出任何解释文字、markdown 围栏或注释。格式：
{"entities":[{"name":"实体名","aliases":["别名","称谓"],"type":"人物|地点|势力|物品|事件","summary":"一句话概括（出场情况/身份/作用，不超过80字）"}]}
规则：
1. type 只能是这五种：${EXTRACT_TYPES.join('、')}
2. 只抽取对后续剧情有持续意义的实体（反复出场的人物/组织、具体地点/物品/事件），忽略一次性路人
3. 同一实体的不同称谓（如「老张」「张师长」）必须合并为一个条目，其余称谓放 aliases
4. 「已知实体名单」中列出的实体如再次出场：沿用相同 name，补充新 aliases/更新 summary
5. 章节中没有值得抽取的实体时输出 {"entities":[]}`

/** 逐章抽取消息组装（system 指令 + user 已知名单与正文） */
export function extractChapterMessages(input: ExtractChapterInput): ChatMessage[] {
  const known =
    input.knownEntities.length > 0
      ? `## 已知实体名单（沿用相同 name）\n${input.knownEntities
          .map((e) => `- ${e.name}（${e.type}）${e.aliases.length > 0 ? `，别名：${e.aliases.join('、')}` : ''}`)
          .join('\n')}\n\n`
      : ''
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${known}## 章节正文：${input.title}\n\n${input.content}`
    }
  ]
}
