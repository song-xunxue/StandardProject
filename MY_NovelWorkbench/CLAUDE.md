# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

MY_NovelWorkbench（小说创作工作台）——**AI 辅助的小说编辑器**：ComfyUI 式节点工作流（蓝图/节点/语义连线）× Obsidian 式双向链接（全局图谱），AI 创作上下文由链接关系自动组装，支持多类 AI API。UI 参考 PyCharm（左侧创建栏 + 右侧内容区 + 顶部文件 Tab + 可拖分界线），深色主题。

**当前状态：v2 二批四项功能全部完成（2026-09-18 收官，268 用例全绿，五维审查 17 项确认缺陷全修复，CDP 冒烟 10/10 零错误）——F8 章节级快照+diff 视图 / F9 前情提要双档 / F13 去AI味改写预设 / F16 场景节拍→整章草稿；两项遗留修复（addNodesBatch 单笔落盘 / GlobalGraphView 渲染代际守卫）；拍板与验收标准见 `docs/03-下阶段优化方案.md` 第 10 节；三批候选（F10-F12/F14/F15/F17+）待用户挑选。**

**重要交互机制（2026-08-27 联调修复 + 2026-08-30 补充，改动画布前必读）**：
- 画布选中为**显式事件驱动**（onNodeClick/onEdgeClick/onPaneClick → setSelection），勿回灌 `selected` 到 nodes/edges props——会与 RF 内部状态在结构变更时形成无限渲染循环（建节点/连线全黑崩溃）
- 受控 `nodes` 必须接 `onNodesChange`（本地镜像 `applyNodeChanges`，仅承接 `position`/`remove` 变更；`dimensions`/`select` 回灌会与 RF 测量形成主线程打满循环），否则拖拽不跟手
- 节点创建入口在画布右键菜单（onPaneContextMenu → canvasCreateBridge 复用 CanvasToolbar 的创建实现，落点=鼠标位置）
- **Delete 键删除为自实现 window keydown**（BlueprintCanvas：作用于 store 显式选中集 selectedNodeIds + dialogConfirm，nokey/输入控件防线）——select 变更既被镜像刻意丢弃（上一条），RF 受控模式下永无内部选中集，`deleteKeyCode` 路径不可达；勿恢复 deleteKeyCode，除非同步解决 select 回灌循环
- **章节文件系统变更（交换/删除/重命名/快照创建与恢复）必须先走 aiStore.chapterFlush 前置冲刷**（清防抖定时器→落盘），否则编辑器重挂载的卸载冲刷会用旧内存内容覆盖交换结果/复活已删文件；恢复后必须 chapterReloadSeq+1 重挂载编辑器（novelStore.restoreChapterSnapshot 同款三步串行编排）
- **multiGen chapterDraft 会话（F16 整章草稿）不依赖编辑器**：ChapterEditor/AiPanel 的「卸载/编辑器消失即停生成」守卫对 kind==='chapterDraft' 豁免——文本在 store 累积，采纳时才确保目标章就绪（不存在则 createFile 建章）

## 常用命令

```bash
npm install        # 安装依赖（Electron 二进制慢时: ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/）
npm run dev        # 开发模式（Electron 窗口 + 热更新）
npm run typecheck  # tsc --noEmit（web）+ tsconfig.node.json（主进程，无 DOM）
npm run test       # vitest 单测（纯逻辑 + jsdom 编辑器桥接，当前 268 用例）
npm run build      # electron-vite 三目标构建 → out/{main,preload,renderer}
npm run pack:win   # 免安装目录包（release/win-unpacked）
npm run dist:win   # NSIS 安装包（release/*-setup.exe；二进制下载慢时设 ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/）
npm run smoke:packaged [exe路径]  # 打包产物自检（--smoke：better-sqlite3/渲染产物/userData）
npm run gen:icon   # 重新生成应用图标（build/icon.ico，零依赖 PNG-in-ICO）
node scripts/gen-stress-blueprint.mjs <小说目录> [节点数] [--chapters N --words 每章字数]  # 压力样本（M2 画布 / M5 长章节）
# LLM 开发期联调：项目根 .env 配 NOVEL_LLM_BASE_URL / NOVEL_LLM_API_KEY / NOVEL_LLM_MODEL（正式配置走应用内 AI 面板）
```

