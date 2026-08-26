/**
 * electron-vite 构建配置：主进程 / 预加载 / 渲染进程三目标构建
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. 初版：React 插件 + @ 路径别名 + 自定义目录入口（electron/ 与 src/）
 */

import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  // 主进程：electron/main.ts -> out/main/index.js（依赖外置，better-sqlite3 原生模块不可打包）
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main.ts') }
      }
    }
  },
  // 预加载：electron/preload.ts -> out/preload/index.js
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.ts') }
      }
    }
  },
  // 渲染进程：src/index.html 为入口，@ 指向 src/，@shared 指向 shared/
  // 注意：electron-vite 的 index.html 自动探测只认 src/renderer/，自定义目录必须显式指定 input
  renderer: {
    root: 'src',
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/index.html') }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared')
      }
    }
  }
})
