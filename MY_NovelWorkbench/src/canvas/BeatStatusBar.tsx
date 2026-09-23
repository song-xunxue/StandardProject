/**
 * 单路节拍整章生成状态条（v2 三批遗留修复）：App 根级右下角固定浮层。
 * 承载 beatSingleSession 的会话状态渲染——生成中实时字数+停止按钮（补齐中断入口）、
 * 完成/中断/失败终态提示（补齐失败可见性）。与 .beat-candidates-float 同视觉族；
 * running 态不提供关闭（只有「停止」），终态可手动关（done 态 5s 自动淡出）。
 * 无会话时渲染 null（App 常驻挂载，由会话态驱动显隐）。
 *
 * 作者: 李文煜
 * 日期: 2026-09-23
 */

import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { beatSingleSession } from '@/services/beatSingleSession'
import type { BeatSingleState } from '@/services/beatSingleSession'

/** 完成态自动淡出延迟（ms）——中断/失败保留至手动关闭 */
const DONE_AUTO_DISMISS_MS = 5000

/** 千分位格式化 */
const fmt = (n: number): string => n.toLocaleString('zh-CN')

export function BeatStatusBar(): ReactElement | null {
  const [state, setState] = useState<BeatSingleState | null>(() => beatSingleSession.getState())

  // 订阅会话状态（模块级单例，订阅一次）
  useEffect(() => beatSingleSession.subscribe(() => setState(beatSingleSession.getState())), [])

  // 完成态自动淡出（终态变化时重挂定时器；卸载/回到 running 时清理）
  useEffect(() => {
    if (state?.status !== 'done') return
    const timer = setTimeout(() => beatSingleSession.clear(), DONE_AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [state])

  if (!state) return null

  const running = state.status === 'running'
  const statusText =
    state.status === 'running'
      ? `生成中 ${fmt(state.chars)} 字`
      : state.status === 'done'
        ? `已完成 ${fmt(state.chars)} 字`
        : state.status === 'stopped'
          ? `已中断（保留 ${fmt(state.chars)} 字）`
          : `失败：${state.error ?? '未知错误'}`

  return (
    <div className="beat-status-bar nokey">
      <span className="beat-status-title" title={state.targetTitle}>
        ♬ 节拍整章 · {state.targetTitle}
      </span>
      <span className={`beat-status-text${state.status === 'error' ? ' beat-status-error' : ''}`}>{statusText}</span>
      {running ? (
        <button className="left-tool-btn beat-status-stop" title="中断生成（保留已生成部分）" onClick={() => void beatSingleSession.stop()}>
          ■ 停止
        </button>
      ) : (
        <button className="beat-status-close" title="关闭提示" onClick={() => beatSingleSession.clear()}>
          ×
        </button>
      )}
    </div>
  )
}
