/**
 * vitest 配置：单测覆盖 src / shared / electron 三处的纯逻辑
 * 注意：@ 别名指向 src，@shared 指向 shared（与 tsconfig 路径一致）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：显式别名与测试范围（tsconfig 拆分后不再依赖根路径解析）
 */

import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'shared')
    }
  },
  test: {
    include: ['src/**/*.test.ts', 'shared/**/*.test.ts', 'electron/**/*.test.ts'],
    environment: 'node'
  }
})
