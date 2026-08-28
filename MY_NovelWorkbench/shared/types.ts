/**
 * 跨进程共享类型与 IPC 契约（主进程与渲染进程共同引用，纯类型无副作用）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：小说元信息/文件树/章节文档/最近列表 + fs 通道 IPC 契约
 *   2. M2：新增 novel.json 元信息读写与资源库通道；节点补充 refTarget 字段
 *   3. M3：新增 AI Provider 配置与 LLM 流式生成契约（provider:* / llm:* 通道 + llm:chunk 推送）
 */

/** 小说元信息（novel.json） */
export interface NovelMeta {
  id: string
  title: string
  /** 小说目录绝对路径（运行时填充，不落盘到 novel.json） */
  dir?: string
  createdAt: string
  /** 标签库：内置 + 自定义 */
  tagLibrary: Array<{ name: string; color: string; builtin: boolean }>
}

/** 最近打开记录（userData/recent.json，仅主进程读写） */
export interface RecentNovel {
  dir: string
  title: string
  openedAt: string
}

/** 文件树节点 */
export interface TreeNode {
  name: string
  /** 相对小说目录的路径 */
  path: string
  kind: 'dir' | 'blueprint' | 'chapter' | 'meta'
  children?: TreeNode[]
}

/** 章节文档（chapters/*.md 解析结果） */
export interface ChapterDoc {
  path: string
  title: string
  tags: string[]
  aliases: string[]
  /** frontmatter 未知键的原样行（date/status 等用户手写键，保存时原样回写不丢失） */
  extraLines?: string[]
  content: string
}

/** IPC 通道契约：fs 通道（渲染 → 主，ipcRenderer.invoke） */
export const IPC = {
  pickDirectory: 'dialog:pickDirectory', // () => string | null（用户取消返回 null）
  createNovel: 'fs:createNovel', // (payload: { dir, title }) => NovelMeta
  openNovel: 'fs:openNovel', // (payload: { dir }) => NovelMeta
  recentNovels: 'fs:recentNovels', // () => RecentNovel[]
  readTree: 'fs:readTree', // () => TreeNode[]
  readBlueprint: 'fs:readBlueprint', // (payload: { path }) => BlueprintFile
  saveBlueprint: 'fs:saveBlueprint', // (payload: { path, file: BlueprintFile }) => void
  readChapter: 'fs:readChapter', // (payload: { path }) => ChapterDoc
  saveChapter: 'fs:saveChapter', // (payload: { path, doc: ChapterDoc }) => void
  createFile: 'fs:createFile', // (payload: { kind, title, volume? }) => { path }（章节可指定卷目录）
  createVolume: 'fs:createVolume', // (payload: { name }) => { path }（chapters 下建卷目录）
  renameFile: 'fs:renameFile', // (payload: { path, title }) => { path }
  exchangeFiles: 'fs:exchangeFiles', // (payload: { pathA, pathB }) => void（文件名互换=内容位置对调，用于章节排序）
  deleteFile: 'fs:deleteFile', // (payload: { path }) => void
  rebuildIndex: 'fs:rebuildIndex', // () => { nodes: number; edges: number }
  indexStats: 'fs:indexStats', // () => { nodes: number; edges: number; lastBuiltAt: string | null }
  readMeta: 'fs:readMeta', // () => NovelMeta（当前小说的 novel.json）
  saveMeta: 'fs:saveMeta', // (payload: { meta }) => NovelMeta（标签库等元信息更新）
  // M4-B 起资源库为全局目录（userData/resources），跨小说共享，不依赖打开小说
  listResources: 'fs:listResources', // () => Array<{ path, template }>（path=相对全局资源目录的文件名）
  saveResource: 'fs:saveResource', // (payload: { template }) => { path }（全局资源目录内新建/覆盖）
  deleteResource: 'fs:deleteResource', // (payload: { path }) => void（path 为 listResources 返回的相对路径）

  // M3：AI Provider（ADR-9/16）
  providerList: 'provider:list', // () => ProviderInfo[]
  providerSave: 'provider:save', // (payload: { config: Omit<ProviderConfig,'apiKeyEnc'>, apiKey?: string }) => ProviderInfo（apiKey 明文仅经此通道进主进程加密）
  providerDelete: 'provider:delete', // (payload: { id }) => void
  providerTest: 'provider:test', // (payload: { id }) => { ok: boolean; message: string }

  // M3：LLM 流式生成（主进程 fetch SSE，ADR-10；chunk 经 IPC_PUSH.llmChunk 推送）
  llmGenerate: 'llm:generate', // (payload: { providerId, requestId, messages, maxTokens? }) => void
  llmStop: 'llm:stop' // (payload: { requestId }) => void
} as const

