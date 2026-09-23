/**
 * 单路节拍整章会话控制器（v2 三批遗留修复）：F16 单路生成的写入器生命周期宿主。
 * 原实现把 GenerationWriter/StreamInserter 挂在 BeatLauncher 浮层 ref 上——
 * 全屏遮罩挡住编辑器与图标条（流式落点不可见）、浮层内无中断入口、失败静默。
 * 迁出为模块级单例后：浮层发起成功即关闭，App 根级 BeatStatusBar 订阅本会话
 * 状态渲染角落状态条（生成中字数/停止/完成/中断/失败提示）。
 * 收尾口径与 AiPanel/原 BeatLauncher 一致：错误丢挂起缓冲（abort）、正常/中断
 * 落地残余（close），随后 writer.finalize 按 markdown 重排生成区。
 *
 * 作者: 李文煜
 * 日期: 2026-09-23
 */

import { StreamInserter } from '@/services/streamInsert'
import { GenerationWriter } from '@/services/generationWriter'
import { useAiStore } from '@/store/aiStore'
import type { ChatMessage } from '@shared/types'

/** 单路会话对外状态（BeatStatusBar 渲染依据） */
export interface BeatSingleState {
  /** running=流式中；done=自然完成；stopped=用户中断（保留已落文本）；error=生成失败 */
  status: 'running' | 'done' | 'stopped' | 'error'
  /** 已生成字符数（流式批次原样累计，状态条展示口径） */
  chars: number
  /** 失败文案（status==='error' 时） */
  error: string | null
  /** 目标章标题（状态条展示） */
  targetTitle: string
}

/** 会话发起参数 */
export interface BeatSingleStartOptions {
  messages: ChatMessage[]
  maxTokens: number
  targetTitle: string
}

class BeatSingleSession {
  private writer: GenerationWriter | null = null
  private inserter: StreamInserter | null = null
  private state: BeatSingleState | null = null
  private listeners = new Set<() => void>()
  /** 用户主动停止标记（区分 done 与 stopped；发起时重置） */
  private stopRequested = false
  /** aiStore 订阅（单例生命周期内只挂一次，无会话时是 no-op） */
  private unsubscribeStore: (() => void) | null = null

  /** 当前状态（null=无会话——状态条不渲染） */
  getState(): BeatSingleState | null {
    return this.state
  }

  /** 状态变化订阅（返回取消函数） */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private patch(partial: Partial<BeatSingleState>): void {
    if (!this.state) return
    this.state = { ...this.state, ...partial }
    for (const fn of this.listeners) fn()
  }

  /**
   * 发起单路生成：创建写入器并走 aiStore.startGeneration（沿用其互斥守卫与
   * requestId 路由）。发起失败自清理后原样上抛（调用方负责提示），不进入会话态
   */
  async start(opts: BeatSingleStartOptions): Promise<void> {
    // 仅 running 态拒绝重复发起（终态未清理时允许直接开新会话，状态条随新会话刷新）
    if (this.state?.status === 'running') throw new Error('单路会话已存在')
    this.ensureStoreSubscription()
    this.stopRequested = false
    this.state = { status: 'running', chars: 0, error: null, targetTitle: opts.targetTitle }
    const writer = new GenerationWriter(() => useAiStore.getState().chapterEditor)
    // 字数在批次落地回调里累计（帧合并后的原样字符数，展示口径）
    const inserter = new StreamInserter((batch) => {
      writer.applyBatch(batch)
      if (this.state) this.patch({ chars: this.state.chars + batch.length })
    })
    this.writer = writer
    this.inserter = inserter
    for (const fn of this.listeners) fn()
    try {
      await useAiStore.getState().startGeneration('continue', opts.messages, (delta) => this.inserter?.push(delta), {
        maxTokens: opts.maxTokens
      })
    } catch (err) {
      // 发起失败（未选择 Provider/互斥守卫等）：abort 丢挂起 + finalize 空生成区（原文不动），
      // 清会话态（调用方负责弹提示——不进 error 会话态，避免状态条与对话框双重提示）
      this.writer = null
      this.inserter = null
      inserter.abort()
      writer.finalize()
      this.state = null
      for (const fn of this.listeners) fn()
      throw err
    }
  }

  /** 用户中断：stopGeneration 同步摘会话 → store 订阅触发 finish（标记 stopped） */
  async stop(): Promise<void> {
    if (!this.state || this.state.status !== 'running') return
    this.stopRequested = true
    await useAiStore.getState().stopGeneration()
  }

  /** 终态后清空会话（状态条关闭按钮；running 态 UI 不提供本入口） */
  clear(): void {
    if (this.state?.status === 'running') return
    this.state = null
    for (const fn of this.listeners) fn()
  }

  /** 订阅 aiStore：generation 由非空转空 = 本会话流结束（done/error/stopped 收尾） */
  private ensureStoreSubscription(): void {
    if (this.unsubscribeStore) return
    this.unsubscribeStore = useAiStore.subscribe((state, prev) => {
      if (prev.generation !== null && state.generation === null && this.writer) this.finish()
    })
  }

  /** 收尾：错误丢挂起缓冲，正常/中断落地残余；finalize 按 markdown 重排生成区 */
  private finish(): void {
    const writer = this.writer
    const inserter = this.inserter
    this.writer = null
    this.inserter = null
    if (!writer) return
    if (!this.state) {
      writer.finalize()
      return
    }
    const error = useAiStore.getState().generationError
    if (error && !this.stopRequested) {
      inserter?.abort()
      this.patch({ status: 'error', error })
    } else {
      inserter?.close()
      this.patch({ status: this.stopRequested ? 'stopped' : 'done' })
    }
    writer.finalize()
  }
}

/** 模块级单例（App 生命周期内唯一——与 aiStore 单会话 generation 一一对应） */
export const beatSingleSession = new BeatSingleSession()
