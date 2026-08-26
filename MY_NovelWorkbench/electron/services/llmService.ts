/**
 * LLM 流式生成服务（主进程）：OpenAI 兼容 /chat/completions 的 SSE 流式请求
 * 架构（ADR-10）：fetch + ReadableStream 解析 SSE——在主进程执行（sandbox 渲染层
 * fetch 有 CORS 限制且密钥不应出主进程），分块经 IPC_PUSH.llmChunk 推送渲染层，
 * 中断经 AbortController（llm:stop）
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M3 初版
 */

import type { BrowserWindow } from 'electron'
import { IPC_PUSH } from '../../shared/types'
import type { ChatMessage, LlmChunkPayload } from '../../shared/types'
import { extractDeltaContent, extractSSEEvents } from '../../shared/sse'
import { getProviderConfig, resolveApiKey } from './providerService'

/** 进行中的生成（requestId → AbortController） */
const active = new Map<string, AbortController>()

function send(win: BrowserWindow, payload: LlmChunkPayload): void {
  if (!win.isDestroyed()) win.webContents.send(IPC_PUSH.llmChunk, payload)
}

export interface GenerateOptions {
  requestId: string
  providerId: string
  messages: ChatMessage[]
  maxTokens?: number
}

/** 启动流式生成（fire-and-forget：结果全部经 llm:chunk 推送） */
export function startGeneration(win: BrowserWindow, opts: GenerateOptions): void {
  if (active.has(opts.requestId)) return
  const controller = new AbortController()
  active.set(opts.requestId, controller)
  void run(win, controller, opts).finally(() => active.delete(opts.requestId))
}

/** 中断生成（已结束的 requestId 静默忽略） */
export function stopGeneration(requestId: string): void {
  active.get(requestId)?.abort()
}

async function run(win: BrowserWindow, controller: AbortController, opts: GenerateOptions): Promise<void> {
  const { requestId } = opts
  const provider = getProviderConfig(opts.providerId)
  if (!provider) {
    send(win, { requestId, done: true, error: 'Provider 不存在' })
    return
  }
  const apiKey = resolveApiKey(provider)
  const url = `${provider.baseURL.replace(/\/+$/, '')}/chat/completions`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        model: provider.model,
        messages: opts.messages,
        stream: true,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {})
      }),
      signal: controller.signal
    })
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 300)
      send(win, { requestId, done: true, error: `HTTP ${res.status}${body ? `：${body}` : ''}` })
      return
    }
    if (!res.body) {
      send(win, { requestId, done: true, error: '响应无内容流' })
      return
    }
    // SSE 解析（ADR-10）：跨 chunk 半行留存缓冲，[DONE] 结束
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const { events, rest } = extractSSEEvents(buffer, decoder.decode(value, { stream: true }))
      buffer = rest
      for (const event of events) {
        const delta = extractDeltaContent(event)
        if (delta === null) {
          send(win, { requestId, done: true })
          return
        }
        if (delta !== '') send(win, { requestId, delta, done: false })
      }
    }
    // 流自然结束（个别厂商不发 [DONE]）：处理残余缓冲后正常收尾
    if (buffer.trim().startsWith('data:')) {
      const delta = extractDeltaContent(buffer.trim().slice('data:'.length).trim())
      if (delta) send(win, { requestId, delta, done: false })
    }
    send(win, { requestId, done: true })
  } catch (err) {
    if (controller.signal.aborted) {
      send(win, { requestId, done: true }) // 用户中断：不算错误
      return
    }
    console.error('[llmService] 生成失败:', err)
    send(win, { requestId, done: true, error: err instanceof Error ? err.message : String(err) })
  }
}
