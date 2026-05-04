"""
用户模型

作者: 李文煜
日期: 2026-05-04

2026-05-04
变更说明：
  1. 新建 User ORM 模型，对应 users 表
"""

from datetime import datetime, timezone

from app.extensions import db


class User(db.Model):
    """用户表"""
    __tablename__ = 'users'

    email = db.Column(db.String(120), primary_key=True)
    password_hash = db.Column(db.String(128), nullable=False)
    nickname = db.Column(db.String(80), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='user')
    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    # 关系
    knowledge_bases = db.relationship(
        'KnowledgeBase', backref='user', lazy='dynamic',
        cascade='all, delete-orphan'
    )
    conversations = db.relationship(
        'Conversation', backref='user', lazy='dynamic',
        cascade='all, delete-orphan'
    )
    api_keys = db.relationship(
        'ApiKey', backref='user', lazy='dynamic',
        cascade='all, delete-orphan'
    )
    presets = db.relationship(
        'ParamPreset', backref='user', lazy='dynamic',
        cascade='all, delete-orphan'
    )

    def to_dict(self):
        """转为字典（不含密码）"""
        return {
            'email': self.email,
            'nickname': self.nickname,
            'role': self.role,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
