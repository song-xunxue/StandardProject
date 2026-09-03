/**
 * 资源库服务单测（M4-B）：全局目录 CRUD + 清洗撞车拒写 + 防穿越 + 旧目录幂等迁移
 * electron 的 app.getPath 以 vi.mock 注入临时目录（环境隔离，不触碰真实 userData）
 *
 * 作者: 李文煜
 * 日期: 2026-08-28
 *
 * 2026-08-28
 * 变更说明：
 *   1. M4-B 初版
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 全局资源目录 = 测试临时目录下的 resources/（beforeEach 中重建）
let root = ''
vi.mock('electron', () => ({
  app: {
    // getPath('userData') → 临时根目录（惰性求值，调用时 root 已就绪）
    getPath: (_name: string) => root
  }
}))

import { deleteResource, listResources, migrateLegacyResources, saveResource } from './resourceService'
import { tagSetTemplate } from '../../shared/resource'
import type { ResourceTemplate } from '../../shared/types'

/** 最小合法节点模板（手写载荷，避免依赖 BlueprintNode 全字段） */
const nodeTpl = (name: string): ResourceTemplate => ({
  kind: 'node',
  name,
  payload: {
    type: 'text',
    title: name,
    tags: ['设定'],
    aliases: [],
    prompt: '',
    summary: '',
    size: { width: 160, height: 60 }
  }
})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'novel-resources-'))
  // v2-F5：首次 listResources 会种子写入内置结构模板（标记文件驱动）——预消费种子
  // 并清掉结构模板文件，保持既有用例夹具干净（标记已写，后续调用不再种子）
  listResources()
  for (const f of readdirSync(join(root, 'resources'))) {
    if (f.endsWith('.structure.json')) unlinkSync(join(root, 'resources', f))
  }
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('saveResource / listResources（全局目录）', () => {
  it('首次保存自动建目录，listResources 返回并按名称排序', () => {
    const tagSet = tagSetTemplate('标签组', ['设定'])
    const r1 = saveResource(nodeTpl('乙模板'))
    const r2 = saveResource(tagSet)
    expect(existsSync(join(root, 'resources'))).toBe(true)
    expect(r1.path).toBe('乙模板.node.json')
    expect(r2.path).toBe('标签组.tagSet.json')
    const items = listResources()
    // zh-CN 拼音序：标(biāo) < 乙(yǐ)
    expect(items.map((i) => i.template.name)).toEqual(['标签组', '乙模板'])
  })

  it('v2-F5 种子标记驱动：删光结构模板不复活；删标记后重新种子（升级用户可找回）', () => {
    // 夹具已预消费种子并清掉结构模板（标记已写）——不复活
    expect(listResources().filter((i) => i.template.kind === 'structure')).toEqual([])
    // 删标记（模拟 v2 升级前的存量安装）→ 重新种子三骨架
    unlinkSync(join(root, 'resources', '.structures-seeded'))
    const items = listResources()
    expect(items.map((i) => i.template.kind)).toEqual(['structure', 'structure', 'structure'])
    expect(items.map((i) => i.template.name).sort()).toEqual(['三幕结构', '英雄之旅', '救猫咪节拍表'].sort())
    // 二次调用不再重复种子（幂等）
    expect(listResources()).toHaveLength(3)
  })

  it('同名同类型覆盖保存', () => {
    saveResource(tagSetTemplate('标签组', ['设定']))
    saveResource(tagSetTemplate('标签组', ['伏笔', '大纲']))
    const items = listResources()
    expect(items).toHaveLength(1)
    expect(items[0]!.template).toMatchObject({ kind: 'tagSet', payload: { tags: ['伏笔', '大纲'] } })
  })

  it('清洗后撞车但实际不同名时拒写（防静默互相覆盖）', () => {
    saveResource(nodeTpl('主角设定'))
    // 冒号为 Windows 非法字符，清洗后与既有文件同名，但模板名不同 → 拒绝
    expect(() => saveResource(nodeTpl('主角:设定'))).toThrow('请换个名称')
    // 既有模板未被覆盖
    expect(listResources()[0]!.template.name).toBe('主角设定')
  })

  it('坏 JSON 与非模板结构文件跳过（不阻断列表）', () => {
    saveResource(nodeTpl('正常模板'))
    const dir = join(root, 'resources')
    writeFileSync(join(dir, '坏的.json'), 'not-json', 'utf-8')
    writeFileSync(join(dir, '不合规.json'), JSON.stringify({ kind: 'other' }), 'utf-8')
    writeFileSync(join(dir, 'readme.txt'), 'x', 'utf-8')
    expect(listResources().map((i) => i.template.name)).toEqual(['正常模板'])
  })
})

