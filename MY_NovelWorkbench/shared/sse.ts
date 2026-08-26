/**
 * SSE 流解析（纯函数，ADR-10：fetch + ReadableStream 解析 SSE）
 * OpenAI 兼容 /chat/completions 的 stream 响应格式：
 *   data: {"choices":[{"delta":{"content":"..."}}]}
 *   data: [DONE]
 * 逐块喂数据，返回解析出的事件与未消费的缓冲残余（跨 chunk 的半行）
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M3 初版：extractSSEEvents / extractDeltaContent
 */

/** 将累积缓冲喂入后返回完整事件与剩余缓冲（按 \n 分行，无行尾的半行留存） */
export function extractSSEEvents(buffer: string, chunk: string): { events: string[]; rest: string } {
  const combined = buffer + chunk
  const lines = combined.split('\n')
  const rest = lines.pop() ?? '' // 最后一段无换行符 → 半行，留存到下一块
  const events: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('data:')) {
      const data = trimmed.slice('data:'.length).trim()
      if (data !== '') events.push(data)
    }
    // SSE 注释行（: keep-alive）与其他字段行忽略
  }
  return { events, rest }
}

/** 从单个 data 事件提取增量文本；[DONE] 返回 null（流结束信号） */
export function extractDeltaContent(data: string): string | null {
  if (data === '[DONE]') return null
  try {
    const parsed: unknown = JSON.parse(data)
    if (typeof parsed !== 'object' || parsed === null) return ''
    const delta = (parsed as { choices?: Array<{ delta?: { content?: unknown } }> }).choices?.[0]?.delta?.content
    return typeof delta === 'string' ? delta : ''
  } catch {
    return '' // 非 JSON 的 keep-alive 类负载：无增量
  }
}
