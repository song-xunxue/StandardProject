/**
 * 左侧创建栏：小说操作工具条 + 真实文件树（M1 接入 IPC）
 * M3 交互增强：蓝图按「蓝图之中的蓝图」（owner 归属关系）呈现文件目录式层级
 *
 * 作者: 李文煜
 * 日期：2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. 初版：静态项目树占位 + 底部运行时版本信息（验证 preload IPC 桥）
 *   2. M1：真实文件树（novelStore.tree）、新建/打开小说、新建蓝图/章节、重命名/删除
 *   3. M3 交互增强：blueprints/ 平铺列表按 graphStore 的 ownerNodeId 关系重排为
 *      嵌套层级（子图挂在其拥有节点的所属蓝图之下），父级可 ▸/▾ 折叠
 */

import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { TreeNode } from '@shared/types'
import { useNovelStore } from '@/store/novelStore'
import { useGraphStore } from '@/store/graphStore'
import { dialogConfirm, dialogPrompt } from '@/store/dialogStore'

const displayTitle = (name: string): string => name.replace(/\.blueprint\.json$/, '').replace(/\.md$/, '')

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

  /** 蓝图文件的父级路径（无 / 父不在当前文件集合 → null = 顶层） */
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
        const nextVisited = new Set([...visited, i.path]) // 环脏数据防护
        const children = assemble(i.path, nextVisited)
        return children.length > 0 ? { ...i, children } : { ...i, children: undefined }
      })

  return assemble(null, new Set())
}

/** 文件树渲染（递归；蓝图纸级带折叠） */
function TreeBranch({ nodes, depth }: { nodes: TreeNode[]; depth: number }): ReactElement {
  const openTab = useNovelStore((s) => s.openTab)
  const renameFile = useNovelStore((s) => s.renameFile)
  const deleteFile = useNovelStore((s) => s.deleteFile)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

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
      {nodes.map((node) =>
        node.kind === 'dir' || node.kind === 'meta' ? (
          <div key={node.path + node.name}>
            <div className="tree-item" style={{ paddingLeft: 6 + depth * 14, color: 'var(--fg-muted)' }}>
              <span className="tree-icon">{node.kind === 'meta' ? '📖' : '▸'}</span>
              <span className="tree-label">{node.name}</span>
            </div>
            {node.children && node.children.length > 0 && <TreeBranch nodes={node.children} depth={depth + 1} />}
          </div>
        ) : node.kind === 'blueprint' && node.children && node.children.length > 0 ? (
          // 蓝图纸级（拥有子图的蓝图）：目录形态 + 折叠
          <div key={node.path}>
            <div
              className="tree-item file"
              style={{ paddingLeft: 6 + depth * 14, color: 'var(--accent)' }}
              title={node.path}
              onClick={() => openTab('blueprint', node.path)}
            >
              <button
                className="tree-toggle"
                title={collapsed[node.path] ? '展开子蓝图' : '折叠子蓝图'}
                onClick={(e) => {
                  e.stopPropagation()
                  setCollapsed((prev) => ({ ...prev, [node.path]: !prev[node.path] }))
                }}
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
            {!collapsed[node.path] && <TreeBranch nodes={node.children} depth={depth + 1} />}
          </div>
        ) : (
          <div
            key={node.path}
            className="tree-item file"
            style={{ paddingLeft: 6 + depth * 14, color: node.kind === 'blueprint' ? 'var(--accent)' : '#c8ccd4' }}
            title={node.path}
            onClick={() => openTab(node.kind === 'blueprint' ? 'blueprint' : 'chapter', node.path)}
          >
            <span className="tree-icon">{node.kind === 'blueprint' ? '◆' : '▪'}</span>
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
      )}
    </>
  )
}

export function LeftPanel(): ReactElement {
  const novel = useNovelStore((s) => s.novel)
  const tree = useNovelStore((s) => s.tree)
  const createFile = useNovelStore((s) => s.createFile)
  const graphs = useGraphStore((s) => s.graphs)
  const gnodes = useGraphStore((s) => s.nodes)
  const graphPaths = useGraphStore((s) => s.graphPaths)
  const versions = typeof window !== 'undefined' ? window.api?.versions : undefined

  /** 展示树：blueprints/ 平铺列表 → owner 嵌套层级（磁盘真相不变，仅展示重排） */
  const displayTree = useMemo<TreeNode[]>(() => {
    if (tree.length === 0) return tree
    const bpDir = tree[0]?.children?.find((c) => c.kind === 'dir' && c.path === 'blueprints')
    if (!bpDir || !bpDir.children || bpDir.children.length === 0) return tree
    const hierarchical = buildBlueprintHierarchy(bpDir.children, graphs, gnodes, graphPaths)
    return [{ ...tree[0]!, children: [{ ...bpDir, children: hierarchical }, ...(tree[0]!.children ?? []).filter((c) => c.path !== 'blueprints')] }]
  }, [tree, graphs, gnodes, graphPaths])

  const newBlueprint = async (): Promise<void> => {
    const title = await dialogPrompt('新建蓝图', '蓝图名称', '新蓝图')
    if (title) void createFile('blueprint', title)
  }
  const newChapter = async (): Promise<void> => {
    const title = await dialogPrompt('新建章节', '章节名称', '新章节')
    if (title) void createFile('chapter', title)
  }

  return (
    <div className="left-panel" style={{ background: 'var(--bg-left)' }}>
      <div className="left-header">{novel ? novel.title : '未打开小说'}</div>
      <div className="left-toolbar">
        <button className="left-tool-btn" title="新建蓝图" onClick={() => void newBlueprint()} disabled={!novel}>
          + 蓝图
        </button>
        <button className="left-tool-btn" title="新建章节" onClick={() => void newChapter()} disabled={!novel}>
          + 章节
        </button>
      </div>
      <div className="left-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {displayTree.length > 0 ? (
          <TreeBranch nodes={displayTree} depth={0} />
        ) : (
          <div className="tree-empty">尚未打开小说，请先新建或打开</div>
        )}
      </div>
      {versions && (
        <div className="left-footer">
          Electron {versions.electron} · Node {versions.node}
        </div>
      )}
    </div>
  )
}
