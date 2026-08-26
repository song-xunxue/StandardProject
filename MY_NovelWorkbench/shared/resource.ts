/**
 * 资源库模板纯函数：节点 ↔ 模板载荷互转、标签组模板构造
 * 模板落盘为 resources/*.json（ResourceTemplate），插入时重新生成 id/坐标
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M2 初版：nodeToTemplate / templateToNodeDraft / tagSetTemplate
 */

import type { BlueprintNode } from './blueprint'
import type { NodeTemplatePayload, ResourceTemplate, TagSetTemplatePayload } from './types'

/**
 * 节点 → 模板载荷：剥离 id/graphId/position/refGraphId/refTarget/content
 * （refGraphId 指向的子图属于原小说结构，复制到别处无意义；插入后可再挂子图）
 */
export function nodeToTemplate(node: BlueprintNode): NodeTemplatePayload {
  return {
    type: node.type,
    title: node.title,
    tags: [...node.tags],
    aliases: [...node.aliases],
    prompt: node.prompt,
    summary: node.summary,
    size: { ...node.size }
  }
}

/** 模板载荷 → 新节点草稿字段（不含 id/graphId/position，由调用方补齐） */
export function templateToNodeDraft(tpl: NodeTemplatePayload): Omit<BlueprintNode, 'id' | 'graphId' | 'position'> {
  return {
    type: tpl.type,
    title: tpl.title,
    tags: [...tpl.tags],
    aliases: [...tpl.aliases],
    prompt: tpl.prompt,
    summary: tpl.summary,
    size: { ...tpl.size }
  }
}

/** 节点标签组模板：保存选中节点当前标签集合 */
export function tagSetTemplate(name: string, tags: string[]): Extract<ResourceTemplate, { kind: 'tagSet' }> {
  return { kind: 'tagSet', name, payload: { tags: [...tags] } satisfies TagSetTemplatePayload }
}

/** 未知结构兜底校验（listResources 读盘时过滤坏文件用） */
export function isResourceTemplate(v: unknown): v is ResourceTemplate {
  if (typeof v !== 'object' || v === null) return false
  const t = v as Record<string, unknown>
  if (typeof t['name'] !== 'string' || t['name'] === '') return false
  if (t['kind'] === 'node') {
    const p = t['payload'] as Record<string, unknown> | undefined
    return (
      !!p &&
      (p['type'] === 'blueprint' || p['type'] === 'text' || p['type'] === 'ref') &&
      typeof p['title'] === 'string' &&
      Array.isArray(p['tags']) &&
      Array.isArray(p['aliases']) &&
      typeof p['prompt'] === 'string' &&
      typeof p['summary'] === 'string' &&
      typeof p['size'] === 'object' &&
      p['size'] !== null
    )
  }
  if (t['kind'] === 'tagSet') {
    const p = t['payload'] as Record<string, unknown> | undefined
    return !!p && Array.isArray(p['tags']) && (p['tags'] as unknown[]).every((x) => typeof x === 'string')
  }
  return false
}