/** 主进程 → 渲染进程推送（webContents.send） */
export const IPC_PUSH = {
  /** 小说目录内文件变化（防抖后）：负载 { tree, changed }（changed=本窗口内变更的相对路径清单） */
  novelChanged: 'novel:changed',
  /** LLM 流式分块：负载 { requestId, delta?, done, error? } */
  llmChunk: 'llm:chunk'
} as const

/** novel:changed 推送负载 */
export interface NovelChangedPayload {
  tree: TreeNode[]
  /** 防抖窗口内累积变更的相对路径（渲染层据此增量合并，仅重读变更蓝图） */
  changed: string[]
}

/** llm:chunk 推送负载 */
export interface LlmChunkPayload {
  requestId: string
  /** 本次增量文本（done 时可缺省） */
  delta?: string
  done: boolean
  error?: string
}

/** 蓝图文件落盘结构（.blueprint.json）：节点不带 graphId（由所属文件隐含） */
export interface BlueprintFile {
  id: string
  title: string
  nodes: Array<Omit<BlueprintFileNode, 'graphId'>>
  edges: Array<{
    id: string
    from: string
    to: string
    type: 'arrow' | 'line' | 'dashed'
    label?: string
  }>
}

/** 蓝图文件节点（graphId 在解析时回填为所属文件 id） */
export interface BlueprintFileNode {
  id: string
  type: 'blueprint' | 'text' | 'ref'
  title: string
  graphId: string
  refGraphId?: string
  refTarget?: string
  tags: string[]
  aliases: string[]
  prompt: string
  summary: string
  content?: string
  position: { x: number; y: number }
  size: { width: number; height: number }
}

/**
 * 资源库模板（userData/resources/*.json，M4-B 起全局目录跨小说共享；旧小说目录内 resources/ 打开时自动迁移）
 * - node：节点模板（保存时剥离 id/graphId/position/refGraphId/content，插入时重新生成）
 * - tagSet：标签组模板（一键为选中节点贴一组标签）
 */
export type ResourceTemplate =
  | { kind: 'node'; name: string; payload: NodeTemplatePayload }
  | { kind: 'tagSet'; name: string; payload: TagSetTemplatePayload }

/** 节点模板载荷：可安全复制到任意画布的节点字段 */
export interface NodeTemplatePayload {
  type: 'blueprint' | 'text' | 'ref'
  title: string
  tags: string[]
  aliases: string[]
  prompt: string
  summary: string
  size: { width: number; height: number }
}

/** 标签组模板载荷 */
export interface TagSetTemplatePayload {
  tags: string[]
}

/**
 * AI Provider 配置（userData/providers.json；baseURL+key+model 一套覆盖 OpenAI 兼容厂商，ADR-9）
 * apiKeyEnc 为 safeStorage 加密后的 base64（ADR-16），仅存主进程，绝不回传渲染层
 */
export interface ProviderConfig {
  id: string
  name: string
  /** OpenAI 兼容 Base URL（如 https://api.deepseek.com 或 http://localhost:11434/v1） */
  baseURL: string
  model: string
  apiKeyEnc?: string
  isDefault?: boolean
}

/** 渲染层可见的 Provider 信息（密文剔除，以 hasKey 表示是否已配置密钥） */
export type ProviderInfo = Omit<ProviderConfig, 'apiKeyEnc'> & { hasKey: boolean }

/** 聊天消息（OpenAI 兼容 /chat/completions 的 messages 元素） */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
