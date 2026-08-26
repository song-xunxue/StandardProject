# MY_NovelWorkbench 项目计划书

| 项目 | 内容 |
|---|---|
| 文档版本 | v1.1 |
| 作者 | 李文煜 |
| 日期 | 2026-08-25 |
| 状态 | 已确认（技术栈与全部 Open Questions 已闭环，见 ADR-1~16） |
| 配套文档 | [docs/01-产品需求文档.md](docs/01-产品需求文档.md) · [docs/02-技术调研报告.md](docs/02-技术调研报告.md) |

---

## 1. 项目概述

### 1.1 定位

AI 辅助的小说创作工作台（桌面应用）：**ComfyUI 式节点工作流蓝图 × Obsidian 式双向链接图谱 × 链路驱动的 AI 上下文组装**，支持多 AI API（BYOK）。

### 1.2 目标

1. 作者以「蓝图 + 节点 + 语义连线」组织小说的设定/伏笔/大纲/世界观，蓝图节点可进入（子图嵌套）
2. 正文创作时，AI 上下文由「前后链接节点 + 上级蓝图链路」自动组装（结构化链路驱动，关键词触发兜底）
3. 数据本地优先：一本小说 = 一个目录，纯文件真相源，git 友好
4. PyCharm 式深色界面（左创建栏 / 右内容区 / 顶部 Tab / 可拖分界线）

### 1.3 非目标（v1 不做）

- 多人实时协作（CRDT 预留但不实现）
- 移动端 / 云同步服务
- 内置模型托管 / 积分计费（走 BYOK）
- 网文平台一键发布对接

## 2. 技术决策记录（ADR 摘要）

| # | 决策 | 选择 | 理由 | 备选与放弃原因 |
|---|---|---|---|---|
| ADR-1 | 应用形态 | **Electron** | 中文 IME 稳定性优先；VS Code/Obsidian 同路线；本地文件访问天然支持 | Tauri（WebView 一致性风险）；Web（非桌面形态） |
| ADR-2 | 前端框架 | **React 18 + TypeScript** | React Flow 生态绑定 React，社区最大 | Vue 3（画布库选择面窄） |
| ADR-3 | 蓝图画布 | **React Flow (@xyflow/react) v12** | MIT；语义连线/小地图/黑网格全命中；子图路由式进入社区已验证 | LiteGraph（Canvas 渲染做富文本节点成本高）；X6（无 React 绑定时备选） |
| ADR-4 | 全局图谱 | **AntV G6 5.x**（Graphin 3 封装） | MIT、中文文档、力导向布局 | Cytoscape.js（偏分析、定制繁琐） |
| ADR-5 | 正文编辑器 | **Tiptap** | [[双链]] 悬浮预览 + 流式插入 | CodeMirror 6（轻量备选，双链渲染弱） |
| ADR-6 | 状态管理 | **zustand** | React Flow 官方推荐，selector 订阅避免画布全局重渲染 | Redux（过重） |
| ADR-7 | 数据存储 | **纯文件真相源 + SQLite 索引缓存** | Markdown+JSON 可 git/可移植；索引可重建 | 纯 SQLite（Logseq 迁移教训） |
| ADR-8 | 蓝图文件格式 | **JSON Canvas 扩展**（自定义 node type + edge.type 语义） | 保留 JSON Canvas 核心字段子集，自定义字段对 Obsidian **降级可读**（Obsidian 忽略未知字段仍能打开画布，但自定义 node type 不可编辑）——是「子集兼容」而非「生态互通」 | 完全自定义格式 |
| ADR-9 | AI 接入 | **自写 OpenAI 兼容 Provider 层** | baseURL+key+model 一套覆盖 90% 厂商（DeepSeek/GLM/Kimi/Qwen/Ollama） | LiteLLM/one-api 网关（进程过重，不内置） |
| ADR-10 | 流式输出 | **fetch + ReadableStream 解析 SSE** | 需自定义 Header；Electron 本地侧无跨域问题 | EventSource（不支持 POST/Header） |
| ADR-11 | 开发流程 | **M0 PoC 先行** | 子图数据模型是第一技术风险，风险前置 | 直接开发（风险后置） |
| ADR-12 | 蓝图嵌套深度上限（PRD Q5） | **上限 8 层** | 防无限递归与 UI 迷航（面包屑最多 8 级）；创建第 9 层蓝图节点时界面提示并阻止。8 层已远超「小说→内容→大纲→章节→场景」的实际深度（4-5 层） | 不设限（递归与迷航风险） |
| ADR-13 | 多本小说同时打开（PRD Q6） | **v1 单本**：单窗口单小说目录 | 简化窗口/Tab/索引架构；「最近打开」列表快速切换 | 多本同时打开（M5 后评估多 Tab 架构） |
| ADR-14 | 版本管理（PRD Q7） | **v1 不内置 git，纯文件天然 git 友好** | 用户可对小说目录自行 `git init`；应用内快照（复制目录到 .snapshots/）列为 M5 评估项 | 内置 git 集成（复杂度高，需求未验证） |
| ADR-15 | 语义连线映射表（PRD Q8） | **箭头=因果/顺序（展开、前后文推进）· 直线=并列关联（同类设定互指）· 虚线=参考/伏笔（弱关联、跨章呼应）** | 映射关系同时决定上下文注入权重（虚线参考边 < 实线关联边 < 箭头顺序边）；连线可附 label 说明具体语义 | 更多种类（用户认知负担，v2 扩展） |
| ADR-16 | API Key 存储（NFR-04 落点） | **Electron safeStorage 加密后存 userData 目录** | 系统级密钥链加密，不明文落盘；`.env` 仅用于开发期联调，不分发 | 明文 JSON（不安全）；.env 分发（桌面应用无意义） |

