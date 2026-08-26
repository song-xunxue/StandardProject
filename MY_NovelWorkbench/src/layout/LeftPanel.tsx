/**
 * 左侧创建栏：小说操作工具条 + 真实文件树（M1 接入 IPC）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. 初版：静态项目树占位 + 底部运行时版本信息（验证 preload IPC 桥）
 *   2. M1：真实文件树（novelStore.tree）、新建/打开小说、新建蓝图/章节、重命名/删除
 */

import type { ReactElement } from 'react'
import type { TreeNode } from '@shared/types'
import { useNovelStore } from '@/store/novelStore'
import { dialogConfirm, dialogPrompt } from '@/store/dialogStore'

/** 文件树渲染（递归） */
function TreeBranch({ nodes, depth }: { nodes: TreeNode[]; depth: number }): ReactElement {
  const openTab = useNovelStore((s) => s.openTab)
  const renameFile = useNovelStore((s) => s.renameFile)
  const deleteFile = useNovelStore((s) => s.deleteFile)

  const startRename = async (node: TreeNode): Promise<void> => {
    const name = node.name.replace(/\.blueprint\.json$/, '').replace(/\.md$/, '')
    const next = await dialogPrompt('重命名', '新名称', name)
    if (next && next !== name) void renameFile(node.path, next)
  }

  const startDelete = async (node: TreeNode): Promise<void> => {
    const ok = await dialogConfirm(`删除「${node.name}」？`, '删除')
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
        ) : (
          <div
            key={node.path}
            className="tree-item file"
            style={{ paddingLeft: 6 + depth * 14, color: node.kind === 'blueprint' ? 'var(--accent)' : '#c8ccd4' }}
            title={node.path}
            onClick={() => openTab(node.kind === 'blueprint' ? 'blueprint' : 'chapter', node.path)}
          >
            <span className="tree-icon">{node.kind === 'blueprint' ? '◆' : '▪'}</span>
            <span className="tree-label">{node.name.replace(/\.blueprint\.json$/, '').replace(/\.md$/, '')}</span>
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
  const versions = typeof window !== 'undefined' ? window.api?.versions : undefined

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
        {tree.length > 0 ? (
          <TreeBranch nodes={tree} depth={0} />
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
