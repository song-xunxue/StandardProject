# MY_NovelWorkbench 项目计划书

| 项目 | 内容 |
|---|---|
| 文档版本 | v2.1 |
| 作者 | 李文煜 |
| 日期 | 2026-08-28 |
| 状态 | **M0-M5 全部完成**（快照已实现，ADR-14 闭环；全部 Open Questions 已闭环，见 ADR-1~16） |
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
| ADR-14 | 版本管理（PRD Q7） | **v1 不内置 git，纯文件天然 git 友好**；应用内快照 M5 已实现（.snapshots/ 目录拷贝，上限 10 份，恢复前自动备份） | 用户可对小说目录自行 `git init`；快照为应用内轻量回滚 | 内置 git 集成（复杂度高，需求未验证） |
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

### M2：蓝图编辑器完整版（3 周，前置：M1）✅ **已完成（2026-08-26，验收 5/5 PASS）**

**完成情况**：三视角审查（验收核验/逻辑正确性/回归）+ 反驳式复核确认 4 高/3 中/10 低危发现，全部高危与中危当日修复：受控选中（数组化 selectedNodeIds/selectedEdgeIds 回灌 RF，属性面板不再首键即关）、canvas-row 高度链（.content-area 非 flex 导致画布视口 0 高）、hydrate 脏图/保存中图保护（自身保存触发的 watcher 回推不再回滚防抖窗口内编辑）、defaultTitle 同名基数（第二次创建蓝图节点不再必然撞文件名）、孤儿子图不抢根图身份（hydrate 沿用 prev.rootGraphId）、外部手编文件字段归一化（缺 tags/position 不再白屏）。低危修复含：连线 label 改防抖落盘、ref 下拉 kind 标注、资源浮层锚定画布与滚动容器、资源名清洗撞车拒写、proxy↔proxy 连线拒绝、createTag/删资源失败提示、8 层插入模板提示、M1 旧 novel.json 无 tagLibrary 回填。100 节点 60fps 已人工实测通过（2026-08-26，`scripts/gen-stress-blueprint.mjs` 生成压力蓝图后拖拽/缩放观察）。新增 77 用例（graphStore 22 / codec 4 / tags 6 / resource 6 / naming 4 / 既有扩展），typecheck/vitest/build/dev 冒烟全绿。

| 任务 | 验收标准 |
|---|---|
| 节点创建/标题/类型 | 三类节点（blueprint/text/ref）可创建编辑；蓝图节点双击进入（M0 能力产品化）；嵌套达 8 层时阻止并提示（ADR-12） |
| 语义连线 | 箭头/直线/虚线三类可创建、可改型、可附 label；连线持久化到蓝图 JSON 且重开画布还原 |
| 标签系统 | 内置标签（设定/伏笔/大纲/世界观）+ 自定义标签；节点可多标签；标签决定节点着色 |
| 画布交互 | 节点拖拽/画布缩放平移/小地图；100 节点画布拖拽不掉帧（60fps 目标） |
| 资源库 v1 | 常用节点/标签模板可保存、可插入当前蓝图 |

### M3：正文编辑 + AI（3 周，前置：M1 索引、M2 蓝图）✅ **已完成（2026-08-26，验收 4 PASS + 2 PARTIAL[需真实 API Key 人工联调]）**

**完成情况**：Tiptap **v3.30.5**（ADR-5 未锁版本；v2 已冻结且社区 markdown 包停维护）+ 官方 @tiptap/markdown 自定义 wikilink token 双向桥接；LLM 请求移至**主进程**执行（sandbox 渲染层 fetch 有 CORS 风险 + 凭据不出主进程；ADR-10 的 fetch+ReadableStream 解析 SSE 语义不变），chunk 经 `llm:chunk` IPC 推送。三视角审查（17 代理）+ 反驳式复核确认 4 高/5 中/7 低，全部修复：wikilink mark `inclusive:false`（后续打字不再被吸收进 [[...]] 污染落盘）、流式帧批次改纯文本内联 + GenerationWriter 收尾按 markdown 重排（不再逐帧碎段落）、章节编辑区滚动恢复（M1 回归）、预算条 CSS 类名对齐（M0 回归）、改写延迟删选区（失败/空响应原文完好）、生成中切 Tab 自动中断、加载章节 `emitUpdate:false`（不再打开即回写）、切小说清 editingDraft、env-default 幽灵 Provider 防护 + hasKey 真实探测 + .env 行内注释剥离。**待人工联调**（需 API Key）：Provider 连接测试真实通过、SSE 流式呈现（代码链路已经审查逐环核验）。组装分支覆盖实测 **97.3%**（contextAssembly 96.8% + graphTraversal 100%），118 用例全绿。

