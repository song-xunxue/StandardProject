"""
数据存储服务（Redis 版本）

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 新建内存存储服务，临时替代数据库
  2. 提供知识库、对话、API Key、参数预设的 CRUD 操作

2026-04-28
变更说明：
  1. 将所有存储从内存字典迁移到 Redis
  2. 使用 Redis Hash + Set 管理数据索引
  3. 保持与原内存版本完全相同的 API 接口
"""

import uuid
from datetime import datetime, timezone

from app.services import redis_service as redis


# ========== Key 前缀 ==========

PREFIX_KB = 'nlp:kb:'
PREFIX_KB_INDEX = 'nlp:user_kbs:'
PREFIX_CONV = 'nlp:conv:'
PREFIX_CONV_INDEX = 'nlp:user_convs:'
PREFIX_APIKEY = 'nlp:apikey:'
PREFIX_APIKEY_INDEX = 'nlp:user_apikeys:'
PREFIX_PRESET = 'nlp:preset:'
PREFIX_PRESET_INDEX = 'nlp:user_presets:'


# ========== 知识库 ==========

def create_kb(user_email, name, description='', mode='multi_doc'):
    """创建知识库"""
    kb_id = str(uuid.uuid4())[:8]
    kb = {
        'id': kb_id,
        'user_email': user_email,
        'name': name,
        'description': description,
        'mode': mode,
        'docs': [],
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    # 存储知识库数据
    redis.hset_dict(PREFIX_KB + kb_id, kb)
    # 添加到用户的知识库索引
    redis.sadd(PREFIX_KB_INDEX + user_email, kb_id)
    return kb


def list_kbs(user_email):
    """获取用户的知识库列表"""
    kb_ids = redis.smembers(PREFIX_KB_INDEX + user_email)
    result = []
    for kb_id in kb_ids:
        kb = redis.hget_dict(PREFIX_KB + kb_id)
        if kb:
            result.append(kb)
        else:
            # 数据不一致，清理索引
            redis.srem(PREFIX_KB_INDEX + user_email, kb_id)
    return result


def get_kb(kb_id, user_email):
    """获取单个知识库"""
    kb = redis.hget_dict(PREFIX_KB + kb_id)
    if not kb or kb.get('user_email') != user_email:
        return None
    return kb


def update_kb(kb_id, user_email, **kwargs):
    """更新知识库"""
    kb = redis.hget_dict(PREFIX_KB + kb_id)
    if not kb or kb.get('user_email') != user_email:
        return None
    for key in ('name', 'description', 'mode'):
        if key in kwargs:
            kb[key] = kwargs[key]
    redis.hset_dict(PREFIX_KB + kb_id, kb)
    return kb


def delete_kb(kb_id, user_email):
    """删除知识库"""
    kb = redis.hget_dict(PREFIX_KB + kb_id)
    if not kb or kb.get('user_email') != user_email:
        return False
    redis.delete_key(PREFIX_KB + kb_id)
    redis.srem(PREFIX_KB_INDEX + user_email, kb_id)
    return True


# ========== 对话 ==========

def create_conversation(kb_id, user_email, title=''):
    """创建对话"""
    conv_id = str(uuid.uuid4())[:8]
    conv = {
        'id': conv_id,
        'kb_id': kb_id,
        'user_email': user_email,
        'title': title or f'对话 {conv_id}',
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    # 存储对话元数据
    redis.hset_dict(PREFIX_CONV + conv_id, conv)
    # 消息列表单独存储（用 JSON 数组）
    redis.set_value(PREFIX_CONV + conv_id + ':messages', [])
    # 添加到用户的对话索引
    redis.sadd(PREFIX_CONV_INDEX + user_email, conv_id)
    conv['messages'] = []
    return conv


def get_conversation(conv_id, user_email):
    """获取对话（含消息列表）"""
    conv = redis.hget_dict(PREFIX_CONV + conv_id)
    if not conv or conv.get('user_email') != user_email:
        return None
    # 读取消息列表
    conv['messages'] = redis.get_value(PREFIX_CONV + conv_id + ':messages') or []
    return conv


def add_message(conv_id, role, content):
    """添加消息到对话"""
    conv = redis.hget_dict(PREFIX_CONV + conv_id)
    if not conv:
        return None
    msg_key = PREFIX_CONV + conv_id + ':messages'
    messages = redis.get_value(msg_key) or []
    msg = {
        'role': role,
        'content': content,
        'timestamp': datetime.now(timezone.utc).isoformat()
    }
    messages.append(msg)
    redis.set_value(msg_key, messages)
    return msg


# ========== API Key 管理 ==========

def save_api_key(user_email, provider, api_key, model_name='', base_url=''):
    """保存用户的 API Key"""
    key_data = {
        'provider': provider,
        'api_key': api_key,
        'model_name': model_name,
        'base_url': base_url
    }
    # 存储 API Key 数据
    redis.hset_dict(PREFIX_APIKEY + user_email + ':' + provider, key_data)
    # 添加到用户索引
    redis.sadd(PREFIX_APIKEY_INDEX + user_email, provider)


def get_api_key(user_email, provider):
    """获取用户的 API Key"""
    return redis.hget_dict(PREFIX_APIKEY + user_email + ':' + provider) or None


def list_api_keys(user_email):
    """获取用户所有 API Key（脱敏）"""
    providers = redis.smembers(PREFIX_APIKEY_INDEX + user_email)
    keys = []
    for provider in providers:
        info = redis.hget_dict(PREFIX_APIKEY + user_email + ':' + provider)
        if not info:
            redis.srem(PREFIX_APIKEY_INDEX + user_email, provider)
            continue
        key = info.get('api_key', '')
        masked = f"****{key[-4:]}" if len(key) > 4 else "****"
        keys.append({
            'provider': provider,
            'api_key_masked': masked,
            'model_name': info.get('model_name', ''),
            'base_url': info.get('base_url', '')
        })
    return keys


def delete_api_key(user_email, provider):
    """删除用户的 API Key"""
    key = PREFIX_APIKEY + user_email + ':' + provider
    if not redis.exists(key):
        return False
    redis.delete_key(key)
    redis.srem(PREFIX_APIKEY_INDEX + user_email, provider)
    return True


# ========== 参数预设 ==========

def save_preset(user_email, name, config):
    """保存参数预设"""
    preset_id = str(uuid.uuid4())[:8]
    preset = {
        'id': preset_id,
        'user_email': user_email,
        'name': name,
        'config': config,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    redis.hset_dict(PREFIX_PRESET + preset_id, preset)
    redis.sadd(PREFIX_PRESET_INDEX + user_email, preset_id)
    return preset


def list_presets(user_email):
    """获取用户的参数预设列表"""
    preset_ids = redis.smembers(PREFIX_PRESET_INDEX + user_email)
    result = []
    for pid in preset_ids:
        preset = redis.hget_dict(PREFIX_PRESET + pid)
        if preset:
            result.append(preset)
        else:
            redis.srem(PREFIX_PRESET_INDEX + user_email, pid)
    return result


def delete_preset(preset_id, user_email):
    """删除参数预设"""
    preset = redis.hget_dict(PREFIX_PRESET + preset_id)
    if not preset or preset.get('user_email') != user_email:
        return False
    redis.delete_key(PREFIX_PRESET + preset_id)
    redis.srem(PREFIX_PRESET_INDEX + user_email, preset_id)
    return True
