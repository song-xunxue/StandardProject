/**
 * 左侧创建栏：文件树（蓝图按 owner 层级 / 章节按卷分组）
 * M3+ 交互批次：
 *   - 统一双击打开（单击仅选中高亮）
 *   - 目录右键菜单：blueprints→新建蓝图；chapters→新增卷/章节；卷→卷内新增章节
 *   - 「第N卷/第N章」自动序号（同级最大序号 +1 预填，可改）
 *   - 章节树项拖动到另一章节 = 交换两章位置（文件名互换，内容对调）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. 初版：静态项目树占位 + 底部运行时版本信息
 *   2. M1：真实文件树（novelStore.tree）、新建/打开小说、新建蓝图/章节、重命名/删除
 *   3. M3 交互增强：蓝图按 owner 关系呈现嵌套层级（父级可折叠）
 *   4. M3+ 批次：双击打开 / 目录右键创建（卷与章节自动序号）/ 章节拖动交换
 *
 * 2026-08-28
 * 变更说明：
 *   1. M5：footer 新增「快照」入口（SnapshotPanel 浮层：创建/列表/恢复/删除，ADR-14）
 *
 * 2026-08-30
 * 变更说明：
 *   1. 体验优化批次：文件项右键菜单补齐常用操作（打开/重命名/删除，与 hover 按钮
 *      能力对齐）；菜单实现迁移共享 useContextMenu hook
 *   2. 性能批次：蓝图层级展示改为「owner 关系签名」订阅（坐标/属性变更不再触发
 *      buildBlueprintHierarchy 全量重算与整树重渲——签名仅由图 owner 链决定）
 *
 * 2026-08-31
 * 变更说明：
 *   1. v2 阶段二：footer 新增「统计」（StatsPanel，F7）与「敏感词」（SensitivePanel，F6）入口
 */

import { useMemo, useRef, useState } from 'react'
import type { ReactElement, MouseEvent as ReactMouseEvent } from 'react'
import type { TreeNode } from '@shared/types'
import { useNovelStore } from '@/store/novelStore'
import { useGraphStore } from '@/store/graphStore'
import { dialogConfirm, dialogPrompt } from '@/store/dialogStore'
import { defaultTitle, nextNumberedName } from '@/services/naming'
import { volumeOfChapter } from '@/services/chapterTree'
import { pathToGraph } from '@/services/graphTraversal'
import { MAX_NESTING_DEPTH } from '@shared/blueprint'
import { SnapshotPanel } from './SnapshotPanel'
import { StatsPanel } from './StatsPanel'
import { SensitivePanel } from './SensitivePanel'
import { useContextMenu } from '@/components/useContextMenu'

const displayTitle = (name: string): string => name.replace(/\.blueprint\.json$/, '').replace(/\.md$/, '')

/** 右键菜单目标区域 */
type MenuArea =
  | 'blueprints'
  | 'chapters'
  | { volume: string } // 卷行：卷内新增章节
  | { blueprintItem: string; name: string } // 蓝图项行：打开/重命名/删除 + 新建子蓝图（挂其内）/ 新建顶层蓝图
  | { chapterItem: string; name: string } // 章节项行：打开/重命名/删除 + 同目录新增章节

/**
 * 把 blueprints/ 的平铺文件按 owner 归属关系重排为层级：
 * 每张图的 owner 蓝图节点所在图 = 父级；根图（owner 为 null）与孤儿（父文件已删）作为顶层
 */