**打包要点（M5）**：better-sqlite3 v13 为 N-API prebuild 直装（prebuilds/ 8 平台，无 install 编译）——**不要**开 npmRebuild/electron-rebuild（会走 node-gyp 下载 headers 且无必要），package.json 已置 `npmRebuild:false`；asarUnpack 已含 better-sqlite3。**本机 Node 24.11.1 Windows 坑**：`rmSync` 删非 ASCII 文件名的单文件会硬崩进程（exit 127 无栈）——文件级删除一律用 `unlinkSync`（目录级 recursive rmSync 正常）。

## 代码结构

**主进程（electron/，tsconfig.node.json）**
- `main.ts` — 窗口/生命周期/IPC 注册入口 + `--smoke` 打包自检模式（不建窗口，better-sqlite3/渲染产物/userData 三项检查后 exit 0/1）
- `ipc.ts` — fs/provider/llm 通道路由（契约见 `shared/types.ts` 的 IPC 常量）；snapshotRestore 在此编排 停监听→closeIndex→恢复→openNovel→startWatching
- `preload.ts` — contextBridge 暴露 `window.api`（fs + provider + llm + snapshot + 目录变化/流式分块订阅）
- `services/novelService.ts` — 小说目录创建/打开/最近列表（userData/recent.json）+ readMeta/saveMeta（novel.json 标签库，tmp+rename 原子写；openNovel 对旧目录回填 tagLibrary + 触发旧资源迁移）
- `services/fileService.ts` — 文件树/蓝图/章节 CRUD（`resolveInNovel` 路径穿越防护）+ 卷支持（chapters/ 一层卷目录，章节按「第N章」数字序）+ exchangeFiles（文件名互换=章节排序）；rename 同步内部 title（蓝图 JSON / 章节 frontmatter）
- `services/resourceService.ts` — 资源库（M4-B 全局目录 userData/resources，跨小说共享不依赖打开小说）：模板列表/保存（tmp+rename 原子写+清洗撞车拒写）/删除（防穿越）+ 内置种子（.structures-seeded 结构模板 + .rewrite-presets-seeded 改写预设，独立标记驱动：删光不复活、存量安装升级补种）+ migrateLegacyResources（旧小说 resources/ 幂等迁移：.migrated 完成标记防已删模板复活）
- `services/statsService.ts` — 码字统计（v2-F7）：writing-stats.json（chapterChars 按路径记账 + days 每日总量）；openNovel 全量对账/saveChapter 入账/deleteFile 清账/renameFile 键迁移/exchangeFiles 账值对调；tmp+rename 原子写
- `services/wordbankService.ts` — 敏感词词库（v2-F6）：userData/sensitive-words/<名>.json，列表/保存（去空去重原子写）/删除/导入 txt（每行一词，覆盖或并入）；不内置词条
- `services/snapshotService.ts` — 快照（M5 ADR-14 + v2-F8 章节级）：全本=.snapshots/<id>/ 目录拷贝（**顶层枚举逐项 copy**——整体 cpSync 因目标在源内被前置拒绝）+ manifest 最后写=完成标记 + 保留上限 10 + restore（自动备份→清空→拷回）；**章节级（F8）**=.snapshots/chapters/<章路径 base64url>/snap-*/ 单文件原文（每章独立 20 份与全本物理隔离；恢复整文件直写零 frontmatter 伪变更；resolveChapterFile 校验 chapters/ 前缀防穿越）。**文件级删除一律 unlinkSync**（本机 Node rmSync 非 ASCII 坑；且 rmSync 对非 ASCII 目录 recursive 有静默漏删变体——测试清理逐文件删）
- `services/providerService.ts` — AI Provider 配置（userData/providers.json + safeStorage 加密 API Key；.env 三变量开发期回退 Provider 'env-default' 不入盘；GET /models 连接测试）
- `services/llmService.ts` — OpenAI 兼容流式生成（主进程 fetch SSE → llm:chunk 推送；AbortController 中断；LLM 在主进程执行：sandbox 渲染层 CORS + 凭据不出主进程）
- `services/indexService.ts` — SQLite 索引（better-sqlite3，`.index/index.db`，mtime+size 增量）；`syncIndex`（M5 冷启动增量校对：基线跨会话保留，仅重读变化+清理删除残留；watcher 打开小说走此路径，全量 rebuildIndex 留作手动兜底）；v2-P1 起内容哈希复核（file_state.hash，mtime/size 变但内容未变只刷基线）
- `watcher.ts` — fs.watch recursive + 300ms 防抖 → 增量索引 + 推送文件树；排除 .index/ 与 .snapshots/（含裸目录名）；打开时 syncIndex 附耗时日志

