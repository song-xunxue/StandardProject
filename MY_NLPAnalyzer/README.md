# MY_NLPAnalyzer —— 基于 Langchain 与大模型的智能 NLP 文献研读助手

## 一、项目简介

MY_NLPAnalyzer 是一个前后端分离的 Web 应用，提供**中文分词**、**关键词提取**和**PDF 文献解析**功能。项目通过 Langchain 实现本地文档解析与文本提取，结合 Coze 大模型智能体完成 NLP 分析任务，脱离商业智能体的"技术黑盒"，可控底层逻辑。

**当前阶段**：Phase 1 已完成（基础架构 + NLP 分词）。

---

## 二、技术栈

| 层级 | 技术 |
|------|------|
| 前端 | HTML5, CSS3, 原生 JavaScript (Fetch API) |
| 后端 | Python, Flask, Flask-CORS |
| 文档解析 | pypdf, Langchain PyPDFLoader |
| AI 服务 | Coze SDK (cozepy) |
| 环境管理 | python-dotenv |

---

## 三、项目目录结构

```
MY_NLPAnalyzer/
├── coze_app.py            # Flask 后端主程序（AI 分析接口）
├── index.html             # 前端主页面（文本输入 / PDF 上传）
├── style.css              # 前端样式表
├── .env                   # 环境变量配置（不提交到版本库）
├── CLAUDE.md              # Claude Code 开发指引
├── NLP 项目计划书.md        # 分阶段开发计划书
└── langchain/             # Langchain 实验性学习脚本（不参与主流程）
    ├── test1.py           # DeepSeek 模型初始化与可配置参数
    ├── test2.py           # @tool 装饰器定义工具的三种方式
    ├── test3.py           # StructuredTool 类创建工具的三种模式
    ├── test4.py           # 工具绑定到模型 + 多工具并行调用
    ├── test5.py           # 流式输出与自定义 RunnableLambda 链
    └── test6.py           # 结构化输出 + Tavily 搜索工具集成
```

---

## 四、模块详细说明

### 4.1 coze_app.py —— 后端核心

Flask 应用主程序，包含 AI 智能体封装和所有 API 路由。

#### NLPAgent 类

封装 Coze SDK 交互逻辑，在模块加载时实例化为全局单例。

| 方法 | 功能 |
|------|------|
| `__init__()` | 读取 `.env` 中的 `COZE_API_TOKEN`、`BOT_ID`、`USER_ID`，初始化 Coze 客户端 |
| `get_nlp_analysis(text)` | 构造分词 + 关键词提取的 Prompt，调用 Coze `create_and_poll` 阻塞等待 AI 返回结果 |

**Coze 调用流程**：
1. 构建 Prompt（要求返回分词结果和 3-5 个核心关键词）
2. 封装为 `Message` 对象，调用 `coze.chat.create_and_poll`
3. 从返回消息中筛选 `role="assistant"` 且 `type="answer"` 的消息
4. 空白字符规范化后返回结果

#### Flask 路由

| 路由 | 方法 | 功能 |
|------|------|------|
| `/` | GET | 返回 `index.html` 页面 |
| `/style.css` | GET | 返回样式表 |
| `/api/analyze_text` | POST | 接收 JSON `{"text": "..."}`，截取前 1500 字后调用 AI 分析 |
| `/api/analyze_pdf` | POST | 接收 PDF 文件（multipart），用 Langchain PyPDFLoader 提取前 2 页文本，截取 1500 字后调用 AI 分析 |

**PDF 处理流程**：上传文件 → 保存为临时文件 → PyPDFLoader 加载 → 提取前 2 页文本 → 截取 1500 字 → AI 分析 → 删除临时文件（finally 块确保清理）。

---

### 4.2 index.html —— 前端界面

单页面应用，包含文本输入和 PDF 上传两个标签页面板。

| 函数 | 功能 |
|------|------|
| `switchTab(type)` | 切换"文本输入"和"PDF 上传"面板 |
| `showMessage(msg, type)` | 在消息区显示 success / error / normal 状态提示 |
| `renderResult(content)` | 将 AI 返回的文本渲染到结果展示区（换行符转 `<br>`） |
| `analyzeText()` | 从文本框读取内容，POST 到 `/api/analyze_text` |
| `analyzePDF()` | 从文件选择器获取 PDF，FormData POST 到 `/api/analyze_pdf` |

前端 API 地址硬编码为 `http://127.0.0.1:5001/api`。

---

### 4.3 style.css —— 前端样式

使用 CSS 变量定义主题色系（`--primary-color`、`--secondary-color` 等），包含标签页导航、面板切换、文件上传区、提交按钮、消息提示、结果展示区等组件样式。响应式居中布局，最大宽度 650px。

---

### 4.4 langchain/ —— 实验脚本

独立的 Langchain 学习脚本，**不被主程序导入**，用于探索 API 模式。

| 文件 | 内容 |
|------|------|
| `test1.py` | DeepSeek 模型初始化，`configurable_fields` 运行时动态调整参数（如 `max_tokens`） |
| `test2.py` | `@tool` 装饰器三种用法：基础定义、Pydantic 参数类、`Annotated` 类型提示 |
| `test3.py` | `StructuredTool.from_function` 三种模式：基础、Pydantic schema、`content_and_artifact` 返回 |
| `test4.py` | `bind_tools()` 将工具绑定到模型，实现工具调用循环（AI 决策 → 工具执行 → 结果回传） |
| `test5.py` | 流式输出（`stream`），`StrOutputParser` 解析 + 自定义 `RunnableLambda` 按标点分块 |
| `test6.py` | `with_structured_output` 结构化输出（Pydantic 联合类型） + Tavily 搜索工具集成 |

---

## 五、环境配置

### 5.1 .env 变量

```env
# 必需 —— Coze SDK
COZE_API_TOKEN=your_coze_api_token
BOT_ID=your_bot_id
USER_ID=your_user_id

# 可选 —— 服务器端口（默认 5001）
PORT=5001

# 实验用 —— Langchain 脚本
OPENAI_API_KEY=your_openai_key
DEEPSEEK_API_KEY=your_deepseek_key
```

### 5.2 启动应用

```bash
python coze_app.py
```

启动后访问 `http://127.0.0.1:5001` 即可使用。

---

## 六、开发计划

| 阶段 | 目标 | 状态 |
|------|------|------|
| **Phase 1** | 基础架构：前后端数据流跑通，PDF 解析 + Coze AI 分词 | ✅ 已完成 |
| **Phase 2** | 引入 RecursiveCharacterTextSplitter，完整 PDF 切分为文本块 | 🟡 计划中 |
| **Phase 3** | RAG 知识库（向量数据库 FAISS）+ LangGraph 智能体编排 | 🔴 远期规划 |

详细计划参见 [`NLP 项目计划书.md`](NLP%20项目计划书.md)。
