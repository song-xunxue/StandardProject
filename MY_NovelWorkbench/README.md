# MY_NovelWorkbench

AI 辅助的小说创作工作台（桌面应用）：

- **节点工作流**（参考 ComfyUI）：蓝图 + 节点 + 语义连线，蓝图节点可进入（子图嵌套）
- **双向链接**（参考 Obsidian）：[[wikilink]] 双链 + 全局图谱视图
- **链路驱动的 AI 上下文组装**：创作正文时，由「前后链接节点 + 上级蓝图链路」自动组装提示词，支持多 AI API（BYOK）
- **本地优先**：一本小说 = 一个目录（Markdown + JSON 纯文件真相源 + SQLite 索引缓存）

## 快速开始

```bash
npm install        # 安装依赖（Electron 二进制下载慢时可设 ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/）
npm run dev        # 启动开发模式（Electron 窗口 + 热更新）
npm run typecheck  # TypeScript 类型检查
npm run build      # 构建产物（out/）
```

## 技术栈

Electron · React 18 + TypeScript · React Flow（蓝图画布）· zustand · AntV G6（图谱，M4）· Tiptap（正文编辑，M3）· electron-vite

## 界面与色板

PyCharm 式布局：左侧创建栏 / 右侧内容区（顶部文件 Tab）/ 可拖动分界线。

| 部位 | 色值 |
|---|---|
| 左侧创建栏背景 | `#191A1C` |
| 分界线 | `#26282B` |
| 左栏滚动条 | `#545557` |
| 右侧内容展示框 | `#1E1F22` |
| 蓝图画布背景 | `#161618` + 点阵网格 |

## 文档

- [PROJECT_PLAN.md](PROJECT_PLAN.md) — 项目计划书（技术决策 / 架构 / 里程碑 M0-M5）
- [docs/01-产品需求文档.md](docs/01-产品需求文档.md) — 需求（FR/NFR）
- [docs/02-技术调研报告.md](docs/02-技术调研报告.md) — 竞品 / 开源 / 技术选型调研

## 作者

李文煜
