/**
 * [[wikilink]] 扩展（Tiptap v3 Mark）：正文内双向链接
 * 能力：[[ 触发输入补全（中文正文任意位置可触发，allowedPrefixes: null）/
 *       [[目标]] markdown 双向编解码（@tiptap/markdown 自定义 token）/
 *       悬浮预览卡片（floating-ui 定位）/ 点击跳转
 * IME 注意：onKeyDown 对 isComposing 放行（拼音上屏优先），全角 ［ 不触发（已知限制）
 *
 * 作者: 李文煜
 * 日期: 2026-08-26
 *
 * 2026-08-26
 * 变更说明：
 *   1. M3 初版
 */

import { Mark, mergeAttributes } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { computePosition, flip, offset } from '@floating-ui/dom'

/** 补全候选：蓝图节点或章节文件 */
export interface WikilinkItem {
  /** 落入 [[...]] 的目标文本（节点标题或章节名） */
  target: string
  /** 候选类型标识（下拉展示用） */
  kind: 'node' | 'chapter'
  label: string
}

/** 悬浮预览信息 */
export interface WikilinkPreview {
  title: string
  description: string
}

export interface WikilinkOptions {
  /** 补全候选（query 过滤由调用方实现） */
  items: (query: string) => WikilinkItem[]
  /** 悬浮预览数据（无匹配返回 null） */
  lookup: (target: string) => WikilinkPreview | null
  /** 点击 wikilink 跳转 */
  onNavigate: (target: string) => void
}

/** wikilink 语法：[[目标]]（目标内不允许换行与方括号，长度 1-120） */
const WIKILINK_RE = /^\[\[([^\[\]\n]{1,120})\]\]/

export const wikilinkPluginKey = new PluginKey('wikilinkHover')

export const Wikilink = Mark.create<WikilinkOptions>({
  name: 'wikilink',

  // inclusive:false——光标移到链接末尾后继续打字不得被吸收进 [[...]]
  // （ProseMirror 默认 true 会把后续输入并入 mark，落盘后 target 被污染——审查修复）
  inclusive: false,
  // 拆分（回车）时不保留 mark
  keepOnSplit: false,

  addOptions() {
    return {
      items: () => [],
      lookup: () => null,
      onNavigate: () => {}
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-wikilink]' }]
  },

  renderHTML({ mark, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-wikilink': mark.attrs.target, class: 'wikilink' }), 0]
  },

  addAttributes() {
    return {
      target: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-wikilink') ?? '',
        renderHTML: () => ({})
        // 真实属性由 renderHTML 顶层注入 data-wikilink
      }
    }
  },

  // ---- @tiptap/markdown v3 契约：自定义 token 双向编解码 ----
  markdownTokenName: 'wikilink',

  parseMarkdown(token, h) {
    const target = String(token['text'] ?? '')
    return { mark: 'wikilink', attrs: { target }, content: [h.createTextNode(target)] }
  },

  renderMarkdown(node, h) {
    // mark 序列化契约：manager 以「合成节点 + 占位符文本」探测开/闭定界符
    // （getMarkOpening/Closing 取占位符前/后部分），必须输出 [[<内容>]] 形态；
    // 实际文本由 encodeTextForMarkdown 转义后夹在 [[ 与 ]] 之间
    const inner =
      typeof node['text'] === 'string'
        ? node['text']
        : (h?.renderChildren?.(node['content'] ?? []) ?? String(node['attrs']?.['target'] ?? ''))
    return `[[${inner}]]`
  },

  markdownTokenizer: {
    name: 'wikilink',
    level: 'inline',
    start: '[[',
    tokenize(src) {
      const match = WIKILINK_RE.exec(src)
      if (!match) return undefined
      return { type: 'wikilink', raw: match[0], text: match[1]! }
    }
  },

  addProseMirrorPlugins() {
    const options = this.options
    return [
      // [[ 触发的输入补全（allowedPrefixes: null——中文正文任意位置可触发）
      Suggestion({
        editor: this.editor,
        char: '[[',
        allowedPrefixes: null,
        allowSpaces: false,
        items: ({ query }) => options.items(query),
        command: ({ editor, range, props }) => {
          // 删除触发文本 → 插入目标文本 → 加 wikilink mark → 光标移到链接后
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContentAt(range.from, props.target)
            .setTextSelection({ from: range.from, to: range.from + props.target.length })
            .setMark('wikilink', { target: props.target })
            .setTextSelection(range.from + props.target.length)
            .run()
        },
        render: () => createSuggestionDropdown()
      }),
      // 悬浮预览 + 点击跳转
      new Plugin({
        key: wikilinkPluginKey,
        props: {
          handleDOMEvents: {
            mouseover: (_view, event) => {
              const el = (event.target as HTMLElement | null)?.closest?.('.wikilink')
              if (!el) return false
              showPreview(el as HTMLElement, options)
              return false
            },
            mouseout: (_view, event) => {
              const el = (event.target as HTMLElement | HTMLElement | null)?.closest?.('.wikilink')
              if (el) hidePreview()
              return false
            },
            click: (_view, event) => {
              const el = (event.target as HTMLElement | null)?.closest?.('.wikilink')
              if (!el) return false
              // 跳转前先收起预览卡（跳转后被悬浮元素已从 DOM 移除，不会再收到 mouseout）
              hidePreview()
              const target = el.getAttribute('data-wikilink')
              if (target) options.onNavigate(target)
              return false
            }
          }
        },
        // 编辑器销毁兜底收起预览卡（模块级单例挂在 document.body，不随编辑器销毁）
        view() {
          return { destroy: () => hidePreview() }
        }
      })
    ]
  }
})

