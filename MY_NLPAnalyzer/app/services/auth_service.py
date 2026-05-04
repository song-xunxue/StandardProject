"""
JWT 认证服务（SQLAlchemy 版本）

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 新建认证服务，支持邮箱注册/登录
  2. 使用 bcrypt 哈希密码，PyJWT 生成令牌
  3. 用户数据存储在内存字典中（Phase 2.2）

2026-04-28
变更说明：
  1. 用户存储从内存字典迁移到 Redis Hash
  2. 新增 JWT Token 黑名单机制（支持主动登出/令牌吊销）
  3. 启动时自动预置默认管理员账户

2026-05-04
变更说明：
  1. 用户存储从 Redis Hash 迁移到 SQLAlchemy ORM
  2. JWT Token 黑名单仍使用 Redis（需要 TTL 自动过期）
"""

import bcrypt
import jwt
from datetime import datetime, timedelta, timezone

from app.config import Config
from app.extensions import db
from app.models.user import User
from app.services import redis_service as redis


# ========== Key 前缀 ==========

PREFIX_JWT_BLACKLIST = 'nlp:jwt_bl:'   # JWT 黑名单，TTL = token 剩余有效期（仍用 Redis）


def _seed_default_users():
    """预置默认用户（管理员账户），仅在数据库中不存在时创建"""
    admin_email = 'root@root'
    existing = User.query.filter_by(email=admin_email).first()
    if existing:
        return
    admin_password = 'root'
    admin_hash = bcrypt.hashpw(admin_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    admin = User(
        email=admin_email,
        password_hash=admin_hash,
        nickname='管理员',
        role='admin',
    )
    db.session.add(admin)
    db.session.commit()


def init_default_users():
    """应用启动时调用，确保默认用户存在"""
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

    # 检查邮箱是否已注册
    if User.query.filter_by(email=email).first():
        return False, '该邮箱已被注册', None

    if len(password) < 6:
        return False, '密码至少需要6位', None

    # bcrypt 哈希密码
    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    user = User(
        email=email,
        password_hash=password_hash,
        nickname=nickname or email.split('@')[0],
    )
    db.session.add(user)
    db.session.commit()

    return True, '注册成功', {
        'email': user.email,
        'nickname': user.nickname,
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

    user = User.query.filter_by(email=email).first()
    if not user:
        return False, '邮箱或密码错误', None

    if not bcrypt.checkpw(password.encode('utf-8'), user.password_hash.encode('utf-8')):
        return False, '邮箱或密码错误', None

    # 生成 JWT Token
    token = _create_token(user.email, user.nickname)

    return True, '登录成功', {
        'token': token,
        'user': {
            'email': user.email,
            'nickname': user.nickname,
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
        # 先检查黑名单（Redis）
        if redis.exists(PREFIX_JWT_BLACKLIST + token):
            return None

        payload = jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=[Config.JWT_ALGORITHM])
        email = payload.get('email')
        if not email:
            return None

        user = User.query.filter_by(email=email).first()
        if not user:
            return None

        return {
            'email': user.email,
            'nickname': user.nickname,
        }
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def blacklist_token(token):
    """
    将 Token 加入黑名单（用于登出，仍使用 Redis TTL）

    参数：
        token: JWT Token 字符串

    返回：
        bool，成功返回 True
    """
    try:
        payload = jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=[Config.JWT_ALGORITHM])
        exp = payload.get('exp', 0)
        # 计算剩余有效期
        now = datetime.now(timezone.utc).timestamp()
        remaining = int(exp - now)
        if remaining <= 0:
            # Token 已过期，无需加入黑名单
            return True
        # 设置黑名单，TTL = token 剩余有效期
        redis.set_value(PREFIX_JWT_BLACKLIST + token, '1', ex=remaining)
        return True
    except jwt.InvalidTokenError:
        return False


def get_user(email):
    """获取用户信息（不含密码）"""
    user = User.query.filter_by(email=email).first()
    if not user:
        return None
    return {
        'email': user.email,
        'nickname': user.nickname,
        'created_at': user.created_at.isoformat() if user.created_at else None,
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