## 3. 架构设计

### 3.1 进程与分层

```
┌─────────────────────────── Electron ───────────────────────────┐
│  主进程 (electron/)                                             │
│    · 窗口管理 / 菜单 / 生命周期                                   │
│    · 文件系统服务（小说目录读写、监听） ←→ 纯文件真相源             │
│    · SQLite 索引（nodes/edges/tags 表，增量更新，可重建）          │
│    · AI Provider 凭据（safeStorage 加密，ADR-16）                │
│  预加载 (contextIsolation + sandbox)                             │
│    · IPC 桥：window.api.fs / window.api.llm / window.api.index   │
│  渲染进程 (src/)                                                 │
│    · 工作台布局（三栏 + Tab + 可拖分界线）                         │
│    · 蓝图画布（React Flow，路由式子图进入）                        │
│    · 正文编辑器（Tiptap，[[wikilink]] + 流式插入）                │
│    · 全局图谱（G6，逻辑图投影）                                   │
│    · zustand 全局状态 / AI Provider 层（渲染侧 fetch SSE）        │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 数据模型草案（M0 冻结字段）

**一本小说 = 一个目录**：

```
MyNovel/
├── novel.json               # 小说元信息（书名/简介/标签库）
├── blueprints/              # 蓝图文件（JSON Canvas 扩展）
│   ├── 内容.blueprint.json   #   nodes[]: {id,type:blueprint|text|ref,title,tags[],
│   │                        #            prompt,summary,pos,size}
│   └── 世界观.blueprint.json #   edges[]: {id,from,to,type:arrow|line|dashed,label}
├── chapters/                # 正文（Markdown + frontmatter）
│   └── 第01章.md             #   frontmatter: {tags[],aliases[]} —— 只放元数据，
│                             #   绝不放链接（双链索引坑，见调研 3.2 冻结建议）
│                             #   正文内 [[wikilink]] 双链
└── .index/                  # SQLite 索引缓存（可删除重建，创建小说时自动生成
                             # .gitignore 忽略之）
