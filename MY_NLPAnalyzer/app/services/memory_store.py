"""
数据存储服务（SQLAlchemy 版本）

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

2026-05-04
变更说明：
  1. 将所有存储从 Redis 迁移到 SQLAlchemy ORM
  2. API Key 使用 Fernet 加密存储
  3. 保持与 Redis 版本完全相同的 API 接口
  4. 新增 add_doc_to_kb() 修复文档上传持久化问题
  5. 新增 Document 和 Chunk 的 CRUD 操作（Phase 3）
"""

import json
import uuid
from datetime import datetime, timezone

from app.extensions import db
from app.models.knowledge_base import KnowledgeBase
from app.models.conversation import Conversation, Message
from app.models.api_key import ApiKey
from app.models.param_preset import ParamPreset
from app.models.document import Document
from app.models.chunk import Chunk
from app.services import crypto_service


# ========== 知识库 ==========

def create_kb(user_email, name, description='', mode='multi_doc'):
    """创建知识库"""
    kb_id = str(uuid.uuid4())[:8]
    kb = KnowledgeBase(
        id=kb_id,
        user_email=user_email,
        name=name,
        description=description,
        mode=mode,
        docs='[]',
    )
    db.session.add(kb)
    db.session.commit()
    return kb.to_dict()


def list_kbs(user_email):
    """获取用户的知识库列表"""
    kbs = KnowledgeBase.query.filter_by(user_email=user_email).all()
    return [kb.to_dict() for kb in kbs]


def get_kb(kb_id, user_email):
    """获取单个知识库"""
    kb = KnowledgeBase.query.filter_by(id=kb_id, user_email=user_email).first()
    if not kb:
        return None
    return kb.to_dict()


def update_kb(kb_id, user_email, **kwargs):
    """更新知识库"""
    kb = KnowledgeBase.query.filter_by(id=kb_id, user_email=user_email).first()
    if not kb:
        return None
    for key in ('name', 'description', 'mode'):
        if key in kwargs:
            setattr(kb, key, kwargs[key])
    db.session.commit()
    return kb.to_dict()


def delete_kb(kb_id, user_email):
    """删除知识库（级联删除对话和消息）"""
    kb = KnowledgeBase.query.filter_by(id=kb_id, user_email=user_email).first()
    if not kb:
        return False
    db.session.delete(kb)
    db.session.commit()
    return True


def add_doc_to_kb(kb_id, user_email, doc):
    """
    向知识库添加文档记录（持久化）

    参数：
        kb_id: 知识库 ID
        user_email: 用户邮箱
        doc: 文档字典，如 {'filename': 'xxx.pdf', 'status': 'uploaded'}

    返回：
        更新后的知识库字典，失败返回 None
    """
    kb = KnowledgeBase.query.filter_by(id=kb_id, user_email=user_email).first()
    if not kb:
        return None
    docs = json.loads(kb.docs) if isinstance(kb.docs, str) else (kb.docs or [])
    docs.append(doc)
    kb.docs = json.dumps(docs, ensure_ascii=False)
    db.session.commit()
    return kb.to_dict()


# ========== 对话 ==========

def create_conversation(kb_id, user_email, title=''):
    """创建对话"""
    conv_id = str(uuid.uuid4())[:8]
    conv = Conversation(
        id=conv_id,
        kb_id=kb_id,
        user_email=user_email,
        title=title or f'对话 {conv_id}',
    )
    db.session.add(conv)
    db.session.commit()
    # 返回时包含空的 messages 列表
    result = conv.to_dict(include_messages=True)
    return result


def get_conversation(conv_id, user_email):
    """获取对话（含消息列表）"""
    conv = Conversation.query.filter_by(id=conv_id, user_email=user_email).first()
    if not conv:
        return None
    return conv.to_dict(include_messages=True)


def add_message(conv_id, role, content):
    """添加消息到对话"""
    conv = Conversation.query.filter_by(id=conv_id).first()
    if not conv:
        return None
    msg = Message(
        conv_id=conv_id,
        role=role,
        content=content,
    )
    db.session.add(msg)
    db.session.commit()
    return msg.to_dict()


# ========== API Key 管理 ==========

def save_api_key(user_email, provider, api_key, model_name='', base_url=''):
    """保存用户的 API Key（Fernet 加密存储）"""
    encrypted = crypto_service.encrypt(api_key)
    existing = ApiKey.query.filter_by(user_email=user_email, provider=provider).first()
    if existing:
        existing.encrypted_key = encrypted
        existing.model_name = model_name
        existing.base_url = base_url
    else:
        key_record = ApiKey(
            user_email=user_email,
            provider=provider,
            encrypted_key=encrypted,
            model_name=model_name,
            base_url=base_url,
        )
        db.session.add(key_record)
    db.session.commit()


def get_api_key(user_email, provider):
    """获取用户的 API Key（解密后返回明文）"""
    key_record = ApiKey.query.filter_by(user_email=user_email, provider=provider).first()
    if not key_record:
        return None
    decrypted_key = crypto_service.decrypt(key_record.encrypted_key)
    return {
        'provider': key_record.provider,
        'api_key': decrypted_key,
        'model_name': key_record.model_name,
        'base_url': key_record.base_url,
    }


