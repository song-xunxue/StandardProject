/**
 * 工作台根组件：PyCharm 式三栏布局 + 欢迎页（无小说时）
 * （左侧图标条 + 创建栏 | 可拖分界线 | 右侧 Tab 栏 + 内容区 [+ 上下文预览面板]）
 *
 * 作者: 李文煜
 * 日期: 2026-08-25
 *
 * 2026-08-25
 * 变更说明：
 *   1. 初版：布局骨架 + 分栏宽度拖动（200-480px 钳制）+ 蓝图画布演示
 *   2. M0：AI 图标切换上下文预览面板（assembleContext 实时结果）
 *   3. M1：novelStore 初始化、欢迎页（新建/打开/最近列表）、动态 Tab 分发画布/章节编辑器
 *   4. M2：蓝图 Tab 增加右侧属性面板（Inspector，可拖宽度 200-420px，复用 Splitter）
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { IconStrip } from './layout/IconStrip'
import { LeftPanel } from './layout/LeftPanel'
import { Splitter } from './layout/Splitter'
import { TabBar } from './layout/TabBar'
import { BlueprintCanvas } from './canvas/BlueprintCanvas'
import { AiPanel } from './canvas/AiPanel'
import { ChapterEditor } from './canvas/ChapterEditor'
import { InspectorPanel } from './canvas/InspectorPanel'
import { Dialog } from './components/Dialog'
import { useNovelStore } from './store/novelStore'
import { dialogPrompt } from './store/dialogStore'

const MIN_LEFT = 200
const MAX_LEFT = 480
const DEFAULT_LEFT = 240

/** 属性面板宽度范围 */
const MIN_INSPECTOR = 200
const MAX_INSPECTOR = 420
const DEFAULT_INSPECTOR = 280

/** 欢迎页：无小说时全屏引导 */
function Welcome(): ReactElement {
  const createNovel = useNovelStore((s) => s.createNovel)
  const openNovel = useNovelStore((s) => s.openNovel)
  const recents = useNovelStore((s) => s.recents)

  const handleCreate = async (): Promise<void> => {
    const dir = await window.api.fs.pickDirectory()
    if (!dir) return
    const title = await dialogPrompt('新建小说', '小说名称', '我的小说')
    if (title) void createNovel(dir, title)
  }

  const handleOpen = async (): Promise<void> => {
    const dir = await window.api.fs.pickDirectory()
    if (dir) void openNovel(dir)
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-title">MY_NovelWorkbench</div>
        <div className="welcome-sub">AI 辅助小说创作工作台 · 节点蓝图 × 双向链接</div>
        <div className="welcome-actions">
          <button className="welcome-btn primary" onClick={() => void handleCreate()}>
            新建小说
          </button>
          <button className="welcome-btn" onClick={() => void handleOpen()}>
            打开小说目录
          </button>
        </div>
        {recents.length > 0 && (
          <div className="welcome-recents">
            <div className="welcome-recents-title">最近打开</div>
            {recents.slice(0, 5).map((r) => (
              <button key={r.dir} className="welcome-recent" onClick={() => void openNovel(r.dir)} title={r.dir}>
                {r.title}
                <span className="welcome-recent-dir">{r.dir}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function App(): ReactElement {
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT)
  const [inspectorWidth, setInspectorWidth] = useState(DEFAULT_INSPECTOR)
  const [activeStrip, setActiveStrip] = useState('novel')
  const novel = useNovelStore((s) => s.novel)
  const init = useNovelStore((s) => s.init)
  const activeTab = useNovelStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null)
  // 章节内容版本：交换/重排后递增 → key 变化 → ChapterEditor 重挂载重读磁盘
  const chapterReloadSeq = useNovelStore((s) => s.chapterReloadSeq)

  useEffect(() => {
    void init()
  }, [init])

  // 分界线拖动/按键：按位移增量调整左栏宽度并钳制范围
  const handleResize = useCallback((dx: number) => {
    setLeftWidth((w) => Math.min(MAX_LEFT, Math.max(MIN_LEFT, w + dx)))
  }, [])

  // 双击分界线：复位默认宽度
  const handleReset = useCallback(() => {
    setLeftWidth(DEFAULT_LEFT)
  }, [])

  // 属性面板分界线（dx 为正向右=面板加宽）
  const handleInspectorResize = useCallback((dx: number) => {
    setInspectorWidth((w) => Math.min(MAX_INSPECTOR, Math.max(MIN_INSPECTOR, w + dx)))
  }, [])

  const handleInspectorReset = useCallback(() => {
    setInspectorWidth(DEFAULT_INSPECTOR)
  }, [])

  if (!novel) {
    return (
      <>
        <Welcome />
        <Dialog />
      </>
    )
  }

  return (
    <div className="workbench">
      <IconStrip active={activeStrip} onSelect={setActiveStrip} />
      <div style={{ width: leftWidth, display: 'flex', flexDirection: 'column' }}>
        <LeftPanel />
      </div>
      <Splitter onResize={handleResize} onReset={handleReset} />
      <div className="right-area">
        <TabBar />
        <div className="content-area">
          {activeTab?.kind === 'blueprint' ? (
            <div className="canvas-row">
              <BlueprintCanvas />
              <Splitter onResize={handleInspectorResize} onReset={handleInspectorReset} />
              <div className="inspector-wrap" style={{ width: inspectorWidth }}>
                <InspectorPanel />
              </div>
            </div>
          ) : activeTab?.kind === 'chapter' ? (
            <ChapterEditor key={`${activeTab.path}#${chapterReloadSeq}`} path={activeTab.path} />
          ) : (
            <div className="placeholder-editor">在左侧点击蓝图或章节文件打开</div>
          )}
          {activeStrip === 'ai' && <AiPanel />}
        </div>
      </div>
      <Dialog />
    </div>
  )
}