| 任务 | 验收标准 |
|---|---|
| Tiptap 编辑器 | 正文编辑自动保存；[[wikilink]] 输入补全 + 悬浮预览；流式插入不卡顿（节流批量，见风险 R7） |
| Provider 层（ADR-9/16） | OpenAI 兼容 + Ollama 可配置多 Provider；API Key 经 safeStorage 加密存储（NFR-04 验收）；连接测试通过 |
| 流式生成 | 续写/改写以 SSE 流式呈现；可中断 |
| 上下文组装 v1 | 三层优先级 + 深度截断 + 预算分层 + 关键词兜底全部实现；组装逻辑纯函数单测覆盖 ≥ 90% 分支 |
| Context Viewer | 面板可查看当前实际组装的 prompt 全文、各层 token 占用与预算命中率 |

### M4：全局图谱 + 资源库完善（2 周，前置：M2 标签、M1 索引）✅ **已完成（M4-A 2026-08-27；M4-B 2026-08-28，验收 3/3 PASS，CDP 冒烟 17 步全过）**

**M4-A 完成情况**：AntV G6 5.1.1 全局图谱视图（`src/graph/GlobalGraphView.tsx`）——图标条 graph 项进入全宽覆盖层（再点同图标切换返回）；全部节点/边（跨蓝图）投影为 d3-force 力导向图；节点按标签着色（回退类型色：蓝图蓝/引用绿/文本灰），大小随度数增长；图例标签勾选过滤（不选=全部）；点击节点跳转其所在蓝图并选中（自动关闭图谱回工作区）；分析开关：**孤立节点（度=0）高亮**与**未回收「伏笔」标签节点高亮**（红底!图标）；边按语义着色（箭头蓝/直线灰/虚线紫+虚线样式）；拖拽平移/滚轮缩放/节点拖动；挂载取快照构建（观察视图，重开即刷新）。

**M4-B 完成情况**：①**资源库跨小说**——新 `electron/services/resourceService.ts`，模板迁至全局目录 `userData/resources/`（FR-08「跨小说复用」；ADR-7 适用范围界定：真相源=小说内容，应用级创作资产与 providers.json/recent.json 同级），IPC 三通道与 UI 零结构改动；旧小说目录内 `resources/` 打开时自动迁移（幂等：tmp+rename 原子复制、同名跳过保全局版、`.migrated` 完成标记防已删模板复活、旧目录保留不删）；②**别名编辑入口**——共用 `AliasEditor`（chips + 非法字符校验）挂 InspectorPanel 节点态与 ChapterEditor 元信息区，补齐关键词兜底的数据入口；③**frontmatter 未知键保留**——非应用自管键与一切非键值行（注释/点号键/续行）原样行往返不再静默丢失；④**重建索引入口**——左栏 footer 按钮（M1 遗留：IPC 已通纯 UI 缺口），rebuildIndex 强制重开连接加固；⑤**标签删除**——`removeTag`（内置标签双层禁删，保护伏笔分析依赖）+ 标签下拉菜单删除入口（删前节点引用计数提示；M2 既有标签名非法字符缺口一并补防）。三视角审查（4 代理）+ 反驳式复核：38 项通过、1 中危（迁移复活）+ 16 低危确认，全部修复含回归用例。152 用例全绿（131→152）。

