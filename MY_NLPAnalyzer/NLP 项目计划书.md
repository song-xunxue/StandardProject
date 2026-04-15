# NLPAnalyzer 项目开发计划书

## 一、项目名称与简介

- **项目名称**：MY_NLPAnalyzer —— 基于 Langchain 与大模型的智能 NLP 文献研读助手

- **项目背景**：在 NLP（自然语言处理）领域，长文本文献的阅读和核心信息提取一直是一大痛点。现有的商业智能体（如直接丢给 Coze 等）虽然好用，但存在"技术黑盒"，无法控制底层的分词、分块（Chunking）和检索（Retrieval）逻辑。

- **项目目标**：本项目旨在从零搭建一个前后端分离的 Web 应用，**脱离商业黑盒**。利用 Langchain 框架在本地实现文档解析与文本分块，并结合多种大模型 API（DeepSeek / OpenAI / Ollama / Coze 智能体）实现精准的【中文分词】、【关键词提取】以及未来的【文献 RAG 问答】功能。支持用户自定义模型提供商和 API Key，提供邮箱登录实现多用户隔离。

- **设计参考**：前端界面参考 Google AI Studio 的三栏布局（左-知识库管理、中-工作区、右-模型与参数面板），提供可视化的参数调节和多模型切换体验。

---

## 二、技术栈选型

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| **前端交互** | HTML5, CSS3, 原生 JavaScript (Fetch API) | 三栏响应式布局 + 登录注册页面 |
| **后端服务** | Python, Flask, Flask-CORS | RESTful API 设计 |
| **文档解析** | pypdf, Langchain PyPDFLoader | PDF 文本提取 |
| **大模型统一接口** | Langchain `init_chat_model` | 支持 DeepSeek / OpenAI / Ollama 多提供商切换 |
| **Coze 智能体** | Coze SDK (cozepy) | 作为可选模型提供商保留 |
| **用户认证** | bcrypt + PyJWT | 邮箱注册登录、JWT 会话管理 |
| **数据加密** | cryptography (Fernet) | 用户 API Key 加密存储 |
| **关系数据库** | SQLite + SQLAlchemy ORM | 用户、知识库、文档、对话持久化 |
| **缓存层** | Redis + redis-py | JWT 会话缓存、热数据加速 |
| **环境管理** | python-dotenv | 环境变量隔离 |
| **后续扩展** | Langchain TextSplitter, FAISS, LangGraph | 文档切分 / 向量检索 / 智能体编排 |

### 核心依赖清单

```
flask
flask-cors
python-dotenv
cozepy
langchain
langchain-openai
langchain-community
pypdf
redis
sqlalchemy
flask-sqlalchemy
bcrypt
PyJWT
cryptography
```

---

## 三、前端页面布局设计

### 3.1 整体页面流程

```
用户访问 → [登录/注册页面] → 认证通过 → [主应用三栏界面]
                                          未登录 → 重定向到登录页
```

### 3.2 登录/注册页面

```
┌─────────────────────────────────────┐
│         MY_NLPAnalyzer              │
│      智能 NLP 文献研读助手           │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  [登录]  [注册]              │    │
│  ├─────────────────────────────┤    │
│  │                             │    │
│  │  📧 邮箱                    │    │
│  │  ┌───────────────────────┐  │    │
│  │  │                       │  │    │
│  │  └───────────────────────┘  │    │
│  │                             │    │
│  │  🔒 密码                    │    │
│  │  ┌───────────────────────┐  │    │
│  │  │                       │  │    │
│  │  └───────────────────────┘  │    │
│  │                             │    │
│  │  [       登  录       ]     │    │
│  │                             │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

- 登录/注册通过顶部标签页切换
- 注册额外需要确认密码和昵称（可选）
- 登录成功后 JWT Token 存入 `localStorage`，后续请求携带 `Authorization: Bearer <token>` 头

### 3.3 主应用三栏布局

参考 Google AI Studio，采用**三栏式布局**：

```
┌──────────────────────────────────────────────────────────────────────┐
│  MY_NLPAnalyzer    [用户昵称] [退出]              状态栏              │
├────────────┬──────────────────────────────┬──────────────────────────┤
│  知识库管理  │         主工作区              │   参数调节面板            │
│            │                              │                          │
│ [+新建知识库]│  ┌────────────────────────┐  │  ▼ 模型配置              │
│            │  │ 对话消息列表              │  │  提供商 [DeepSeek ▼]    │
│ ───────── │  │                          │  │  API Key [••••••] [👁]  │
│ ● 论文集A  │  │  AI: 分词结果如下...      │  │  模型   [deepseek-chat▼]│
│   ├ doc1  │  │                          │  │  Base URL (可选)        │
│   ├ doc2  │  │  User: 请提取关键词      │  │                          │
│   └ doc3  │  │                          │  ├──────────────────────────┤
│ ● 论文集B  │  │  AI: 核心关键词：...     │  │  ▼ 模型参数              │
│   ├ doc1  │  │                          │  │  Temperature ──●──  0.7  │
│            │  │                          │  │  Top-P  ────●────  0.95 │
│            │  │                          │  │  Top-K  ────●────  40   │
│ ───────── │  ├────────────────────────┤  │  Max Tokens ──●──  2048  │
│ ● 快速分析  │  │ 📝 文本 / 📄 PDF上传     │  ├──────────────────────────┤
│   (单文档) │  │ [发送] [上传文件]         │  │  ▼ NLP 参数              │
│            │  └────────────────────────┘  │  Chunk Size ──●──  500   │
│            │                              │  Overlap  ────●───  50   │
│            │                              │  关键词数 ────●───  5    │
│            │                              │  截断长度 ────●───  1500  │
│            │                              │                          │
│            │                              │  [重置默认] [保存预设]     │
├────────────┴──────────────────────────────┴──────────────────────────┤
│  状态栏：知识库: 论文集A | 模型: DeepSeek/deepseek-chat | 文档数: 3  │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.4 三栏功能说明

