/**
 * 敏感词词库服务（v2-F6，主进程）：userData/sensitive-words/<库名>.json
 * 库结构 { name, words: string[] }；跨小说共享（网文词库按投稿站点组织——起点/晋江/番茄等）
 * 不内置任何具体词（词库内容属平台合规口径，由作者自行导入维护——网文圈常见 txt 词库
 * 每行一词，importTxt 解析该格式）；tmp+rename 原子写；库名清洗防穿越
 *
 * 作者: 李文煜
 * 日期: 2026-08-31
 *
 * 2026-08-31
 * 变更说明：
 *   1. v2-F6 初版：列表/保存/删除/导入 txt（dialog 选文件 → 按行拆词去空去重）
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, dialog, type BrowserWindow } from 'electron'
import { sanitizeFileName } from '../../shared/sanitize'
import type { Wordbank } from '../../shared/types' // IPC 契约单一来源（晨间审查：原先本地重复声明）


function bankDir(): string {
  const dir = join(app.getPath('userData'), 'sensitive-words')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function bankPath(name: string): string {
  return join(bankDir(), `${sanitizeFileName(name)}.json`)
}

/** 全部词库（按库名排序；损坏文件跳过不阻断） */
export function listWordbanks(): Wordbank[] {
  const out: Wordbank[] = []
  for (const file of readdirSync(bankDir())) {
    if (!file.endsWith('.json')) continue
    try {
      const parsed = JSON.parse(readFileSync(join(bankDir(), file), 'utf-8')) as Partial<Wordbank>
      if (typeof parsed.name === 'string' && Array.isArray(parsed.words)) {
        out.push({ name: parsed.name, words: parsed.words.filter((w): w is string => typeof w === 'string') })
      }
    } catch {
      /* 单库损坏跳过 */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

/** 保存（新建/覆盖）：去空去重；tmp+rename 原子写 */
export function saveWordbank(name: string, words: string[]): Wordbank {
  const clean = sanitizeFileName(name)
  if (clean === '') throw new Error('库名不能为空')
  const unique = [...new Set(words.map((w) => w.trim()).filter((w) => w !== ''))]
  const bank: Wordbank = { name: clean, words: unique }
  const abs = bankPath(clean)
  const tmp = `${abs}.tmp`
  writeFileSync(tmp, JSON.stringify(bank, null, 2), 'utf-8')
  renameSync(tmp, abs)
  return bank
}

/** 删除词库（不存在的删除为幂等 no-op） */
export function deleteWordbank(name: string): void {
  const abs = bankPath(name)
  if (existsSync(abs)) unlinkSync(abs)
}

/**
 * 从 txt 导入（每行一词；去空行/首尾空白/全角空格）：弹系统文件选择框
 * 返回 null=用户取消；merge=true 时并入既有词库（去重），否则覆盖
 */
export async function importWordbankTxt(win: BrowserWindow | null, name: string, merge: boolean): Promise<Wordbank | null> {
  const opts = {
    title: `导入敏感词库${merge ? '（并入' : '（覆盖）'}「${name}」`,
    filters: [{ name: '文本文件', extensions: ['txt'] }],
    properties: ['openFile'] as Array<'openFile'>
  }
  // Electron 类型要求挂窗时非空——win 为空时退化为无父窗对话框
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (result.canceled || result.filePaths.length === 0) return null
  const text = readFileSync(result.filePaths[0]!, 'utf-8')
  const imported = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/　/g, ''))
    .filter((line) => line !== '')
  const existing = merge ? (listWordbanks().find((b) => b.name === sanitizeFileName(name))?.words ?? []) : []
  return saveWordbank(name, [...existing, ...imported])
}