| 任务 | 验收标准 |
|---|---|
| G6 图谱视图 | 全部节点/边投影为一张图；按标签着色与过滤；点击节点跳转对应蓝图/正文 |
| 图谱分析提示 | 孤立节点（无任何链接）与未回收「伏笔」标签节点可高亮提示 |
| 资源库跨小说 | 资源库目录独立于单本小说，可跨小说引用 |

### M5：打磨与发布（2 周，前置：全部）✅ **已完成（2026-08-28，验收 4/4 PASS，CDP/打包冒烟全过）**

**完成情况**：①**性能**——画布开 `onlyRenderVisibleElements` 视口虚拟化（源码级验证 @xyflow `getNodesInside` 对未测量节点 forceInitialRender 必渲染，首帧测量后裁剪，fitView/受控镜像机制不受影响；CDP 实测 500 节点：fitView 300 DOM → 2.5x 缩放 4 个 → 0.2x 回 300，右键创建/拖拽持久化/选中回归全过）；冷启动索引改 `syncIndex` 增量校对（原 `startWatching` 内嵌全量 `rebuildIndex` 清空 mtime+size 基线致每次打开重读全部文件——现保留基线跨会话生效，仅重读变化文件+清理删除残留；`indexChapter` 长章节只读头部 64KB 提取 frontmatter，闭合符不在头部回退全文读；**10 万字 51 文件冷启动实测 60ms**，目标 <5s 余量 83 倍，恢复相同内容因 Windows CopyFile 保留 mtime 实现零重索引）。②**快照（ADR-14 评估通过并实现）**——`snapshotService`（.snapshots/ 目录拷贝、manifest 最后写=完成标记、保留上限 10、id 正则防穿越、恢复=自动备份→清空应用内容→拷回、.git/.index 不动）；恢复编排主进程 `stopWatching→closeIndex→恢复→openNovel→startWatching`（增量校对自动对齐索引），渲染层 `restoreSnapshot` 前序 flushDirty/清草稿/关 Tab 卸载冲刷/150ms IPC 顺序保证；watcher 排除 .snapshots/；UI 左栏「快照」浮层（创建/列表/恢复/删除），CDP 冒烟全过。③**打包**——electron-builder 26.15.3（npmRebuild:false——better-sqlite3 v13 为 N-API prebuild 直装无需 rebuild，R5 以「prebuild 通用 ABI + 打包态实测」方式解除）；nsis 非一键安装包 102MB；`--smoke` 自检模式（better-sqlite3 内存库读写/渲染产物/userData 三项）+ `smoke-packaged.mjs` 驱动；**静默安装→已安装 exe smoke PASS→静默卸载**全链路验证；CSP 复检通过（script-src 'self'、connect-src 未放开 https——LLM 在主进程不受渲染层 CSP 约束，ws: 仅 dev HMR 生产无攻击面）；零依赖图标生成（PNG-in-ICO）。④**用户文档**——README 重写覆盖创建小说→蓝图→正文→AI→图谱→快照全流程 + Provider 配置表 + 数据结构 + 故障排查。