#### 左栏 —— 知识库管理面板（可折叠）

支持两种使用模式：

| 模式 | 说明 |
|------|------|
| **多文档知识库** | 按研究主题创建知识库（如"论文集A"），内部可上传多篇 PDF，适合系统性文献研读 |
| **单文档快速分析** | 无需创建知识库，直接输入文本或上传单份 PDF 进行即时分析 |

知识库管理功能：
- 新建 / 重命名 / 删除知识库
- 知识库内文档列表（上传、删除、查看状态）
- 点击知识库切换当前工作上下文
- 知识库搜索（按名称）

#### 中栏 —— 主工作区

- **对话式交互**：聊天界面风格，展示用户输入和 AI 回复的历史记录
- **双输入模式**：保留文本输入框和 PDF 文件上传按钮
- **上下文关联**：当前选中的知识库文档作为分析上下文
- **结果展示**：支持分词结果、关键词提取、文本摘要等多种输出格式

#### 右栏 —— 参数调节面板（可折叠/滑出）

分为三个区块，从上到下：

**① 模型配置区（顶部）**

| 配置项 | 控件类型 | 说明 |
|--------|----------|------|
| 提供商 | 下拉菜单 | DeepSeek / OpenAI / Ollama / Coze 智能体 |
| API Key | 密码输入框 + 显示/隐藏切换 | 用户自行输入，加密存储到数据库 |
| 模型名称 | 下拉菜单（根据提供商动态更新） | 如 `deepseek-chat`、`gpt-4o-mini`、`qwen2.5` 等 |
| Base URL | 文本输入框（可选） | 自定义 API 端点，支持 OpenAI 兼容服务 |

- 切换提供商时，模型名称下拉自动更新候选列表
- 切换提供商时，如用户已保存过该提供商的 API Key 则自动填充
- Ollama 模式下 API Key 输入框隐藏（本地模型无需 Key）
- Coze 模式下显示 Bot ID 输入框替代模型名称

**② 模型参数组**

| 参数 | 范围 | 默认值 | 说明 |
|------|------|--------|------|
| Temperature | 0.0 - 2.0 | 0.7 | 控制输出随机性 |
| Top-P | 0.0 - 1.0 | 0.95 | 核采样概率阈值 |
| Top-K | 1 - 100 | 40 | 候选 token 数量 |
| Max Tokens | 100 - 8192 | 2048 | 最大输出长度 |

**③ NLP 参数组**

| 参数 | 范围 | 默认值 | 说明 |
|------|------|--------|------|
| Chunk Size | 100 - 2000 | 500 | 文本分块大小（字符数） |
| Chunk Overlap | 0 - 500 | 50 | 分块重叠区大小 |
| 关键词数量 | 1 - 10 | 5 | 提取的核心关键词数量 |
| 文本截断长度 | 500 - 10000 | 1500 | 单次分析最大字符数 |

附加功能：
- 「重置默认值」按钮
- 「保存为预设」按钮（保存当前参数组合，可命名）
- 「加载预设」下拉菜单

---

## 四、支持的模型提供商

项目通过 Langchain 的 `init_chat_model` 统一接口支持多种大模型提供商：

### 4.1 DeepSeek（推荐默认）

