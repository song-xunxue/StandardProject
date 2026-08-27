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
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, MouseEvent as ReactMouseEvent } from 'react'
import type { TreeNode } from '@shared/types'
import { useNovelStore } from '@/store/novelStore'
import { useGraphStore } from '@/store/graphStore'
import { dialogConfirm, dialogPrompt } from '@/store/dialogStore'
import { defaultTitle, nextNumberedName } from '@/services/naming'

const displayTitle = (name: string): string => name.replace(/\.blueprint\.json$/, '').replace(/\.md$/, '')

/** 右键菜单目标区域 */
type MenuArea = 'blueprints' | 'chapters' | { volume: string }

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

  return assemble(null, new Set())
}

/** 文件树渲染（递归） */
function TreeBranch(props: {
  nodes: TreeNode[]
  depth: number
  selectedPath: string | null
  onOpenFile: (node: TreeNode) => void
  onSelect: (path: string) => void
  onContextArea: (e: ReactMouseEvent, area: MenuArea) => void
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
        // 卷目录（chapters 下的 dir）：右键菜单 + 章节分组
        if (node.kind === 'dir' && node.path !== 'blueprints' && node.path !== 'chapters') {
          return (
            <div key={node.path}>
              <div
                className="tree-item"
                style={{ paddingLeft: 6 + depth * 14, color: 'var(--fg-muted)' }}
                onContextMenu={(e) => props.onContextArea(e, { volume: node.name })}
              >
                <span className="tree-icon">▸</span>
                <span className="tree-label">📕 {node.name}</span>
              </div>
              {node.children && node.children.length > 0 && (
                <TreeBranch {...props} nodes={node.children} depth={depth + 1} />
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
            draggable={isChapter}
            onDragStart={(e) => {
              dragPathRef.current = node.path
              e.dataTransfer.setData('text/plain', node.path)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              if (!isChapter || !dragPathRef.current || dragPathRef.current === node.path) return
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
  const graphs = useGraphStore((s) => s.graphs)
  const gnodes = useGraphStore((s) => s.nodes)
  const graphPaths = useGraphStore((s) => s.graphPaths)
  const versions = typeof window !== 'undefined' ? window.api?.versions : undefined

  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; area: MenuArea } | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // 菜单外点击 / Esc 关闭
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) setMenu(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  /** 展示树：blueprints/ 平铺列表 → owner 嵌套层级（磁盘真相不变，仅展示重排） */
  const displayTree = useMemo<TreeNode[]>(() => {
    if (tree.length === 0) return tree
    const bpDir = tree[0]?.children?.find((c) => c.kind === 'dir' && c.path === 'blueprints')
    if (!bpDir || !bpDir.children || bpDir.children.length === 0) return tree
    const hierarchical = buildBlueprintHierarchy(bpDir.children, graphs, gnodes, graphPaths)
    return [
      {
        ...tree[0]!,
        children: [
          { ...bpDir, children: hierarchical },
          ...(tree[0]!.children ?? []).filter((c) => c.path !== 'blueprints')
        ]
      }
    ]
  }, [tree, graphs, gnodes, graphPaths])

  const openFile = (node: TreeNode): void => {
    if (node.kind === 'blueprint' || node.kind === 'chapter') {
      useNovelStore.getState().openTab(node.kind, node.path)
    }
  }

  /** 目录区右键菜单 */
  const onContextArea = (e: ReactMouseEvent, area: MenuArea): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, area })
  }

  /** 同级章节显示名（自动序号用） */
  const siblingChapterNames = (area: MenuArea): string[] => {
    const chDir = tree[0]?.children?.find((c) => c.kind === 'dir' && c.path === 'chapters')
    if (!chDir?.children) return []
    if (area === 'chapters') {
      return chDir.children.filter((c) => c.kind === 'chapter').map((c) => displayTitle(c.name))
    }
    if (typeof area === 'object') {
      const vol = chDir.children.find((c) => c.kind === 'dir' && c.name === area.volume)
      return (vol?.children ?? []).map((c) => displayTitle(c.name))
    }
    return []
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
    if (name) void createFile('blueprint', name)
  }

  const handleCreateVolume = async (): Promise<void> => {
    const name = await dialogPrompt('新增卷', '卷名称', nextNumberedName(volumeNames(), '卷'))
    if (name) void createVolume(name)
  }

  const handleCreateChapter = async (area: MenuArea): Promise<void> => {
    const volume = typeof area === 'object' ? area.volume : undefined
    const name = await dialogPrompt(volume ? `在「${volume}」新增章节` : '新增章节', '章节名称', nextNumberedName(siblingChapterNames(area), '章'))
    if (name) void createFile('chapter', name, volume)
  }

  const handleExchange = (pathA: string, pathB: string): void => {
    void exchangeFiles(pathA, pathB)
  }

  const menuItems: Array<{ key: string; label: string; run: () => Promise<void> }> =
    menu === null
      ? []
      : menu.area === 'blueprints'
        ? [{ key: 'bp', label: '◆ 新建蓝图', run: handleCreateBlueprint }]
        : menu.area === 'chapters'
          ? [
              { key: 'vol', label: '📕 新增卷', run: handleCreateVolume },
              { key: 'ch', label: '▪ 新增章节', run: () => handleCreateChapter('chapters') }
            ]
          : [
              { key: 'ch', label: `▪ 在「${menu.area.volume}」新增章节`, run: () => handleCreateChapter(menu!.area as { volume: string }) }
            ]

  return (
    <div className="left-panel" style={{ background: 'var(--bg-left)' }}>
      <div className="left-header">{novel ? novel.title : '未打开小说'}</div>
      <div className="left-toolbar">
        <button className="left-tool-btn" title="新建蓝图（或在 blueprints 目录右键）" onClick={() => void handleCreateBlueprint()} disabled={!novel}>
          + 蓝图
        </button>
        <button className="left-tool-btn" title="新增章节（或在 chapters 目录右键）" onClick={() => void handleCreateChapter('chapters')} disabled={!novel}>
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
            onExchange={handleExchange}
          />
        ) : (
          <div className="tree-empty">尚未打开小说，请先新建或打开</div>
        )}
      </div>
      {versions && (
        <div className="left-footer">
          Electron {versions.electron} · Node {versions.node}
        </div>
      )}
      {/* 目录右键菜单：按区域提供创建项（自动序号预填） */}
      {menu && (
        <div ref={menuRef} className="canvas-context-menu tree-context-menu" style={{ left: menu.x, top: menu.y }}>
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
