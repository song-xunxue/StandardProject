"""
JWT 鉴权装饰器

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 新建 JWT 鉴权中间件，用于保护需要登录的 API
"""

from functools import wraps
from flask import request, g

from app.services import auth_service
from app.utils import unauthorized_response


def login_required(f):
    """JWT 鉴权装饰器：验证请求头中的 Bearer Token"""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else ''

        if not token:
            return unauthorized_response('缺少认证令牌')

        user = auth_service.verify_token(token)
        if not user:
            return unauthorized_response('登录已过期或令牌无效，请重新登录')

        g.user = user
        return f(*args, **kwargs)

    return decorated
