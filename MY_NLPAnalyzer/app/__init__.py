"""
Flask 应用工厂

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 新建应用工厂模块
  2. 注册所有蓝图、CORS、静态文件服务
"""

import os
from flask import Flask, send_file
from flask_cors import CORS

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

    # 确保上传目录存在
    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)

    # 注册蓝图
    from app.routes import register_blueprints
    register_blueprints(app)

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
