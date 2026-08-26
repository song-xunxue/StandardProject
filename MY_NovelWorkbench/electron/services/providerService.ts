/**
 * AI Provider 服务（主进程）：多 Provider 配置 CRUD + safeStorage 加密存储 + 连接测试
 * 架构（ADR-9/16）：OpenAI 兼容 baseURL+key+model 一套；API Key 经 safeStorage 加密后
 * 以 base64 内嵌 userData/providers.json（非敏感字段明文）；.env 三变量仅开发期联调默认值
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M3 初版
 */

import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ProviderConfig, ProviderInfo } from '../../shared/types'

/** .env 开发期默认 Provider 的固定 id（不入盘，list 时动态合成） */
export const ENV_PROVIDER_ID = 'env-default'

function providersPath(): string {
  return join(app.getPath('userData'), 'providers.json')
}

/** 读取全部已保存配置（损坏/结构不符静默降级为空表） */
function loadProviders(): ProviderConfig[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(providersPath(), 'utf-8'))
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p): p is ProviderConfig =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as ProviderConfig).id === 'string' &&
        typeof (p as ProviderConfig).name === 'string' &&
        typeof (p as ProviderConfig).baseURL === 'string' &&
        typeof (p as ProviderConfig).model === 'string'
    )
  } catch {
    return []
  }
}

/** tmp+rename 原子写（与 novelService 的 recent.json/saveMeta 同模式） */
function saveProvidersAtomically(list: ProviderConfig[]): void {
  const target = providersPath()
  const tmp = `${target}.tmp`
  writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf-8')
  renameSync(tmp, target)
}

/** 解析项目根 .env（仅开发期；取 NOVEL_LLM_* 三变量作联调默认值，见 .env.example） */
function loadEnvFile(): Record<string, string> {
  if (app.isPackaged) return {}
  try {
    const envPath = join(app.getAppPath(), '.env')
    if (!existsSync(envPath)) return {}
    const out: Record<string, string> = {}
    for (const line of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
      if (!m) continue // 注释/空行
      // 未加引号的值剥离行内注释（dotenv 惯例：# 之后为注释）
      let raw = m[2]!
      if (!/^['"]/.test(raw)) raw = raw.replace(/\s+#.*$/, '')
      const value = raw.replace(/^['"]|['"]$/g, '')
      out[m[1]!] = value
    }
    return out
  } catch {
    return {}
  }
}

/** .env 开发期默认 Provider（未配置三变量时为 null；不入盘） */
function envDefaultProvider(): ProviderConfig | null {
  const env = loadEnvFile()
  const baseURL = env['NOVEL_LLM_BASE_URL'] || process.env['NOVEL_LLM_BASE_URL'] || ''
  const model = env['NOVEL_LLM_MODEL'] || process.env['NOVEL_LLM_MODEL'] || ''
  if (!baseURL || !model) return null
  return { id: ENV_PROVIDER_ID, name: '默认（.env 联调）', baseURL, model, isDefault: true }
}

/** 密文 → 渲染层可见信息（密文剔除，hasKey 真实反映密钥可用性——含 env Provider 探测） */
function toInfo(p: ProviderConfig): ProviderInfo {
  const { apiKeyEnc: _enc, ...rest } = p
  return { ...rest, hasKey: Boolean(p.apiKeyEnc) || (p.id === ENV_PROVIDER_ID && Boolean(resolveApiKey(p))) }
}

/** Provider 列表：已保存配置；为空时回退 .env 默认（开发期联调零配置可用） */
export function listProviders(): ProviderInfo[] {
  const saved = loadProviders()
  if (saved.length > 0) return saved.map(toInfo)
  const env = envDefaultProvider()
  return env ? [toInfo(env)] : []
}

/** 保存 Provider：apiKey 明文经 IPC 进来即加密（safeStorage 不可用时拒绝保存密钥，ADR-16 不降级明文） */
export function saveProvider(config: Omit<ProviderConfig, 'apiKeyEnc'>, apiKey?: string): ProviderInfo {
  if (!config.name || !config.baseURL || !config.model) {
    throw new Error('Provider 配置不完整（名称 / Base URL / 模型均必填）')
  }
  // env 联调 Provider 是运行时合成的（不入盘）——不得以该 id 持久化（否则成为无法删除的幽灵条目）
  if (config.id === ENV_PROVIDER_ID) {
    throw new Error('.env 联调默认 Provider 不可保存为正式配置，请新建 Provider')
  }
  const list = loadProviders()
  const existing = list.find((p) => p.id === config.id)
  let apiKeyEnc: string | undefined = existing?.apiKeyEnc // 未传新 key 时保留旧密文
  if (apiKey !== undefined && apiKey !== '') {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('系统密钥链不可用，无法加密保存 API Key（ADR-16）')
    }
    apiKeyEnc = safeStorage.encryptString(apiKey).toString('base64')
  }
  const next: ProviderConfig = { ...config, apiKeyEnc }
  if (existing) {
    list[list.indexOf(existing)] = next
  } else {
    next.id = next.id || `p-${randomUUID().slice(0, 8)}`
    list.push(next)
  }
  // 唯一默认：置默认时清除其他默认标记
  if (next.isDefault) {
    for (const p of list) if (p.id !== next.id) p.isDefault = undefined
  }
  saveProvidersAtomically(list)
  return toInfo(next)
}

/** 删除 Provider */
export function deleteProvider(id: string): void {
  if (id === ENV_PROVIDER_ID) throw new Error('.env 联调默认 Provider 不可删除（清空 .env 即可）')
  saveProvidersAtomically(loadProviders().filter((p) => p.id !== id))
}

/** 取完整配置（含密文，仅主进程内部使用） */
export function getProviderConfig(id: string): ProviderConfig | null {
  if (id === ENV_PROVIDER_ID) return envDefaultProvider()
  return loadProviders().find((p) => p.id === id) ?? null
}

/** 解密 API Key（env Provider 取 .env 明文；无密钥返回 undefined——Ollama 等本地端点可无鉴权） */
export function resolveApiKey(config: ProviderConfig): string | undefined {
  if (config.id === ENV_PROVIDER_ID) {
    const env = loadEnvFile()
    return env['NOVEL_LLM_API_KEY'] || process.env['NOVEL_LLM_API_KEY'] || undefined
  }
  if (!config.apiKeyEnc) return undefined
  if (!safeStorage.isEncryptionAvailable()) return undefined
  try {
    return safeStorage.decryptString(Buffer.from(config.apiKeyEnc, 'base64'))
  } catch (err) {
    console.error('[providerService] API Key 解密失败:', err)
    return undefined
  }
}

/** 连接测试：GET {baseURL}/models（OpenAI 兼容标准端点；Ollama 亦支持） */
export async function testProvider(id: string): Promise<{ ok: boolean; message: string }> {
  const config = getProviderConfig(id)
  if (!config) return { ok: false, message: 'Provider 不存在' }
  const key = resolveApiKey(config)
  const url = `${config.baseURL.replace(/\/+$/, '')}/models`
  try {
    const res = await fetch(url, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 200)
      return { ok: false, message: `HTTP ${res.status}${body ? `：${body}` : ''}` }
    }
    return { ok: true, message: '连接成功' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
