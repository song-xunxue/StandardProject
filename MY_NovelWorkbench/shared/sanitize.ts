/**
 * 文件名清洗（纯函数）：标题 → 安全文件名（Windows 保留字符过滤）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. M1 初版：过滤 Windows 非法字符与首尾空白/点号，空结果回退「未命名」
 */

/** 清洗为安全的文件名成分（不含扩展名） */
export function sanitizeFileName(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, '') // Windows 保留字符
    .replace(/[\x00-\x1f]/g, '') // 控制字符
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '') // 首尾点号/空格（Windows 特殊）
  return cleaned === '' ? '未命名' : cleaned.slice(0, 80)
}
