/**
 * 别名编辑器（M4-B，轻量 chips）：蓝图节点与章节 frontmatter 的 aliases 共用
 * 意图式 API（onAdd/onRemove 由消费方解析到最新状态——dialogPrompt 异步返回后闭包快照可能过期，
 * 同 TagEditor.toggleTag 的新鲜读约定）；值校验拒绝逗号/方括号/换行（frontmatter 内联数组裸值语法限制）
 *
 * 作者: 李文煜
 * 日期: 2026-08-28
 *
 * 2026-08-28
 * 变更说明：
 *   1. M4-B 初版（审查遗留低危：aliases 此前只能手改文件，无编辑入口）
 */

import type { ReactElement } from 'react'
import { dialogConfirm, dialogPrompt } from '@/store/dialogStore'

/** 别名中的非法字符：逗号破坏内联数组解析、方括号破坏数组定界、换行破坏行结构、
 *  首尾引号会被 parse 静默剥离导致往返失真（审查修复补充） */
const INVALID_ALIAS = /[,[\]'"\r\n]/

export function AliasEditor(props: {
  values: string[]
  onAdd: (alias: string) => void
  onRemove: (alias: string) => void
  /** 添加对话框标题（节点/章节两侧语境不同） */
  addTitle?: string
}): ReactElement {
  const { values, onAdd, onRemove } = props

  const handleAdd = async (): Promise<void> => {
    const input = await dialogPrompt(props.addTitle ?? '添加别名', '别名（关键词兜底匹配/检索用）')
    if (input === null) return
    const alias = input.trim()
    if (alias === '') return
    // 非法字符校验先于查重：非法输入给出明确提示而不是被查重静默吞掉
    if (INVALID_ALIAS.test(alias)) {
      await dialogConfirm('别名不能包含逗号、方括号、引号或换行（frontmatter 兼容限制），请换个写法', '知道了')
      return
    }
    if (values.includes(alias)) return
    onAdd(alias)
  }

  return (
    <div className="insp-tags alias-editor">
      <div className="insp-tags-chips">
        {values.length === 0 && <span className="insp-hint">无别名（上下文组装的关键词兜底会用到）</span>}
        {/* key 含索引：手改文件可能产生重复别名，裸字符串 key 会触发 React 重复告警 */}
        {values.map((alias, idx) => (
          <span key={`${alias}#${idx}`} className="bp-node-tag insp-tag-chip alias-chip">
            {alias}
            <button className="insp-tag-remove" title="移除别名" onClick={() => onRemove(alias)}>
              ×
            </button>
          </span>
        ))}
        <button className="insp-tag-add" onClick={() => void handleAdd()}>
          + 别名
        </button>
      </div>
    </div>
  )
}
