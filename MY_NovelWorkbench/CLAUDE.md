# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

MY_NovelWorkbench（小说创作工作台）——**AI 辅助的小说编辑器**：ComfyUI 式节点工作流（蓝图/节点/语义连线）× Obsidian 式双向链接（全局图谱），AI 创作上下文由链接关系自动组装，支持多类 AI API。UI 参考 PyCharm（左侧创建栏 + 右侧内容区 + 顶部文件 Tab + 可拖分界线），深色主题。

**当前状态：M0-M4 完成（2026-08-28，152 用例全绿）——正文 Tiptap 编辑器 + [[wikilink]] 双链 + AI Provider（safeStorage 加密）+ 流式生成/中断 + 上下文组装 v1（分支覆盖 97.3%）+ Context Viewer + G6 全局图谱 + 资源库跨小说（userData/resources 全局目录）+ 别名编辑/重建索引/标签删除入口可用。下一站 M5（打包发布）。**

**重要交互机制（2026-08-27 联调修复，改动画布前必读）**：
- 画布选中为**显式事件驱动**（onNodeClick/onEdgeClick/onPaneClick → setSelection），勿回灌 `selected` 到 nodes/edges props——会与 RF 内部状态在结构变更时形成无限渲染循环（建节点/连线全黑崩溃）
- 受控 `nodes` 必须接 `onNodesChange`（本地镜像 `applyNodeChanges`，仅承接 `position`/`remove` 变更；`dimensions`/`select` 回灌会与 RF 测量形成主线程打满循环），否则拖拽不跟手
- 节点创建入口在画布右键菜单（onPaneContextMenu → canvasCreateBridge 复用 CanvasToolbar 的创建实现，落点=鼠标位置）

## 常用命令

```bash
npm install        # 安装依赖（Electron 二进制慢时: ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/）
npm run dev        # 开发模式（Electron 窗口 + 热更新）
npm run typecheck  # tsc --noEmit（web）+ tsconfig.node.json（主进程，无 DOM）
npm run test       # vitest 单测（纯逻辑 + jsdom 编辑器桥接，当前 152 用例）
npm run build      # electron-vite 三目标构建 → out/{main,preload,renderer}
node scripts/gen-stress-blueprint.mjs <小说目录> [节点数]  # 生成 100 节点压力蓝图（M2 性能验收工具）
# LLM 开发期联调：项目根 .env 配 NOVEL_LLM_BASE_URL / NOVEL_LLM_API_KEY / NOVEL_LLM_MODEL（正式配置走应用内 AI 面板）
```

## 代码结构

**主进程（electron/，tsconfig.node.json）**
- `main.ts` — 窗口/生命周期/IPC 注册入口
- `ipc.ts` — fs/provider/llm 通道路由（契约见 `shared/types.ts` 的 IPC 常量）
- `preload.ts` — contextBridge 暴露 `window.api`（fs + provider + llm + 目录变化/流式分块订阅）
- `services/novelService.ts` — 小说目录创建/打开/最近列表（userData/recent.json）+ readMeta/saveMeta（novel.json 标签库，tmp+rename 原子写；openNovel 对旧目录回填 tagLibrary + 触发旧资源迁移）
- `services/fileService.ts` — 文件树/蓝图/章节 CRUD（`resolveInNovel` 路径穿越防护）+ 卷支持（chapters/ 一层卷目录，章节按「第N章」数字序）+ exchangeFiles（文件名互换=章节排序）；rename 同步内部 title（蓝图 JSON / 章节 frontmatter）
- `services/resourceService.ts` — 资源库（M4-B 全局目录 userData/resources，跨小说共享不依赖打开小说）：模板列表/保存（tmp+rename 原子写+清洗撞车拒写）/删除（防穿越）+ migrateLegacyResources（旧小说 resources/ 幂等迁移：.migrated 完成标记防已删模板复活）
- `services/providerService.ts` — AI Provider 配置（userData/providers.json + safeStorage 加密 API Key；.env 三变量开发期回退 Provider 'env-default' 不入盘；GET /models 连接测试）
- `services/llmService.ts` — OpenAI 兼容流式生成（主进程 fetch SSE → llm:chunk 推送；AbortController 中断；LLM 在主进程执行：sandbox 渲染层 CORS + 凭据不出主进程）
- `services/indexService.ts` — SQLite 索引（better-sqlite3，`.index/index.db`，mtime+size 增量）
- `watcher.ts` — fs.watch recursive + 300ms 防抖 → 增量索引 + 推送文件树

**共享层（shared/，两个 tsconfig 都引用，必须环境无关）**
- `blueprint.ts` — 蓝图领域类型（含 refTarget、MAX_NESTING_DEPTH=8）；`blueprintCodec.ts` — 文件↔GraphData 水合/导出（节点/边字段归一化容错）
- `novelTemplate.ts` — 新建小说标准目录模板（含内置标签库）；`frontmatter.ts` — 章节 YAML 子集编解码（未知键与非键值行以原样行 extraLines 保留往返）
- `sanitize.ts` — 文件名清洗；`types.ts` — IPC 契约与 NovelMeta/TreeNode/ChapterDoc/ResourceTemplate/ProviderConfig/ChatMessage
- `tags.ts` — 标签工具（tagColorOf/nodeAccentColor/自定义色板轮转）；`resource.ts` — 资源模板互转与校验
- `sse.ts` — SSE 流解析纯函数（跨 chunk 半行缓冲/[DONE]/非 JSON 容错）

