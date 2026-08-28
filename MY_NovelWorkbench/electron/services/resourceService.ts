/**
 * 资源库服务（主进程）：跨小说全局资源模板 CRUD + 旧小说目录迁移
 * M4-B 起资源库独立于单本小说（FR-08「跨小说复用」），存 userData/resources/*.json——
 * 应用级创作资产与 providers.json/recent.json 同级（ADR-7 真相源范围=小说内容，应用级资产走 userData）
 *
 * 作者: 李文煜
 * 日期: 2026-08-28
 *
 * 2026-08-28
 * 变更说明：
 *   1. M4-B 初版：自 fileService 迁出 listResources/saveResource/deleteResource，
 *      基目录由小说目录 resources/ 改为 userData/resources（跨小说共享，不依赖打开小说）
 *   2. 新增 migrateLegacyResources：M2-M4A 期间存小说目录内的旧资源迁移入全局目录
 *   3. 审查修复：迁移完成标记 .migrated（防全局库删除已迁移模板后重开小说复活）；
 *      迁移/保存改 tmp+rename 原子写；迁移目录级容错；跨旧小说清洗撞车告警
 */

import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import { sanitizeFileName } from '../../shared/sanitize'
import { isResourceTemplate } from '../../shared/resource'
import type { ResourceTemplate } from '../../shared/types'

/** 旧资源目录的迁移完成标记（隐藏文件，不参与 *.json 扫描） */
const MIGRATED_MARKER = '.migrated'

/** 全局资源库目录（userData/resources，跨小说共享） */
export function globalResourcesDir(): string {
  return join(app.getPath('userData'), 'resources')
}

