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
    createFile: (kind: 'blueprint' | 'chapter', title: string) => ipcRenderer.invoke(IPC.createFile, { kind, title }),
    renameFile: (path: string, title: string) => ipcRenderer.invoke(IPC.renameFile, { path, title }),
    deleteFile: (path: string) => ipcRenderer.invoke(IPC.deleteFile, { path }),
    rebuildIndex: () => ipcRenderer.invoke(IPC.rebuildIndex),
    indexStats: () => ipcRenderer.invoke(IPC.indexStats),
    readMeta: () => ipcRenderer.invoke(IPC.readMeta),
    saveMeta: (meta: unknown) => ipcRenderer.invoke(IPC.saveMeta, { meta }),
    listResources: () => ipcRenderer.invoke(IPC.listResources),
    saveResource: (template: unknown) => ipcRenderer.invoke(IPC.saveResource, { template }),
    deleteResource: (path: string) => ipcRenderer.invoke(IPC.deleteResource, { path })
  },
  /** 订阅小说目录变化（返回取消订阅函数） */
  onNovelChanged: (callback: (tree: unknown) => void): (() => void) => {
    const listener = (_e: unknown, tree: unknown): void => callback(tree)
    ipcRenderer.on(IPC_PUSH.novelChanged, listener)
    return () => ipcRenderer.removeListener(IPC_PUSH.novelChanged, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