function buildBlueprintHierarchy(
  items: TreeNode[],
  graphs: ReturnType<typeof useGraphStore.getState>['graphs'],
  gnodes: ReturnType<typeof useGraphStore.getState>['nodes'],
  graphPaths: Record<string, string>
): TreeNode[] {
  const pathToGraphId = new Map<string, string>()
  for (const [gid, path] of Object.entries(graphPaths)) pathToGraphId.set(path, gid)
  const itemPaths = new Set(items.map((i) => i.path))

  const parentOf = (item: TreeNode): string | null => {
    const gid = pathToGraphId.get(item.path)
    if (!gid) return null
    const graph = graphs[gid]
    if (!graph || graph.ownerNodeId === null) return null
    const ownerNode = gnodes[graph.ownerNodeId]
    if (!ownerNode) return null
    const parentPath = graphPaths[ownerNode.graphId]
    return parentPath && itemPaths.has(parentPath) && parentPath !== item.path ? parentPath : null
  }

  const assemble = (parentPath: string | null, visited: Set<string>): TreeNode[] =>
    items
      .filter((i) => i.kind === 'blueprint' && parentOf(i) === parentPath && !visited.has(i.path))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      .map((i) => {
        const nextVisited = new Set([...visited, i.path])
        const children = assemble(i.path, nextVisited)
        return children.length > 0 ? { ...i, children } : { ...i, children: undefined }
      })

  const tops = assemble(null, new Set())
  // 环兜底：owner 链成环的成员（assemble 永远收不到）挂到顶层展示，避免整组从树上消失
  const collected = new Set<string>()
  const collect = (arr: TreeNode[]): void => {
    for (const i of arr) {
      collected.add(i.path)
      if (i.children) collect(i.children)
    }
  }
  collect(tops)
  for (const item of items) {
    if (item.kind === 'blueprint' && !collected.has(item.path)) tops.push({ ...item, children: undefined })
  }
  return tops
}

