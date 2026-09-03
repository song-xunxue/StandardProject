/**
 * 预加载脚本：通过 contextBridge 向渲染进程暴露安全 IPC 桥（window.api）
 * fs 通道封装 ipcRenderer.invoke；novelChanged 为订阅推送
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. 初版：仅暴露应用版本信息
 *   2. M1：新增 fs 通道（小说/文件树/蓝图/章节 CRUD/索引）与目录变化订阅
 *   3. M2：新增元信息读写与资源库通道
 *   4. M3：新增 provider 组（Provider CRUD/测试）与 llm 组（流式生成/中断 + llm:chunk 订阅）
 *   5. M5：新增快照四通道（创建/列表/删除/恢复）
 
 * 2026-09-01
 * 变更说明（v2 首批补记+晨间审查修复）：
 *   1. v2 补记：fs.getWritingStats 与 wordbank 组（list/save/remove/importTxt）暴露
*/

import { contextBridge, ipcRenderer } from 'electron'
import { IPC, IPC_PUSH } from '../shared/types'

const api = {
  versions: {
    chrome: process.versions['chrome'] ?? '',
    node: process.versions['node'] ?? '',
    electron: process.versions['electron'] ?? ''
  },
  fs: {
    pickDirectory: () => ipcRenderer.invoke(IPC.pickDirectory),
    createNovel: (dir: string, title: string) => ipcRenderer.invoke(IPC.createNovel, { dir, title }),
    openNovel: (dir: string) => ipcRenderer.invoke(IPC.openNovel, { dir }),
    recentNovels: () => ipcRenderer.invoke(IPC.recentNovels),
    readTree: () => ipcRenderer.invoke(IPC.readTree),
    readBlueprint: (path: string) => ipcRenderer.invoke(IPC.readBlueprint, { path }),
    saveBlueprint: (path: string, file: unknown) => ipcRenderer.invoke(IPC.saveBlueprint, { path, file }),
    readChapter: (path: string) => ipcRenderer.invoke(IPC.readChapter, { path }),
    saveChapter: (path: string, doc: unknown) => ipcRenderer.invoke(IPC.saveChapter, { path, doc }),
    createFile: (kind: 'blueprint' | 'chapter', title: string, volume?: string) =>
      ipcRenderer.invoke(IPC.createFile, { kind, title, volume }),
    createVolume: (name: string) => ipcRenderer.invoke(IPC.createVolume, { name }),
    renameFile: (path: string, title: string) => ipcRenderer.invoke(IPC.renameFile, { path, title }),
    exchangeFiles: (pathA: string, pathB: string) => ipcRenderer.invoke(IPC.exchangeFiles, { pathA, pathB }),
    deleteFile: (path: string) => ipcRenderer.invoke(IPC.deleteFile, { path }),
    rebuildIndex: () => ipcRenderer.invoke(IPC.rebuildIndex),
    indexStats: () => ipcRenderer.invoke(IPC.indexStats),
    readMeta: () => ipcRenderer.invoke(IPC.readMeta),
    saveMeta: (meta: unknown) => ipcRenderer.invoke(IPC.saveMeta, { meta }),
    listResources: () => ipcRenderer.invoke(IPC.listResources),
    saveResource: (template: unknown) => ipcRenderer.invoke(IPC.saveResource, { template }),
    deleteResource: (path: string) => ipcRenderer.invoke(IPC.deleteResource, { path }),
    snapshotCreate: (note: string) => ipcRenderer.invoke(IPC.snapshotCreate, { note }),
    snapshotList: () => ipcRenderer.invoke(IPC.snapshotList),
    snapshotDelete: (id: string) => ipcRenderer.invoke(IPC.snapshotDelete, { id }),
    snapshotRestore: (id: string) => ipcRenderer.invoke(IPC.snapshotRestore, { id }),
    // v2-F7：码字统计
    getWritingStats: () => ipcRenderer.invoke(IPC.getWritingStats)
  },
  /** v2-F6：敏感词词库（全局目录跨小说共享；扫描在渲染层 shared/sensitiveScan） */
  wordbank: {
    list: () => ipcRenderer.invoke(IPC.wordbankList),
    save: (name: string, words: string[]) => ipcRenderer.invoke(IPC.wordbankSave, { name, words }),
    remove: (name: string) => ipcRenderer.invoke(IPC.wordbankDelete, { name }),
    importTxt: (name: string, merge: boolean) => ipcRenderer.invoke(IPC.wordbankImportTxt, { name, merge })
  },
  /** 订阅小说目录变化（返回取消订阅函数）；负载 { tree, changed } */
  onNovelChanged: (callback: (payload: unknown) => void): (() => void) => {
    const listener = (_e: unknown, payload: unknown): void => callback(payload)
    ipcRenderer.on(IPC_PUSH.novelChanged, listener)
    return () => ipcRenderer.removeListener(IPC_PUSH.novelChanged, listener)
  },
  provider: {
    list: () => ipcRenderer.invoke(IPC.providerList),
    save: (config: unknown, apiKey?: string) => ipcRenderer.invoke(IPC.providerSave, { config, apiKey }),
    remove: (id: string) => ipcRenderer.invoke(IPC.providerDelete, { id }),
    test: (id: string) => ipcRenderer.invoke(IPC.providerTest, { id })
  },
  llm: {
    generate: (payload: unknown) => ipcRenderer.invoke(IPC.llmGenerate, payload),
    stop: (requestId: string) => ipcRenderer.invoke(IPC.llmStop, { requestId }),
    /** 订阅流式分块（返回取消订阅函数） */
    onChunk: (callback: (chunk: unknown) => void): (() => void) => {
      const listener = (_e: unknown, chunk: unknown): void => callback(chunk)
      ipcRenderer.on(IPC_PUSH.llmChunk, listener)
      return () => ipcRenderer.removeListener(IPC_PUSH.llmChunk, listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
