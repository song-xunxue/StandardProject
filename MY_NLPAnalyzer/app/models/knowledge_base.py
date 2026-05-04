"""
知识库模型

作者: 李文煜
日期: 2026-05-04

2026-05-04
变更说明：
  1. 新建 KnowledgeBase ORM 模型，对应 knowledge_bases 表
"""

from datetime import datetime, timezone

from app.extensions import db


class KnowledgeBase(db.Model):
    """知识库表"""
    __tablename__ = 'knowledge_bases'

    id = db.Column(db.String(8), primary_key=True)
    user_email = db.Column(
        db.String(120), db.ForeignKey('users.email'),
        nullable=False, index=True
    )
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=False, default='')
    mode = db.Column(db.String(20), nullable=False, default='multi_doc')
    docs = db.Column(db.Text, nullable=False, default='[]')  # JSON 数组字符串
    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    # 关系
    conversations = db.relationship(
        'Conversation', backref='knowledge_base', lazy='dynamic'
    )
    documents = db.relationship(
        'Document', backref='knowledge_base', lazy='dynamic',
        cascade='all, delete-orphan'
    )

    def to_dict(self):
        """转为字典"""
        import json
        return {
            'id': self.id,
            'user_email': self.user_email,
            'name': self.name,
            'description': self.description,
            'mode': self.mode,
            'docs': json.loads(self.docs) if isinstance(self.docs, str) else (self.docs or []),
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
