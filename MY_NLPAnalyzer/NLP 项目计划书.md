# NLPAnalyzer 项目开发计划书

<!--
  作者: 李文煜
  日期: 2026-05-09

  2026-05-09
  变更说明：
    1. Phase 2 标记为 ✅ 已完成，2.1-2.4 子阶段均标记已完成
    2. Phase 2.1-2.4 精简为交付物总结（移除规划阶段的详细验证标准/代码改动列表）
    3. Phase 3 标记为已完成
    4. Phase 4 拆分为 4.1-4.4，4.1/4.2 标记已完成，补充实际实现细节
    5. 里程碑表格增加"状态"列
    6. 修正 ENCRYPTION_KEY → FERNET_KEY，Redis 键结构更新为实际使用状态
    7. 核心依赖新增 faiss-cpu、langchain-ollama
-->

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
| **后续扩展** | Langchain TextSplitter, FAISS, LangGraph | 文档切分 / 向量检索 / 智能体编排（Phase 3-4 已落地） |

### 核心依赖清单

```
flask
flask-cors
python-dotenv
cozepy
langchain
langchain-openai
langchain-community
langchain-ollama
pypdf
redis
sqlalchemy
flask-sqlalchemy
bcrypt
PyJWT
cryptography
faiss-cpu
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
用户输入 API Key → 后端接收明文 → Fernet 对称加密（密钥来自 .env 的 FERNET_KEY）
→ 加密后存入 user_api_keys.encrypted_key → 调用模型时：读取 → Fernet 解密 → 传给 Langchain
```

- 加密密钥 `FERNET_KEY` 存在 `.env` 中，不入版本库
- 前端展示 API Key 时仅显示后 4 位（如 `••••••ab3f`）
- API Key 仅在调用模型时解密，不写入日志

### 5.3 Redis —— JWT 黑名单

> 当前 Redis 仅用于 JWT Token 黑名单，其他缓存场景（会话状态、分析缓存、频率限制）尚未实现。

| 键模式 | 数据类型 | 用途 | TTL |
|--------|----------|------|-----|
| `nlp:jwt_bl:{token}` | String | JWT 黑名单（注销时写入） | Token 剩余有效期 |

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

### 🟡 Phase 2：系统架构升级（✅ 已完成）

> **工程思路**：前端三栏布局 → 后端模块化 + 多模型 → Redis JWT 黑名单 → SQLite 持久化 + Fernet 加密。

---

#### Phase 2.1：前端三栏布局重构 + 登录页面（✅ 已完成）

- **核心目标**：将单页面工具重构为 Google AI Studio 风格的三栏界面 + 登录注册页面。
- **交付内容**：
  - 登录/注册页面（标签页切换，邮箱+密码）
  - 三栏布局：左栏知识库管理（240px）+ 中栏对话式工作区 + 右栏参数面板（300px）
  - 右栏三区块：模型配置区（提供商/API Key/模型动态切换）+ 模型参数滑块 + NLP 参数滑块
  - 后端仅对分析接口增加可选 `params` 字段透传
- **技术产出**：`static/login.html`、`static/index.html`、`static/style.css`、`static/app.js`

---

#### Phase 2.2：后端模块化重构 + 多模型支持（✅ 已完成）

- **核心目标**：`coze_app.py` 单文件拆分为 Flask 工厂模式 + 蓝图路由 + 服务层，引入 Langchain `init_chat_model` 多模型支持。
- **交付内容**：
  - 模块化结构：`app/` 包（routes 7 个蓝图 + services 4 个服务 + middleware + models）
  - 多模型服务（`llm_service.py`）：Coze SDK / Ollama / DeepSeek / OpenAI / 自定义提供商统一路由
  - JWT 认证服务（`auth_service.py`）：注册/登录/鉴权装饰器
  - 内存存储（`memory_store.py`）：知识库/对话/参数 CRUD
  - 完整 API 接口体系（认证、模型、知识库、文档、对话、参数共 20+ 路由）
- **技术产出**：模块化后端 `app/` 包、多模型服务、JWT 认证、完整 API

---

#### Phase 2.3：Redis JWT 黑名单（✅ 已完成）

- **核心目标**：引入 Redis 管理 JWT Token 黑名单，支持主动注销使 Token 立即失效。
- **交付内容**：
  - Redis 连接池服务（`app/services/redis_service.py`）
  - JWT 注销时将 Token 写入 Redis（TTL = Token 剩余有效期）
  - 鉴权时检查 Token 是否在黑名单中
