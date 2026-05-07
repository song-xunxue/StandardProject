"""
Flask 应用工厂

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 新建应用工厂模块
  2. 注册所有蓝图、CORS、静态文件服务

2026-04-28
变更说明：
  1. 应用启动时初始化 Redis 连接池
  2. 启动时预置默认管理员账户

2026-05-04
变更说明：
  1. 集成 SQLAlchemy 初始化（Phase 2.4 持久化）
  2. 启动时自动创建数据库表

2026-05-07
变更说明：
  1. 启动时确保 FAISS 索引目录存在（Phase 4.1）
"""

import os
from flask import Flask, send_file
from flask_cors import CORS

from app.extensions import db

# 项目根目录（app/__init__.py 的上级目录）
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def create_app():
    """创建并配置 Flask 应用"""
    app = Flask(__name__)
    CORS(app)

    # 导入配置
    from app.config import Config
    app.config['SECRET_KEY'] = Config.SECRET_KEY
    app.config['MAX_CONTENT_LENGTH'] = Config.MAX_CONTENT_LENGTH
    app.config['SQLALCHEMY_DATABASE_URI'] = Config.SQLALCHEMY_DATABASE_URI
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = Config.SQLALCHEMY_TRACK_MODIFICATIONS

    # 确保 data 目录存在
    os.makedirs(Config._DATA_DIR, exist_ok=True)
    # 确保 FAISS 索引目录存在（Phase 4.1）
    os.makedirs(Config.FAISS_INDEX_DIR, exist_ok=True)

    # 初始化 SQLAlchemy
    db.init_app(app)
    with app.app_context():
        from app.models import User, KnowledgeBase, Conversation, Message, ApiKey, ParamPreset, Document, Chunk  # noqa: F401
        db.create_all()
        print("[DB] SQLite 数据库已就绪")

    # 确保上传目录存在
    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)

    # 注册蓝图（在 Redis 初始化之前，因为路由只做 import 不执行）
    from app.routes import register_blueprints
    register_blueprints(app)

    # 初始化 Redis 连接
    from app.services import redis_service
    try:
        redis_service.init_redis()
        print("[Redis] 连接成功")
    except Exception as e:
        print(f"[Redis] 连接失败: {e}")
        print("[Redis] 将使用本地内存回退（部分功能可能重启后丢失）")

    # 初始化默认用户（需要 app context 和 Redis）
    from app.services import auth_service
    try:
        with app.app_context():
            auth_service.init_default_users()
        print("[Auth] 默认用户已就绪")
    except Exception as e:
        print(f"[Auth] 初始化默认用户失败: {e}")

    # 页面路由（使用项目根目录的绝对路径）
    @app.route('/')
    def serve_index():
        return send_file(os.path.join(PROJECT_ROOT, 'index.html'))

    @app.route('/login')
    def serve_login():
        return send_file(os.path.join(PROJECT_ROOT, 'login.html'))

    @app.route('/style.css')
    def serve_css():
        return send_file(os.path.join(PROJECT_ROOT, 'style.css'))

    @app.route('/app.js')
    def serve_js():
        return send_file(os.path.join(PROJECT_ROOT, 'app.js'), mimetype='application/javascript')

    return app
