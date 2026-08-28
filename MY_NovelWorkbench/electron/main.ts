/**
 * 主进程入口：窗口创建、应用生命周期、IPC 注册
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. 初版：创建主窗口（深色背景），加载渲染进程（开发 URL / 构建产物）
 *   2. M1：注册 IPC fs 通道；退出时停止目录监听
 *
 * 2026-08-28
 * 变更说明：
 *   1. M5：--smoke 自检模式（打包产物冒烟，R5 验收）——不建窗口，跑原生模块/产物/
 *    userData 自检并写 smoke-result.json 后以 0/1 退出；scripts/smoke-packaged.mjs 驱动
 */

import { app, BrowserWindow } from 'electron'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { stopWatching } from './watcher'
import { closeIndex } from './services/indexService'

/**
 * --smoke 自检（打包冒烟，M5）：不建窗口，逐项检查打包态关键能力后写结果文件退出。
 * 覆盖 R5（better-sqlite3 原生模块 ABI）、渲染产物完整性、userData 可写
 */
async function runSmoke(): Promise<void> {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = []
  // 1. better-sqlite3 原生模块：加载 + 内存库建表读写（ABI 不匹配在此必炸）
  try {
    const { default: Database } = await import('better-sqlite3')
    const db = new Database(':memory:')
    db.exec('CREATE TABLE t (v TEXT)')
    db.prepare('INSERT INTO t VALUES (?)').run('ok')
    const row = db.prepare('SELECT v FROM t').get() as { v: string }
    db.close()
    checks.push({ name: 'better-sqlite3', ok: row.v === 'ok', detail: `读写正常（${process.arch}）` })
  } catch (err) {
    checks.push({ name: 'better-sqlite3', ok: false, detail: err instanceof Error ? err.message : String(err) })
  }
  // 2. 渲染产物存在（asar 内相对结构）
  const rendererHtml = join(__dirname, '../renderer/index.html')
  checks.push({ name: 'renderer', ok: existsSync(rendererHtml), detail: rendererHtml })
  // 3. userData 可写（providers.json/recent.json/resources 的家）
  try {
    const userData = app.getPath('userData')
    const probe = join(userData, 'smoke-probe.tmp')
    writeFileSync(probe, 'ok', 'utf-8')
    checks.push({ name: 'userData', ok: true, detail: userData })
  } catch (err) {
    checks.push({ name: 'userData', ok: false, detail: err instanceof Error ? err.message : String(err) })
  }
  const ok = checks.every((c) => c.ok)
  const result = { ok, at: new Date().toISOString(), version: app.getVersion(), packaged: app.isPackaged, checks }
  try {
    writeFileSync(join(app.getPath('userData'), 'smoke-result.json'), JSON.stringify(result, null, 2), 'utf-8')
  } catch {
    /* 结果文件写不进时仍有退出码 */
  }
  console.log('[smoke]', JSON.stringify(result))
  app.exit(ok ? 0 : 1)
}

// 创建主窗口：宽高 1440x900，背景色与内容区色板一致
function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#1E1F22',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // 首帧渲染完成后再显示，避免白屏闪烁
  win.on('ready-to-show', () => win.show())

  // 开发模式加载 electron-vite 注入的渲染进程 URL；生产模式加载构建产物
  // 加载失败必须留痕，避免白屏无日志难以排查
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']).catch((err: unknown) => {
      console.error('[main] 渲染进程开发 URL 加载失败:', err)
    })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html')).catch((err: unknown) => {
      console.error('[main] 渲染进程产物加载失败:', err)
    })
  }

  return win
}

app.whenReady().then(() => {
  // --smoke：打包冒烟模式（不建窗口，检查完即退出）
  if (process.argv.includes('--smoke')) {
    void runSmoke()
    return
  }
  registerIpcHandlers(createWindow())

  // macOS：点击 Dock 图标且无窗口时重新创建
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 退出前清理监听与索引连接
app.on('before-quit', () => {
  stopWatching()
  closeIndex()
})

// 非 macOS：关闭所有窗口即退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
