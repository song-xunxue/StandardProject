/**
 * IPC 处理器注册（主进程）：fs 通道全部路由到服务层
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：fs:* 通道注册；打开/创建小说后自动启动监听与索引
 *   2. M2：新增元信息读写（readMeta/saveMeta）与资源库（listResources/saveResource/deleteResource）
 *   3. M3：新增 AI Provider（provider:*）与 LLM 流式生成（llm:*，chunk 经 llm:chunk 推送）
 *   4. M4-B：资源库三通道路由至 resourceService（全局目录跨小说，不依赖打开小说）
 *
 * 2026-08-28
 * 变更说明：
 *   1. M5：新增快照四通道（snapshotService）；restore 在本层编排
 *    停监听 → closeIndex（释放 SQLite 句柄，Windows 删除/覆盖前置条件）
 *    → 恢复文件 → openNovel → startWatching（增量校对对齐索引）
 */

import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { IPC } from '../shared/types'
import type { ProviderConfig } from '../shared/types'
import { createNovel, currentNovel, openNovel, readMeta, recentNovels, saveMeta } from './services/novelService'
import {
  createFile,
  createVolume,
  deleteFile,
  exchangeFiles,
  readBlueprint,
  readChapter,
  readTree,
  renameFile,
  saveBlueprint,
  saveChapter
} from './services/fileService'
import { deleteResource, listResources, saveResource } from './services/resourceService'
import { createSnapshot, deleteSnapshot, listSnapshots, restoreSnapshot } from './services/snapshotService'
import { deleteProvider, listProviders, saveProvider, testProvider } from './services/providerService'
import { startGeneration, stopGeneration } from './services/llmService'
import { indexStats, rebuildIndex, closeIndex } from './services/indexService'
import { startWatching, stopWatching } from './watcher'