**共享层（shared/，两个 tsconfig 都引用，必须环境无关）**
- `blueprint.ts` — 蓝图领域类型（含 refTarget、MAX_NESTING_DEPTH=8）；`blueprintCodec.ts` — 文件↔GraphData 水合/导出（节点/边字段归一化容错）
- `novelTemplate.ts` — 新建小说标准目录模板（含内置标签库）；`frontmatter.ts` — 章节 YAML 子集编解码（未知键与非键值行以原样行 extraLines 保留往返）
- `sanitize.ts` — 文件名清洗；`types.ts` — IPC 契约与 NovelMeta/TreeNode/ChapterDoc/ResourceTemplate/ProviderConfig/ChatMessage/RecapConfig/ChapterSnapshotInfo/快照上限共享常量
- `sensitiveScan.ts` — 敏感词扫描 AC 自动机（v2-F6，O(text+words)，命中带上下文）；`structureTemplates.ts` — 内置情节结构骨架（三幕/英雄之旅/救猫咪，v2-F5）；`tags.ts` — 标签工具（tagColorOf/nodeAccentColor/自定义色板轮转）；`resource.ts` — 资源模板互转与校验（含 rewritePreset 第四类，v2-F13）；`rewritePresets.ts` — 内置「去AI味」改写预设（种子用，v2-F13）；`chapterDiff.ts` — 行级 LCS diff 纯函数（前后缀快进/超规模降级/ctx 折叠，v2-F8）；`textMetrics.ts` — countChars 去空白字数（码字统计与章节快照共用口径）
- `sse.ts` — SSE 流解析纯函数（跨 chunk 半行缓冲/[DONE]/非 JSON 容错）

