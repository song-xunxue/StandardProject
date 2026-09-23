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
 
 * 2026-09-01
 * 变更说明（v2 首批补记+晨间审查修复）：
 *   1. v2 补记：getWritingStats 与 wordbank 四通道路由

 * 2026-09-17
 * 变更说明：
 *   1. v2-F8：章节快照五通道路由（轻量恢复编排 + recordChapterSave 统计入账）

 * 2026-09-23
 * 变更说明：
 *   1. v2 三批遗留修复：snapshotRestore 恢复成功后、openNovel 前调
 *      recomputeChapterChars 全量重算 chapterChars（live 键值随内容回退校正），
 *      days 历史保留；失败兜底分支同样重算（内容可能半换血，尽量对齐磁盘现状）
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
import {
  createChapterSnapshot,
  createSnapshot,
  deleteChapterSnapshot,
  deleteSnapshot,
  listChapterSnapshots,
  listSnapshots,
  readChapterSnapshot,
  restoreChapterSnapshot,
  restoreSnapshot
} from './services/snapshotService'
import { deleteProvider, listProviders, saveProvider, testProvider } from './services/providerService'
import { startGeneration, stopGeneration } from './services/llmService'
import { getWritingStats, recordChapterSave, recomputeChapterChars } from './services/statsService'
import { parseFrontmatter } from '../shared/frontmatter'
import { deleteWordbank, importWordbankTxt, listWordbanks, saveWordbank } from './services/wordbankService'
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

  // v2-F7：码字统计
  ipcMain.handle(IPC.getWritingStats, () =>
    opened(() => {
      if (!currentNovel()) throw new Error('尚未打开小说')
      return getWritingStats()
    })
  )

  // v2-F6：敏感词词库（全局目录，不依赖打开小说；importTxt 弹系统文件框）
  ipcMain.handle(IPC.wordbankList, () => opened(() => listWordbanks()))
  ipcMain.handle(IPC.wordbankSave, (_e, p: { name: string; words: string[] }) =>
    opened(() => saveWordbank(p.name, p.words))
  )
  ipcMain.handle(IPC.wordbankDelete, (_e, p: { name: string }) => opened(() => deleteWordbank(p.name)))
  ipcMain.handle(IPC.wordbankImportTxt, (_e, p: { name: string; merge: boolean }) =>
    opened(() => importWordbankTxt(win, p.name, p.merge))
  )

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
        // v2 三批：兜底路径同样重算统计（内容可能半换血，尽量对齐磁盘现状；失败不阻断）
        try {
          recomputeChapterChars()
        } catch (statsErr) {
          console.error('[ipc] 恢复失败兜底的统计重算失败（不阻断）:', statsErr)
        }
        try {
          openNovel(novel.dir)
          startWatching(win)
        } catch {
          /* 二次失败：上抛原始错误，用户重开小说自愈 */
        }
        throw err
      }
      // v2 三批遗留修复：恢复后、openNovel 前全量重算 chapterChars——initStats 对账
      // 只处理新键/死键，内容回退的 live 键停留恢复前字数永不自愈；days 历史保留，
      // 随后 openNovel→initStats→stampToday 以校正后总量记当日。重算失败不阻断恢复
      // （统计是衍生账本，下次 openNovel 的对账仍保证新键/死键正确）
      try {
        recomputeChapterChars()
      } catch (statsErr) {
        console.error('[ipc] 快照恢复后统计重算失败（不阻断恢复）:', statsErr)
      }
      openNovel(novel.dir)
      startWatching(win)
    })
  )

  // v2-F8：章节级快照（轻量编排——不需要 stopWatching/closeIndex：单文件写入不触碰
  // SQLite 句柄，watcher 捕获 mtime 变化自动增量索引并推送 novelChanged）
  ipcMain.handle(IPC.snapshotChapterCreate, (_e, p: { chapterPath: string; note?: string }) =>
    opened(() => {
      const novel = currentNovel()
      if (!novel) throw new Error('尚未打开小说')
      return createChapterSnapshot(novel.dir, p.chapterPath, p.note ?? '')
    })
  )
  ipcMain.handle(IPC.snapshotChapterList, (_e, p: { chapterPath: string }) =>
    opened(() => {
      const novel = currentNovel()
      if (!novel) throw new Error('尚未打开小说')
      return listChapterSnapshots(novel.dir, p.chapterPath)
    })
  )
  ipcMain.handle(IPC.snapshotChapterDelete, (_e, p: { chapterPath: string; id: string }) =>
    opened(() => {
      const novel = currentNovel()
      if (!novel) throw new Error('尚未打开小说')
      deleteChapterSnapshot(novel.dir, p.chapterPath, p.id)
    })
  )
  ipcMain.handle(IPC.snapshotChapterRead, (_e, p: { chapterPath: string; id: string }) =>
    opened(() => {
      const novel = currentNovel()
      if (!novel) throw new Error('尚未打开小说')
      return readChapterSnapshot(novel.dir, p.chapterPath, p.id)
    })
  )
  ipcMain.handle(IPC.snapshotChapterRestore, (_e, p: { chapterPath: string; id: string }) =>
    opened(() => {
      const novel = currentNovel()
      if (!novel) throw new Error('尚未打开小说')
      const raw = restoreChapterSnapshot(novel.dir, p.chapterPath, p.id)
      // 码字统计入账：恢复绕过 saveChapter 直写文件，必须手动记录——否则
      // chapterChars[path] 停留旧值永不自愈（initStats 对账只处理新键/死键）。
      // 审查修复：入账失败不阻断恢复（文件已写成功，reject 会让渲染层不递增
      // chapterReloadSeq，旧编辑器内存随后把恢复结果覆盖回去）
      try {
        recordChapterSave(p.chapterPath, parseFrontmatter(raw).content)
      } catch (err) {
        console.error('[ipc] 章节快照恢复后统计入账失败（不阻断恢复）:', err)
      }
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
