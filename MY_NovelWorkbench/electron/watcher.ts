/**
 * 小说目录监听（主进程）：fs.watch recursive + 防抖
 * 变化 → 增量索引受影响文件 + 推送最新文件树到渲染进程
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：300ms 防抖；忽略 .index/ 自身变化；应用内保存触发的重扫幂等
 *
 * 2026-08-28
 * 变更说明：
 *   1. M5：打开小说改走 syncIndex 增量校对（原全量 rebuildIndex 会清空 mtime+size
 *      基线，第二次打开仍重读全部文件，冷启动不达标）；全量重建保留给手动命令兜底。
 *      附耗时日志（ms + 变更/清理计数），为大画布性能问题提供第一手数据
 *   2. M5：忽略 .snapshots/ 自身变化（快照创建/恢复是整目录拷贝，会引发事件风暴）
 
 * 2026-09-01
 * 变更说明（v2 首批补记+晨间审查修复）：
 *   1. v2-F7：忽略 writing-stats.json（保存高频小文件，不触发树推送）
*/

import { watch, type FSWatcher } from 'node:fs'
import type { BrowserWindow } from 'electron'
import { IPC_PUSH, type TreeNode } from '../shared/types'
import { currentNovel } from './services/novelService'
import { readTree } from './services/fileService'
import { indexBlueprint, indexChapter, syncIndex } from './services/indexService'

const DEBOUNCE_MS = 300

let watcher: FSWatcher | null = null
let timer: NodeJS.Timeout | null = null
/** 防抖窗口内累积的变化路径 */
let pendingPaths = new Set<string>()

/** 开始监听当前小说目录（打开/切换小说时调用） */
export function startWatching(win: BrowserWindow): void {
  stopWatching()
  const novel = currentNovel()
  if (!novel) return
  // 增量校对建立基线：切换小说后索引库指向新目录，未变文件（mtime+size 一致）零重读；
  // 全量重建由「重建索引」命令兜底（索引损坏/怀疑漂移时使用）
  const t0 = Date.now()
  try {
    const stats = syncIndex()
    console.log(
      `[watcher] 索引校对完成 ${Date.now() - t0}ms（重索引 ${stats.changed}，清理 ${stats.removed}，` +
        `当前 ${stats.nodes} 节点 / ${stats.edges} 边）`
    )
  } catch (err) {
    console.error('[watcher] 初始索引失败:', err)
  }
  watcher = watch(novel.dir, { recursive: true }, (_event, filename) => {
    const rel = String(filename ?? '').replace(/\\/g, '/')
    if (rel === '') return
    // 忽略索引目录与快照目录自身的抖动（快照创建/恢复=整目录拷贝，会引发事件风暴）；
    // v2-F7：writing-stats.json 为保存时的统计入账写入（高频小文件），不触发树推送
    if (
      rel === '.index' ||
      rel === '.snapshots' ||
      rel === 'writing-stats.json' ||
      rel.startsWith('.index/') ||
      rel.startsWith('.snapshots/')
    ) {
      return
    }
    pendingPaths.add(rel)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const changed = [...pendingPaths]
      pendingPaths = new Set()
      for (const path of changed) {
        try {
          if (path.startsWith('blueprints/') && path.endsWith('.blueprint.json')) indexBlueprint(path)
          else if (path.startsWith('chapters/') && path.endsWith('.md')) indexChapter(path)
        } catch (err) {
          // 文件已删除的场景由 indexService 内部 ENOENT 清理；这里只留痕瞬时不可读等异常
          console.error('[watcher] 索引更新失败:', path, err)
        }
      }
      // 推送最新文件树 + 变更清单（渲染层据此做增量合并，只重读变更蓝图——
      // 未变图保持对象引用，画布/AI 面板不整体重渲）
      let tree: TreeNode[]
      try {
        tree = readTree()
      } catch {
        return
      }
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_PUSH.novelChanged, { tree, changed })
      }
    }, DEBOUNCE_MS)
  })
}

/** 停止监听（关闭/切换小说时调用） */
export function stopWatching(): void {
  if (timer) clearTimeout(timer)
  timer = null
  pendingPaths = new Set()
  watcher?.close()
  watcher = null
}
