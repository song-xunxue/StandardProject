"""
内存数据存储服务

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 新建内存存储服务，临时替代数据库
  2. 提供知识库、对话、API Key、参数预设的 CRUD 操作
"""

import uuid
from datetime import datetime, timezone


# 存储字典
_knowledge_bases = {}  # kb_id → {id, user_email, name, description, mode, docs, created_at}
_conversations = {}    # conv_id → {id, kb_id, user_email, title, messages, created_at}
_api_keys = {}         # (user_email, provider) → {provider, api_key, model_name, base_url}
_presets = {}          # preset_id → {id, user_email, name, config, created_at}


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
    _knowledge_bases[kb_id] = kb
    return kb


def list_kbs(user_email):
    """获取用户的知识库列表"""
    return [kb for kb in _knowledge_bases.values() if kb['user_email'] == user_email]


def get_kb(kb_id, user_email):
    """获取单个知识库"""
    kb = _knowledge_bases.get(kb_id)
    if not kb or kb['user_email'] != user_email:
        return None
    return kb


def update_kb(kb_id, user_email, **kwargs):
    """更新知识库"""
    kb = _knowledge_bases.get(kb_id)
    if not kb or kb['user_email'] != user_email:
        return None
    for key in ('name', 'description', 'mode'):
        if key in kwargs:
            kb[key] = kwargs[key]
    return kb


def delete_kb(kb_id, user_email):
    """删除知识库"""
    kb = _knowledge_bases.get(kb_id)
    if not kb or kb['user_email'] != user_email:
        return False
    del _knowledge_bases[kb_id]
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
        'messages': [],
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    _conversations[conv_id] = conv
    return conv


def get_conversation(conv_id, user_email):
    """获取对话"""
    conv = _conversations.get(conv_id)
    if not conv or conv['user_email'] != user_email:
        return None
    return conv


def add_message(conv_id, role, content):
    """添加消息到对话"""
    conv = _conversations.get(conv_id)
    if not conv:
        return None
    msg = {
        'role': role,
        'content': content,
        'timestamp': datetime.now(timezone.utc).isoformat()
    }
    conv['messages'].append(msg)
    return msg


# ========== API Key 管理 ==========

def save_api_key(user_email, provider, api_key, model_name='', base_url=''):
    """保存用户的 API Key"""
    _api_keys[(user_email, provider)] = {
        'provider': provider,
        'api_key': api_key,
        'model_name': model_name,
        'base_url': base_url
    }


def get_api_key(user_email, provider):
    """获取用户的 API Key"""
    return _api_keys.get((user_email, provider))


def list_api_keys(user_email):
    """获取用户所有 API Key（脱敏）"""
    keys = []
    for (email, provider), info in _api_keys.items():
        if email == user_email:
            key = info['api_key']
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
    key = (user_email, provider)
    if key in _api_keys:
        del _api_keys[key]
        return True
    return False


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
    _presets[preset_id] = preset
    return preset


def list_presets(user_email):
    """获取用户的参数预设列表"""
    return [p for p in _presets.values() if p['user_email'] == user_email]


def delete_preset(preset_id, user_email):
    """删除参数预设"""
    preset = _presets.get(preset_id)
    if not preset or preset['user_email'] != user_email:
        return False
    del _presets[preset_id]
    return True
