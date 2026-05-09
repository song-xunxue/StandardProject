"""
文档模型

作者: 李文煜
日期: 2026-05-04

2026-05-04
变更说明：
  1. 新建 Document ORM 模型，对应 documents 表
  2. 支持文档生命周期：uploaded → processing → processed / failed
"""

from datetime import datetime, timezone

from app.extensions import db


class Document(db.Model):
    """知识库文档表"""
    __tablename__ = 'documents'

    id = db.Column(db.String(8), primary_key=True)
    kb_id = db.Column(
        db.String(8), db.ForeignKey('knowledge_bases.id'),
        nullable=False, index=True
    )
    filename = db.Column(db.String(500), nullable=False)
    file_path = db.Column(db.String(1000), nullable=False)
    file_size = db.Column(db.Integer, nullable=False, default=0)
    mime_type = db.Column(db.String(100), nullable=False, default='application/pdf')
    # 状态机：uploaded -> processing -> processed / failed
    status = db.Column(db.String(20), nullable=False, default='uploaded')
    page_count = db.Column(db.Integer, nullable=True)
    total_chars = db.Column(db.Integer, nullable=True)
    full_text = db.Column(db.Text, nullable=True)
    error_message = db.Column(db.Text, nullable=True)
    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )

    # 关系（不使用 cascade，由路由层显式控制删除顺序）
    chunks = db.relationship(
        'Chunk', backref='document', lazy='dynamic'
    )

    def to_dict(self, include_full_text=False):
        """转为字典"""
        result = {
            'id': self.id,
            'kb_id': self.kb_id,
            'filename': self.filename,
            'file_size': self.file_size,
            'mime_type': self.mime_type,
            'status': self.status,
            'page_count': self.page_count,
            'total_chars': self.total_chars,
            'error_message': self.error_message,
            'chunk_count': self.chunks.count(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_full_text:
            result['full_text'] = self.full_text
        return result
