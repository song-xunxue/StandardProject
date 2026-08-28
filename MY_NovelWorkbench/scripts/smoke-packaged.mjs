/**
 * 打包产物冒烟驱动（M5，R5 验收）：启动 release/win-unpacked 下的 exe --smoke，
 * 等待退出码 + 读取 userData/smoke-result.json 汇报自检明细
 * 用法：npm run smoke:packaged（默认找 release/win-unpacked/*.exe；可传自定义 exe 路径）
 *
 * 作者: 李文煜
 * 日期: 2026-08-28
 *
 * 2026-08-28
 * 变更说明：
 *   1. M5 初版
 */

import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const unpackedDir = join(root, 'release', 'win-unpacked')

// exe 定位：优先命令行参数，否则 win-unpacked 下第一个 .exe（排除 Uninstall 卸载器）
const argExe = process.argv[2]
let exe = argExe
if (!exe) {
  if (!existsSync(unpackedDir)) {
    console.error(`未找到 ${unpackedDir}——先 npm run pack:win`)
    process.exit(1)
  }
  const candidate = readdirSync(unpackedDir).find((f) => f.endsWith('.exe') && !f.startsWith('Uninstall'))
  if (!candidate) {
    console.error('win-unpacked 下未找到应用 exe')
    process.exit(1)
  }
  exe = join(unpackedDir, candidate)
}
console.log(`冒烟目标: ${exe}`)

// smoke-result.json 落在打包应用的 userData（productName 决定目录名）
const appData = join(homedir(), 'AppData', 'Roaming')
const resultCandidates = [
  join(appData, 'MY NovelWorkbench', 'smoke-result.json'),
  join(appData, 'my-novel-workbench', 'smoke-result.json')
]
for (const p of resultCandidates) {
  if (existsSync(p)) rmSync(p) // 清旧结果，确保读到本次的
}

const child = spawn(exe, ['--smoke'], { stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
child.stdout.on('data', (d) => (output += d))
child.stderr.on('data', (d) => (output += d))

const timeout = setTimeout(() => {
  console.error('冒烟超时（60s）——进程未退出')
  child.kill()
  process.exit(1)
}, 60000)

const code = await new Promise((resolve) => child.on('exit', resolve))
clearTimeout(timeout)

console.log(`退出码: ${code}`)
if (output.trim()) console.log('进程输出:\n' + output.trim().slice(-2000))

let reported = false
for (const p of resultCandidates) {
  if (existsSync(p)) {
    console.log('自检明细:')
    const result = JSON.parse(readFileSync(p, 'utf-8'))
    for (const c of result.checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}: ${c.detail}`)
    console.log(`  总体: ${result.ok ? 'PASS' : 'FAIL'}（v${result.version}，packaged=${result.packaged}）`)
    reported = true
    break
  }
}
if (!reported && code === 0) console.log('（未找到 smoke-result.json，但退出码 0）')

process.exit(code === 0 ? 0 : 1)
