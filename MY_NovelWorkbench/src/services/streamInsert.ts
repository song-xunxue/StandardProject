/**
 * 流式插入器（R7 对策）：LLM 分块文本的节流批量写入编辑器
 * 机制：delta 先入缓冲，按帧（requestAnimationFrame，退化为 16ms 定时）合并成批
 * 调用 apply —— 高频 chunk 不会逐个触发 ProseMirror 事务，避免大文档卡顿
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M3 初版
 */

export type CancelFn = () => void
export type ScheduleFn = (cb: () => void) => CancelFn

/** 默认帧调度：requestAnimationFrame 优先，无 rAF 环境（测试/降级）用 16ms 定时（≈60fps） */
export const frameSchedule: ScheduleFn = (cb) => {
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(cb)
    return () => cancelAnimationFrame(id)
  }
  const timer = setTimeout(cb, 16)
  return () => clearTimeout(timer)
}

export class StreamInserter {
  private buffer = ''
  private cancel: CancelFn | null = null
  private closed = false

  constructor(
    /** 批量落地回调（一帧内累积的全部 delta） */
    private readonly apply: (text: string) => void,
    private readonly schedule: ScheduleFn = frameSchedule
  ) {}

  /** 追加增量（已关闭后静默丢弃） */
  push(delta: string): void {
    if (this.closed || delta === '') return
    this.buffer += delta
    if (this.cancel === null) {
      this.cancel = this.schedule(() => {
        this.cancel = null
        this.drain()
      })
    }
  }

  /** 立即落地挂起缓冲（流结束/中断时调用） */
  flush(): void {
    if (this.cancel !== null) {
      this.cancel()
      this.cancel = null
    }
    this.drain()
  }

  /** 关闭：落地残余并停止接收 */
  close(): void {
    this.flush()
    this.closed = true
  }

  /** 丢弃挂起缓冲并停止（错误中断时不落半个词） */
  abort(): void {
    if (this.cancel !== null) {
      this.cancel()
      this.cancel = null
    }
    this.buffer = ''
    this.closed = true
  }

  private drain(): void {
    if (this.buffer === '') return
    const text = this.buffer
    this.buffer = ''
    this.apply(text)
  }
}
