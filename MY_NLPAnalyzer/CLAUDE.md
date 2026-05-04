# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MY_NLPAnalyzer is a Chinese NLP Analysis Assistant providing intelligent text segmentation and keyword extraction. Flask backend (modular) + vanilla JS frontend (three-column layout), supporting multi-model providers (DeepSeek, OpenAI, Ollama, Coze) via Langchain `init_chat_model`, with JWT authentication, SQLAlchemy/SQLite persistent storage, and Redis-backed JWT blacklist.

## Running the Application

```bash
# Use langchain conda environment
# Dependencies: flask, flask-cors, cozepy, langchain, langchain-community, langchain-openai, python-dotenv, bcrypt, PyJWT, redis, flask-sqlalchemy, cryptography
python coze_app.py
```

Server starts at `http://127.0.0.1:5001`. Login page at `/login`. No test suite; `langchain/test*.py` files are standalone experiments.

## Architecture

**Backend** (`app/` package, entry via `coze_app.py`):
- `app/__init__.py` — Flask app factory (`create_app()`), initializes SQLAlchemy + Redis
- `app/extensions.py` — Flask extension instances (`db = SQLAlchemy()`)
- `app/config.py` — Environment config, `SUPPORTED_PROVIDERS` dict
- `app/models/` — SQLAlchemy ORM models (User, KnowledgeBase, Conversation, Message, ApiKey, ParamPreset, Document, Chunk)
- `app/routes/` — Blueprint-based API routes (auth, analyze, models, kb, chat, params, doc)
- `app/services/auth_service.py` — JWT + bcrypt authentication (SQLAlchemy user store + Redis token blacklist)
- `app/services/llm_service.py` — Multi-model service via Langchain `init_chat_model` + Coze SDK
- `app/services/pdf_parser.py` — PDF parsing via Langchain PyPDFLoader (page-limited + full-page modes)
- `app/services/doc_service.py` — Document processing service (PDF full parse + RecursiveCharacterTextSplitter chunking)
- `app/services/redis_service.py` — Redis connection pool (JWT blacklist only)
- `app/services/memory_store.py` — SQLAlchemy-backed data store (knowledge bases, documents, chunks, conversations, API keys, presets)
- `app/services/crypto_service.py` — Fernet symmetric encryption for API keys
- `app/middleware/auth_guard.py` — `@login_required` JWT decorator

**Frontend** (`login.html` + `index.html` + `style.css` + `app.js`):
- Login/register page with email + password
- Three-column layout: left (knowledge base management, 240px) + center (workspace/chat) + right (parameter panel, 300px)
- Model provider selector with dynamic model list
- Parameter sliders (model params + NLP params)
- Pink theme CSS variables

**`langchain/` directory**: Standalone learning scripts — not imported by the main app.

## Key API Routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/login` | GET | No | Login page |
| `/api/auth/register` | POST | No | Register (email+password) |
| `/api/auth/login` | POST | No | Login, returns JWT |
| `/api/auth/me` | GET | Yes | Current user info |
| `/api/auth/logout` | POST | Yes | Logout (JWT blacklist) |
| `/api/auth/keys` | GET/POST/DELETE | Yes | API Key management |
| `/api/models/providers` | GET | No | List providers |
| `/api/analyze_text` | POST | Yes | Text analysis (with model params) |
| `/api/analyze_pdf` | POST | Yes | PDF analysis (with model params) |
| `/api/kb` | GET/POST | Yes | Knowledge base CRUD |
| `/api/params/default` | GET | No | Default parameters |
| `/api/params/presets` | GET/POST/DELETE | Yes | Parameter presets |
| `/api/kb/<id>/docs` | POST | Yes | Upload PDF to knowledge base (parse + chunk) |
| `/api/docs/<id>` | GET/DELETE | Yes | Document detail / delete |
| `/api/docs/<id>/chunks` | GET | Yes | Document chunks (paginated) |
| `/api/docs/<id>/rechunk` | POST | Yes | Re-chunk with new parameters |

## Multi-Model Service

`app/services/llm_service.py` provides unified analysis:
- **Coze**: Uses `cozepy` SDK (preserved from Phase 1)
- **DeepSeek/OpenAI**: `init_chat_model(model, model_provider="openai", api_key=..., base_url=...)`
- **Ollama**: `init_chat_model(model, model_provider="ollama", base_url="http://localhost:11434")`

Frontend sends `params` dict with provider, api_key, model, base_url, and model parameters.

## Environment Configuration

`.env` file (required, not committed):
- `COZE_API_TOKEN`, `BOT_ID`, `USER_ID` — Coze SDK (required)
- `JWT_SECRET_KEY` — JWT token signing (required)
- `REDIS_URL` — Redis connection URL (required for JWT blacklist)
- `FERNET_KEY` — Fernet encryption key for API keys (required, generate via `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`)
- `PORT` — optional, defaults to 5001
- `DATABASE_URL` — optional, defaults to `sqlite:///data/nlp.db`
- `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` — used by langchain scripts

## Code Conventions

- All UI text, prompts, and comments in Chinese
- API responses: `{"success": bool, "data": ..., "message": str}` or `{"success": false, "error": str}`
- Text input truncated to `truncate-length` param (default 1500)
- `use_reloader=False` in `app.run()` — required for singleton patterns
