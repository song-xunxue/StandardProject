/**
 * IPC 处理器注册（主进程）：fs 通道全部路由到服务层
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：fs:* 通道注册；打开/创建小说后自动启动监听与索引
 */

import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { IPC } from '../shared/types'
import { createNovel, openNovel, recentNovels } from './services/novelService'
import {
  createFile,
  deleteFile,
  readBlueprint,
  readChapter,
  readTree,
  renameFile,
  saveBlueprint,
  saveChapter
} from './services/fileService'
import { indexStats, rebuildIndex, closeIndex } from './services/indexService'
import { startWatching } from './watcher'

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
  ipcMain.handle(IPC.createFile, (_e, p: { kind: 'blueprint' | 'chapter'; title: string }) =>
    opened(() => createFile(p.kind, p.title))
  )
  ipcMain.handle(IPC.renameFile, (_e, p: { path: string; title: string }) => opened(() => renameFile(p.path, p.title)))
  ipcMain.handle(IPC.deleteFile, (_e, p: { path: string }) => opened(() => deleteFile(p.path)))

  ipcMain.handle(IPC.rebuildIndex, () => opened(() => rebuildIndex()))
  ipcMain.handle(IPC.indexStats, () => opened(() => indexStats()))
}
