/**
 * 渲染进程全局类型：window.api 类型声明（与 electron/preload.ts 保持一致）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. 初版：声明 preload 暴露的 versions 信息
 *   2. M1：fs 通道与目录变化订阅的完整类型（复用 shared 契约类型）
 *   3. M2：新增元信息读写与资源库通道类型
 *   4. M3：新增 provider 组（Provider CRUD/测试）与 llm 组（流式生成/中断 + 分块订阅）
 */

import type {
  BlueprintFile,
  ChapterDoc,
  ChatMessage,
  LlmChunkPayload,
  NovelChangedPayload,
  NovelMeta,
  ProviderConfig,
  ProviderInfo,
  RecentNovel,
  ResourceTemplate,
  TreeNode
} from '@shared/types'

export interface Api {
  versions: {
    chrome: string
    node: string
    electron: string
  }
  fs: {
    pickDirectory: () => Promise<string | null>
    createNovel: (dir: string, title: string) => Promise<NovelMeta>
    openNovel: (dir: string) => Promise<NovelMeta>
    recentNovels: () => Promise<RecentNovel[]>
    readTree: () => Promise<TreeNode[]>
    readBlueprint: (path: string) => Promise<BlueprintFile>
    saveBlueprint: (path: string, file: BlueprintFile) => Promise<void>
    readChapter: (path: string) => Promise<ChapterDoc>
    saveChapter: (path: string, doc: ChapterDoc) => Promise<void>
    createFile: (kind: 'blueprint' | 'chapter', title: string, volume?: string) => Promise<{ path: string; id?: string }>
    createVolume: (name: string) => Promise<{ path: string }>
    renameFile: (path: string, title: string) => Promise<{ path: string }>
    exchangeFiles: (pathA: string, pathB: string) => Promise<void>
    deleteFile: (path: string) => Promise<void>
    rebuildIndex: () => Promise<{ nodes: number; edges: number }>
    indexStats: () => Promise<{ nodes: number; edges: number; lastBuiltAt: string | null }>
    readMeta: () => Promise<NovelMeta>
    saveMeta: (meta: NovelMeta) => Promise<NovelMeta>
    listResources: () => Promise<Array<{ path: string; template: ResourceTemplate }>>
    saveResource: (template: ResourceTemplate) => Promise<{ path: string }>
    deleteResource: (path: string) => Promise<void>
  }
  onNovelChanged: (callback: (payload: NovelChangedPayload) => void) => () => void
  provider: {
    list: () => Promise<ProviderInfo[]>
    /** apiKey 明文仅经此通道进主进程加密（ADR-16） */
    save: (config: Omit<ProviderConfig, 'apiKeyEnc'>, apiKey?: string) => Promise<ProviderInfo>
    remove: (id: string) => Promise<void>
    test: (id: string) => Promise<{ ok: boolean; message: string }>
  }
  llm: {
    generate: (payload: {
      requestId: string
      providerId: string
      messages: ChatMessage[]
      maxTokens?: number
    }) => Promise<void>
    stop: (requestId: string) => Promise<void>
    onChunk: (callback: (chunk: LlmChunkPayload) => void) => () => void
  }
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
