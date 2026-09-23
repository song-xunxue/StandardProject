/**
 * 导出浮层（v2-F18）：范围（全本/按卷/选章）× 格式（TXT/MD/EPUB/DOCX）× 选项
 * （BOM/wikilink/章标题行）+ 作者（EPUB/DOCX 元数据，写回 novel.json）
 * TXT 双档语义：粘贴档（选章，默认无标题行、剥 wikilink 与 Markdown 记号）/
 * 全本存档档（卷分隔+章标题行）；MD 保留双链回归 Obsidian；EPUB/DOCX 仅在检测到
 * Pandoc 时可选（缺失置灰+降级文案，发布态服务层覆写为剥 wikilink+标题必开）
 *
 * 作者: 李文煜
 * 日期: 2026-09-24
 */

import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { ExportFormat, ExportOptions, ExportResult } from '@shared/exportFormat'
import { flattenChapterFiles } from '@/services/chapterTree'
import { useNovelStore } from '@/store/novelStore'
import { dialogConfirm } from '@/store/dialogStore'

type ScopeMode = 'all' | 'volumes' | 'chapters'

const FORMAT_LABEL: Record<ExportFormat, string> = {
  txt: 'TXT（网文发布粘贴）',
  md: 'Markdown（Obsidian 回流）',
  epub: 'EPUB 电子书',
  docx: 'Word 文档'
}

/** 千分位 */
const fmt = (n: number): string => n.toLocaleString('zh-CN')

