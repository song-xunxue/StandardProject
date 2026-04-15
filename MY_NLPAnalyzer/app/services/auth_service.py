"""
JWT 认证服务

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 新建认证服务，支持邮箱注册/登录
  2. 使用 bcrypt 哈希密码，PyJWT 生成令牌
  3. 用户数据存储在内存字典中（Phase 2.2）
"""

import bcrypt
import jwt
from datetime import datetime, timedelta, timezone

from app.config import Config


# 内存用户存储：email → {password_hash, nickname, created_at}
_users = {}


def _seed_default_users():
    """预置默认用户（管理员账户）"""
    # 管理员账户
    admin_email = 'root@root'
    admin_password = 'root'
    admin_hash = bcrypt.hashpw(admin_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    _users[admin_email] = {
        'email': admin_email,
        'password_hash': admin_hash,
        'nickname': '管理员',
        'role': 'admin',
        'created_at': datetime.now(timezone.utc).isoformat()
    }


# 模块加载时自动预置用户
_seed_default_users()


def register(email, password, nickname=None):
    """
    注册新用户

    参数：
        email: 用户邮箱
        password: 明文密码
        nickname: 可选昵称

    返回：
        (success, message, data)
    """
    if not email or not password:
        return False, '邮箱和密码不能为空', None

    if email in _users:
        return False, '该邮箱已被注册', None

    if len(password) < 6:
        return False, '密码至少需要6位', None

    # bcrypt 哈希密码
    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    user = {
        'email': email,
        'password_hash': password_hash,
        'nickname': nickname or email.split('@')[0],
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    _users[email] = user

    return True, '注册成功', {
        'email': user['email'],
        'nickname': user['nickname']
    }


def login(email, password):
    """
    用户登录

    参数：
        email: 用户邮箱
        password: 明文密码

    返回：
        (success, message, data)
    """
    if not email or not password:
        return False, '邮箱和密码不能为空', None

    user = _users.get(email)
    if not user:
        return False, '邮箱或密码错误', None

    if not bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
        return False, '邮箱或密码错误', None

    # 生成 JWT Token
    token = _create_token(email, user['nickname'])

    return True, '登录成功', {
        'token': token,
        'user': {
            'email': user['email'],
            'nickname': user['nickname']
        }
    }


def verify_token(token):
    """
    验证 JWT Token

    参数：
        token: JWT Token 字符串

    返回：
        验证成功返回用户信息字典，失败返回 None
    """
    try:
        payload = jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=[Config.JWT_ALGORITHM])
        email = payload.get('email')
        if not email or email not in _users:
            return None
        user = _users[email]
        return {
            'email': user['email'],
            'nickname': user['nickname']
        }
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def get_user(email):
    """获取用户信息（不含密码）"""
    user = _users.get(email)
    if not user:
        return None
    return {
        'email': user['email'],
        'nickname': user['nickname'],
        'created_at': user['created_at']
    }


def _create_token(email, nickname):
    """生成 JWT Token"""
    expire = datetime.now(timezone.utc) + timedelta(hours=Config.JWT_EXPIRE_HOURS)
    payload = {
        'email': email,
        'nickname': nickname,
        'exp': expire
    }
    return jwt.encode(payload, Config.JWT_SECRET_KEY, algorithm=Config.JWT_ALGORITHM)