/** 文件树渲染（递归） */
function TreeBranch(props: {
  nodes: TreeNode[]
  depth: number
  selectedPath: string | null
  onOpenFile: (node: TreeNode) => void
  onSelect: (path: string) => void
  onContextArea: (e: ReactMouseEvent, area: MenuArea) => void
  onContextItem: (e: ReactMouseEvent, node: TreeNode) => void
  onExchange: (pathA: string, pathB: string) => void
}): ReactElement {
  const { nodes, depth } = props
  const renameFile = useNovelStore((s) => s.renameFile)
  const deleteFile = useNovelStore((s) => s.deleteFile)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  const dragPathRef = useRef<string | null>(null)

  const startRename = async (node: TreeNode): Promise<void> => {
    const name = displayTitle(node.name)
    const next = await dialogPrompt('重命名', '新名称', name)
    if (next && next !== name) void renameFile(node.path, next)
  }

  const startDelete = async (node: TreeNode): Promise<void> => {
    const ok = await dialogConfirm(`删除「${displayTitle(node.name)}」？`, '删除')
    if (ok) void deleteFile(node.path)
  }

  return (
    <>
      {nodes.map((node) => {
        // 卷目录（chapters 下的 dir）：可折叠 + 右键菜单（卷内新增章节）
        if (node.kind === 'dir' && node.path !== 'blueprints' && node.path !== 'chapters') {
          const hasChildren = (node.children ?? []).length > 0
          return (
            <div key={node.path}>
              <div
                className="tree-item"
                style={{ paddingLeft: 6 + depth * 14, color: 'var(--fg-muted)' }}
                onContextMenu={(e) => props.onContextArea(e, { volume: node.name })}
              >
                {hasChildren ? (
                  <button
                    className="tree-toggle"
                    title={collapsed[node.path] ? '展开卷' : '折叠卷'}
                    onClick={(e) => {
                      e.stopPropagation()
                      setCollapsed((prev) => ({ ...prev, [node.path]: !prev[node.path] }))
                    }}
                  >
                    {collapsed[node.path] ? '▸' : '▾'}
                  </button>
                ) : (
                  <span className="tree-icon">·</span>
                )}
                <span className="tree-icon">📕</span>
                <span className="tree-label">{node.name}</span>
              </div>
              {hasChildren && !collapsed[node.path] && (
                <TreeBranch {...props} nodes={node.children!} depth={depth + 1} />
              )}
            </div>
          )
        }
        if (node.kind === 'dir' || node.kind === 'meta') {
          const area: MenuArea | null = node.path === 'blueprints' ? 'blueprints' : node.path === 'chapters' ? 'chapters' : null
          return (
            <div key={node.path + node.name}>
              <div
                className="tree-item"
                style={{ paddingLeft: 6 + depth * 14, color: 'var(--fg-muted)' }}
                onContextMenu={(e) => area && props.onContextArea(e, area)}
              >
                <span className="tree-icon">{node.kind === 'meta' ? '📖' : '▸'}</span>
                <span className="tree-label">{node.name}</span>
              </div>
              {node.children && node.children.length > 0 && (
                <TreeBranch {...props} nodes={node.children} depth={depth + 1} />
              )}
            </div>
          )
        }
        if (node.kind === 'blueprint' && node.children && node.children.length > 0) {
          // 蓝图纸级（拥有子图）：目录形态 + 折叠；双击打开
          return (
            <div key={node.path}>
              <div
                className={`tree-item file${props.selectedPath === node.path ? ' active' : ''}`}
                style={{ paddingLeft: 6 + depth * 14, color: 'var(--accent)' }}
                title={`${node.path}（双击打开）`}
                onClick={() => props.onSelect(node.path)}
                onDoubleClick={() => props.onOpenFile(node)}
                onContextMenu={(e) => props.onContextItem(e, node)}
              >
                <button
                  className="tree-toggle"
                  title={collapsed[node.path] ? '展开子蓝图' : '折叠子蓝图'}
                  onClick={(e) => {
                    e.stopPropagation()
                    setCollapsed((prev) => ({ ...prev, [node.path]: !prev[node.path] }))
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  {collapsed[node.path] ? '▸' : '▾'}
                </button>
                <span className="tree-icon">◆</span>
                <span className="tree-label">{displayTitle(node.name)}</span>
                <span className="tree-actions">
                  <button className="tree-act" title="重命名" onClick={(e) => { e.stopPropagation(); void startRename(node) }}>
                    ✎
                  </button>
                  <button className="tree-act" title="删除" onClick={(e) => { e.stopPropagation(); void startDelete(node) }}>
                    ✕
                  </button>
                </span>
              </div>
              {!collapsed[node.path] && <TreeBranch {...props} nodes={node.children} depth={depth + 1} />}
            </div>
          )
        }
        // 普通文件行（章节 / 无子图蓝图）：单击选中、双击打开；章节可拖动交换
        const isChapter = node.kind === 'chapter'
        return (
          <div
            key={node.path}
            className={`tree-item file${props.selectedPath === node.path ? ' active' : ''}${dragOverPath === node.path ? ' drop-target' : ''}`}
            style={{ paddingLeft: 6 + depth * 14, color: isChapter ? '#c8ccd4' : 'var(--accent)' }}
            title={`${node.path}（双击打开${isChapter ? ' · 可拖动到其他章节交换位置' : ''}）`}
            onClick={() => props.onSelect(node.path)}
            onDoubleClick={() => props.onOpenFile(node)}
            onContextMenu={(e) => props.onContextItem(e, node)}
            draggable={isChapter}
            onDragStart={(e) => {
              dragPathRef.current = node.path
              e.dataTransfer.setData('text/plain', node.path)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              // 跨分组拖动（顶层↔卷）时 dragPathRef 属另一 TreeBranch 实例恒为 null——
              // 改用 dataTransfer.types 判定（dragover 阶段不可读数据但 types 可读）
              if (!isChapter || dragPathRef.current === node.path) return
              if (!e.dataTransfer.types.includes('text/plain')) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDragOverPath(node.path)
            }}
            onDragLeave={() => setDragOverPath((p) => (p === node.path ? null : p))}
            onDrop={(e) => {
              e.preventDefault()
              setDragOverPath(null)
              const from = dragPathRef.current ?? e.dataTransfer.getData('text/plain')
              dragPathRef.current = null
              if (from && from !== node.path) props.onExchange(from, node.path)
            }}
          >
            <span className="tree-icon">{isChapter ? '▪' : '◆'}</span>
            <span className="tree-label">{displayTitle(node.name)}</span>
            <span className="tree-actions">
              <button className="tree-act" title="重命名" onClick={(e) => { e.stopPropagation(); void startRename(node) }}>
                ✎
              </button>
              <button className="tree-act" title="删除" onClick={(e) => { e.stopPropagation(); void startDelete(node) }}>
                ✕
              </button>
            </span>
          </div>
        )
      })}
    </>
  )
}

export function LeftPanel(): ReactElement {
  const novel = useNovelStore((s) => s.novel)
  const tree = useNovelStore((s) => s.tree)
  const createFile = useNovelStore((s) => s.createFile)
  const createVolume = useNovelStore((s) => s.createVolume)
  const exchangeFiles = useNovelStore((s) => s.exchangeFiles)
  const versions = typeof window !== 'undefined' ? window.api?.versions : undefined

  // 性能批次：不再整表订阅 graphs/nodes——层级结构只依赖 owner 归属关系，改订阅其「签名」
  // （字符串比较稳定），节点坐标拖动/属性提交不再触发 buildBlueprintHierarchy 重算与整树重渲
  const ownerSignature = useGraphStore((s) => {
    const owner = Object.values(s.graphs)
      .map((g) => `${g.id}>${g.ownerNodeId ?? ''}>${g.ownerNodeId !== null ? (s.nodes[g.ownerNodeId]?.graphId ?? '?') : ''}`)
      .sort()
      .join('|')
    const paths = Object.entries(s.graphPaths).sort().map(([gid, p]) => `${gid}@${p}`).join(';')
    return `${owner}##${paths}`
  })

  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [snapOpen, setSnapOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [sensitiveOpen, setSensitiveOpen] = useState(false)
  const { menu, setMenu, menuRef } = useContextMenu<{ area: MenuArea }>()

  /** 展示树：blueprints/ 平铺列表 → owner 嵌套层级（磁盘真相不变，仅展示重排） */
  const displayTree = useMemo<TreeNode[]>(() => {
    if (tree.length === 0) return tree
    const bpDir = tree[0]?.children?.find((c) => c.kind === 'dir' && c.path === 'blueprints')
    if (!bpDir || !bpDir.children || bpDir.children.length === 0) return tree
    const gs = useGraphStore.getState()
    const hierarchical = buildBlueprintHierarchy(bpDir.children, gs.graphs, gs.nodes, gs.graphPaths)
    return [
      {
        ...tree[0]!,
        children: [
          { ...bpDir, children: hierarchical },
          ...(tree[0]!.children ?? []).filter((c) => c.path !== 'blueprints')
        ]
      }
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, ownerSignature])

  const openFile = (node: TreeNode): void => {
    if (node.kind === 'blueprint' || node.kind === 'chapter') {
      useNovelStore.getState().openTab(node.kind, node.path)
    }
  }

  /** 目录区右键菜单 */
  const onContextArea = (e: ReactMouseEvent, area: MenuArea): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, target: { area } })
  }

  /** 文件项右键：蓝图/章节行——打开/重命名/删除 + 各自的创建项 */
  const onContextItem = (e: ReactMouseEvent, node: TreeNode): void => {
    e.preventDefault()
    e.stopPropagation()
    if (node.kind === 'blueprint') setMenu({ x: e.clientX, y: e.clientY, target: { area: { blueprintItem: node.path, name: node.name } } })
    else if (node.kind === 'chapter') setMenu({ x: e.clientX, y: e.clientY, target: { area: { chapterItem: node.path, name: node.name } } })
  }

  /** 章节所在卷（chapterTree 共享实现：chapters/卷/章.md → 卷名；直下 → undefined） */

  /** 同级章节显示名（自动序号用；volume 缺省= chapters 直下） */
  const siblingChapterNames = (volume?: string): string[] => {
    const chDir = tree[0]?.children?.find((c) => c.kind === 'dir' && c.path === 'chapters')
    if (!chDir?.children) return []
    if (volume === undefined) {
      return chDir.children.filter((c) => c.kind === 'chapter').map((c) => displayTitle(c.name))
    }
    const vol = chDir.children.find((c) => c.kind === 'dir' && c.name === volume)
    return (vol?.children ?? []).map((c) => displayTitle(c.name))
  }

  /** 已有卷名列表 */
  const volumeNames = (): string[] => {
    const chDir = tree[0]?.children?.find((c) => c.kind === 'dir' && c.path === 'chapters')
    return (chDir?.children ?? []).filter((c) => c.kind === 'dir').map((c) => c.name)
  }

  /** 已有蓝图名列表（新建蓝图默认名用） */
  const blueprintNames = (): string[] => {
    const bpDir = tree[0]?.children?.find((c) => c.kind === 'dir' && c.path === 'blueprints')
    return (bpDir?.children ?? []).map((c) => displayTitle(c.name))
  }

  const handleCreateBlueprint = async (): Promise<void> => {
    const name = await dialogPrompt('新建蓝图', '蓝图名称', defaultTitle('新蓝图', blueprintNames()))
    if (!name) return
    try {
      await createFile('blueprint', name)
    } catch (err) {
      await dialogConfirm(`创建失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    }
  }

  /** 在指定蓝图内新建子蓝图：建子图文件 → 刷新 → 在目标图内落蓝图节点（挂 refGraphId） */
  const handleCreateSubBlueprint = async (parentPath: string): Promise<void> => {
    const gs = useGraphStore.getState()
    const gid = Object.entries(gs.graphPaths).find(([, p]) => p === parentPath)?.[0]
    const parentGraph = gid ? gs.graphs[gid] : undefined
    if (!gid || !parentGraph) {
      await dialogConfirm('该蓝图的图数据尚未加载完成，请先双击打开一次再试', '知道了')
      return
    }
    // ADR-12 深度检查（目标图不在当前路由上，按祖先链长度判）
    const depth = pathToGraph({ nodes: gs.nodes, edges: gs.edges, graphs: gs.graphs }, gid).length
    if (depth >= MAX_NESTING_DEPTH) {
      await dialogConfirm(`「${parentGraph.title}」已达蓝图嵌套上限（${MAX_NESTING_DEPTH} 层），无法再建子蓝图`, '知道了')
      return
    }
    const nodeTitles = parentGraph.nodeIds.map((id) => gs.nodes[id]?.title ?? '')
    const name = await dialogPrompt(
      `在「${parentGraph.title}」内新建子蓝图`,
      '蓝图名称',
      defaultTitle('新蓝图', [...nodeTitles, ...blueprintNames()])
    )
    if (!name) return
    let created: { path: string; id?: string }
    try {
      created = await window.api.fs.createFile('blueprint', name)
    } catch (err) {
      await dialogConfirm(`子蓝图文件创建失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
      return
    }
    await useNovelStore.getState().refreshTree()
    useGraphStore.getState().addNode({
      type: 'blueprint',
      title: name,
      graphId: gid,
      position: { x: 80 + (parentGraph.nodeIds.length % 5) * 60, y: 80 + (parentGraph.nodeIds.length % 5) * 48 },
      refGraphId: created.id
    })
  }

  const handleCreateVolume = async (): Promise<void> => {
    const name = await dialogPrompt('新增卷', '卷名称', nextNumberedName(volumeNames(), '卷'))
    if (!name) return
    try {
      await createVolume(name)
    } catch (err) {
      await dialogConfirm(`创建失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    }
  }

  const handleCreateChapter = async (volume?: string): Promise<void> => {
    const name = await dialogPrompt(volume ? `在「${volume}」新增章节` : '新增章节', '章节名称', nextNumberedName(siblingChapterNames(volume), '章'))
    if (!name) return
    try {
      await createFile('chapter', name, volume)
    } catch (err) {
      await dialogConfirm(`创建失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    }
  }

  const handleExchange = (pathA: string, pathB: string): void => {
    void exchangeFiles(pathA, pathB)
  }

  /** 重建索引（M4-B 入口补齐：IPC 链路 M1 已通，此前仅无 UI）；主进程同步 IO，大目录可能短暂卡顿 */
  const handleRebuildIndex = async (): Promise<void> => {
    try {
      const { nodes, edges } = await window.api.fs.rebuildIndex()
      await dialogConfirm(`索引重建完成：节点 ${nodes} · 边 ${edges}`, '知道了')
    } catch (err) {
      console.error('[LeftPanel] 重建索引失败:', err)
      await dialogConfirm(`索引重建失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    }
  }

  /** 右键菜单的文件通用动作（与 hover 行内按钮同能力——审查补齐右键覆盖面） */
  const openByPath = (path: string): void => {
    useNovelStore.getState().openTab(path.endsWith('.md') ? 'chapter' : 'blueprint', path)
  }
  const renameByPath = async (path: string, name: string): Promise<void> => {
    const cur = displayTitle(name)
    const next = await dialogPrompt('重命名', '新名称', cur)
    if (next && next !== cur) void useNovelStore.getState().renameFile(path, next)
  }
  const deleteByPath = async (path: string, name: string): Promise<void> => {
    const ok = await dialogConfirm(`删除「${displayTitle(name)}」？`, '删除')
    if (ok) void useNovelStore.getState().deleteFile(path)
  }

  const menuArea = menu?.target.area ?? null
  const menuItems: Array<{ key: string; label: string; run: () => Promise<void> }> =
    menuArea === null
      ? []
      : menuArea === 'blueprints'
        ? [{ key: 'bp', label: '◆ 新建蓝图', run: handleCreateBlueprint }]
        : menuArea === 'chapters'
          ? [
              { key: 'vol', label: '📕 新增卷', run: handleCreateVolume },
              { key: 'ch', label: '▪ 新增章节', run: () => handleCreateChapter() }
            ]
          : 'volume' in menuArea
            ? [{ key: 'ch', label: `▪ 在「${menuArea.volume}」新增章节`, run: () => handleCreateChapter(menuArea.volume) }]
            : 'blueprintItem' in menuArea
              ? [
                  { key: 'open', label: '◆ 打开', run: async () => openByPath(menuArea.blueprintItem) },
                  { key: 'ren', label: '✎ 重命名', run: () => renameByPath(menuArea.blueprintItem, menuArea.name) },
                  { key: 'del', label: '✕ 删除', run: () => deleteByPath(menuArea.blueprintItem, menuArea.name) },
                  { key: 'sub', label: '◆ 在此蓝图内新建子蓝图', run: () => handleCreateSubBlueprint(menuArea.blueprintItem) },
                  { key: 'bp', label: '◆ 新建蓝图（顶层）', run: handleCreateBlueprint }
                ]
              : [
                  { key: 'open', label: '▪ 打开', run: async () => openByPath(menuArea.chapterItem) },
                  { key: 'ren', label: '✎ 重命名', run: () => renameByPath(menuArea.chapterItem, menuArea.name) },
                  { key: 'del', label: '✕ 删除', run: () => deleteByPath(menuArea.chapterItem, menuArea.name) },
                  {
                    key: 'ch',
                    label: '▪ 同目录新增章节',
                    run: () => handleCreateChapter(volumeOfChapter(menuArea.chapterItem))
                  }
                ]

  return (
    <div className="left-panel nokey" style={{ background: 'var(--bg-left)' }}>
      <div className="left-header">{novel ? novel.title : '未打开小说'}</div>
      <div className="left-toolbar">
        <button className="left-tool-btn" title="新建蓝图（或在 blueprints 目录右键）" onClick={() => void handleCreateBlueprint()} disabled={!novel}>
          + 蓝图
        </button>
        <button className="left-tool-btn" title="新增章节（或在 chapters 目录右键）" onClick={() => void handleCreateChapter()} disabled={!novel}>
          + 章节
        </button>
      </div>
      <div className="left-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {displayTree.length > 0 ? (
          <TreeBranch
            nodes={displayTree}
            depth={0}
            selectedPath={selectedPath}
            onOpenFile={openFile}
            onSelect={setSelectedPath}
            onContextArea={onContextArea}
            onContextItem={onContextItem}
            onExchange={handleExchange}
          />
        ) : (
          <div className="tree-empty">尚未打开小说，请先新建或打开</div>
        )}
      </div>
      {versions && (
        <div className="left-footer">
          <span className="left-footer-ver" title={`Electron ${versions.electron} · Node ${versions.node}`}>
            Electron {versions.electron} · Node {versions.node}
          </span>
          {/* 按钮独立一行可换行（晨间审查修复：4 按钮+版本串单行在默认 240px 左栏下必然溢出） */}
          <div className="left-footer-btns">
            <button
              className="left-footer-btn"
              title="码字统计：今日新增 / 总字数 / 连续天数 / 近 14 天趋势"
              disabled={!novel}
              onClick={() => setStatsOpen(true)}
            >
              统计
            </button>
            <button
              className="left-footer-btn"
              title="敏感词检测：按投稿站点词库检测当前章/全本（纯本地）"
              disabled={!novel}
              onClick={() => setSensitiveOpen(true)}
            >
              敏感词
            </button>
            <button
              className="left-footer-btn"
              title="快照：把当前小说存为可回滚的完整拷贝（.snapshots/，最多 10 份）"
              disabled={!novel}
              onClick={() => setSnapOpen(true)}
            >
              快照
            </button>
            <button
              className="left-footer-btn"
              title="重建 .index 索引（索引异常时的兜底手段；大目录可能短暂卡顿）"
              disabled={!novel}
              onClick={() => void handleRebuildIndex()}
            >
              重建索引
            </button>
          </div>
        </div>
      )}
      {snapOpen && <SnapshotPanel onClose={() => setSnapOpen(false)} />}
      {statsOpen && <StatsPanel onClose={() => setStatsOpen(false)} />}
      {sensitiveOpen && <SensitivePanel onClose={() => setSensitiveOpen(false)} />}
      {/* 目录右键菜单：按区域提供创建项（自动序号预填）+ 文件项通用操作 */}
      {menu && (
        <div
          ref={menuRef}
          className="canvas-context-menu tree-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={() => setMenu(null)}
        >
          {menuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className="canvas-context-item"
              onClick={() => {
                setMenu(null)
                void item.run()
              }}
            >
              <span className="canvas-context-title">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
