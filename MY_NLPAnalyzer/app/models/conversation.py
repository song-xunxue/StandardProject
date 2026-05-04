"""
对话与消息模型

作者: 李文煜
日期: 2026-05-04

2026-05-04
变更说明：
  1. 新建 Conversation 和 Message ORM 模型
"""

from datetime import datetime, timezone

from app.extensions import db


class Conversation(db.Model):
    """对话表"""
    __tablename__ = 'conversations'

    id = db.Column(db.String(8), primary_key=True)
    kb_id = db.Column(
        db.String(8), db.ForeignKey('knowledge_bases.id'),
        nullable=False, index=True
    )
    user_email = db.Column(
        db.String(120), db.ForeignKey('users.email'),
        nullable=False, index=True
    )
    title = db.Column(db.String(200), nullable=False, default='')
    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    # 关系
    messages = db.relationship(
        'Message', backref='conversation', lazy='dynamic',
        cascade='all, delete-orphan',
        order_by='Message.timestamp'
    )

    def to_dict(self, include_messages=True):
        """转为字典"""
        result = {
            'id': self.id,
            'kb_id': self.kb_id,
            'user_email': self.user_email,
            'title': self.title,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_messages:
            result['messages'] = [m.to_dict() for m in self.messages.all()]
        return result


class Message(db.Model):
    """消息表"""
    __tablename__ = 'messages'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    conv_id = db.Column(
        db.String(8), db.ForeignKey('conversations.id'),
        nullable=False, index=True
    )
    role = db.Column(db.String(20), nullable=False)  # 'user' | 'assistant'
    content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self):
        """转为字典"""
        return {
            'role': self.role,
            'content': self.content,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
        }
