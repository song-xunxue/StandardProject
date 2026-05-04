"""
路由蓝图注册

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 新建路由注册模块，统一注册所有蓝图

2026-05-04
变更说明：
  1. 新增 doc_bp 文档管理蓝图
"""

from flask import Flask

from app.routes.auth import auth_bp
from app.routes.models import models_bp
from app.routes.analyze import analyze_bp
from app.routes.kb import kb_bp
from app.routes.chat import chat_bp
from app.routes.params import params_bp
from app.routes.doc import doc_bp


def register_blueprints(app: Flask):
    """注册所有蓝图"""
    app.register_blueprint(auth_bp)
    app.register_blueprint(models_bp)
    app.register_blueprint(analyze_bp)
    app.register_blueprint(kb_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(params_bp)
    app.register_blueprint(doc_bp)