// ---- 补全下拉（纯 DOM：props.mount 由 v3 suggestion 内置 floating-ui 定位） ----

interface DropdownState {
  el: HTMLDivElement
  items: WikilinkItem[]
  active: number
  command: (item: WikilinkItem) => void
  unmount?: () => void
}

let dropdown: DropdownState | null = null

function createSuggestionDropdown() {
  return {
    onStart: (props: SuggestionRenderProps): void => {
      const el = document.createElement('div')
      el.className = 'wikilink-menu'
      dropdown = { el, items: props.items, active: 0, command: props.command }
      // v3：把元素交给 suggestion 挂载与定位（滚动/resize 自动跟随）
      dropdown.unmount = props.mount(el)
      renderDropdown()
    },
    onUpdate: (props: SuggestionRenderProps): void => {
      if (!dropdown) return
      dropdown.items = props.items
      dropdown.active = 0
      dropdown.command = props.command
      renderDropdown()
    },
    onKeyDown: (props: { event: KeyboardEvent }): boolean => {
      // IME 组合中放行（拼音上屏优先，防止回车误选候选）
      if (props.event.isComposing) return false
      if (!dropdown) return false
      const { event } = props
      if (event.key === 'ArrowDown') {
        dropdown.active = (dropdown.active + 1) % Math.max(dropdown.items.length, 1)
        renderDropdown()
        return true
      }
      if (event.key === 'ArrowUp') {
        dropdown.active = (dropdown.active - 1 + dropdown.items.length) % Math.max(dropdown.items.length, 1)
        renderDropdown()
        return true
      }
      if (event.key === 'Enter') {
        const item = dropdown.items[dropdown.active]
        if (item) {
          dropdown.command(item)
          closeDropdown()
        }
        return true
      }
      if (event.key === 'Escape') {
        closeDropdown()
        return true
      }
      return false
    },
    onExit: (): void => closeDropdown()
  }
}

/** v3 suggestion render 生命周期回调的实际入参形状（只取用到字段） */
interface SuggestionRenderProps {
  items: WikilinkItem[]
  command: (item: WikilinkItem) => void
  mount: (el: HTMLElement) => () => void
}

function renderDropdown(): void {
  if (!dropdown) return
  const { el, items, active } = dropdown
  el.innerHTML = ''
  if (items.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'wikilink-menu-empty'
    empty.textContent = '无匹配的节点或章节'
    el.appendChild(empty)
    return
  }
  items.forEach((item, i) => {
    const row = document.createElement('button')
    row.type = 'button'
    row.className = `wikilink-menu-item ${i === active ? 'active' : ''}`
    const kind = document.createElement('span')
    kind.className = 'wikilink-menu-kind'
    kind.textContent = item.kind === 'chapter' ? '正文' : '节点'
    const label = document.createElement('span')
    label.textContent = item.label
    row.appendChild(kind)
    row.appendChild(label)
    // mousedown（先于编辑器 blur）选中
    row.addEventListener('mousedown', (e) => {
      e.preventDefault()
      dropdown?.command(item)
      closeDropdown()
    })
    el.appendChild(row)
  })
}

function closeDropdown(): void {
  dropdown?.unmount?.()
  dropdown = null
}

// ---- 悬浮预览卡片（floating-ui 定位，模块级单例） ----

let previewEl: HTMLDivElement | null = null

function showPreview(anchor: HTMLElement, options: WikilinkOptions): void {
  const target = anchor.getAttribute('data-wikilink')
  if (!target) return
  const info = options.lookup(target)
  if (!info) return
  if (!previewEl) {
    previewEl = document.createElement('div')
    previewEl.className = 'wikilink-preview'
    document.body.appendChild(previewEl)
  }
  previewEl.innerHTML = ''
  const title = document.createElement('div')
  title.className = 'wikilink-preview-title'
  title.textContent = info.title
  previewEl.appendChild(title)
  if (info.description !== '') {
    const desc = document.createElement('div')
    desc.className = 'wikilink-preview-desc'
    desc.textContent = info.description
    previewEl.appendChild(desc)
  }
  const hint = document.createElement('div')
  hint.className = 'wikilink-preview-hint'
  hint.textContent = '点击跳转'
  previewEl.appendChild(hint)
  previewEl.style.display = 'block'
  void computePosition(anchor, previewEl, { placement: 'top-start', middleware: [offset(6), flip()] }).then(
    ({ x, y }) => {
      if (!previewEl) return
      previewEl.style.left = `${x}px`
      previewEl.style.top = `${y}px`
    }
  )
}

function hidePreview(): void {
  if (previewEl) previewEl.style.display = 'none'
}