/** 解析资源库内相对路径为绝对路径，并拒绝越出全局资源目录的路径（防穿越，口径同 fileService.resolveInNovel） */
function resolveInResources(path: string): string {
  const base = globalResourcesDir()
  if (isAbsolute(path)) {
    throw new Error(`仅接受相对路径：${path}`)
  }
  const abs = join(base, path)
  const rel = relative(base, abs)
  // 精确匹配 '..' 与 '..<sep>' 前缀（避免误伤以 '..' 开头的合法文件名）
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`)) {
    throw new Error(`路径越出资源库目录：${path}`)
  }
  return abs
}

/** 资源库文件名（统一 <名称>.<kind>.json，与 M2 期间小说目录内命名保持一致） */
function resourceFileOf(template: ResourceTemplate): string {
  return `${sanitizeFileName(template.name)}.${template.kind}.json`
}

/** 列出资源库全部模板（坏文件跳过并留日志，不阻断列表；不依赖打开小说） */
export function listResources(): Array<{ path: string; template: ResourceTemplate }> {
  const dir = globalResourcesDir()
  if (!existsSync(dir)) return []
  const out: Array<{ path: string; template: ResourceTemplate }> = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(dir, entry.name), 'utf-8'))
      if (isResourceTemplate(parsed)) out.push({ path: entry.name, template: parsed })
    } catch (err) {
      console.error(`[resourceService] 资源模板解析失败 ${entry.name}:`, err)
    }
  }
  out.sort((a, b) => a.template.name.localeCompare(b.template.name, 'zh-CN'))
  return out
}

/** 保存资源模板（同名同类型覆盖；名称清洗后撞车但实际不同名时拒绝，防静默互相覆盖），返回相对全局资源目录的路径 */
export function saveResource(template: ResourceTemplate): { path: string } {
  if (!isResourceTemplate(template)) throw new Error('资源模板结构不完整')
  const file = resourceFileOf(template)
  const abs = resolveInResources(file)
  if (existsSync(abs)) {
    try {
      const existing = JSON.parse(readFileSync(abs, 'utf-8')) as ResourceTemplate
      if (existing.kind !== template.kind || existing.name !== template.name) {
        throw new Error(`已存在名称清洗后与之相同的其他模板（${existing.name}），请换个名称`)
      }
    } catch (err) {
      // 读不出/解析失败：按既有文件不可识别处理，允许覆盖（保守放开）
      if (err instanceof Error && err.message.includes('请换个名称')) throw err
      console.error('[resourceService] 读取既有资源模板失败（将覆盖）:', err)
    }
  }
  mkdirSync(globalResourcesDir(), { recursive: true })
  // tmp+rename 原子写（与 novelService 既有模式一致）：崩溃不留半写 JSON
  const tmp = `${abs}.tmp`
  writeFileSync(tmp, JSON.stringify(template, null, 2), 'utf-8')
  renameSync(tmp, abs)
  return { path: file }
}

/** 删除资源模板（仅限资源库根目录内的单 .json 文件；不依赖打开小说） */
export function deleteResource(path: string): void {
  const abs = resolveInResources(path)
  const rel = relative(globalResourcesDir(), abs).replace(/\\/g, '/')
  if (rel.includes('/') || !rel.endsWith('.json')) {
    throw new Error(`仅允许删除资源模板文件：${path}`)
  }
  unlinkSync(abs)
}

/**
 * 旧小说目录内 resources/ 的一次性迁移（M2-M4A 期间资源存小说目录内）：
 * 逐文件校验结构后复制入全局目录；全局已存在同名文件跳过（保留全局版本，防覆盖用户新编辑）；
 * 一轮完整通过后向旧目录写完成标记（.migrated）——此后不再重扫，否则用户在全局库删除
 * 已迁移模板后重开该小说，旧文件会被重新复制导致「删除复活」（审查修复）。
 * 旧目录与旧文件一律保留不删（不删用户数据）；单文件/目录级失败仅记日志，不阻断打开流程。
 * 打开/创建小说时调用（createNovel 内部亦经 openNovel，单一挂载点），返回迁移成功的文件数。
 */
export function migrateLegacyResources(novelDir: string): number {
  const legacyDir = join(novelDir, 'resources')
  if (!existsSync(legacyDir)) return 0
  const marker = join(legacyDir, MIGRATED_MARKER)
  if (existsSync(marker)) return 0 // 已完成迁移：不再重扫（防已删模板复活）
  const globalDir = globalResourcesDir()
  let migrated = 0
  // 目录级容错：resources 恰为同名文件（ENOTDIR）或不可读（EACCES）时不阻断打开小说
  let entries: Dirent[]
  try {
    entries = readdirSync(legacyDir, { withFileTypes: true })
  } catch (err) {
    console.error('[resourceService] 读取旧资源目录失败（跳过迁移）:', err)
    return 0
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const source = join(legacyDir, entry.name)
    const target = join(globalDir, entry.name)
    if (existsSync(target)) {
      // 跨旧小说清洗撞车（两本小说各有一个同名不同实体的模板）：首开者胜出，留告警可追溯
      try {
        const existing = JSON.parse(readFileSync(target, 'utf-8')) as ResourceTemplate
        const incoming = JSON.parse(readFileSync(source, 'utf-8')) as ResourceTemplate
        if (existing.kind !== incoming.kind || existing.name !== incoming.name) {
          console.warn(
            `[resourceService] 全局库已有清洗后同名的模板（${existing.name}），跳过 ${novelDir} 的 ${incoming.name}`
          )
        }
      } catch {
        /* 撞车告警读失败不影响跳过决策 */
      }
      continue
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(source, 'utf-8'))
      if (!isResourceTemplate(parsed)) {
        console.warn(`[resourceService] 旧资源模板结构不符，跳过迁移：${entry.name}`)
        continue
      }
      mkdirSync(globalDir, { recursive: true })
      // tmp+rename 原子复制（同卷 rename）：复制中途崩溃不留半文件被 existsSync 永久跳过
      const tmp = `${target}.tmp`
      copyFileSync(source, tmp)
      renameSync(tmp, target)
      migrated += 1
    } catch (err) {
      console.error(`[resourceService] 迁移旧资源模板失败 ${entry.name}:`, err)
    }
  }
  // 写完成标记（单文件失败已按「放弃该文件」处理，一轮通过即完成）
  try {
    writeFileSync(marker, new Date().toISOString(), 'utf-8')
  } catch (err) {
    console.error('[resourceService] 写迁移完成标记失败（下次打开将重扫）:', err)
  }
  if (migrated > 0) console.log(`[resourceService] 已迁移 ${migrated} 个旧资源模板到全局资源库`)
  return migrated
}
