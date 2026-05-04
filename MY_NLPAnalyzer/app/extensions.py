"""
Flask 扩展实例

作者: 李文煜
日期: 2026-05-04

2026-05-04
变更说明：
  1. 新建扩展模块，存放 SQLAlchemy db 实例
  2. 独立于 app 包避免循环导入
"""

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
