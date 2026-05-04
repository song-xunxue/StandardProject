"""
应用配置管理

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 新建配置模块，从 .env 读取所有环境变量
  2. 定义支持的模型提供商配置

2026-04-28
变更说明：
  1. 新增 Redis 连接配置（REDIS_URL），用于 Phase 2.3 缓存层

2026-05-04
变更说明：
  1. 新增 SQLAlchemy/SQLite 配置，用于 Phase 2.4 持久化
  2. 新增 Fernet 加密密钥配置，用于 API Key 加密存储
"""

import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """应用配置类"""

    # Flask
    SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'change-this-secret-in-production')
    PORT = int(os.environ.get('PORT', 5001))

    # Coze 智能体配置（保留 Phase 1）
    COZE_API_TOKEN = os.environ.get('COZE_API_TOKEN', '')
    COZE_BOT_ID = os.environ.get('BOT_ID', '')
    COZE_USER_ID = os.environ.get('USER_ID', '')

    # JWT 配置
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'change-this-secret-in-production')
    JWT_ALGORITHM = 'HS256'
    JWT_EXPIRE_HOURS = 24

    # Redis 配置（JWT 黑名单仍在 Redis）
    REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')

    # SQLAlchemy / SQLite 配置
    _DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'DATABASE_URL',
        'sqlite:///' + os.path.join(_DATA_DIR, 'nlp.db')
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Fernet 对称加密密钥（32 字节 Base64 编码字符串）
    FERNET_KEY = os.environ.get('FERNET_KEY', '')

    # 文件上传
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'uploads')
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB

    @staticmethod
    def validate_coze():
        """检查 Coze 必要配置是否存在"""
        return bool(Config.COZE_API_TOKEN and Config.COZE_BOT_ID and Config.COZE_USER_ID)


# 支持的模型提供商配置
SUPPORTED_PROVIDERS = {
    'deepseek': {
        'name': 'DeepSeek',
        'models': ['deepseek-chat', 'deepseek-reasoner'],
        'need_key': True,
        'need_bot_id': False,
        'default_base': 'https://api.deepseek.com/v1',
        'langchain_provider': 'openai',  # DeepSeek 兼容 OpenAI 接口
    },
    'openai': {
        'name': 'OpenAI',
        'models': ['gpt-4o-mini', 'gpt-4o'],
        'need_key': True,
        'need_bot_id': False,
        'default_base': 'https://api.openai.com/v1',
        'langchain_provider': 'openai',
    },
    'ollama': {
        'name': 'Ollama',
        'models': ['qwen2.5', 'llama3', 'gemma2'],
        'need_key': False,
        'need_bot_id': False,
        'default_base': 'http://localhost:11434',
        'langchain_provider': 'ollama',
    },
    'coze': {
        'name': 'Coze 智能体',
        'models': [],
        'need_key': True,
        'need_bot_id': True,
        'default_base': '',
        'langchain_provider': None,  # Coze 走独立 SDK 路径
    },
}
