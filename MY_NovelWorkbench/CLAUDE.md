# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

MY_NovelWorkbench（小说创作工作台）——**AI 辅助的小说编辑器**：ComfyUI 式节点工作流（蓝图/节点/语义连线）× Obsidian 式双向链接（全局图谱），AI 创作上下文由链接关系自动组装，支持多类 AI API。UI 参考 PyCharm（左侧创建栏 + 右侧内容区 + 顶部文件 Tab + 可拖分界线），深色主题。

**当前状态：M0/M1/M2 已完成（2026-08-26）——蓝图编辑器完整版可用（三类节点/语义连线/标签着色/资源库/8 层拦截），审查修复全落；M2 遗留一项人工实测（100 节点 60fps，用 `node scripts/gen-stress-blueprint.mjs <小说目录>` 生成压力蓝图）。M3（正文编辑 + AI）待启动。**

## 常用命令

```bash
npm install        # 安装依赖（Electron 二进制慢时: ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/）
npm run dev        # 开发模式（Electron 窗口 + 热更新）
npm run typecheck  # tsc --noEmit（web）+ tsconfig.node.json（主进程，无 DOM）
npm run test       # vitest 单测（shared/src/electron 纯逻辑，当前 77 用例）
npm run build      # electron-vite 三目标构建 → out/{main,preload,renderer}
node scripts/gen-stress-blueprint.mjs <小说目录> [节点数]  # 生成 100 节点压力蓝图（M2 性能验收工具）
```

## 代码结构

**主进程（electron/，tsconfig.node.json）**
- `main.ts` — 窗口/生命周期/IPC 注册入口
- `ipc.ts` — fs 通道路由（契约见 `shared/types.ts` 的 IPC 常量）
- `preload.ts` — contextBridge 暴露 `window.api`（fs CRUD + 元信息/资源库 + 目录变化订阅）
- `services/novelService.ts` — 小说目录创建/打开/最近列表（userData/recent.json）+ readMeta/saveMeta（novel.json 标签库，tmp+rename 原子写；openNovel 对旧目录回填 tagLibrary）
- `services/fileService.ts` — 文件树/蓝图/章节 CRUD（`resolveInNovel` 路径穿越防护）+ 资源库（resources/ 模板列表/保存/删除，清洗撞车拒写）
- `services/indexService.ts` — SQLite 索引（better-sqlite3，`.index/index.db`，mtime+size 增量）
- `watcher.ts` — fs.watch recursive + 300ms 防抖 → 增量索引 + 推送文件树

**共享层（shared/，两个 tsconfig 都引用，必须环境无关）**
- `blueprint.ts` — 蓝图领域类型（含 refTarget、MAX_NESTING_DEPTH=8）；`blueprintCodec.ts` — 文件↔GraphData 水合/导出（节点/边字段归一化容错）
- `novelTemplate.ts` — 新建小说标准目录模板（含内置标签库）；`frontmatter.ts` — 章节 YAML 子集编解码
- `sanitize.ts` — 文件名清洗；`types.ts` — IPC 契约与 NovelMeta/TreeNode/ChapterDoc/ResourceTemplate
- `tags.ts` — 标签工具（tagColorOf/nodeAccentColor/自定义色板轮转）；`resource.ts` — 资源模板互转与校验

**渲染层（src/，tsconfig.json）**
- `App.tsx` — 三栏布局 + 欢迎页 + 画布行（画布+分界线+属性面板，200-420px 可拖）
- `store/novelStore.ts` — 元信息/文件树/Tab/水合编排 + createTag（标签库写回 novel.json）
- `store/graphStore.ts` — 全局图数据+路由栈+**变更 action 与保存编排**：结构变更（增删节点/边、连线改型）立即落盘，属性/位置变更 600ms 防抖；脏图与保存中图受 hydrate 保护（自身保存触发的 watcher 回推不回滚内存）；受控选中数组（selectedNodeIds/selectedEdgeIds）；8 层嵌套拦截（ADR-12）
- `store/dialogStore.ts` + `components/Dialog.tsx` — Promise 化 prompt/confirm（Electron 无原生）
- `layout/` — 图标条/文件树（含重命名删除）/Tab 栏/分界线
- `canvas/BlueprintCanvas.tsx` — 蓝图画布（子图进入+跨图代理+连线创建+拖拽持久化+受控选中+标签着色+Delete 删除）
- `canvas/CanvasToolbar.tsx` — 画布工具条（三类节点创建/保存状态/层级指示/资源库入口）
- `canvas/InspectorPanel.tsx` — 右侧属性面板（节点标题/标签/prompt/summary/refTarget/子图、边改型与 label、图信息）
- `canvas/ResourcePanel.tsx` — 资源库浮层（节点/标签组模板保存、插入、应用、删除）
- `canvas/ChapterEditor.tsx` — 章节编辑（防抖保存）
- `services/contextAssembly.ts` + `graphTraversal.ts` — 上下文组装与图遍历纯函数；`services/naming.ts` — 默认标题去重（节点标题 + 蓝图文件名全局占用）
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
