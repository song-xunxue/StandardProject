"""
Redis 缓存服务

作者: 李文煜
日期: 2026-04-28

2026-04-28
变更说明：
  1. 新建 Redis 服务模块，提供连接池管理和 JSON 序列化辅助函数
  2. 支持字符串/字典/列表的存取、TTL 管理、集合操作
"""

import json
import redis

from app.config import Config


# Redis 连接池（延迟初始化）
_pool = None
_client = None


def init_redis():
    """
    初始化 Redis 连接池

    在 Flask 应用工厂中调用，确保应用启动时建立连接
    """
    global _pool, _client
    _pool = redis.ConnectionPool.from_url(
        Config.REDIS_URL,
        max_connections=20,
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
        retry_on_timeout=True,
    )
    _client = redis.Redis(connection_pool=_pool)
    # 测试连接
    _client.ping()
    return _client


def get_client():
    """
    获取 Redis 客户端实例

    返回：
        redis.Redis 实例
    """
    if _client is None:
        return init_redis()
    return _client


# ========== 通用辅助函数 ==========

def _json_dumps(obj):
    """JSON 序列化，确保中文不转义"""
    return json.dumps(obj, ensure_ascii=False)


def set_value(key, value, ex=None):
    """
    存储值到 Redis（自动 JSON 序列化）

    参数：
        key: Redis 键
        value: Python 对象（字典、列表、字符串等）
        ex: 过期时间（秒），None 表示永不过期
    """
    client = get_client()
    data = _json_dumps(value)
    if ex:
        client.setex(key, ex, data)
    else:
        client.set(key, data)


def get_value(key):
    """
    从 Redis 获取值（自动 JSON 反序列化）

    参数：
        key: Redis 键

    返回：
        Python 对象，键不存在时返回 None
    """
    client = get_client()
    data = client.get(key)
    if data is None:
        return None
    return json.loads(data)


def delete_key(key):
    """
    删除 Redis 键

    参数：
        key: Redis 键

    返回：
        删除的键数量
    """
    client = get_client()
    return client.delete(key)


def exists(key):
    """
    检查键是否存在

    参数：
        key: Redis 键

    返回：
        bool
    """
    client = get_client()
    return bool(client.exists(key))


def set_expire(key, seconds):
    """
    设置键的过期时间

    参数：
        key: Redis 键
        seconds: 过期时间（秒）
    """
    client = get_client()
    client.expire(key, seconds)


def get_ttl(key):
    """
    获取键的剩余生存时间

    参数：
        key: Redis 键

    返回：
        剩余秒数，-1 表示永不过期，-2 表示键不存在
    """
    client = get_client()
    return client.ttl(key)


# ========== Hash 操作 ==========

def hset_dict(key, mapping):
    """
    存储字典到 Redis Hash（值自动 JSON 序列化）

    参数：
        key: Redis 键
        mapping: 字典
    """
    client = get_client()
    serialized = {k: _json_dumps(v) for k, v in mapping.items()}
    client.hset(key, mapping=serialized)


def hget_dict(key):
    """
    从 Redis Hash 获取完整字典（值自动 JSON 反序列化）

    参数：
        key: Redis 键

    返回：
        dict，键不存在时返回空字典
    """
    client = get_client()
    data = client.hgetall(key)
    if not data:
        return {}
    return {k: json.loads(v) for k, v in data.items()}


# ========== Set 操作 ==========

def sadd(key, *members):
    """
    向集合添加成员

    参数：
        key: Redis 键
        *members: 成员列表
    """
    client = get_client()
    client.sadd(key, *members)


def srem(key, *members):
    """
    从集合移除成员

    参数：
        key: Redis 键
        *members: 成员列表
    """
    client = get_client()
    client.srem(key, *members)


def smembers(key):
    """
    获取集合所有成员

    参数：
        key: Redis 键

    返回：
        set
    """
    client = get_client()
    return client.smembers(key)


def scard(key):
    """
    获取集合成员数量

    参数：
        key: Redis 键

    返回：
        int
    """
    client = get_client()
    return client.scard(key)