describe('deleteResource（防穿越）', () => {
  it('删除 listResources 返回路径对应的模板', () => {
    saveResource(nodeTpl('待删'))
    const path = listResources()[0]!.path
    deleteResource(path)
    expect(listResources()).toEqual([])
  })

  it('越出资源目录 / 子目录 / 非 json / 绝对路径均拒绝', () => {
    saveResource(nodeTpl('占位'))
    expect(() => deleteResource('../providers.json')).toThrow()
    expect(() => deleteResource('sub/x.json')).toThrow()
    expect(() => deleteResource('x.txt')).toThrow()
    expect(() => deleteResource(join(root, 'resources', 'x.json'))).toThrow()
    // 拒绝的调用未产生副作用
    expect(listResources()).toHaveLength(1)
  })
})

describe('migrateLegacyResources（旧小说目录迁移）', () => {
  it('无旧目录时为 no-op', () => {
    expect(migrateLegacyResources(join(root, '某小说'))).toBe(0)
  })

  it('有效模板复制入全局目录，旧目录文件保留，并写完成标记', () => {
    const novelDir = join(root, '某小说')
    mkdirSync(join(novelDir, 'resources'), { recursive: true })
    writeFileSync(join(novelDir, 'resources', '旧模板.tagSet.json'), JSON.stringify(tagSetTemplate('旧模板', ['设定'])), 'utf-8')
    const migrated = migrateLegacyResources(novelDir)
    expect(migrated).toBe(1)
    expect(listResources().map((i) => i.template.name)).toEqual(['旧模板'])
    // 旧目录原地保留（不删用户数据）；完成标记就位
    expect(existsSync(join(novelDir, 'resources', '旧模板.tagSet.json'))).toBe(true)
    expect(existsSync(join(novelDir, 'resources', '.migrated'))).toBe(true)
  })

  it('全局已有同名文件时跳过（保留全局版本）', () => {
    saveResource(tagSetTemplate('同', ['新版内容']))
    const novelDir = join(root, '某小说')
    mkdirSync(join(novelDir, 'resources'), { recursive: true })
    writeFileSync(join(novelDir, 'resources', '同.tagSet.json'), JSON.stringify(tagSetTemplate('同', ['旧版内容'])), 'utf-8')
    expect(migrateLegacyResources(novelDir)).toBe(0)
    const raw = JSON.parse(readFileSync(join(root, 'resources', '同.tagSet.json'), 'utf-8'))
    expect(raw.payload.tags).toEqual(['新版内容'])
  })

  it('结构不符与非 json 文件跳过；重复执行幂等', () => {
    const novelDir = join(root, '某小说')
    mkdirSync(join(novelDir, 'resources'), { recursive: true })
    writeFileSync(join(novelDir, 'resources', '有效.node.json'), JSON.stringify(nodeTpl('有效')), 'utf-8')
    writeFileSync(join(novelDir, 'resources', '不合规.json'), JSON.stringify({ kind: 'other' }), 'utf-8')
    writeFileSync(join(novelDir, 'resources', 'note.txt'), 'x', 'utf-8')
    expect(migrateLegacyResources(novelDir)).toBe(1)
    // 第二次执行：完成标记短路
    expect(migrateLegacyResources(novelDir)).toBe(0)
    expect(listResources().map((i) => i.template.name)).toEqual(['有效'])
  })

  it('审查回归：全局库删除已迁移模板后重开小说不复活（完成标记）', () => {
    const novelDir = join(root, '某小说')
    mkdirSync(join(novelDir, 'resources'), { recursive: true })
    writeFileSync(join(novelDir, 'resources', '待删.tagSet.json'), JSON.stringify(tagSetTemplate('待删', ['设定'])), 'utf-8')
    expect(migrateLegacyResources(novelDir)).toBe(1)
    expect(listResources().map((i) => i.template.name)).toEqual(['待删'])
    // 用户在资源库删除该模板
    deleteResource(listResources()[0]!.path)
    expect(listResources()).toEqual([])
    // 重开小说：旧文件仍在旧目录，但完成标记阻止复活
    expect(migrateLegacyResources(novelDir)).toBe(0)
    expect(listResources()).toEqual([])
  })
})