**渲染层（src/，tsconfig.json）**
- `App.tsx` — 三栏布局 + 欢迎页 + 画布行（画布+分界线+属性面板，200-420px 可拖）
- `store/novelStore.ts` — 元信息/文件树/Tab/水合编排 + createTag/removeTag（标签库写回 novel.json，内置标签禁删；openNovel 清 aiStore.editingDraft）+ restoreSnapshot（M5：flushDirty→清草稿→关 Tab 卸载编辑器冲刷→150ms IPC 顺序→主进程恢复→复用 openNovel 水合）；2026-08-30 批次：closeTabs（Tab 右键菜单批量底座：激活回退链 fallbackId→剩余最后一个→空，蓝图回退经 activateTab 同步路由；closeTab/deleteFile/restoreSnapshot 统一走它）、exchangeFiles/deleteFile/renameFile 经 chapterFlush 前置冲刷、renameFile 重写 Tab id、reconcileTabs 树对账（onNovelChanged/refreshTree 清理失效 Tab）；v2 二批：createSnapshot（全本快照前置冲刷——修复直调 IPC 漏防抖窗口内编辑）、createChapterSnapshot/restoreChapterSnapshot（F8：冲刷→IPC→chapterReloadSeq 重挂载）、setRecapConfig（F9 配置写回）、createFile 返回实际创建路径（F16 采纳建章用）
- `store/graphStore.ts` — 全局图数据+路由栈+**变更 action 与保存编排**：结构变更（增删节点/边、连线改型）立即落盘，属性/位置变更 600ms 防抖；脏图与保存中图受 hydrate 保护（自身保存触发的 watcher 回推不回滚内存）；受控选中数组（selectedNodeIds/selectedEdgeIds）；8 层嵌套拦截（ADR-12）；**addNodesBatch（v2 二批）**——批量建点+索引边下标连线，单次 set 单笔落盘（结构模板插入用；蓝图超限位 null+端点边丢弃）
- `store/aiStore.ts` — AI 工作区：Provider 列表/选择、流式生成会话（llm:chunk 全局单订阅按 requestId 路由；startGeneration 带 options.maxTokens 透传）、editingDraft（ChapterEditor 节流 300ms 发布的正文草稿）、chapterEditor 实例引用、chapterFlush 冲刷桥（ChapterEditor 注册的「立即落盘挂起编辑」回调，章节文件系统变更前调用——清防抖定时器防卸载冲刷覆盖/复活）；v2-F3 multiGen 三路候选会话（deltaHandlers Map 按 requestId 分路路由；80ms 节流累积；originPath 发起章节供采纳校验）；v2-F16 扩展 MultiGenOptions（kind='chapterDraft' 会话不依赖编辑器——目标章可显式传入，采纳时才建章/落盘）
- `store/uiStore.ts` — 跨组件浮层状态（v2：章节快照列表/diff 对比/节拍整章发起浮层的开合——TabBar/画布发起 → App 根挂载）
- `store/dialogStore.ts` + `components/Dialog.tsx` — Promise 化 prompt/confirm（Electron 无原生）
- `components/useContextMenu.ts` — 右键菜单共享 hook（2026-08-30：开合状态+外点 mousedown/Esc 关闭+视口边缘钳制；TabBar/LeftPanel/BlueprintCanvas 三处菜单单点维护）
- `layout/` — 图标条/文件树/Tab 栏/分界线。左栏：**双击打开**（单击仅选中）、目录右键创建（卷/章节中文序号自动递增，>99 回绕阿拉伯数字）、**文件项右键**（打开/重命名/删除+创建项，2026-08-30）、章节拖动交换（含跨卷，经 exchangeFiles+chapterReloadSeq 重载编辑器）、蓝图按 owner 嵌套层级（成环兜底顶层；**owner 关系签名订阅**——节点拖动/属性变更不触发整树重算）、footer 快照/重建索引按钮；Tab 激活走 novelStore.activateTab（蓝图 Tab 同步画布路由）；全部容器带 nokey 类（画布外 Delete 不删节点）。TabBar：右键菜单（关闭/其他/右侧/所有，唯一 Tab 收敛单项；章节 Tab 附加「创建章节快照」「章节快照与对比…」，v2-F8）+中键关闭（mousedown 拦截自动滚动）+溢出横向滚动（滚轮纵转横/激活自动滚入视野/滚动条隐藏）；Splitter 拖动 rAF 合帧；IconStrip 四项：novel/ai/graph/timeline（search/blueprint 死项已移除，设置按钮接 AI 面板）；左栏 footer 两行布局（版本串+统计/敏感词/快照/重建索引四按钮）
- `layout/SnapshotPanel.tsx` — 全本快照浮层（M5：创建/列表/恢复（confirm 含自动备份提示）/删除；创建走 novelStore.createSnapshot 前置冲刷；复用 resource-panel 样式族 + .snapshot-overlay 居中遮罩）
- `layout/ChapterSnapshotPanel.tsx` + `layout/ChapterDiffPanel.tsx` — 章节级快照浮层族（v2-F8：列表/创建/恢复/删除 + 行级 diff 视图「当前→快照」红删绿增/长 ctx 折叠/一键恢复；入口=TabBar 章节 Tab 右键；经 uiStore 根级挂载）
- `canvas/BlueprintCanvas.tsx` — 蓝图画布（子图进入+跨图代理+连线创建+拖拽持久化+受控选中+标签着色+**Delete 自实现 window keydown+确认框**（作用于 store 选中集；deleteKeyCode 路径在 select 不回灌模式下不可达，勿恢复）+**节点右键菜单**（删除（确认）/进入子图/打开指向/生成整章草稿（blueprint 节点+有子图，F16））+**onlyRenderVisibleElements 视口虚拟化**——RF 对未测量节点 forceInitialRender 必渲染，首帧测量后裁剪；**rfNodes/rfEdges 增量缓存（2026-08-31 夜间）**：源对象引用未变即复用上次构建产物，mergeRefresh 的引用保护传导到 RF 层；nodeMirror 等价跳过）
- `canvas/CanvasToolbar.tsx` — 画布工具条（三类节点创建/保存状态/层级指示/资源库入口）
- `canvas/InspectorPanel.tsx` — 右侧属性面板（节点标题/标签（含新建自定义标签校验与删除入口）/别名/prompt/summary/refTarget/子图、边改型与 label、图信息）
- `canvas/AliasEditor.tsx` — 别名编辑器（M4-B，节点与章节共用：chips + 非法字符校验，意图式 onAdd/onRemove 由消费方读最新态解析）
- `canvas/ResourcePanel.tsx` — 资源库浮层（节点/标签组/结构模板保存、插入、应用、删除；改写预设分区（PresetForm 新建/编辑/删除，v2-F13）；结构模板插入走 addNodesBatch 单笔落盘；M4-B 起全局目录跨小说共享）
- `layout/StatsPanel.tsx` — 码字统计浮层（今日/总量/连续天数三卡片+近14天柱图）；`layout/SensitivePanel.tsx` — 敏感词浮层（站点库管理/当前章与全本检测——激活章用编辑草稿/按词聚合命中+跳章）；浮层族统一遮罩点关+Esc
- `graph/TimelineView.tsx` — 时间线矩阵（v2-F4：行=引用节点标签/列=章节数字序/格=交叉点亮，伏笔行红色；点格跳章即关覆盖层）
- `graph/GlobalGraphView.tsx` — 全局图谱（M4-A，G6 5：d3-force 投影/标签着色过滤/点击跳转蓝图/孤立与伏笔高亮；图标条 graph 项全宽覆盖层）。**2026-08-31 夜间重构：过滤/开关走 updateData 部分样式+visibility 与 draw()（不重排不丢用户布局），仅数据集变化才 render；清理走 stopLayout+延迟销毁+容错（防 G6 销毁竞态告警与清理异常白屏）**。**2026-09-18 渲染代际守卫：genRef 代际号+chainRef 串行队列——G6 异步操作严格串行、旧代链空跑、全链 try/catch；setData 首帧烤入过滤/高亮（viewStateRef 不进依赖，治「全可见一帧再隐藏」闪烁）**
- `canvas/ChapterEditor.tsx` — 章节 Tiptap 编辑器（StarterKit+Markdown+Placeholder+Wikilink；600ms 防抖保存 getMarkdown 落盘+卸载冲刷；**markdown 序列化按 ProseMirror doc 引用缓存**——草稿发布与保存共用；**chapterFlush 冲刷桥注册**（见 aiStore）；**卸载即中断 AI 生成**（chapterDraft 候选会话豁免——不依赖编辑器，F16）；加载 emitUpdate:false；草稿节流发布；元信息区标题/别名经 scheduleMetaSave 防抖——元信息变更不发布草稿）
- `canvas/extensions/Wikilink.ts` — [[wikilink]] Mark（inclusive:false；suggestion 补全 allowedPrefixes:null+isComposing 放行；markdown 自定义 token 双向；悬浮预览 floating-ui+点击跳转）
- `canvas/AiPanel.tsx` — AI 撰写面板（Provider 管理/续写/改写选中/停止；**前情提要双档（F9）**：novel.json recap 配置（尾部全文/开头摘要×N 章×每章字数），recap-config 行内编辑+合计行显示档位与前情 token；**改写预设选择器（F13）**：替换式注入改写指令；**节拍整章入口（F16）**：取 route 尾图开 BeatLauncher；候选区=MultiCandidates 组件；续写无编辑器时自动切最近章节，**改写不自动切换**（新挂载编辑器必无选区）；**组装草稿输入 1s 尾随去抖**）
- `canvas/MultiCandidates.tsx` — 多候选组件（F3 抽出独立，F16 扩展：continue=编辑器在原章才可采纳；chapterDraft=采纳时确保目标章就绪/不存在则自动建章；AI 面板内 + App 根级全局浮层双挂载）
- `canvas/BeatLauncher.tsx` — 节拍整章发起浮层（F16：节拍勾选/字数档位/目标章当前或新章/单路流式（浮层自承载写入器收尾）或三路候选）
- `services/contextAssembly.ts` + `graphTraversal.ts` — 上下文组装与图遍历纯函数（分支覆盖 97.3%；**关键词兜底只扫草稿尾部 KEYWORD_SCAN_TAIL_CHARS=20000 字**）；`naming.ts` — 默认标题去重；`recapAssembly.ts` — 前情双档组装（F9：总量上限均摊）；`generateMessages.ts` — 续写/改写消息组装（F13 预设替换式注入）；`beatAssembly.ts` — 节拍排序（arrow 拓扑+并列 y/x 稳定+容环回退）与整章消息组装（F16，不走三层预算）
- `services/streamInsert.ts` — StreamInserter 帧合并缓冲（R7：rAF/16ms 批量）；`generationWriter.ts` — 生成区写入器（流式纯文本内联 + finalize 按 markdown 重排；改写延迟删选区；编辑器销毁防护）
- `styles/` — 主题色板；色值以需求文档 5.2 节为准
- `scripts/gen-stress-blueprint.mjs` — 压力样本生成（节点蓝图 + --chapters/--words 长章节）
- `scripts/smoke-packaged.mjs` — 打包产物冒烟驱动（spawn exe --smoke，读 smoke-result.json）
- `scripts/gen-icon.mjs` — 零依赖应用图标生成（PNG-in-ICO，npm run gen:icon）