| 项目 | 说明 |
|------|------|
| **提供商标识** | `deepseek` |
| **推荐模型** | `deepseek-chat`（通用）、`deepseek-reasoner`（推理） |
| **Langchain 调用** | `init_chat_model(model="deepseek-chat", model_provider="deepseek")` |
| **API Key 获取** | [platform.deepseek.com](https://platform.deepseek.com) |
| **特点** | 国产模型，性价比极高，中文能力优秀 |
| **依赖包** | `langchain-openai`（DeepSeek 兼容 OpenAI 接口） |

### 4.2 OpenAI

| 项目 | 说明 |
|------|------|
| **提供商标识** | `openai` |
| **推荐模型** | `gpt-4o-mini`（性价比）、`gpt-4o`（高性能） |
| **Langchain 调用** | `init_chat_model(model="gpt-4o-mini", model_provider="openai")` |
| **API Key 获取** | [platform.openai.com](https://platform.openai.com) |
| **特点** | 国际主流，能力全面，但价格较高 |
| **依赖包** | `langchain-openai` |

### 4.3 Ollama（本地模型）

| 项目 | 说明 |
|------|------|
| **提供商标识** | `ollama` |
| **推荐模型** | `qwen2.5`（中文强）、`llama3`（英文强）、`gemma2` |
| **Langchain 调用** | `init_chat_model(model="qwen2.5", model_provider="ollama", base_url="http://localhost:11434")` |
| **API Key** | 无需 Key（本地运行） |
| **特点** | 完全本地化，隐私安全，无 API 费用，但需本地 GPU |
| **依赖包** | `langchain-community` |
| **前置要求** | 用户需自行安装 [Ollama](https://ollama.ai) 并下载模型 |

### 4.4 Coze 智能体（保留方案）

| 项目 | 说明 |
|------|------|
| **提供商标识** | `coze` |
| **使用方式** | 通过 Bot ID + API Token 调用自定义 Coze 智能体 |
| **调用方式** | `coze.chat.create_and_poll(bot_id=..., user_id=..., ...)` |
| **API Token 获取** | [coze.cn](https://coze.cn) |
| **特点** | 可自定义 Prompt 和工作流，但无法透传 temperature 等参数 |
| **依赖包** | `cozepy` |
| **注意** | Coze 走独立 SDK 路径，不经过 Langchain `init_chat_model` |

### 4.5 自定义提供商（OpenAI 兼容）

用户可通过填写 Base URL 接入任何 OpenAI API 兼容服务（如智谱 AI、Moonshot、百川等）。

---

## 五、数据库设计

### 5.1 SQLite —— 关系型持久化存储

#### ER 关系图

```
┌──────────────┐       ┌──────────────────┐
│    users      │       │  user_api_keys    │
├──────────────┤       ├──────────────────┤
│ id (PK)      │──1:N──│ id (PK)          │
│ email        │       │ user_id (FK)     │
│ password_hash│       │ provider         │
│ nickname     │       │ encrypted_key    │
│ created_at   │       │ model_name       │
└──────┬───────┘       │ base_url         │
       │               │ created_at       │
       │ 1:N           └──────────────────┘
       │
┌──────▼───────┐       ┌──────────────────┐
│knowledge_bases│       │    documents      │
├──────────────┤       ├──────────────────┤
│ id (PK)      │──1:N──│ id (PK)          │
│ user_id (FK) │       │ kb_id (FK)       │
│ name         │       │ filename         │
│ description  │       │ file_path        │
│ mode         │       │ page_count       │
│ created_at   │       │ char_count       │
│ updated_at   │       │ status           │
└──────┬───────┘       │ uploaded_at      │
       │               └──────────────────┘
       │ 1:N
┌──────▼───────┐       ┌──────────────────┐
│conversations  │       │    messages       │
├──────────────┤       ├──────────────────┤
│ id (PK)      │──1:N──│ id (PK)          │
│ kb_id (FK)   │       │ conversation_id  │
│ title        │       │ role             │
│ model_config │       │ content          │
│ created_at   │       │ result_data      │
│ updated_at   │       │ params_snapshot  │
└──────────────┘       │ created_at       │
                       └──────────────────┘

┌──────────────────┐
│ parameter_presets │
├──────────────────┤
│ id (PK)          │
│ user_id (FK)     │
│ name             │
│ config_json      │
│ created_at       │
└──────────────────┘
```

#### 表结构详细说明

**users（用户表）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| email | TEXT UNIQUE | 用户邮箱（登录凭证） |
| password_hash | TEXT | bcrypt 加密的密码哈希 |
| nickname | TEXT | 用户昵称（可选，默认取邮箱前缀） |
| created_at | DATETIME | 注册时间 |

**user_api_keys（用户 API Key 表）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| user_id | INTEGER FK | 所属用户 |
| provider | TEXT | 提供商标识：`deepseek` / `openai` / `ollama` / `coze` |
| encrypted_key | TEXT | Fernet 加密后的 API Key（Ollama 为空） |
| model_name | TEXT | 默认模型名称 |
| base_url | TEXT | 自定义 API 端点（可选） |
| created_at | DATETIME | 添加时间 |

**knowledge_bases（知识库表）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| user_id | INTEGER FK | 所属用户（数据隔离） |
| name | TEXT | 知识库名称 |
| description | TEXT | 描述信息（可选） |
| mode | TEXT | 使用模式：`multi_doc`（多文档）或 `quick`（快速分析） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 最后更新时间 |

**documents（文档表）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| kb_id | INTEGER FK | 所属知识库 ID |
| filename | TEXT | 原始文件名 |
| file_path | TEXT | 服务器存储路径 |
| page_count | INTEGER | PDF 总页数 |
| char_count | INTEGER | 提取的总字符数 |
| status | TEXT | 处理状态：`pending` / `processed` / `failed` |
| uploaded_at | DATETIME | 上传时间 |

**conversations（对话表）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| kb_id | INTEGER FK | 关联的知识库 ID（可为空，快速分析模式） |
| title | TEXT | 对话标题（自动生成或用户命名） |
| model_config | TEXT | 对话使用的模型配置快照（JSON：provider/model/params） |
| mode | TEXT | 分析模式：`segment`（分词）/ `keyword`（关键词）/ `summary`（摘要） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 最后活跃时间 |

**messages（消息表）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| conversation_id | INTEGER FK | 所属对话 ID |
| role | TEXT | 消息角色：`user` / `assistant` / `system` |
| content | TEXT | 消息内容 |
| result_data | TEXT | AI 返回的完整结果（JSON 格式） |
| params_snapshot | TEXT | 发送时的参数快照（JSON） |
| created_at | DATETIME | 消息时间 |

**parameter_presets（参数预设表）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| user_id | INTEGER FK | 所属用户 |
| name | TEXT | 预设名称 |
| config_json | TEXT | 参数配置（JSON，包含模型+NLP所有参数） |
| created_at | DATETIME | 创建时间 |

### 5.2 API Key 加密方案

```
用户输入 API Key
      ↓
后端接收明文 Key
      ↓
使用 Fernet 对称加密（密钥来自 .env 的 ENCRYPTION_KEY）
      ↓
加密后存入 user_api_keys.encrypted_key
      ↓
调用模型时：读取加密 Key → Fernet 解密 → 传给 Langchain
```

- 加密密钥 `ENCRYPTION_KEY` 存在 `.env` 中，不入版本库
- 前端展示 API Key 时仅显示后 4 位（如 `••••••ab3f`）
- API Key 仅在调用模型时解密，不写入日志

### 5.3 Redis —— 缓存层

| 键模式 | 数据类型 | 用途 | TTL |
|--------|----------|------|-----|
| `jwt:{token}` | Hash | JWT 会话信息（user_id、角色） | 24h |
| `session:{user_id}` | Hash | 当前活跃会话状态（知识库、对话、临时参数） | 24h |
| `params:temp:{session_id}` | Hash | 未保存的临时参数修改 | 2h |
| `task:{task_id}` | String | 异步任务状态（PDF 处理进度等） | 1h |
| `cache:analysis:{hash}` | String | 相同文本+参数的分析结果缓存 | 1h |
| `rate_limit:{user_id}` | Counter | API 调用频率限制 | 1min |

---

## 六、API 接口规划

### 6.1 认证接口（公开，无需 Token）

| 方法 | 路由 | 功能 | 请求体 |
|------|------|------|--------|
| POST | `/api/auth/register` | 邮箱注册 | `{email, password, nickname?}` |
| POST | `/api/auth/login` | 邮箱登录 | `{email, password}` |

登录成功返回 JWT Token：
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {"id": 1, "email": "user@example.com", "nickname": "用户"}
  }
}
```

### 6.2 用户信息接口（需 Token）

| 方法 | 路由 | 功能 |
|------|------|------|
| GET | `/api/auth/me` | 获取当前用户信息 |
| PUT | `/api/auth/me` | 更新用户信息（昵称、密码） |

### 6.3 API Key 管理接口（需 Token）

| 方法 | 路由 | 功能 | 请求体 |
|------|------|------|--------|
| GET | `/api/auth/keys` | 获取用户所有已配置的 API Key（脱敏） | - |
| POST | `/api/auth/keys` | 添加/更新 API Key | `{provider, api_key, model_name?, base_url?}` |
| DELETE | `/api/auth/keys/{provider}` | 删除指定提供商的 Key | - |

### 6.4 模型信息接口

| 方法 | 路由 | 功能 |
|------|------|------|
| GET | `/api/models/providers` | 获取所有支持的提供商列表及其推荐模型 |
| GET | `/api/models/{provider}/models` | 获取指定提供商的可用模型列表 |

### 6.5 知识库管理接口（需 Token）

| 方法 | 路由 | 功能 |
|------|------|------|
| GET | `/api/kb` | 获取当前用户的所有知识库列表 |
| POST | `/api/kb` | 创建新知识库（`{name, description, mode}`） |
| PUT | `/api/kb/{id}` | 更新知识库信息（重命名、修改描述） |
| DELETE | `/api/kb/{id}` | 删除知识库及其所有文档和对话 |
| GET | `/api/kb/{id}` | 获取单个知识库详情（含文档列表和统计） |

### 6.6 文档管理接口（需 Token）

| 方法 | 路由 | 功能 |
|------|------|------|
| GET | `/api/kb/{kb_id}/docs` | 获取知识库下的文档列表 |
| POST | `/api/kb/{kb_id}/docs` | 上传文档到知识库（multipart，支持多文件） |
| DELETE | `/api/kb/{kb_id}/docs/{doc_id}` | 删除指定文档 |
| GET | `/api/kb/{kb_id}/docs/{doc_id}/status` | 查询文档处理状态 |
| GET | `/api/kb/{kb_id}/docs/{doc_id}/text` | 获取文档提取的原始文本 |

### 6.7 对话管理接口（需 Token）

| 方法 | 路由 | 功能 |
|------|------|------|
| GET | `/api/kb/{kb_id}/conversations` | 获取知识库下的对话列表 |
| POST | `/api/kb/{kb_id}/conversations` | 创建新对话 |
| GET | `/api/conversations/{id}/messages` | 获取对话的所有消息 |
| POST | `/api/conversations/{id}/messages` | 发送消息并获取 AI 回复 |
| DELETE | `/api/conversations/{id}` | 删除对话 |

### 6.8 分析接口（保留，需 Token）

| 方法 | 路由 | 功能 |
|------|------|------|
| POST | `/api/analyze_text` | 文本分析（增加模型参数透传） |
| POST | `/api/analyze_pdf` | PDF 分析（增加模型参数透传） |

### 6.9 参数配置接口（需 Token）

| 方法 | 路由 | 功能 |
|------|------|------|
| GET | `/api/params/default` | 获取默认参数配置 |
| GET | `/api/params/presets` | 获取当前用户的参数预设 |
| POST | `/api/params/presets` | 保存当前参数为预设 |
| DELETE | `/api/params/presets/{id}` | 删除参数预设 |
| PUT | `/api/params/presets/{id}` | 更新参数预设 |

### 6.10 统一响应格式

```json
{
  "success": true,
  "data": {},
  "message": "操作成功"
}
```

```json
{
  "success": false,
  "error": "错误描述",
  "code": "ERROR_CODE"
}
```

鉴权失败统一返回：
```json
{
  "success": false,
  "error": "未登录或登录已过期",
  "code": "UNAUTHORIZED"
}
```

---

## 七、分阶段开发计划

### 🟢 Phase 1：V1.0 基础架构与 NLP 分词（✅ 已完成）

- **核心目标**：跑通前后端数据流，完成本地文档读取与大模型生成。

- **实现功能**：
  1. 开发直观的 Web UI，支持"纯文本输入"和"PDF 文件上传"。
  2. 后端使用 Langchain 的 PyPDFLoader 将 PDF 文件转化为 Document 对象并提取文本。
  3. 通过自定义 Prompt 限制，调用 Coze SDK 完成基础 NLP 任务（中文分词、提取 3-5 个核心关键词）。
  4. 为防止大模型上下文溢出，当前采用截断前 1500 字的临时策略。

- **技术产出**：`index.html`、`style.css`、`coze_app.py`。

---

### 🟡 Phase 2：系统架构升级（当前阶段，细分为 4 个子阶段）

> **工程思路**：先跑通前端 UI → 再重构后端（多模型 + 新 API，内存存储）→ 引入 Redis（JWT 会话 + 缓存）→ 最后 SQLite 持久化（含用户认证 + API Key 加密）。每一步都可在前一步的基础上独立验证，降低风险。

---

#### Phase 2.1：前端三栏布局重构 + 登录页面（纯前端改造，后端不动）

- **核心目标**：将单页面工具重构为 Google AI Studio 风格的三栏界面 + 登录注册页面，所有数据暂存前端 JS 状态。

- **前端改造内容**：
  1. **登录/注册页面**：
     - 登录表单：邮箱 + 密码
     - 注册表单：邮箱 + 密码 + 确认密码 + 昵称（可选）
     - 登录/注册标签页切换
     - 暂时跳过实际认证，点登录直接进入主界面（mock 模式）
  2. **主应用三栏布局**：CSS Grid / Flexbox 实现左（240px）/ 中（自适应）/ 右（300px）三栏，各栏可折叠。
  3. **左栏 —— 知识库管理面板**：
     - 新建/重命名/删除知识库（操作仅修改前端 JS 数组）
     - 支持多文档知识库和单文档快速分析两种模式
     - 知识库内文档列表展示
  4. **中栏 —— 对话式工作区**：
     - 聊天气泡风格展示用户输入和 AI 回复
     - 保留文本输入框和 PDF 上传按钮
     - 仍然调用现有的 `/api/analyze_text` 和 `/api/analyze_pdf`
  5. **右栏 —— 参数调节面板**：
     - **模型配置区（新增）**：
       - 提供商下拉：DeepSeek / OpenAI / Ollama / Coze 智能体
       - API Key 输入框（密码类型 + 显示/隐藏切换）
       - 模型名称下拉（根据提供商动态切换候选列表）
       - Base URL 输入框（可选，自定义端点）
       - Coze 模式额外显示 Bot ID 输入框
       - Ollama 模式隐藏 API Key 输入框
     - **模型参数滑块组**：Temperature、Top-P、Top-K、Max Tokens
     - **NLP 参数滑块组**：Chunk Size、Chunk Overlap、关键词数量、文本截断长度
     - 「重置默认值」按钮
  6. **顶部导航栏**：项目名称 + 用户昵称 + 退出按钮
  7. **底部状态栏**：当前知识库名称、模型信息、文档数。

- **后端改动**：
  - 仅对现有 `/api/analyze_text` 和 `/api/analyze_pdf` 增加可选 `params` 字段透传（向后兼容）。

- **验证标准**：
  - 登录页面正常渲染，点击登录可进入主界面
  - 三栏布局正确渲染，各面板可折叠
  - 右栏模型配置区切换提供商时，模型列表和输入框动态更新
  - 文本分析和 PDF 分析功能正常调用原有接口
  - 参数通过请求体传到后端（后端日志确认收到）

- **技术产出**：`static/login.html`、`static/index.html`、`static/style.css`、`static/app.js`。

---

#### Phase 2.2：后端模块化重构 + 多模型支持（内存存储）

- **核心目标**：将 `coze_app.py` 单文件拆分为模块化项目结构，引入 Langchain `init_chat_model` 多模型支持，新增知识库/对话/参数/模型/认证 API，数据使用 Python 内存字典存储。

- **项目结构重组**：
  ```
  MY_NLPAnalyzer/
  ├── app/
  │   ├── __init__.py          # Flask 应用工厂（create_app）
  │   ├── config.py            # 配置管理（读取 .env）
  │   ├── routes/              # API 路由蓝图
  │   │   ├── __init__.py
  │   │   ├── auth.py          # 认证接口（注册/登录/me）
  │   │   ├── analyze.py       # 分析接口（迁移自 coze_app.py）
  │   │   ├── kb.py            # 知识库 CRUD 接口
  │   │   ├── docs.py          # 文档管理接口
  │   │   ├── chat.py          # 对话管理接口
  │   │   ├── params.py        # 参数配置接口
  │   │   └── models.py        # 模型提供商信息接口
  │   ├── services/            # 业务逻辑层
  │   │   ├── llm_service.py   # 多模型统一服务（init_chat_model + Coze SDK）
  │   │   ├── pdf_parser.py    # PDF 解析服务
  │   │   ├── auth_service.py  # 认证服务（JWT 生成/验证）
  │   │   └── memory_store.py  # 内存存储服务（临时替代数据库）
  │   ├── middleware/           # 中间件
  │   │   └── auth_guard.py    # JWT 鉴权装饰器
  │   └── utils/               # 工具函数
  │       └── response.py      # 统一响应格式封装
  ├── static/                  # 前端静态资源（Phase 2.1 产出）
  │   ├── login.html
  │   ├── index.html
  │   ├── style.css
  │   └── app.js
  ├── data/
  │   └── uploads/             # 上传文档存储目录
  ├── coze_app.py              # 入口文件（精简为启动脚本）
  ├── .env
  └── requirements.txt         # 依赖清单
  ```

- **多模型服务设计**（`llm_service.py`）：

  ```
  前端传入 → {provider, api_key, model_name, base_url, params}
      ↓
  ┌─────────────────────────────────────┐
  │           llm_service.py             │
  │                                     │
  │  provider == "coze"?                │
  │    → Coze SDK 路径                  │
  │      coze.chat.create_and_poll()    │
  │                                     │
  │  provider == "ollama"?              │
  │    → init_chat_model(               │
  │        model=model_name,            │
  │        model_provider="ollama",     │
  │        base_url=base_url)           │
  │                                     │
  │  provider in ["deepseek","openai"]? │
  │    → init_chat_model(               │
  │        model=model_name,            │
  │        model_provider=provider,     │
  │        api_key=api_key)             │
  │                                     │
  │  provider == "custom"?              │
  │    → ChatOpenAI(                    │
  │        model=model_name,            │
  │        api_key=api_key,             │
  │        base_url=base_url)           │
  └─────────────────────────────────────┘
  ```

- **认证服务设计**（`auth_service.py`，内存版）：
  - 注册：邮箱+密码 → bcrypt 哈希 → 存入内存字典
  - 登录：验证密码 → 生成 JWT Token → 返回给前端
  - 鉴权装饰器：从请求头提取 Token → 验证 → 注入 `g.user`
  - **注意**：此阶段用户数据存内存，重启丢失。JWT 无状态验证，重启后旧 Token 仍有效（签名密钥在 .env 中）

- **新增 API 接口**：
  - 认证：`POST /api/auth/register`、`POST /api/auth/login`、`GET /api/auth/me`
  - API Key：`GET/POST/DELETE /api/auth/keys`
  - 模型信息：`GET /api/models/providers`、`GET /api/models/{provider}/models`
  - 知识库 CRUD：`GET/POST/PUT/DELETE /api/kb`
  - 文档管理：`POST/DELETE/GET /api/kb/{id}/docs`
  - 对话管理：`GET/POST /api/kb/{id}/conversations`、`GET/POST /api/conversations/{id}/messages`
  - 参数配置：`GET /api/params/default`、`GET/POST/DELETE /api/params/presets`

- **前端对接**：
  - 登录页面调用 `/api/auth/register` 和 `/api/auth/login`
  - 登录成功后 Token 存 `localStorage`，后续请求带 `Authorization` 头
  - 右栏模型配置调用 `/api/models/providers` 获取提供商列表
  - API Key 通过 `/api/auth/keys` 管理和自动填充
  - 知识库/对话/参数操作全部改为调用真实 API

- **验证标准**：
  - 前端注册/登录流程正常，JWT Token 正确返回
  - 切换提供商后调用对应模型成功（DeepSeek / OpenAI 至少验证一个）
  - Coze 智能体模式仍正常工作
  - 知识库 CRUD 通过前端界面操作正常
  - 未登录访问需鉴权的接口返回 401

- **技术产出**：模块化后端、多模型服务、内存存储层、JWT 认证、完整 API 接口。

---

#### Phase 2.3：Redis 缓存层 + JWT 会话管理

- **核心目标**：引入 Redis 管理 JWT 会话和热数据缓存，提升性能和会话可控性。

- **Redis 集成内容**：
  1. **JWT 会话管理**：Token 黑名单/白名单存 Redis，支持主动注销和踢人
  2. **会话状态缓存**：用户当前选中的知识库、活跃对话 ID 存入 Redis Hash（TTL 24h）
  3. **临时参数存储**：右侧面板实时调节但未保存的参数存入 Redis（TTL 2h）
  4. **分析结果缓存**：相同文本 + 模型 + 参数组合的分析结果缓存（TTL 1h）
  5. **任务状态追踪**：PDF 处理进度存入 Redis（TTL 1h）
  6. **频率限制**：API 调用计数（TTL 1min）

- **代码改动**：
  - 新增 `app/services/cache.py`：Redis 连接管理、缓存读写封装
  - 修改 `app/services/auth_service.py`：JWT 验证增加 Redis 白名单检查
  - 修改 `app/services/memory_store.py`：热数据查询优先走 Redis
  - 修改 `app/routes/` 各路由：分析接口增加缓存判断
  - `.env` 新增 `REDIS_URL` 配置

- **验证标准**：
  - Redis 服务运行正常，键值可通过 `redis-cli` 查看
  - 相同文本重复分析命中缓存，响应加快
  - JWT 注销后 Token 立即失效（Redis 黑名单）
  - 服务重启后 Redis 中的会话状态仍可用（TTL 内）

- **技术产出**：Redis 缓存服务层、JWT 会话管理、缓存策略。

---

#### Phase 2.4：SQLite 持久化 + 用户认证 + API Key 加密

- **核心目标**：用 SQLite + SQLAlchemy 替换内存字典，实现数据持久化。新增 users 表和 user_api_keys 表，完成完整的用户认证和 API Key 加密存储。

- **ORM 集成**：
  - 新增 `app/models/` 目录，定义 SQLAlchemy 模型：
    - `user.py` → users 表
    - `user_api_key.py` → user_api_keys 表
    - `knowledge_base.py` → knowledge_bases 表
    - `document.py` → documents 表
    - `conversation.py` → conversations 表
    - `message.py` → messages 表
    - `parameter_preset.py` → parameter_presets 表
  - 新增 `app/extensions.py`：Flask-SQLAlchemy 初始化
  - 数据库文件存放在 `data/nlp_analyzer.db`

- **代码改动**：
  - `app/services/memory_store.py` → 重构为 `app/services/db_store.py`：CRUD 改为 SQLAlchemy 查询
  - 修改 `app/services/auth_service.py`：用户数据从内存迁移到 SQLite
  - 新增 `app/services/crypto_service.py`：Fernet 加密/解密 API Key
  - 修改 `app/services/llm_service.py`：从数据库读取用户加密的 API Key → 解密 → 调用模型
  - 修改各 `routes/` 路由：memory_store 替换为 db_store
  - `.env` 新增 `ENCRYPTION_KEY` 配置

- **数据分层（最终状态）**：

  ```
  ┌─────────────────────────────────────────────────┐
  │                 前端 (static/)                    │
  │  login.html · index.html · style.css · app.js   │
  └────────────────────┬────────────────────────────┘
                       │ HTTP + JWT Bearer Token
  ┌────────────────────▼────────────────────────────┐
  │              Flask 路由层 (routes/)               │
  │  auth · models · analyze · kb · docs · chat     │
  └────┬───────────┬──────────────┬─────────────────┘
       │           │              │
  ┌────▼─────┐ ┌───▼──────┐ ┌───▼──────────┐
  │ db_store  │ │ cache.py │ │ llm_service  │
  │ (SQLite) │ │ (Redis)  │ │ (Langchain)  │
  └────┬─────┘ └───┬──────┘ └──────────────┘
       │           │
  ┌────▼─────┐ ┌───▼──────┐
  │ SQLite   │ │  Redis   │
  │ (持久化)  │ │ (缓存)   │
  └──────────┘ └──────────┘
  ```

  - **SQLite**：用户、API Key（加密）、知识库、文档、对话、消息、参数预设
  - **Redis**：JWT 会话、临时参数、分析缓存、任务进度
  - **Langchain**：统一模型调用接口，支持多提供商动态切换

- **验证标准**：
  - 服务重启后，用户数据、知识库、对话历史完整保留
  - 用户可用注册的邮箱密码正常登录
  - API Key 加密存储，数据库中不可见明文
  - 前端展示 API Key 仅显示后 4 位
  - Redis 缓存层正常工作
  - `data/nlp_analyzer.db` 可通过 SQLite 工具查看

- **技术产出**：SQLAlchemy ORM 模型、Fernet 加密服务、用户认证系统、持久化存储。

---

### 🔵 Phase 3：V3.0 Langchain 文档切分引擎

- **核心目标**：解决超长 PDF 无法一次性处理的问题，深入应用 NLP 核心概念。

- **实现功能**：
  1. 引入 Langchain 的 `RecursiveCharacterTextSplitter`。
  2. 不仅提取前两页，而是**读取完整 PDF**，并将长文档科学地切分为若干个 500-1000 字的"文本块（Chunks）"。
  3. **NLP 考点体现**：展示并解释"Chunk overlap（重叠区）"的概念，说明如何防止分词或句子在块边缘被生硬截断，保留上下文语境。
  4. 参数面板中的 Chunk Size 和 Chunk Overlap 滑块**实时生效**，调节后立即重新切分并展示预览。
  5. 前端增加**分块可视化视图**：展示切分后的文本块列表，标注重叠区域。
  6. 支持按分块逐个送入大模型分析，结果汇总展示。

- **技术产出**：文档切分引擎、分块可视化组件、完整 PDF 处理流程。

---

### 🔴 Phase 4：V4.0 RAG 知识库与 LangGraph 编排（最终答辩版）

- **核心目标**：完成真正的"文献研读助手"，引入向量化和智能体工作流。

- **实现功能**：
  1. **引入向量模型 (Embedding)**：使用开源模型（如 BAAI/bge-large-zh）将 Phase 3 得到的文本块转化为向量，存入本地 **FAISS** 数据库。
  2. **实现 RAG 检索**：用户在网页输入框提问（例如："这篇论文的主要创新点是什么？"），后端通过 FAISS 检索出最相关的 Top-3 文本块。
  3. **LangGraph 智能路由**：使用状态图构建工作流。系统自动判断用户输入是"闲聊"还是"文献检索"，如果是文献检索则走 RAG 节点，最后将 Context 喂给大模型生成标准答案。
  4. **多轮对话记忆**：对话历史持久化到数据库，支持上下文连续追问。
  5. **多文档联合分析**：知识库内的多篇文档统一向量化，跨文档检索相关信息。

- **最终效果**：用户上传多篇全英文/中文 NLP 顶会论文（总页数达 100 页左右），网页在几秒内完成解析，随后用户可以针对特定论文进行多轮对话和深度研读。

---

## 八、里程碑与交付物

| 阶段 | 核心交付物 | 关键能力 |
|------|-----------|----------|
| Phase 1 ✅ | 单页 Web 工具 | 文本/PDF 输入 → Coze AI 分词 |
| Phase 2.1 | 三栏前端 + 登录页面 | Google AI Studio 风格布局 + 模型选择器（纯前端） |
| Phase 2.2 | 模块化后端 + 多模型 | Langchain 多提供商 + 知识库 CRUD + JWT（内存） |
| Phase 2.3 | Redis 缓存层 | JWT 会话管理 + 结果缓存 + 频率限制 |
| Phase 2.4 | SQLite + 用户认证 | 数据库持久化 + 邮箱登录 + API Key 加密 |
| Phase 3 | 文档切分引擎 | 完整 PDF 解析 + 智能分块 + 分块可视化 |
| Phase 4 | RAG 智能助手 | 向量检索 + 多轮对话 + LangGraph 编排 |

---

## 九、风险与注意事项

1. **Redis 依赖**：Phase 2.3 起 Redis 必须运行。Phase 2.1 和 2.2 不依赖 Redis。
2. **模型提供商可用性**：不同提供商的 API 能力有差异（如 Coze 不支持 temperature 透传），`llm_service.py` 需做参数适配。
3. **API Key 安全**：Fernet 加密密钥 `ENCRYPTION_KEY` 必须妥善保管，泄露等同于所有用户 Key 泄露。密钥丢失则已存储的 Key 不可恢复。
4. **文件存储空间**：多文档上传后 `data/uploads/` 目录会增长，需定期清理或设置容量上限。
5. **并发安全**：SQLite 在高并发写入时有锁竞争，单用户学习项目影响不大，但需注意。
6. **向后兼容**：每个子阶段完成后，前一个子阶段的功能必须完整保留且正常工作。
7. **数据迁移**：Phase 2.4 引入 SQLite 时，需考虑从内存字典到数据库的数据格式映射，确保前端无感知。
8. **Ollama 前置条件**：用户需自行安装 Ollama 并下载模型，项目文档需提供安装指引。