**渲染层（src/，tsconfig.json）**
- `App.tsx` — 三栏布局 + 欢迎页 + 画布行（画布+分界线+属性面板，200-420px 可拖）
- `store/novelStore.ts` — 元信息/文件树/Tab/水合编排 + createTag/removeTag（标签库写回 novel.json，内置标签禁删；openNovel 清 aiStore.editingDraft）
- `store/graphStore.ts` — 全局图数据+路由栈+**变更 action 与保存编排**：结构变更（增删节点/边、连线改型）立即落盘，属性/位置变更 600ms 防抖；脏图与保存中图受 hydrate 保护（自身保存触发的 watcher 回推不回滚内存）；受控选中数组（selectedNodeIds/selectedEdgeIds）；8 层嵌套拦截（ADR-12）
- `store/aiStore.ts` — AI 工作区：Provider 列表/选择、流式生成会话（llm:chunk 全局单订阅按 requestId 路由）、editingDraft（ChapterEditor 节流 300ms 发布的正文草稿）、chapterEditor 实例引用
- `store/dialogStore.ts` + `components/Dialog.tsx` — Promise 化 prompt/confirm（Electron 无原生）
- `layout/` — 图标条/文件树/Tab 栏/分界线。左栏：**双击打开**（单击仅选中）、目录右键创建（卷/章节中文序号自动递增，>99 回绕阿拉伯数字）、章节拖动交换（含跨卷，经 exchangeFiles+chapterReloadSeq 重载编辑器）、蓝图按 owner 嵌套层级（成环兜底顶层）；Tab 激活走 novelStore.activateTab（蓝图 Tab 同步画布路由）；全部容器带 nokey 类（画布外 Delete 不删节点）
- `canvas/BlueprintCanvas.tsx` — 蓝图画布（子图进入+跨图代理+连线创建+拖拽持久化+受控选中+标签着色+Delete 删除）
- `canvas/CanvasToolbar.tsx` — 画布工具条（三类节点创建/保存状态/层级指示/资源库入口）
- `canvas/InspectorPanel.tsx` — 右侧属性面板（节点标题/标签（含新建自定义标签校验与删除入口）/别名/prompt/summary/refTarget/子图、边改型与 label、图信息）
- `canvas/AliasEditor.tsx` — 别名编辑器（M4-B，节点与章节共用：chips + 非法字符校验，意图式 onAdd/onRemove 由消费方读最新态解析）
- `canvas/ResourcePanel.tsx` — 资源库浮层（节点/标签组模板保存、插入、应用、删除；M4-B 起全局目录跨小说共享）
- `graph/GlobalGraphView.tsx` — 全局图谱（M4-A，G6 5：d3-force 投影/标签着色过滤/点击跳转蓝图/孤立与伏笔高亮；图标条 graph 项全宽覆盖层）
- `canvas/ChapterEditor.tsx` — 章节 Tiptap 编辑器（StarterKit+Markdown+Placeholder+Wikilink；600ms 防抖保存 getMarkdown 落盘+卸载冲刷；加载 emitUpdate:false；草稿节流发布；元信息区标题/别名经 scheduleMetaSave 防抖——元信息变更不发布草稿）
- `canvas/extensions/Wikilink.ts` — [[wikilink]] Mark（inclusive:false；suggestion 补全 allowedPrefixes:null+isComposing 放行；markdown 自定义 token 双向；悬浮预览 floating-ui+点击跳转）
- `canvas/AiPanel.tsx` — AI 撰写面板（Provider 管理/续写/改写选中/停止；**前情提要**：编辑第 N 章自动注入前 2 章正文尾部；Context Viewer：三层预算/prompt 全文与复制/丢弃记录；组装目标 ref→选中→首节点；无编辑器时自动切最近章节）
- `services/contextAssembly.ts` + `graphTraversal.ts` — 上下文组装与图遍历纯函数（分支覆盖 97.3%）；`naming.ts` — 默认标题去重
- `services/streamInsert.ts` — StreamInserter 帧合并缓冲（R7：rAF/16ms 批量）；`generationWriter.ts` — 生成区写入器（流式纯文本内联 + finalize 按 markdown 重排；改写延迟删选区；编辑器销毁防护）
- `styles/` — 主题色板；色值以需求文档 5.2 节为准
- `scripts/gen-stress-blueprint.mjs` — 100 节点压力蓝图生成（性能验收）

## 文档结构

- `PROJECT_PLAN.md` — 项目计划书（ADR-1~16 技术决策、里程碑 M0-M5 验收表、风险对策）
- `docs/01-产品需求文档.md` — 需求（FR/NFR 编号、术语表、UI 规范含色值表、待讨论问题）
- `docs/02-技术调研报告.md` — 竞品/开源项目/技术选型调研
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
