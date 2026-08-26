/**
 * SSE 流解析单测（M3，ADR-10）
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M3 初版：跨 chunk 半行缓冲 / [DONE] / 非 JSON 负载 / 注释行忽略
 */

import { describe, expect, it } from 'vitest'
import { extractDeltaContent, extractSSEEvents } from './sse'

describe('extractSSEEvents', () => {
  it('完整行解析出 data 事件；无行尾的半行留作缓冲', () => {
    const { events, rest } = extractSSEEvents('', 'data: {"a":1}\ndata: {"b"')
    expect(events).toEqual(['{"a":1}'])
    expect(rest).toBe('data: {"b"')
  })

  it('缓冲 + 新块拼接后跨 chunk 事件完整还原', () => {
    const r1 = extractSSEEvents('', 'data: {"choices":[{"delta":{"content":"少年')
    const r2 = extractSSEEvents(r1.rest, '"}}]\n')
    expect(r2.events).toEqual(['{"choices":[{"delta":{"content":"少年"}}]'])
    expect(r2.rest).toBe('')
  })

  it('注释行与空行被忽略', () => {
    const { events } = extractSSEEvents('', ': keep-alive\n\ndata: x\n')
    expect(events).toEqual(['x'])
  })

  it('CRLF 行尾兼容', () => {
    const { events } = extractSSEEvents('', 'data: a\r\ndata: b\r\n')
    expect(events).toEqual(['a', 'b'])
  })
})

describe('extractDeltaContent', () => {
  it('解析 OpenAI 兼容 delta 内容', () => {
    expect(extractDeltaContent('{"choices":[{"delta":{"content":"剑鸣"}}]}')).toBe('剑鸣')
  })

  it('[DONE] 返回 null（流结束信号）', () => {
    expect(extractDeltaContent('[DONE]')).toBeNull()
  })

  it('无 content 字段 / 非 JSON / keep-alive 均返回空串', () => {
    expect(extractDeltaContent('{"choices":[{"delta":{}}]}')).toBe('')
    expect(extractDeltaContent('{"choices":[]}')).toBe('')
    expect(extractDeltaContent('not-json')).toBe('')
  })
})