| 任务 | 验收标准 |
|---|---|
| 性能优化 | 大画布视口虚拟化；索引增量更新（10 万字小说冷启动索引 < 5s）✅ 60ms |
| electron-builder 打包 | Windows nsis 安装包可安装运行；**better-sqlite3 原生模块 ABI 匹配冒烟测试通过**（见风险 R5）✅；CSP 收紧复检 ✅ |
| 快照功能评估 | 评估目录快照方案，通过则实现（ADR-14）✅ 已实现 |
| 用户文档 | README/使用说明覆盖创建小说到 AI 创作全流程 ✅ |

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
| 2026-08-26 | v1.4 | M2 完成并通过审查修复（4 PASS + 1 PARTIAL：100 节点 60fps 待人工实测）：三类节点创建编辑 + 属性面板（InspectorPanel）+ 8 层嵌套拦截（ADR-12）；语义连线创建/改型/label + 持久化还原；标签系统（内置四标签 + 自定义 + 节点多标签 + 着色，novel.json 标签库 + saveMeta 通道）；画布交互（拖拽持久化/缩放/小地图/受控选中）；资源库 v1（resources/ 节点与标签组模板，saveResource/deleteResource 通道）。架构落点：graphStore 变更 action + 脏图/保存中图集合 + 「结构变更立即落盘、属性防抖 600ms」保存编排；ref 节点补 refTarget 字段；codec 节点/边归一化容错。审查修复 4 高/3 中/10 低（详见 M2 完成情况），77 单测全绿 |
| 2026-08-26 | v1.5 | M2 收官：100 节点 60fps 人工实测通过，M2 验收 5/5 PASS |
| 2026-08-26 | v1.6 | M3 完成并通过审查修复（4 PASS + 2 PARTIAL 待人工联调）：Tiptap v3 编辑器（markdown 双向 + wikilink 补全/悬浮/跳转 + 自动保存）；Provider 层（providers.json + safeStorage 加密 + .env 联调回退 + GET /models 连接测试）；流式生成（主进程 fetch SSE → llm:chunk 推送 → StreamInserter 帧合并 + GenerationWriter 纯文本流式/markdown 收尾重排；AbortController 中断）；上下文组装真实 draft 接入 + 分支覆盖 97.3%；Context Viewer（prompt 全文/复制、三层 token、命中率）。架构注记：LLM 请求在主进程执行（CORS+凭据安全），ADR-10 语义不变。审查修复 4 高/5 中/7 低，118 用例全绿 |
| 2026-08-27 | v1.7 | M3 人工联调修复批次（CDP 远程实测驱动）：① 撤受控选中回灌（M2 审查修复引入的结构变更无限渲染循环——建节点/建连线全黑崩溃的根因），改显式 onNodeClick/onEdgeClick/onPaneClick 事件；② 节点拖拽跟手（受控 nodes 必须接 onNodesChange：本地镜像承接 position/remove，dimensions/select 回灌会与 RF 测量形成主线程打满循环）；③ 三类节点创建移入画布右键菜单（落点=鼠标位置，canvasCreateBridge 单一实现）；④ 续写/改写无编辑器时自动切换最近章节并等待就绪；⑤ 左侧蓝图树按 owner 归属呈现目录式层级（父级可折叠，磁盘真相不变）；⑥ DeepSeek API 全链路联调通过（连接测试 + 流式续写 676 字端到端） |
| 2026-08-27 | v1.8 | 章节连续性 + 左栏交互批次：① 前情提要——写第 N 章自动注入前 2 章正文尾部各 800 字（无需手动关联，解决「写第二章 AI 不知道第一章」）；② 蓝图 Tab/树点击同步画布路由（activateTab，修 Tab 切换无响应）；③ 卷（Volume）支持——chapters/ 一层卷目录（readTree/createFile/createVolume，.gitkeep 占位）；④ 左栏右键菜单（blueprints→新建蓝图 / chapters→新增卷·章节 / 卷→卷内新增章节），「第N卷/第N章」中文序号自动递增（numToCn/cnToNum/nextNumberedName）；⑤ 左栏统一双击打开（单击仅选中）；⑥ 章节树项拖动交换位置（fs:exchangeFiles 文件名互换=内容对调，章节/蓝图内部 title 同步）；⑦ 章节未链接蓝图的引导提示（含多章共享设定节点方法）。121 用例全绿 |
| 2026-08-27 | v1.9 | 全量功能审查批次（五维 47 代理：验收复核/近期改动逻辑/回归/UX性能/测试缺口，26 PASS+5 PARTIAL，发现 19 项确认缺陷全修复）：**数据安全**——章节交换后已打开编辑器重挂载重读（chapterReloadSeq，防旧缓冲回写吞掉交换内容）、重命名后 ref 节点 refTarget 随迁；**正确性**——章节/卷排序改「第N章」数字序（shared/naming chapterNameCompare，zh-CN 拼音序乱序的系统性修复：前情提要不选错章/左栏顺序正确）、卷内章节接入 wikilink 补全/预览/跳转与 ref 指向候选（flattenChapterFiles 共享摊平）、rebuildIndex 递归卷目录、跨分组（顶层↔卷）拖动交换、中文序号 >99 回绕阿拉伯不撞车+畸形输入拒绝、蓝图 owner 成环左栏兜底显示；**性能**——watcher 推送变更清单→增量合并（graphStore.mergeRefresh：未变图对象引用稳定，保存后 IO 从 O(全蓝图) 降为 O(变更)）、Inspector 文本输入本地态失焦提交（消除每键 O(N) 全局扩散）、MiniMap 着色回调稳定化、拖拽中 hydrate 镜像重置守卫（draggingRef）；**UX**——两处右键菜单视口边缘钳制+Esc/外点关闭统一、卷行可折叠、创建失败弹窗反馈、confirm 对话框主按钮聚焦（Enter/Esc 可用）、nokey 类防画布外 Delete 误删节点、续写超时提示。131 用例全绿（+10） |
| 2026-08-28 | v2.0 | M4-B 完成并通过审查修复（验收 3/3 PASS + CDP 冒烟 17 步全过）：①资源库跨小说——新 resourceService（userData/resources 全局目录，ADR-7 适用范围界定：应用级创作资产），旧小说 resources/ 自动迁移（tmp+rename 原子复制/同名跳过/.migrated 完成标记/目录级容错/撞车告警）；②别名编辑入口——AliasEditor 共用组件挂节点 Inspector 与章节元信息区（非法字符校验防 frontmatter 损坏），关键词兜底的数据入口补齐；③frontmatter 未知键与非键值行（注释/点号键/续行）原样保留，用户手写 YAML 不再保存即丢；④重建索引按钮（左栏 footer；rebuildIndex 强制重开连接加固）；⑤标签删除（removeTag 内置双层禁删 + 菜单删除入口 + 引用计数提示；标签名非法字符 M2 既有缺口补防）；顺带修 chapter-status 死 CSS。审查（4 代理 + 反驳式复核）：38 通过、1 中危（迁移后删除模板重开复活）+ 16 低危全修复含回归用例。152 用例全绿（+21：resourceService 12/novelStore 4/frontmatter 5） |
| 2026-08-28 | v2.1 | M5 完成并通过审查（验收 4/4 PASS，详见 M5 完成情况）：①性能——画布 onlyRenderVisibleElements 视口虚拟化（CDP 实测 500 节点 300→4 DOM，交互回归全过）+ 冷启动 syncIndex 增量校对（mtime+size 基线跨会话保留 + 章节头部 64KB 读取；10 万字实测 60ms < 5s）+ 压力脚本支持长章节生成；②快照（ADR-14 闭环）——snapshotService + 四 IPC 通道 + 恢复编排（主进程停监听/关库/备份/换内容/重开；渲染层前序落盘与 IPC 顺序保证）+ SnapshotPanel UI，CDP 冒烟全过；③打包——electron-builder nsis 102MB 安装包，静默安装/运行 smoke（better-sqlite3 N-API prebuild 直用，R5 解除）/静默卸载全链路验证，--smoke 自检模式 + 零依赖图标生成；④README 重写为全流程用户文档。**排障记录**：本机 Node 24.11.1 Windows 下 `rmSync` 删除非 ASCII 文件名的单文件会硬崩进程（exit 127，无 JS 栈；unlinkSync/目录级 recursive rmSync/ASCII 均正常）——文件级删除统一改 unlinkSync 并在代码注释留档。167 用例全绿（+15：indexService 7/snapshotService 8） |
| 2026-08-30 | v2.2 | 体验优化与整体检测批次（五维审查工作流 45 代理：17 项确认缺陷全修复含 1 项 high 数据丢失，反驳式复核剔除 3 误报，429 限额项按代码级证据自查补修）：**①Tab 栏右键菜单**（关闭/关闭其他/关闭右侧/关闭所有；closeTabs 批量底座——激活回退链 fallbackId→剩余最后一个→空，蓝图回退经 activateTab 同步画布路由）+ 中键关闭（mousedown 阶段拦截 Chromium 自动滚动）+ 溢出横向滚动（滚轮纵转横/激活 Tab 自动滚入视野/滚动条隐藏防 5px 行高跳变）；**②数据安全（high）**——aiStore.chapterFlush 冲刷桥：交换/删除/重命名章节前置落盘并清防抖定时器，修复章节拖动交换时卸载冲刷用旧内存内容覆盖对方正文（静默数据丢失）、删除被卸载冲刷复活、重命名产生新旧双文件；**③Tab 生命周期联动**——renameFile 同步重写 Tab id（id 内嵌路径，防旧名复用产生重复 key/误关双 Tab）、deleteFile 关联 Tab 统一走 closeTabs 回退、watcher/refreshTree 树对账清理指向已删文件的 Tab、restoreSnapshot 关 Tab 统一单一入口；**④AI 面板**——关闭生成中的章节 Tab 即中断生成（AI 面板未挂载时此前无人中断，token 白烧且输出全损）、改写模式不再自动切换编辑器（新挂载编辑器必无选区，原流程注定失败且打断视图）；**⑤交互一致性**——画布 Delete 键自实现 window keydown + dialogConfirm（存量缺陷：M3 联调起 select 变更为防无限循环被镜像丢弃，RF 受控模式永无内部选中集，deleteKeyCode 路径实际不可达，原始代码实测复现；自实现作用于 store 显式选中集 + nokey/输入控件防线）、文件树项右键补「打开/重命名/删除」、画布节点右键菜单（删除（确认）/进入子图/打开指向）、属性面板标签下拉补外点/Esc 关闭与切节点重置、图标条移除 search/blueprint 死项并接线设置按钮到 AI 面板、空态文案「点击」→「双击」×3 处、resource-act 禁用态 hover 修正、CSS 死样式清理；**⑥性能**——关键词兜底扫描限草稿尾部 2 万字（KEYWORD_SCAN_TAIL_CHARS，与续写取尾口径一致）+ AiPanel 组装改 1s 尾随去抖、ChapterEditor markdown 序列化按 ProseMirror doc 引用缓存（连续输入序列化次数减半）、Splitter 拖动 rAF 合帧（消除每 pointermove 的 App 级重渲级联）、左栏改 owner 关系签名订阅（节点坐标拖动/属性提交不再触发整树重算重渲）；**⑦工程**——三处右键菜单抽共享 useContextMenu hook（外点/Esc/视口钳制单点维护，关闭时机拉齐）。178 用例全绿（+10：closeTabs 5/文件变更 Tab 联动 4/关键词窗口 1），CDP 冒烟 14/14（Tab 菜单四项/关闭其他回退/中键关闭/树项与节点右键菜单/Delete 确认取消与确认删除方向），typecheck/build 全绿 |
| 2026-08-31 | v2.3 | 夜间性能重构 + 市面调研批次（用户部署的无人值守定时任务）：**①画布 rfNodes/rfEdges 增量缓存**（源对象引用未变即复用上次构建产物，使 mergeRefresh 的引用保护传导到 RF 层——无关保存的 watcher 回推不再重渲当前图全部可见节点；nodeMirror 等价跳过消除 dragStop/回推的第二轮全图渲染）；**②全局图谱布局保留**（过滤/分析开关改 updateData 部分样式与 visibility + draw()——G6 5 源码语义 draw 仅重绘不重排、updateData 部分合并不携带坐标，用户拖好的布局不再丢失；仅数据集变化才 render 重排；配套 stopLayout+延迟销毁+清理容错，消除 G6 销毁竞态告警并防第三方清理异常打断 React 提交致白屏）。验证三重：178 用例全绿、CDP 冒烟 7/7、G6 节点坐标直读开关往返逐位一致 + 像素级截图字节相等（截图断言三坑留档：系统光标入镜/焦点环与 hover 污染/d3-force 弛豫需静止检测）。**③市面调研**（6 组并行代理，24 产品 + 3 专题）：市场定位结论——「作者蓝图+本地主权+BYOK」空缺地带无人占据，图谱组装=Sudowrite 在研第三代方案且已落地；**④产出《docs/03-下阶段优化方案.md》**（v2 功能路线 F1-F21 按优先级矩阵 + 性能路线 + 竞品对照表 + 待拍板问题） |
