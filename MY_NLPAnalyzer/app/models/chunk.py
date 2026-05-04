"""
文档切分块模型

作者: 李文煜
日期: 2026-05-04

2026-05-04
变更说明：
  1. 新建 Chunk ORM 模型，对应 chunks 表
  2. Phase 4 预留 vector_id 字段用于 FAISS 向量关联
"""

from datetime import datetime, timezone

from app.extensions import db


class Chunk(db.Model):
    """文档切分块表"""
    __tablename__ = 'chunks'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    doc_id = db.Column(
        db.String(8), db.ForeignKey('documents.id'),
        nullable=False, index=True
    )
    chunk_index = db.Column(db.Integer, nullable=False)
    content = db.Column(db.Text, nullable=False)
    char_count = db.Column(db.Integer, nullable=False)
    page_start = db.Column(db.Integer, nullable=True)
    page_end = db.Column(db.Integer, nullable=True)
    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    # Phase 4 预留：FAISS 向量关联
    # vector_id = db.Column(db.String(100), nullable=True)

    def to_dict(self):
        """转为字典"""
        return {
            'id': self.id,
            'doc_id': self.doc_id,
            'chunk_index': self.chunk_index,
            'content': self.content,
            'char_count': self.char_count,
            'page_start': self.page_start,
            'page_end': self.page_end,
        }
