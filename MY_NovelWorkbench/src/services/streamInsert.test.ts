/**
 * 流式插入器单测（M3，R7 节流批量）
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M3 初版：帧合并/立即冲刷/关闭丢弃/错误中断
 */

import { describe, expect, it } from 'vitest'
import type { CancelFn } from './streamInsert'
import { StreamInserter } from './streamInsert'

/** 手动帧调度：step() 触发一帧 */
function manualSchedule(): { schedule: (cb: () => void) => CancelFn; step: () => void } {
  let pending: (() => void) | null = null
  return {
    schedule: (cb) => {
      pending = cb
      return () => {
        if (pending === cb) pending = null
      }
    },
    step: () => {
      const cb = pending
      pending = null
      cb?.()
    }
  }
}

describe('StreamInserter', () => {
  it('同帧多次 push 合并为一次 apply', () => {
    const { schedule, step } = manualSchedule()
    const applied: string[] = []
    const inserter = new StreamInserter((t) => applied.push(t), schedule)
    inserter.push('少')
    inserter.push('年')
    inserter.push('提剑')
    expect(applied).toEqual([]) // 帧未触发不落地
    step()
    expect(applied).toEqual(['少年提剑'])
    inserter.close()
  })

  it('跨帧分批；帧间隔内再 push 复用同一次调度', () => {
    const { schedule, step } = manualSchedule()
    const applied: string[] = []
    const inserter = new StreamInserter((t) => applied.push(t), schedule)
    inserter.push('a')
    inserter.push('b')
    step()
    inserter.push('c')
    step()
    inserter.push('d')
    inserter.push('e')
    step()
    expect(applied).toEqual(['ab', 'c', 'de'])
    inserter.close()
  })

  it('close 先落地残余再停止接收', () => {
    const { schedule } = manualSchedule()
    const applied: string[] = []
    const inserter = new StreamInserter((t) => applied.push(t), schedule)
    inserter.push('尾批')
    inserter.close()
    expect(applied).toEqual(['尾批'])
    inserter.push('late')
    expect(applied).toEqual(['尾批'])
  })

  it('abort 丢弃挂起缓冲', () => {
    const { schedule, step } = manualSchedule()
    const applied: string[] = []
    const inserter = new StreamInserter((t) => applied.push(t), schedule)
    inserter.push('半个')
    inserter.abort()
    step() // 残余调度已取消
    expect(applied).toEqual([])
  })

  it('flush 立即落地且不清空后续接收（close 才停）', () => {
    const { schedule } = manualSchedule()
    const applied: string[] = []
    const inserter = new StreamInserter((t) => applied.push(t), schedule)
    inserter.push('x')
    inserter.flush()
    expect(applied).toEqual(['x'])
    inserter.push('y')
    inserter.flush()
    expect(applied).toEqual(['x', 'y'])
    inserter.close()
  })

  it('空 delta 与关闭后的 push 均为无操作', () => {
    const { schedule } = manualSchedule()
    const applied: string[] = []
    const inserter = new StreamInserter((t) => applied.push(t), schedule)
    inserter.push('')
    inserter.close()
    inserter.push('z')
    expect(applied).toEqual([])
  })
})
