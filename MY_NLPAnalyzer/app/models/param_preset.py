"""
参数预设模型

作者: 李文煜
日期: 2026-05-04

2026-05-04
变更说明：
  1. 新建 ParamPreset ORM 模型，对应 param_presets 表
"""

from datetime import datetime, timezone

from app.extensions import db


class ParamPreset(db.Model):
    """参数预设表"""
    __tablename__ = 'param_presets'

    id = db.Column(db.String(8), primary_key=True)
    user_email = db.Column(
        db.String(120), db.ForeignKey('users.email'),
        nullable=False, index=True
    )
    name = db.Column(db.String(200), nullable=False)
    config = db.Column(db.Text, nullable=False, default='{}')  # JSON 字符串
    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self):
        """转为字典"""
        import json
        return {
            'id': self.id,
            'user_email': self.user_email,
            'name': self.name,
            'config': json.loads(self.config) if isinstance(self.config, str) else (self.config or {}),
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
