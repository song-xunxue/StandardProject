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
  createFile: 'fs:createFile', // (payload: { kind, title }) => { path }
  renameFile: 'fs:renameFile', // (payload: { path, title }) => { path }
  deleteFile: 'fs:deleteFile', // (payload: { path }) => void
  rebuildIndex: 'fs:rebuildIndex', // () => { nodes: number; edges: number }
  indexStats: 'fs:indexStats', // () => { nodes: number; edges: number; lastBuiltAt: string | null }
  readMeta: 'fs:readMeta', // () => NovelMeta（当前小说的 novel.json）
  saveMeta: 'fs:saveMeta', // (payload: { meta }) => NovelMeta（标签库等元信息更新）
  listResources: 'fs:listResources', // () => ResourceTemplate[]
  saveResource: 'fs:saveResource', // (payload: { template }) => { path }（resources/ 下新建/覆盖）
  deleteResource: 'fs:deleteResource' // (payload: { path }) => void
} as const

/** 主进程 → 渲染进程推送（webContents.send） */
export const IPC_PUSH = {
  /** 小说目录内文件变化（防抖后）：负载为最新文件树 */
  novelChanged: 'novel:changed'
} as const

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
 * 资源库模板（resources/*.json，M2 v1 单本内；M4 评估跨小说独立目录）
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
