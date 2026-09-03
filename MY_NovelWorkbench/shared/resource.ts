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
 *
 * 2026-09-01
 * 变更说明：
 *   1. v2-F5：结构模板（节点序列+索引连线）——isResourceTemplate 校验扩展、
 *      graphToStructureTemplate（当前图保存为骨架）、structureTemplate 校验归一化
 */

import type { BlueprintNode, EdgeType, GraphData } from './blueprint'
import type { NodeTemplatePayload, ResourceTemplate, StructureTemplatePayload, TagSetTemplatePayload } from './types'

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
  if (t['kind'] === 'structure') {
    // v2-F5：结构模板——节点序列非空、每项基本字段合法、连线索引在界内且类型合法
    const p = t['payload'] as Record<string, unknown> | undefined
    if (!p || !Array.isArray(p['nodes']) || (p['nodes'] as unknown[]).length === 0) return false
    const nodes = p['nodes'] as Array<Record<string, unknown>>
    const typeOk = nodes.every((n) => n['type'] === 'blueprint' || n['type'] === 'text' || n['type'] === 'ref')
    const fieldOk = nodes.every(
      (n) => typeof n['title'] === 'string' && n['title'] !== '' && Array.isArray(n['tags'])
    )
    if (!typeOk || !fieldOk) return false
    const edges = (p['edges'] ?? []) as Array<Record<string, unknown>>
    const edgeOk = edges.every(
      (e) =>
        typeof e['from'] === 'number' &&
        typeof e['to'] === 'number' &&
        e['from'] >= 0 &&
        e['from'] < nodes.length &&
        e['to'] >= 0 &&
        e['to'] < nodes.length &&
        (e['type'] === 'arrow' || e['type'] === 'line' || e['type'] === 'dashed')
    )
    return edgeOk
  }
  return false
}

/** v2-F5：结构模板校验归一化（损坏字段静默修正：prompt/summary 缺省空串、aliases 过滤、
 *  aiVisibility 非法回落 undefined、空 title 回落占位名、edges 剔除越界与非法类型） */
export function normalizeStructureTemplate(t: StructureTemplatePayload): StructureTemplatePayload {
  return {
    nodes: t.nodes.map((n) => ({
      type: n.type,
      title: typeof n.title === 'string' && n.title !== '' ? n.title : '未命名节点',
      tags: Array.isArray(n.tags) ? n.tags.filter((x) => typeof x === 'string') : [],
      prompt: typeof n.prompt === 'string' ? n.prompt : '',
      summary: typeof n.summary === 'string' ? n.summary : '',
      aliases: Array.isArray(n.aliases) ? n.aliases.filter((x) => typeof x === 'string') : [],
      aiVisibility: n.aiVisibility === 'always' || n.aiVisibility === 'never' ? n.aiVisibility : undefined
    })),
    edges: Array.isArray(t.edges)
      ? t.edges.filter(
          (e) =>
            Number.isInteger(e.from) && e.from >= 0 && e.from < t.nodes.length &&
            Number.isInteger(e.to) && e.to >= 0 && e.to < t.nodes.length &&
            (e.type === 'arrow' || e.type === 'line' || e.type === 'dashed')
        ).map((e) => ({ from: e.from, to: e.to, type: e.type as EdgeType }))
      : []
  }
}

/** v2-F5：当前图 → 结构模板载荷（节点按 nodeIds 顺序，边映射为索引；跨图边与端点不在本图的边跳过） */
export function graphToStructureTemplate(data: GraphData, graphId: string): StructureTemplatePayload | null {
  const graph = data.graphs[graphId]
  if (!graph) return null
  const members = graph.nodeIds.map((id) => data.nodes[id]).filter((n): n is BlueprintNode => Boolean(n))
  if (members.length === 0) return null
  const indexOf = new Map(members.map((n, i) => [n.id, i]))
  const memberSet = new Set(members.map((n) => n.id))
  const edges: StructureTemplatePayload['edges'] = []
  for (const e of Object.values(data.edges)) {
    if (!memberSet.has(e.from) || !memberSet.has(e.to)) continue // 跨图边不入骨架（插入端点须在同图）
    const from = indexOf.get(e.from)!
    const to = indexOf.get(e.to)!
    // 同方向重复边去重（保第一条）
    if (edges.some((x) => x.from === from && x.to === to)) continue
    edges.push({ from, to, type: e.type })
  }
  return {
    nodes: members.map((n) => ({
      type: n.type,
      title: n.title,
      tags: [...n.tags],
      prompt: n.prompt,
      summary: n.summary,
      aliases: [...n.aliases],
      aiVisibility: n.aiVisibility
    })),
    edges
  }
}
