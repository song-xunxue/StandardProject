/**
 * 时间线矩阵视图（v2-F4）：Plottr 式「行=情节线、列=章节」投影
 * 行=标签维度（ref 节点身上的标签，含「未标签」聚合行）；列=章节（「第N章」数字序）；
 * 格=该章存在挂此标签的引用节点则点亮（伏笔行特殊色）——角色/支线在各章的排布一眼可见。
 * 点击格子/列头跳转打开章节 Tab；数据纯渲染层派生（graphStore.nodes + novelStore.tree），
 * 不新增 IPC。图标条 timeline 项全宽覆盖层（与全局图谱同模式）
 *
 * 作者: 李文煜
 * 日期: 2026-09-01
 *
 * 2026-09-01
 * 变更说明：
 *   1. v2-F4 初版
 */

import { useMemo } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import type { BlueprintNode } from '@shared/blueprint'
import { tagColorOf } from '@shared/tags'
import { useGraphStore } from '@/store/graphStore'
import { useNovelStore } from '@/store/novelStore'
import { flattenChapterFiles } from '@/services/chapterTree'

/** 未挂任何标签的引用节点聚合到这一行 */
const UNTAGGED = '（未标签）'

export function TimelineView(props: { onClose: () => void }): ReactElement {
  const nodes = useGraphStore((s) => s.nodes)
  const tree = useNovelStore((s) => s.tree)
  const tagLibrary = useNovelStore((s) => s.novel?.tagLibrary ?? [])

  /** 章节列（按「第N章」数字序；含卷内） */
  const chapters = useMemo(() => flattenChapterFiles(tree), [tree])

  /** 行与点亮格：ref 节点（有 refTarget 且指向现存章节）按标签分组成行 */
  const { rows, totalHits } = useMemo(() => {
    const byPath = new Map(chapters.map((c) => [c.path, c]))
    const hitsOfTag = new Map<string, Map<string, Array<BlueprintNode>>>() // tag → chapterPath → 节点们
    for (const node of Object.values(nodes)) {
      if (node.type !== 'ref' || !node.refTarget) continue
      const ch = byPath.get(node.refTarget)
      if (!ch) continue // 指向蓝图或已删章节的引用不进矩阵
      const tags = node.tags.length > 0 ? node.tags : [UNTAGGED]
      for (const tag of tags) {
        if (!hitsOfTag.has(tag)) hitsOfTag.set(tag, new Map())
        const byCh = hitsOfTag.get(tag)!
        if (!byCh.has(ch.path)) byCh.set(ch.path, [])
        byCh.get(ch.path)!.push(node)
      }
    }
    // 行序：标签库顺序优先，库外自定义标签按字典序殿后
    const libOrder = new Map(tagLibrary.map((t, i) => [t.name, i]))
    const rowNames = [...hitsOfTag.keys()].sort((a, b) => {
      if (a === UNTAGGED) return 1
      if (b === UNTAGGED) return -1
      const ia = libOrder.get(a) ?? 999
      const ib = libOrder.get(b) ?? 999
      return ia !== ib ? ia - ib : a.localeCompare(b, 'zh-CN')
    })
    let total = 0
    for (const byCh of hitsOfTag.values()) for (const list of byCh.values()) total += list.length
    return { rows: rowNames.map((name) => ({ name, hits: hitsOfTag.get(name)! })), totalHits: total }
  }, [nodes, chapters, tagLibrary])

  const chapterCount = chapters.length
  const openChapter = (path: string): void => {
    useNovelStore.getState().openTab('chapter', path)
  }

  return (
    <div className="graph-fullview nokey timeline-fullview">
      <div className="graph-header">
        <span className="graph-title">时间线矩阵</span>
        <span className="graph-stats">
          {chapterCount} 章 × {rows.length} 情节线 · 引用 {totalHits} · 提示：行=标签（引用节点的标签），伏笔行红色高亮，点击格子打开该章
        </span>
        <button className="graph-close" title="返回工作区" onClick={props.onClose}>
          × 关闭矩阵
        </button>
      </div>
      <div className="timeline-scroll left-scroll">
        {rows.length === 0 || chapterCount === 0 ? (
          <div className="timeline-empty">
            {chapterCount === 0
              ? '尚无章节——先在左侧创建章节'
              : '尚无点亮格——在蓝图创建引用节点（§）并「指向」章节、贴上标签，即可在此看到情节线排布'}
          </div>
        ) : (
          <table className="timeline-table">
            <thead>
              <tr>
                <th className="timeline-corner">情节线 ╲ 章节</th>
                {chapters.map((c) => (
                  <th key={c.path} className="timeline-ch" title={`${c.path}（点击打开）`} onClick={() => openChapter(c.path)}>
                    <span className="timeline-ch-title">{c.title}</span>
                    {c.volume && <span className="timeline-ch-vol">{c.volume}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const color = row.name === UNTAGGED ? '#6b7078' : (tagColorOf(tagLibrary, row.name) ?? '#9da0a8')
                const foreshadow = row.name === '伏笔'
                return (
                  <tr key={row.name} className={foreshadow ? 'timeline-row-foreshadow' : undefined}>
                    <th className="timeline-rowhead">
                      <span className="bp-node-tag-dot" style={{ background: foreshadow ? '#e08a8a' : color }} />
                      {row.name}
                    </th>
                    {chapters.map((c) => {
                      const hits = row.hits.get(c.path)
                      return (
                        <td key={c.path} className="timeline-cell">
                          {hits && hits.length > 0 && (
                            <button
                              type="button"
                              className={`timeline-dot${foreshadow ? ' foreshadow' : ''}`}
                              style={{ '--dot-color': foreshadow ? '#e08a8a' : color } as CSSProperties}
                              title={`${hits.map((h) => h.title).join('、')} → ${c.title}（点击打开）`}
                              onClick={() => openChapter(c.path)}
                            >
                              {hits.length > 1 ? hits.length : ''}
                            </button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="canvas-hint">行=情节线（引用节点标签） · 列=章节（数字序） · 伏笔行红点 · 点亮格含引用计数 · 点击跳章</div>
    </div>
  )
}