def list_api_keys(user_email):
    """获取用户所有 API Key（脱敏显示）"""
    key_records = ApiKey.query.filter_by(user_email=user_email).all()
    keys = []
    for record in key_records:
        decrypted_key = crypto_service.decrypt(record.encrypted_key)
        masked = f"****{decrypted_key[-4:]}" if len(decrypted_key) > 4 else "****"
        keys.append({
            'provider': record.provider,
            'api_key_masked': masked,
            'model_name': record.model_name,
            'base_url': record.base_url,
        })
    return keys


def delete_api_key(user_email, provider):
    """删除用户的 API Key"""
    key_record = ApiKey.query.filter_by(user_email=user_email, provider=provider).first()
    if not key_record:
        return False
    db.session.delete(key_record)
    db.session.commit()
    return True


# ========== 参数预设 ==========

def save_preset(user_email, name, config):
    """保存参数预设"""
    preset_id = str(uuid.uuid4())[:8]
    config_str = config if isinstance(config, str) else json.dumps(config, ensure_ascii=False)
    preset = ParamPreset(
        id=preset_id,
        user_email=user_email,
        name=name,
        config=config_str,
    )
    db.session.add(preset)
    db.session.commit()
    return preset.to_dict()


def list_presets(user_email):
    """获取用户的参数预设列表"""
    presets = ParamPreset.query.filter_by(user_email=user_email).all()
    return [p.to_dict() for p in presets]


def delete_preset(preset_id, user_email):
    """删除参数预设"""
    preset = ParamPreset.query.filter_by(id=preset_id, user_email=user_email).first()
    if not preset:
        return False
    db.session.delete(preset)
    db.session.commit()
    return True


# ========== 文档管理 ==========

def create_document(kb_id, filename, file_path, file_size=0, mime_type='application/pdf'):
    """
    创建文档记录

    参数：
        kb_id: 知识库 ID
        filename: 原始文件名
        file_path: 磁盘相对路径
        file_size: 文件大小（字节）
        mime_type: MIME 类型

    返回：
        Document 对象
    """
    doc_id = str(uuid.uuid4())[:8]
    doc = Document(
        id=doc_id,
        kb_id=kb_id,
        filename=filename,
        file_path=file_path,
        file_size=file_size,
        mime_type=mime_type,
        status='uploaded',
    )
    db.session.add(doc)
    db.session.commit()
    return doc


def get_document(doc_id):
    """获取文档对象"""
    return Document.query.filter_by(id=doc_id).first()


def get_kb_documents(kb_id):
    """获取知识库的所有文档"""
    docs = Document.query.filter_by(kb_id=kb_id).order_by(Document.created_at.desc()).all()
    return [doc.to_dict() for doc in docs]


def update_document_status(doc_id, status, **kwargs):
    """
    更新文档状态

    参数：
        doc_id: 文档 ID
        status: 新状态（uploaded/processing/processed/failed）
        **kwargs: 可选更新字段（full_text, page_count, total_chars, error_message）
    """
    doc = Document.query.filter_by(id=doc_id).first()
    if not doc:
        return None
    doc.status = status
    for key in ('full_text', 'page_count', 'total_chars', 'error_message'):
        if key in kwargs:
            setattr(doc, key, kwargs[key])
    db.session.commit()
    return doc


def delete_document(doc_id):
    """
    删除文档（级联删除 chunks）

    返回：
        (success: bool, file_path: str or None)
    """
    doc = Document.query.filter_by(id=doc_id).first()
    if not doc:
        return False, None
    file_path = doc.file_path
    db.session.delete(doc)
    db.session.commit()
    return True, file_path


# ========== Chunk 管理 ==========

def create_chunks(doc_id, chunk_data_list):
    """
    批量创建 chunks

    参数：
        doc_id: 文档 ID
        chunk_data_list: 列表，每项为 dict: {content, char_count, page_start, page_end}

    返回：
        创建的 chunk 数量
    """
    chunks = []
    for i, data in enumerate(chunk_data_list):
        chunk = Chunk(
            doc_id=doc_id,
            chunk_index=i,
            content=data['content'],
            char_count=data['char_count'],
            page_start=data.get('page_start'),
            page_end=data.get('page_end'),
        )
        chunks.append(chunk)
    db.session.add_all(chunks)
    db.session.commit()
    return len(chunks)


def delete_chunks_by_doc(doc_id):
    """删除文档的所有 chunks"""
    Chunk.query.filter_by(doc_id=doc_id).delete()
    db.session.commit()


def get_chunks_by_doc(doc_id, page=1, per_page=50):
    """
    获取文档的 chunks（分页）

    参数：
        doc_id: 文档 ID
        page: 页码（从 1 开始）
        per_page: 每页数量

    返回：
        {'chunks': [dict], 'total': int, 'page': int, 'per_page': int}
    """
    pagination = Chunk.query.filter_by(doc_id=doc_id).order_by(Chunk.chunk_index)\
        .paginate(page=page, per_page=per_page, error_out=False)
    return {
        'chunks': [c.to_dict() for c in pagination.items],
        'total': pagination.total,
        'page': page,
        'per_page': per_page,
    }
