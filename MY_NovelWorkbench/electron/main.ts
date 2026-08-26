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
 */

import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { stopWatching } from './watcher'
import { closeIndex } from './services/indexService'

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
