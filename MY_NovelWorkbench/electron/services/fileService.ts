/**
 * 文件服务（主进程）：文件树读取 / 蓝图与章节 CRUD
 * 全部操作限定在当前小说目录内（路径穿越防护）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：树扫描、蓝图 JSON 读写、章节 frontmatter 读写、创建/重命名/删除
 *   2. M2：新增资源库（resources/ 目录的模板列表/保存/删除）
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { currentNovel } from './novelService'
import { parseFrontmatter, serializeFrontmatter } from '../../shared/frontmatter'
import { sanitizeFileName } from '../../shared/sanitize'
import { isResourceTemplate } from '../../shared/resource'
import type { BlueprintFile, ChapterDoc, ResourceTemplate, TreeNode } from '../../shared/types'

/** 解析小说内相对路径为绝对路径，并拒绝越出小说目录的路径（防穿越） */
function resolveInNovel(path: string): string {
  const novel = currentNovel()
  if (!novel) throw new Error('尚未打开小说')
  if (isAbsolute(path)) {
    throw new Error(`仅接受相对路径：${path}`)
  }
  const abs = join(novel.dir, path)
  const rel = relative(novel.dir, abs)
  // 精确匹配 '..' 与 '..<sep>' 前缀（避免误伤以 '..' 开头的合法文件名）
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`)) {
    throw new Error(`路径越出小说目录：${path}`)
  }
  return abs
}

/** 读取文件树：novel.json / blueprints/*.blueprint.json / chapters/*.md */
export function readTree(): TreeNode[] {
  const novel = currentNovel()
  if (!novel) return []
  const bpDir = join(novel.dir, 'blueprints')
  const chDir = join(novel.dir, 'chapters')
  const listDir = (dir: string, kind: TreeNode['kind']): TreeNode[] =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => ({ name: e.name, path: relative(novel.dir, join(dir, e.name)).replace(/\\/g, '/'), kind }))
          .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      : []
  const tree: TreeNode[] = [
    { name: novel.meta.title, path: '', kind: 'meta', children: [] as TreeNode[] }
  ]
  const blueprints: TreeNode = { name: 'blueprints', path: 'blueprints', kind: 'dir', children: listDir(bpDir, 'blueprint') }
  const chapters: TreeNode = { name: 'chapters', path: 'chapters', kind: 'dir', children: listDir(chDir, 'chapter') }
  tree[0]!.children = [blueprints, chapters]
  return tree
}

/** 读取蓝图文件 */
export function readBlueprint(path: string): BlueprintFile {
  const file = JSON.parse(readFileSync(resolveInNovel(path), 'utf-8')) as BlueprintFile
  if (!file.id || !Array.isArray(file.nodes) || !Array.isArray(file.edges)) {
    throw new Error(`蓝图文件结构不完整：${path}`)
  }
  return file
}

/** 保存蓝图文件 */
export function saveBlueprint(path: string, file: BlueprintFile): void {
  writeFileSync(resolveInNovel(path), JSON.stringify(file, null, 2), 'utf-8')
}

/** 读取章节（frontmatter + 正文） */
export function readChapter(path: string): ChapterDoc {
  const raw = readFileSync(resolveInNovel(path), 'utf-8')
  const { data, content } = parseFrontmatter(raw)
  return {
    path,
    title: data.title ?? path.split('/').pop()?.replace(/\.md$/, '') ?? '未命名',
    tags: data.tags ?? [],
    aliases: data.aliases ?? [],
    content
  }
}

/** 保存章节 */
export function saveChapter(path: string, doc: ChapterDoc): void {
  const raw = serializeFrontmatter({ title: doc.title, tags: doc.tags, aliases: doc.aliases }, doc.content)
  writeFileSync(resolveInNovel(path), raw, 'utf-8')
}

/** 创建文件：蓝图（空图）或章节（空 frontmatter），返回相对路径 */
export function createFile(kind: 'blueprint' | 'chapter', title: string): { path: string; id?: string } {
  const novel = currentNovel()
  if (!novel) throw new Error('尚未打开小说')
  const name = sanitizeFileName(title)
  if (kind === 'blueprint') {
    const id = `g-${randomUUID().slice(0, 8)}`
    const file: BlueprintFile = { id, title: name, nodes: [], edges: [] }
    const path = `blueprints/${name}.blueprint.json`
    const abs = resolveInNovel(path)
    if (existsSync(abs)) throw new Error(`蓝图已存在：${name}`)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, JSON.stringify(file, null, 2), 'utf-8')
    return { path, id }
  }
  const path = `chapters/${name}.md`
  const abs = resolveInNovel(path)
  if (existsSync(abs)) throw new Error(`章节已存在：${name}`)
  mkdirSync(join(abs, '..'), { recursive: true })
  saveChapter(path, { path, title: name, tags: [], aliases: [], content: '' })
  return { path }
}

/** 重命名（改文件名 stem；蓝图文件同步更新内部 title） */
export function renameFile(path: string, newTitle: string): { path: string } {
  const abs = resolveInNovel(path)
  const novel = currentNovel()!
  const dir = join(abs, '..')
  const ext = path.includes('.') ? `.${path.split('.').pop()}` : ''
  const newPath = `${relative(novel.dir, dir).replace(/\\/g, '/')}/${sanitizeFileName(newTitle)}${ext}`
  const newAbs = resolveInNovel(newPath)
  if (existsSync(newAbs)) throw new Error(`目标文件已存在：${newTitle}`)
  renameSync(abs, newAbs)
  // 蓝图：文件内 title 与文件名保持一致（否则面包屑/树标题漂移）
  if (newPath.endsWith('.blueprint.json')) {
    try {
      const file = JSON.parse(readFileSync(newAbs, 'utf-8')) as { title?: string }
      file.title = sanitizeFileName(newTitle)
      writeFileSync(newAbs, JSON.stringify(file, null, 2), 'utf-8')
    } catch (err) {
      console.error('[fileService] 重命名后同步蓝图 title 失败:', err)
    }
  }
  return { path: newPath }
}

/** 删除文件（仅限 blueprints/ 与 chapters/ 内；基于规范化后的路径判定，防 ../ 绕过） */
export function deleteFile(path: string): void {
  const abs = resolveInNovel(path)
  const rel = relative(currentNovel()!.dir, abs).replace(/\\/g, '/')
  if (!rel.startsWith('blueprints/') && !rel.startsWith('chapters/')) {
    throw new Error(`仅允许删除蓝图或章节文件：${path}`)
  }
  unlinkSync(abs)
}

/** 资源库目录内相对路径（资源文件统一 resources/<名称>.<kind>.json） */
function resourcePathOf(template: ResourceTemplate): string {
  return `resources/${sanitizeFileName(template.name)}.${template.kind}.json`
}

/** 列出资源库全部模板（坏文件跳过并留日志，不阻断列表） */
export function listResources(): Array<{ path: string; template: ResourceTemplate }> {
  const novel = currentNovel()
  if (!novel) return []
  const dir = join(novel.dir, 'resources')
  if (!existsSync(dir)) return []
  const out: Array<{ path: string; template: ResourceTemplate }> = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const path = `resources/${entry.name}`
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(dir, entry.name), 'utf-8'))
      if (isResourceTemplate(parsed)) out.push({ path, template: parsed })
    } catch (err) {
      console.error(`[fileService] 资源模板解析失败 ${path}:`, err)
    }
  }
  out.sort((a, b) => a.template.name.localeCompare(b.template.name, 'zh-CN'))
  return out
}

/** 保存资源模板（同名同类型覆盖；名称清洗后撞车但实际不同名时拒绝，防静默互相覆盖），返回相对路径 */
export function saveResource(template: ResourceTemplate): { path: string } {
  if (!isResourceTemplate(template)) throw new Error('资源模板结构不完整')
  const path = resourcePathOf(template)
  const abs = resolveInNovel(path)
  if (existsSync(abs)) {
    try {
      const existing = JSON.parse(readFileSync(abs, 'utf-8')) as ResourceTemplate
      if (existing.kind !== template.kind || existing.name !== template.name) {
        throw new Error(`已存在名称清洗后与之相同的其他模板（${existing.name}），请换个名称`)
      }
    } catch (err) {
      // 读不出/解析失败：按既有文件不可识别处理，允许覆盖（保守放开）
      if (err instanceof Error && err.message.includes('请换个名称')) throw err
      console.error('[fileService] 读取既有资源模板失败（将覆盖）:', err)
    }
  }
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, JSON.stringify(template, null, 2), 'utf-8')
  return { path }
}

/** 删除资源模板（仅限 resources/ 目录内） */
export function deleteResource(path: string): void {
  const abs = resolveInNovel(path)
  const rel = relative(currentNovel()!.dir, abs).replace(/\\/g, '/')
  if (!rel.startsWith('resources/') || !rel.endsWith('.json')) {
    throw new Error(`仅允许删除资源模板文件：${path}`)
  }
  unlinkSync(abs)
}