## 文档结构

- `PROJECT_PLAN.md` — 项目计划书（ADR-1~16 技术决策、里程碑 M0-M5 验收表、风险对策）
- `docs/01-产品需求文档.md` — 需求（FR/NFR 编号、术语表、UI 规范含色值表、待讨论问题）
- `docs/02-技术调研报告.md` — 竞品/开源项目/技术选型调研
- `docs/03-下阶段优化方案.md` — v2 规划提案（2026-08-31 调研驱动：功能路线 F1-F21/性能路线/竞品对照/优先级矩阵/待拍板问题）
- `docs/assets/` — UI 参考图（左侧工具条、AI 撰写图标）
- `docs/archive/` — 原始需求存档

## 仓库与 Git 上下文（重要）

本项目是 `StandardProject` 多项目仓库的一个子目录，**git 仓库根在上级目录** `D:\code\Git_Local\StandardProject`：

- 远程映射：`origin` → Gitee `li_fjyr/standard-project`；`github` → GitHub `song-xunxue/StandardProject`
- 推送顺序：先 `git push origin master`，再 `git push github master`
- `git add` 只操作 `MY_NovelWorkbench/` 目录内的文件，不影响兄弟项目（MY_Coze、MY_NLPAnalyzer 等）
- 隐私/环境文件一律不入库：`.env`、API Key、`*.db`/`*.sqlite` 等（上级 `.gitignore` 已覆盖）
- `.claude/` 为本地配置目录，不入库

## 代码规范（本项目特定）

- 作者署名统一为 `李文煜`
- 头部注释采用**项目类型风格**（功能说明 + 作者 + 日期 + 变更日志），例如：

  ```python
  """
  模块说明

  作者: 李文煜
  日期: yyyy-mm-dd

  yyyy-mm-dd
  变更说明：
    1. 具体修改内容描述
  """
  ```

  JS/TS 用同结构的 JSDoc 块注释
- 所有文档、代码注释、UI 文案使用中文
- 前后端结构可参照兄弟项目 `../MY_NLPAnalyzer/`（Flask 应用工厂 + Blueprint 路由 + 原生 JS 前端 + SQLite），保持工作区风格一致

## .claude/ 目录说明

- `chat.md` — 存放长文本信息（报错日志、超长输出等）
- `skills-guide.md` — Matt Pocock Skills 开发流程指南（全局同步副本）
- `memory_path.txt` — 记忆目录路径缓存（程序只读第一行）