- **Redis 键结构**：`nlp:jwt_bl:{token}` — String，TTL 自动过期
- **技术产出**：Redis 服务层、JWT 黑名单机制

---

#### Phase 2.4：SQLite + SQLAlchemy 持久化 + API Key Fernet 加密（✅ 已完成）

- **核心目标**：Python 内存字典 → SQLite + SQLAlchemy ORM，用户 API Key 使用 Fernet 对称加密存储。
- **交付内容**：
  - 8 个 ORM 模型（`app/models/`）：User、KnowledgeBase、Conversation、Message、ApiKey、ParamPreset、Document、Chunk
  - Fernet 加密服务（`app/services/crypto_service.py`）：API Key 加密存储，调用时解密
  - `memory_store.py` 重写为 SQLAlchemy 查询
  - 数据库文件 `data/nlp.db`
- **数据分层**：
  - **SQLite**：用户、API Key（加密）、知识库、文档、Chunk、对话、消息、参数预设
  - **Redis**：仅 JWT 黑名单（TTL 自动过期）
  - **Langchain**：统一多模型调用接口
- **技术产出**：SQLAlchemy ORM 模型、Fernet 加密服务、持久化存储

---

### 🔵 Phase 3：V3.0 Langchain 文档切分引擎（✅ 已完成）

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

### 🔴 Phase 4：V4.0 RAG 知识库与 LangGraph 编排（当前阶段，细分为 4 个子阶段）

> **工程思路**：先搭建 Embedding 基础设施 → 再实现 FAISS 向量索引管理 → 然后构建 RAG 检索 + LangGraph 编排 → 最后改造前端聊天界面。逐步叠加能力，每一步可独立验证。

---

#### Phase 4.1：Embedding 服务 + 模型扩展（✅ 已完成）

- **核心目标**：建立文本向量化的基础服务，支持多提供商 Embedding 模型，为后续 FAISS 索引和 RAG 检索奠定基础。

- **实现功能**：
  1. **多提供商 Embedding 服务**（`app/services/embedding_service.py`）：
     - 支持 OpenAI、DeepSeek（兼容 OpenAI 接口）、Ollama 三种提供商
     - 使用 `langchain_openai.OpenAIEmbeddings`（OpenAI/DeepSeek）和 `langchain_ollama.OllamaEmbeddings`（Ollama）
     - 提供批量文本向量化（`embed_texts`）、单条查询向量化（`embed_query`）接口
  2. **数据模型扩展**：
     - Chunk 模型新增 `vector_id`（Integer，FAISS 索引行号）和 `embedding_status`（pending/embedded/failed）字段
     - KnowledgeBase 模型新增 `embedding_config`（JSON，存储 Embedding 模型配置）
  3. **配置扩展**（`app/config.py`）：
     - 新增 `FAISS_INDEX_DIR`、`DEFAULT_EMBEDDING_PROVIDER`、`DEFAULT_EMBEDDING_MODEL`、`DEFAULT_EMBEDDING_DIMENSION`
     - `SUPPORTED_PROVIDERS` 新增 `embedding_models`（支持的 Embedding 模型列表）和 `embedding_dimension`（向量维度）
  4. **依赖新增**：`faiss-cpu`、`langchain-ollama`

- **验证标准**：
  - Embedding 服务可调用 OpenAI/DeepSeek/Ollama 模型生成向量
  - Chunk 模型新字段可正常读写
  - 不同提供商的 Embedding 维度配置正确

- **技术产出**：`embedding_service.py`、Chunk/KnowledgeBase 模型扩展、Embedding 配置体系。

---

#### Phase 4.2：FAISS 索引管理 + 向量化流程（✅ 已完成）

- **核心目标**：基于 Phase 4.1 的 Embedding 服务，实现 FAISS 向量索引的全生命周期管理，支持全量构建、增量向量化、检索和删除。