export function ExportPanel(props: { onClose: () => void }): ReactElement {
  const novel = useNovelStore((s) => s.novel)
  const tree = useNovelStore((s) => s.tree)
  const exportNovel = useNovelStore((s) => s.exportNovel)

  const [pandoc, setPandoc] = useState<{ available: boolean; version: string | null } | null>(null)
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all')
  const [volumeSel, setVolumeSel] = useState<Set<string>>(new Set())
  const [chapterSel, setChapterSel] = useState<Set<string>>(new Set())
  const [format, setFormat] = useState<ExportFormat>('txt')
  const [bom, setBom] = useState(true)
  const [chapterTitles, setChapterTitles] = useState(true)
  const [author, setAuthor] = useState('')
  const [exporting, setExporting] = useState(false)

  const chapters = useMemo(() => flattenChapterFiles(tree), [tree])
  /** 卷名集合（undefined=未分卷直下章，UI 显示「未分卷」，scope 值 ''） */
  const volumes = useMemo(() => {
    const set = new Set<string>()
    for (const c of chapters) set.add(c.volume ?? '')
    return [...set]
  }, [chapters])

  // 挂载探测 Pandoc（主进程会话级缓存）+ 预填作者
  useEffect(() => {
    void window.api.export.checkPandoc().then(setPandoc).catch(() => setPandoc({ available: false, version: null }))
  }, [])
  useEffect(() => {
    setAuthor(novel?.author ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novel?.id])

  // Esc 关闭（浮层族统一交互）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !exporting) props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exporting, props])

  const isPandocFormat = format === 'epub' || format === 'docx'
  const effectiveTitles = isPandocFormat ? true : chapterTitles

  const selectedCount =
    scopeMode === 'all'
      ? chapters.length
      : scopeMode === 'volumes'
        ? chapters.filter((c) => volumeSel.has(c.volume ?? '')).length
        : chapters.filter((c) => chapterSel.has(c.path)).length

  const toggle = (set: Set<string>, value: string, apply: (next: Set<string>) => void): void => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    apply(next)
  }

  const handleExport = async (): Promise<void> => {
    if (selectedCount === 0 || exporting) return
    setExporting(true)
    try {
      // 作者写回 novel.json（EPUB/DOCX 元数据一处维护；失败不阻断导出）
      if (isPandocFormat && author.trim() !== (novel?.author ?? '') && novel) {
        try {
          const meta = await window.api.fs.saveMeta({ ...novel, author: author.trim() })
          useNovelStore.setState({ novel: meta })
        } catch (err) {
          console.error('[ExportPanel] 作者写回 novel.json 失败（不阻断导出）:', err)
        }
      }
      const scope =
        scopeMode === 'all'
          ? { kind: 'all' as const }
          : scopeMode === 'volumes'
            ? { kind: 'volumes' as const, volumes: [...volumeSel] }
            : { kind: 'chapters' as const, paths: [...chapterSel] }
      const options: ExportOptions = {
        bom: format === 'txt' ? bom : false,
        wikilinkMode: format === 'md' ? 'keep' : 'strip',
        chapterTitles: effectiveTitles
      }
      const result = (await exportNovel({ format, scope, options, author: author.trim() })) as ExportResult | null
      if (!result) return // 用户取消保存框
      await dialogConfirm(`已导出 ${result.chapters} 章 · ${fmt(result.chars)} 字\n${result.path}`, '完成')
      props.onClose()
    } catch (err) {
      await dialogConfirm(`导出失败：${err instanceof Error ? err.message : String(err)}`, '知道了')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="snapshot-overlay" onMouseDown={() => !exporting && props.onClose()}>
      <div className="resource-panel export-panel nokey" onMouseDown={(e) => e.stopPropagation()}>
        <div className="resource-header">
          <span>导出 · {novel?.title ?? ''}（{chapters.length} 章）</span>
          <button className="resource-close" title="关闭（Esc）" disabled={exporting} onClick={props.onClose}>
            ×
          </button>
        </div>

        <div className="export-body left-scroll">
          {/* 范围 */}
          <div className="export-section">
            <div className="export-section-title">范围</div>
            <div className="export-scope-modes">
              {(
                [
                  ['all', `全本（${chapters.length} 章）`],
                  ['volumes', '按卷'],
                  ['chapters', '选章']
                ] as Array<[ScopeMode, string]>
              ).map(([mode, label]) => (
                <label key={mode} className="export-radio">
                  <input
                    type="radio"
                    name="export-scope"
                    checked={scopeMode === mode}
                    disabled={exporting}
                    onChange={() => {
                      setScopeMode(mode)
                      // 粘贴档默认无标题行（标题进平台独立输入框）；全本/按卷默认带标题行
                      setChapterTitles(mode !== 'chapters')
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
            {scopeMode === 'volumes' && (
              <div className="export-pick-list">
                {volumes.map((v) => (
                  <label key={v || '__root__'} className="export-pick">
                    <input
                      type="checkbox"
                      checked={volumeSel.has(v)}
                      disabled={exporting}
                      onChange={() => toggle(volumeSel, v, setVolumeSel)}
                    />
                    {v === '' ? '未分卷（直下章节）' : v}
                  </label>
                ))}
              </div>
            )}
            {scopeMode === 'chapters' && (
              <div className="export-pick-list export-chapter-list">
                {chapters.map((c) => (
                  <label key={c.path} className="export-pick">
                    <input
                      type="checkbox"
                      checked={chapterSel.has(c.path)}
                      disabled={exporting}
                      onChange={() => toggle(chapterSel, c.path, setChapterSel)}
                    />
                    {c.volume ? `${c.volume}/` : ''}
                    {c.title}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 格式 */}
          <div className="export-section">
            <div className="export-section-title">格式</div>
            <div className="export-scope-modes">
              {(Object.keys(FORMAT_LABEL) as ExportFormat[]).map((f) => {
                const disabled = (f === 'epub' || f === 'docx') && pandoc !== null && !pandoc.available
                return (
                  <label key={f} className={`export-radio${disabled ? ' disabled' : ''}`} title={disabled ? '未检测到 Pandoc' : undefined}>
                    <input type="radio" name="export-format" checked={format === f} disabled={disabled || exporting} onChange={() => setFormat(f)} />
                    {FORMAT_LABEL[f]}
                  </label>
                )
              })}
            </div>
            <div className="insp-hint">
              {pandoc === null
                ? '正在检测 Pandoc…'
                : pandoc.available
                  ? `已检测到 Pandoc ${pandoc.version ?? ''}——EPUB/DOCX 可用`
                  : '未检测到 Pandoc（安装后可选 EPUB/DOCX）；TXT/MD 始终可用'}
            </div>
          </div>

          {/* 选项 */}
          <div className="export-section">
            <div className="export-section-title">选项</div>
            {format === 'txt' && (
              <>
                <label className="export-pick">
                  <input type="checkbox" checked={bom} disabled={exporting} onChange={() => setBom(!bom)} />
                  UTF-8 BOM（Windows 记事本兼容）
                </label>
                <label className="export-pick">
                  <input type="checkbox" checked={chapterTitles} disabled={exporting} onChange={() => setChapterTitles(!chapterTitles)} />
                  章标题行「第N章 标题」（粘贴到平台发布框时通常关闭——标题单独填）
                </label>
                <div className="insp-hint">TXT 为发布粘贴档：段落间空行分隔，[[双链]]与 Markdown 记号自动清理为纯文本</div>
              </>
            )}
            {format === 'md' && (
              <div className="insp-hint">
                MD 为回流档：保留 [[双链]] 与 frontmatter 之外的正文结构（卷 # / 章 ##），可直接放回 Obsidian
              </div>
            )}
            {isPandocFormat && (
              <>
                <label className="recap-config-field">
                  作者（写入文档元数据）
                  <input className="dialog-input" value={author} disabled={exporting} onChange={(e) => setAuthor(e.target.value)} placeholder="笔名" />
                </label>
                <div className="insp-hint">发布态：双链清理为纯文本、章节标题必开（Pandoc 按 ## 分章）；大书转换可能需要数十秒</div>
              </>
            )}
          </div>
        </div>

        <div className="ai-provider-form-actions">
          <span className="insp-hint" style={{ alignSelf: 'center', flex: 1 }}>
            {selectedCount > 0 ? `将导出 ${selectedCount} 章` : '请选择导出范围'}（导出前自动保存未落盘的编辑）
          </span>
          <button className="left-tool-btn" disabled={exporting} onClick={props.onClose}>
            取消
          </button>
          <button className="left-tool-btn" disabled={exporting || selectedCount === 0} onClick={() => void handleExport()}>
            {exporting ? '导出中…' : '导出…'}
          </button>
        </div>
      </div>
    </div>
  )
}
