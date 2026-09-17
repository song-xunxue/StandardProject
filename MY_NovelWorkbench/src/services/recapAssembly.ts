/**
 * 前情提要双档组装纯函数（v2-F9）
 * 全文层（tail）=前 N 章正文尾部各 X 字（现状行为参数化）；摘要层（summary）=前 N 章
 * 开头各 Y 字（零 LLM 依赖的降级摘要，LLM 生成摘要缓存后置单独批次）。
 * 配置存 novel.json 可选字段 recap（旧小说缺省时 recapConfigOf 兜底=现状行为）
 *
 * 作者: 李文煜
 * 日期: 2026-09-17
 */

import type { NovelMeta, RecapConfig } from '@shared/types'

/** 兜底默认配置：与 F9 之前的硬编码行为一致（前 2 章 × 尾部 800 字） */
export const DEFAULT_RECAP_CONFIG: RecapConfig = {
  mode: 'tail',
  chapters: 2,
  tailChars: 800,
  summaryChars: 300
}

/** 前情提要总字数上限：recap 不占三层预算（独立叠在 system 尾部），设独立总量兜底
 *  防「前 N 章叠加超支」——均摊到每章后与档位单章上限取小 */
export const RECAP_MAX_TOTAL_CHARS = 6000

/** 读 novel.json 的 recap 字段并兜底（缺字段/非法值回落默认，clamp 到合法区间） */
export function recapConfigOf(novel: NovelMeta | null): RecapConfig {
  const r = novel?.recap
  if (!r) return { ...DEFAULT_RECAP_CONFIG }
  const clamp = (v: unknown, def: number, max: number): number => {
    const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : def
    return Math.min(Math.max(n, 1), max)
  }
  return {
    mode: r.mode === 'summary' ? 'summary' : 'tail',
    chapters: clamp(r.chapters, DEFAULT_RECAP_CONFIG.chapters, 20),
    tailChars: clamp(r.tailChars, DEFAULT_RECAP_CONFIG.tailChars, 5000),
    summaryChars: clamp(r.summaryChars, DEFAULT_RECAP_CONFIG.summaryChars, 2000)
  }
}

/** 档位中文说明（system 注入头与 Context Viewer 状态行共用同一口径） */
export function recapModeLabel(mode: RecapConfig['mode']): string {
  return mode === 'summary' ? '开头摘要' : '正文结尾'
}

/** 前情提要取数来源（章标题 + 正文原文） */
export interface RecapSource {
  title: string
  content: string
}

/** 组装前情提要正文：按源顺序（旧→新）逐章截取拼接；空白正文章节跳过；无可用章返回空串 */
export function assembleRecap(sources: RecapSource[], config: RecapConfig): string {
  // 每章配额 = 总量上限均摊，与档位单章上限取小（下限 1 防 slice(-0) 返回空串）
  const perCap = Math.max(1, Math.floor(RECAP_MAX_TOTAL_CHARS / Math.max(1, sources.length)))
  const parts: string[] = []
  for (const s of sources) {
    const flat = s.content.replace(/\s+/g, ' ').trim()
    if (flat === '') continue
    const limit = Math.min(config.mode === 'summary' ? config.summaryChars : config.tailChars, perCap)
    // 全文层取尾部（衔接最近情节），摘要层取开头（章节开局概述）
    const piece = config.mode === 'summary' ? flat.slice(0, limit) : flat.slice(-limit)
    if (piece === '') continue
    parts.push(config.mode === 'summary' ? `【${s.title}】${piece}…` : `【${s.title}】…${piece}`)
  }
  return parts.join('\n')
}
