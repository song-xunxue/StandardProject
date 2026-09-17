/**
 * 文本度量纯函数（跨进程共用）
 *
 * 作者: 李文煜
 * 日期: 2026-09-17
 */

/** 正文字数：去空白字符（空格/换行/制表等不计）——码字统计（F7）与章节快照（F8）共用的统一口径 */
export function countChars(content: string): number {
  return content.replace(/\s/g, '').length
}