- **实现功能**：
  1. **FAISS 索引管理服务**（`app/services/faiss_service.py`）：
     - `build_kb_index(kb_id, embedding_config)` — 全量重建知识库索引
     - `incremental_embed_doc(doc_id, embedding_config)` — 增量向量化单个文档
     - `search(kb_id, query, embedding_config, top_k)` — 向量检索
     - `delete_doc_vectors(doc_id)` — 逻辑删除文档向量（标记为 pending）
     - `get_index_status(kb_id)` — 获取索引状态统计
     - `delete_kb_index(kb_id)` — 删除整个知识库索引目录
  2. **设计特点**：
     - 每个知识库独立 FAISS 索引，存储在 `data/faiss_indexes/{kb_id}/`
     - 内存缓存（`_index_cache`）+ 磁盘持久化，避免重复加载
     - 向量化状态追踪：pending → embedded / failed
  3. **自动化流程**：
     - 文档上传处理后自动触发增量向量化（`doc_service._auto_embed_doc`）
     - 重新切分后自动重新向量化
  4. **API 接口**：
     - 知识库路由：`POST /api/kb/<id>/build_index`、`GET /api/kb/<id>/index_status`、`GET/PUT /api/kb/<id>/embedding_config`
     - 文档路由：`POST /api/docs/<id>/embed`、`GET /api/docs/<id>/embed_status`
     - 删除知识库/文档时自动清理 FAISS 索引

- **验证标准**：
  - 上传 PDF 后自动完成切分 → 向量化 → 索引构建全流程
  - 向量检索返回正确的 Top-K 相关文本块
  - 删除文档后向量被逻辑标记，不破坏索引结构
  - 每个知识库的索引相互独立

- **技术产出**：`faiss_service.py`、自动化向量化流程、Embedding 配置与状态管理 API。

---

#### Phase 4.3：RAG 服务 + LangGraph 智能体编排（待开发）

- **核心目标**：基于 FAISS 向量检索构建 RAG 问答服务，引入 LangGraph StateGraph 编排智能体工作流，实现上下文感知的文献问答。

- **实现功能**：
  1. **RAG 检索服务**（`app/services/rag_service.py`）：
     - 接收用户提问 → Embedding 向量化 → FAISS Top-K 检索 → 拼装 Prompt Context
     - 支持跨文档检索（知识库内所有文档统一检索）
     - 检索结果包含来源文档、Chunk 定位、相似度分数
     - 可配置检索参数：Top-K、相似度阈值、上下文窗口大小
  2. **LangGraph 智能体编排**（`app/services/langgraph_service.py`）：
     - 使用 `StateGraph` 构建工作流状态机
     - **路由节点**：判断用户输入类型（闲聊 / 文献检索 / 概念解释 / 总结摘要）
     - **RAG 节点**：调用 rag_service 检索相关 Chunk，组装 Context
     - **LLM 节点**：将 Context + 用户问题 + 对话历史喂给大模型生成回答
     - **引用节点**：从检索结果中提取引用来源（文档名、页码、Chunk 位置）
  3. **对话管理重写**（`app/routes/chat.py`）：
     - 重写聊天 API，集成 LangGraph 工作流
     - 支持多轮对话记忆（从数据库加载历史消息）
     - 流式响应（SSE）支持，逐步返回生成内容
     - 回答附带引用来源信息
  4. **Prompt 工程**：
     - 系统提示词：定义"文献研读助手"角色和回答规范
     - RAG Prompt 模板：`基于以下文献片段回答问题...\n\n{context}\n\n问题：{question}`
     - 路由 Prompt：判断用户意图的分类提示词

- **验证标准**：
  - 用户提问后系统自动检索相关文献片段并生成有依据的回答
  - 回答附带引用来源（文档名、相关段落）
  - 多轮对话可连续追问，保持上下文
  - LangGraph 正确路由不同类型的用户输入

- **技术产出**：`rag_service.py`、`langgraph_service.py`、重写的 `chat.py`、Prompt 模板体系。

---

#### Phase 4.4：前端聊天界面改造（待开发）

- **核心目标**：将中栏工作区改造为完整的聊天界面，支持 RAG 问答交互、引用来源展示和参数调节。