```

字段说明：

- **`nodes[].type`**：`blueprint`（可进入的子图）/ `text`（纯文本节点）/ `ref`（引用节点——指向 chapters/ 中正文文件或其他蓝图的节点，**章节与蓝图的归属关系由 ref 承载**，而非 frontmatter 字段）
- **`nodes[].prompt`**：节点自带的提示词信息（写作要求/文风约束等，PRD 术语表定义的节点属性）；**`summary`** 是另一概念——摘要卡片（50-100 字，专用于上级链路注入时的压缩表示，见 3.3）
- **`edges[].type`**：语义连线类型，映射见 ADR-15
- **索引 schema**：`nodes(id,path,type,tags,mtime,hash)` / `edges(source_id,target_id,type,anchor)` / `tags(name,color,builtin)`；`anchor` 语义为「链接在源文件中的锚点位置（行号/偏移），用于反链跳转与高亮」；mtime/hash 变更才重解析；「重建索引」命令兜底

### 3.3 AI 上下文组装 v1（M3 实现）

三层优先级：① 当前节点（含其 prompt）+ 直接前后链接节点（全文）→ ② 上级蓝图链摘要卡（50-100 字/蓝图）→ ③ 深度 ≥2 节点按边语义加权（箭头 > 直线 > 虚线，ADR-15）；token 预算分层 60/25/15；链路深度默认截断 2 层；预算未满时关键词匹配兜底。

## 4. 里程碑规划

> 说明：M0 PoC 代码**直接落在 `src/canvas/` 与 `src/store/`**（不建独立 demo 目录，避免一次性丢弃）；骨架已完成的布局部分（`src/layout/`、三栏/Tab/分界线）计为 M1 已完成项。

### M0：PoC——验证第一技术风险（1-2 周）✅ **已完成（2026-08-25，React Flow 选型冻结）**

**目标**：证明「React Flow 路由式子图进入 + 跨图边数据层」可行。

**完成情况**：四项验收全部达成并通过双视角审查（含反驳式复核）——数据层 `src/store/graphStore.ts`、子图进入 `src/canvas/BlueprintCanvas.tsx`（key 重挂 + 面包屑）、跨图边代理节点、组装纯函数 `src/services/contextAssembly.ts`（18 个 vitest 用例全绿）。审查修复：跨图边「仅 to 端在本图」悬空缺陷（验收③）、祖先链重复实现（抽 `src/services/graphTraversal.ts` 单一实现）、layer1 集合循环重建、兜底 token 统计口径。

| 任务 | 验收标准 |
|---|---|
| 全局节点/边表数据层（内存版） | 蓝图 A 可引用蓝图 B 的节点；上级链路可遍历 |
| 路由式子图进入 | 双击蓝图节点 → 路由切换新 ReactFlow 实例；面包屑可回退 |
| 跨图边渲染 | 跨蓝图边在画布上以引用节点形态正确显示 |
| 最小上下文组装 | 给定节点，按三层优先级输出组装结果（纯函数+单测） |
| 决策点 | 数据层验证通过 → 冻结 React Flow；失败 → 回退 X6 方案 |

### M1：工作台骨架完善 + 小说管理（2 周，前置：M0 通过）✅ **已完成（2026-08-25，验收 5/5 PASS）**

| 任务 | 验收标准 |
|---|---|
| 小说目录创建/打开/最近列表 | 新建小说生成标准目录结构（含自动 .gitignore 忽略 .index/）；打开后文件树正确显示 |
| 文件树与文件 CRUD | 蓝图/正文的创建/重命名/删除实时反映到磁盘与文件树 |
| 文件监听 + SQLite 索引 v1 | 外部编辑器修改文件后 2s 内索引更新；删除 .index/ 后「重建索引」可完整恢复 |
| IPC 桥扩展（fs 通道） | 渲染进程经 window.api.fs 完成全部读写，无 nodeIntegration |
| tsconfig 拆分（node/web） | 主进程代码误用 DOM API 时类型检查报错 |

### M2：蓝图编辑器完整版（3 周，前置：M1）

| 任务 | 验收标准 |
|---|---|
| 节点创建/标题/类型 | 三类节点（blueprint/text/ref）可创建编辑；蓝图节点双击进入（M0 能力产品化）；嵌套达 8 层时阻止并提示（ADR-12） |
| 语义连线 | 箭头/直线/虚线三类可创建、可改型、可附 label；连线持久化到蓝图 JSON 且重开画布还原 |
| 标签系统 | 内置标签（设定/伏笔/大纲/世界观）+ 自定义标签；节点可多标签；标签决定节点着色 |
| 画布交互 | 节点拖拽/画布缩放平移/小地图；100 节点画布拖拽不掉帧（60fps 目标） |
| 资源库 v1 | 常用节点/标签模板可保存、可插入当前蓝图 |

### M3：正文编辑 + AI（3 周，前置：M1 索引、M2 蓝图）

| 任务 | 验收标准 |
|---|---|
| Tiptap 编辑器 | 正文编辑自动保存；[[wikilink]] 输入补全 + 悬浮预览；流式插入不卡顿（节流批量，见风险 R7） |
| Provider 层（ADR-9/16） | OpenAI 兼容 + Ollama 可配置多 Provider；API Key 经 safeStorage 加密存储（NFR-04 验收）；连接测试通过 |
| 流式生成 | 续写/改写以 SSE 流式呈现；可中断 |
| 上下文组装 v1 | 三层优先级 + 深度截断 + 预算分层 + 关键词兜底全部实现；组装逻辑纯函数单测覆盖 ≥ 90% 分支 |
| Context Viewer | 面板可查看当前实际组装的 prompt 全文、各层 token 占用与预算命中率 |

### M4：全局图谱 + 资源库完善（2 周，前置：M2 标签、M1 索引）

| 任务 | 验收标准 |
|---|---|
| G6 图谱视图 | 全部节点/边投影为一张图；按标签着色与过滤；点击节点跳转对应蓝图/正文 |
| 图谱分析提示 | 孤立节点（无任何链接）与未回收「伏笔」标签节点可高亮提示 |
| 资源库跨小说 | 资源库目录独立于单本小说，可跨小说引用 |

### M5：打磨与发布（2 周，前置：全部）

| 任务 | 验收标准 |
|---|---|
| 性能优化 | 大画布视口虚拟化；索引增量更新（10 万字小说冷启动索引 < 5s） |
| electron-builder 打包 | Windows nsis 安装包可安装运行；**better-sqlite3 原生模块 ABI 匹配冒烟测试通过**（见风险 R5）；CSP 收紧复检 |
| 快照功能评估 | 评估目录快照方案，通过则实现（ADR-14） |
| 用户文档 | README/使用说明覆盖创建小说到 AI 创作全流程 |

## 5. 风险与对策

| # | 风险 | 等级 | 对策 |
|---|---|---|---|
| R1 | 子图数据模型（跨图边/父子同步）无库级支持 | 高 | M0 PoC 前置验证；失败回退 X6 |
| R2 | 上下文超限（无约束图遍历） | 高 | 深度截断+预算+优先级三件套第一天进设计（3.3 节已定） |
| R3 | 节点画布「非写手习惯」采用风险 | 中 | 画布只做组织层，正文保留传统编辑器；提供模板蓝图降低上手门槛 |
| R4 | 个人开发节奏 | 中 | 里程碑严格验收（第 4 节验收表）；每阶段产出可运行版本 |
| R5 | better-sqlite3 原生模块与 Electron ABI 不匹配（打包失败常见点） | 中 | M5 冒烟测试前置到引入时（M1）；锁定 electron-rebuild 流程文档化 |
| R6 | 文件真相源并发写竞态（外部编辑器 vs 应用内保存） | 中 | chokidar 监听 + 文件 mtime/hash 校验；冲突时提示用户选择版本 |
| R7 | Tiptap 流式插入与 wikilink 实时高亮协同卡顿 | 中 | 节流/批量插入（requestAnimationFrame 合并）；M3 设计时前置性能方案 |
| R8 | Electron 体积/内存 | 低 | 接受（IME 优先级更高） |

## 6. 目录结构

```
MY_NovelWorkbench/
├── PROJECT_PLAN.md            # 本计划书
├── docs/                      # 需求/调研/参考图/存档
├── electron/                  # 主进程与预加载
│   ├── main.ts                # 窗口管理/生命周期
│   └── preload.ts             # IPC 桥（contextIsolation）
├── src/                       # 渲染进程（React）
│   ├── main.tsx               # React 入口
│   ├── App.tsx                # 工作台布局根组件
│   ├── layout/                # 三栏布局/图标条/Tab栏/分界线
│   ├── canvas/                # 蓝图画布（React Flow，M0 PoC 落点）
│   ├── graph/                 # 全局图谱（G6，M4）
│   ├── editor/                # 正文编辑器（Tiptap，M3）
│   ├── store/                 # zustand 状态（M0 PoC 落点）
│   ├── services/              # AI Provider / IPC 封装
│   ├── types/                 # 共享类型（Blueprint/Node/Edge/Tag）
│   └── styles/                # 主题色板（CSS 变量）
├── electron.vite.config.ts    # electron-vite 三目标构建配置
├── package.json
└── README.md
```

## 7. 变更记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-08-25 | v1.0 | 初版：技术决策确认（Electron/React/PoC 先行），里程碑 M0-M5 制定 |
| 2026-08-25 | v1.1 | 审查修订：①M1-M5 补齐验收标准表与前置依赖；②新增 ADR-12~16 闭环 PRD 全部 Open Questions；③修正数据模型（frontmatter 不放链接，归属关系由 ref 节点承载）；④节点增加 prompt 字段；⑤API Key 存储定 safeStorage（ADR-16）；⑥风险表补 R5-R7；⑦ADR-8 兼容性表述修正；⑧M0 代码落位说明 |
| 2026-08-25 | v1.2 | M0 PoC 完成并通过验收审查：React Flow 选型冻结；新增 graphStore/contextAssembly/graphTraversal 与画布集成；18 个单测全绿 |
| 2026-08-25 | v1.3 | M1 完成并通过验收审查（5/5 PASS）：shared 层 + 主进程三服务 + IPC fs 通道 + watcher/SQLite 索引 + 欢迎页/文件树/Tab/章节编辑；37 单测全绿；better-sqlite3 双 ABI 验证（R5 开发期解除）。审查修复：索引删除残留清理（removePath+ENOENT 级联）、StrictMode 重复订阅、hydrate 路由保留、deleteFile 路径规范化防绕过、recent.json 容错+原子写、章节编辑器卸载冲刷保存 |
