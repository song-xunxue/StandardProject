"""
API Key 模型

作者: 李文煜
日期: 2026-05-04

2026-05-04
变更说明：
  1. 新建 ApiKey ORM 模型，encrypted_key 存储 Fernet 加密后的密文
"""

from app.extensions import db


class ApiKey(db.Model):
    """API Key 表（联合主键：user_email + provider）"""
    __tablename__ = 'api_keys'

    user_email = db.Column(
        db.String(120), db.ForeignKey('users.email'),
        nullable=False, primary_key=True
    )
    provider = db.Column(db.String(40), nullable=False, primary_key=True)
    encrypted_key = db.Column(db.Text, nullable=False)  # Fernet 加密密文
    model_name = db.Column(db.String(100), nullable=False, default='')
    base_url = db.Column(db.String(500), nullable=False, default='')