/** 注册全部 IPC 处理器（应用启动时调用一次） */
export function registerIpcHandlers(win: BrowserWindow): void {
  const opened = (fn: () => unknown): unknown => {
    try {
      return fn()
    } catch (err) {
      // 统一转成可序列化的错误消息，渲染层 invoke reject 后可读
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  }

  // 目录选择对话框（新建小说的父目录）
  ipcMain.handle(IPC.pickDirectory, async () => {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]!
  })

  ipcMain.handle(IPC.createNovel, (_e, p: { dir: string; title: string }) =>
    opened(() => {
      const meta = createNovel(p.dir, p.title)
      closeIndex()
      startWatching(win)
      return meta
    })
  )

  ipcMain.handle(IPC.openNovel, (_e, p: { dir: string }) =>
    opened(() => {
      const meta = openNovel(p.dir)
      closeIndex()
      startWatching(win)
      return meta
    })
  )

  ipcMain.handle(IPC.recentNovels, () => opened(() => recentNovels()))

  ipcMain.handle(IPC.readTree, () => opened(() => readTree()))
  ipcMain.handle(IPC.readBlueprint, (_e, p: { path: string }) => opened(() => readBlueprint(p.path)))
  ipcMain.handle(IPC.saveBlueprint, (_e, p: { path: string; file: unknown }) =>
    opened(() => saveBlueprint(p.path, p.file as Parameters<typeof saveBlueprint>[1]))
  )
  ipcMain.handle(IPC.readChapter, (_e, p: { path: string }) => opened(() => readChapter(p.path)))
  ipcMain.handle(IPC.saveChapter, (_e, p: { path: string; doc: unknown }) =>
    opened(() => saveChapter(p.path, p.doc as Parameters<typeof saveChapter>[1]))
  )
  ipcMain.handle(IPC.createFile, (_e, p: { kind: 'blueprint' | 'chapter'; title: string; volume?: string }) =>
    opened(() => createFile(p.kind, p.title, p.volume))
  )
  ipcMain.handle(IPC.createVolume, (_e, p: { name: string }) => opened(() => createVolume(p.name)))
  ipcMain.handle(IPC.renameFile, (_e, p: { path: string; title: string }) => opened(() => renameFile(p.path, p.title)))
  ipcMain.handle(IPC.exchangeFiles, (_e, p: { pathA: string; pathB: string }) => opened(() => exchangeFiles(p.pathA, p.pathB)))
  ipcMain.handle(IPC.deleteFile, (_e, p: { path: string }) => opened(() => deleteFile(p.path)))

  ipcMain.handle(IPC.rebuildIndex, () => opened(() => rebuildIndex()))
  ipcMain.handle(IPC.indexStats, () => opened(() => indexStats()))

  // M2：元信息（标签库）与资源库
  ipcMain.handle(IPC.readMeta, () => opened(() => readMeta()))
  ipcMain.handle(IPC.saveMeta, (_e, p: { meta: unknown }) =>
    opened(() => saveMeta(p.meta as Parameters<typeof saveMeta>[0]))
  )
  // M4-B：资源库（全局目录跨小说，resourceService；三通道均不依赖打开小说，
  // opened 仅作错误消息归一化器统一口径，并非「需打开小说」守卫）
  ipcMain.handle(IPC.listResources, () => opened(() => listResources()))
  ipcMain.handle(IPC.saveResource, (_e, p: { template: unknown }) =>
    opened(() => saveResource(p.template as Parameters<typeof saveResource>[0]))
  )
  ipcMain.handle(IPC.deleteResource, (_e, p: { path: string }) => opened(() => deleteResource(p.path)))

  // M5：快照（依赖已打开小说——所有操作以 currentNovel().dir 为根）
  ipcMain.handle(IPC.snapshotCreate, (_e, p: { note?: string }) =>
    opened(() => {
      const novel = currentNovel()
      if (!novel) throw new Error('尚未打开小说')
      return createSnapshot(novel.dir, p.note ?? '')
    })
  )
  ipcMain.handle(IPC.snapshotList, () =>
    opened(() => {
      const novel = currentNovel()
      if (!novel) throw new Error('尚未打开小说')
      return listSnapshots(novel.dir)
    })
  )
  ipcMain.handle(IPC.snapshotDelete, (_e, p: { id: string }) =>
    opened(() => {
      const novel = currentNovel()
      if (!novel) throw new Error('尚未打开小说')
      deleteSnapshot(novel.dir, p.id)
    })
  )
  ipcMain.handle(IPC.snapshotRestore, (_e, p: { id: string }) =>
    opened(() => {
      const novel = currentNovel()
      if (!novel) throw new Error('尚未打开小说')
      // 顺序至关重要：停监听（防回写事件风暴/索引抖动）→ 关库（Windows 句柄）
      // → 换内容 → 重开监听（内部增量校对，恢复后的 mtime 变化自动重索引）
      stopWatching()
      closeIndex()
      try {
        restoreSnapshot(novel.dir, p.id)
      } catch (err) {
        // 恢复失败兜底（M5 审查修复）：尽力回到可编辑状态——否则监听永久停止、
        // 索引关闭，后续编辑静默不刷新（novel.json 缺失等极端情形重开失败则保持原始错误上抛）
        try {
          openNovel(novel.dir)
          startWatching(win)
        } catch {
          /* 二次失败：上抛原始错误，用户重开小说自愈 */
        }
        throw err
      }
      openNovel(novel.dir)
      startWatching(win)
    })
  )

  // M3：AI Provider（ADR-9/16）与 LLM 流式生成（ADR-10）
  ipcMain.handle(IPC.providerList, () => opened(() => listProviders()))
  ipcMain.handle(IPC.providerSave, (_e, p: { config: Omit<ProviderConfig, 'apiKeyEnc'>; apiKey?: string }) =>
    opened(() => saveProvider(p.config, p.apiKey))
  )
  ipcMain.handle(IPC.providerDelete, (_e, p: { id: string }) => opened(() => deleteProvider(p.id)))
  ipcMain.handle(IPC.providerTest, (_e, p: { id: string }) => opened(() => testProvider(p.id)))
  ipcMain.handle(IPC.llmGenerate, (_e, p: Parameters<typeof startGeneration>[1]) =>
    opened(() => {
      startGeneration(win, p)
    })
  )
  ipcMain.handle(IPC.llmStop, (_e, p: { requestId: string }) => opened(() => stopGeneration(p.requestId)))
}