- **实现功能**：
  1. **聊天输入框改造**：
     - 中栏底部固定聊天输入框（类似 ChatGPT 风格）
     - 支持文本输入 + Enter 发送 / Shift+Enter 换行
     - 输入框自动扩展高度
  2. **对话消息展示**：
     - 用户消息和 AI 回复以气泡/卡片形式展示
     - AI 回复支持 Markdown 渲染（代码块、列表、加粗等）
     - 流式响应实时更新（打字机效果）
     - 加载状态指示器
  3. **引用来源展示**：
     - AI 回复下方展示"引用来源"折叠区域
     - 显示引用的文档名、相关片段摘要、相似度分数
     - 点击引用可展开查看原文 Chunk 内容
  4. **RAG 参数面板**（右栏新增区块）：
     - 检索 Top-K 滑块（1-20，默认 5）
     - 相似度阈值滑块（0.0-1.0，默认 0.5）
     - Embedding 模型选择（与当前知识库配置联动）
     - 是否启用 RAG 检索开关（关闭则直接对话大模型）
  5. **对话管理**：
     - 对话列表展示（侧边栏或中栏顶部）
     - 新建对话 / 删除对话
     - 对话标题自动生成（基于首轮提问）
  6. **知识库联动**：
     - 左栏选中知识库时，聊天自动关联该知识库的 FAISS 索引
     - 切换知识库时提示是否开始新对话

- **验证标准**：
  - 聊天界面交互流畅，输入发送体验良好
  - AI 回复正确展示，引用来源可展开查看
  - 切换知识库后 RAG 检索范围正确切换
  - 参数调节实时生效

- **技术产出**：改造后的 `index.html`、`app.js`、`style.css`，完整的聊天交互界面。

---

## 八、里程碑

| 阶段 | 状态 | 核心交付物 | 关键能力 |
|------|------|-----------|----------|
| Phase 1 | ✅ | 单页 Web 工具 | 文本/PDF 输入 → Coze AI 分词 |
| Phase 2.1 | ✅ | 三栏前端 + 登录页面 | Google AI Studio 风格布局 + 模型选择器（纯前端） |
| Phase 2.2 | ✅ | 模块化后端 + 多模型 | Langchain 多提供商 + 知识库 CRUD + JWT（内存） |
| Phase 2.3 | ✅ | Redis 缓存层 | JWT 会话管理 + 结果缓存 + 频率限制 |
| Phase 2.4 | ✅ | SQLite + 用户认证 | 数据库持久化 + 邮箱登录 + API Key 加密 |
| Phase 3 | ✅ | 文档切分引擎 | 完整 PDF 解析 + 智能分块 + 分块可视化 |
| Phase 4.1 | ✅ | Embedding 服务 | 多提供商向量化 + Chunk 状态追踪 |
| Phase 4.2 | ✅ | FAISS 索引管理 | 全量/增量向量化 + 向量检索 + 自动化流程 |
| Phase 4.3 | 🔲 | RAG + LangGraph 编排 | 向量检索问答 + 智能体工作流 + 多轮对话 |
| Phase 4.4 | 🔲 | 前端聊天界面 | 聊天交互 + 引用来源展示 + RAG 参数面板 |

---

## 九、风险与注意事项

1. **Redis 依赖**：Phase 2.3 起 Redis 必须运行。Phase 2.1 和 2.2 不依赖 Redis。
2. **模型提供商可用性**：不同提供商的 API 能力有差异（如 Coze 不支持 temperature 透传），`llm_service.py` 需做参数适配。
3. **API Key 安全**：Fernet 加密密钥 `FERNET_KEY` 必须妥善保管，泄露等同于所有用户 Key 泄露。密钥丢失则已存储的 Key 不可恢复。
4. **文件存储空间**：多文档上传后 `data/uploads/` 目录会增长，需定期清理或设置容量上限。
5. **并发安全**：SQLite 在高并发写入时有锁竞争，单用户学习项目影响不大，但需注意。
6. **向后兼容**：每个子阶段完成后，前一个子阶段的功能必须完整保留且正常工作。
7. **Ollama 前置条件**：用户需自行安装 Ollama 并下载模型，项目文档需提供安装指引。
8. **FAISS 索引一致性**：FAISS 索引与数据库 Chunk 记录需保持一致。删除文档时仅做逻辑标记（pending），大量删除后需重建索引以释放空间。
9. **Embedding 模型切换**：切换 Embedding 模型（如从 OpenAI 换到 Ollama）后，向量维度可能变化，必须重建索引，否则检索结果不可靠。
10. **LangGraph 依赖**：Phase 4.3 需引入 `langgraph` 库，需确认与现有 Langchain 版本兼容。
11. **流式响应**：Phase 4.4 前端需支持 SSE（Server-Sent Events）接收流式响应，Flask 原生支持有限，可能需引入 `flask-streaming` 或手动实现 generator 响应。
