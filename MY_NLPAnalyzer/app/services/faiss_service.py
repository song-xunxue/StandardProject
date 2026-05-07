"""
FAISS 索引管理服务

作者: 李文煜
日期: 2026-05-07

2026-05-07
变更说明：
  1. 新建 FAISS 索引管理服务
  2. 支持每个知识库独立的 FAISS 索引（构建、检索、删除、状态查询）
  3. 使用 langchain_community.vectorstores.FAISS 封装
  4. 内存缓存 + 磁盘持久化
"""

import json
import os
import shutil

from app.config import Config
from app.extensions import db
from app.models.chunk import Chunk
from app.models.document import Document
from app.services import memory_store
from app.services import embedding_service


# 索引内存缓存 {kb_id: FAISS 实例}
_index_cache = {}


def build_kb_index(kb_id, embedding_config):
    """
    构建知识库的 FAISS 索引（全量重建）

    流程：
    1. 查询该知识库下所有 processed 文档的 chunks
    2. 批量向量化所有 chunk 文本
    3. 构建 FAISS 索引
    4. 保存索引到磁盘
    5. 更新所有 chunk 的 vector_id 和 embedding_status

    参数：
        kb_id: 知识库 ID
        embedding_config: Embedding 提供商配置

    返回：
        (success, result_or_error)
    """
    # 1. 获取知识库下所有 processed 文档的 chunks
    docs = Document.query.filter_by(kb_id=kb_id, status='processed').all()
    if not docs:
        return False, '知识库下没有已处理的文档'

    doc_ids = [doc.id for doc in docs]
    chunks = Chunk.query.filter(Chunk.doc_id.in_(doc_ids)).order_by(Chunk.id).all()

    if not chunks:
        return False, '知识库下没有可向量化的文本块'

    try:
        # 2. 获取 Embeddings 实例
        embeddings = embedding_service.get_embeddings(embedding_config)

        # 3. 批量向量化并构建 FAISS 索引
        texts = [c.content for c in chunks]
        metadatas = [{'chunk_id': c.id, 'doc_id': c.doc_id} for c in chunks]

        from langchain_community.vectorstores import FAISS
        faiss_index = FAISS.from_texts(
            texts=texts,
            embedding=embeddings,
            metadatas=metadatas,
        )

        # 4. 保存索引到磁盘
        index_dir = os.path.join(Config.FAISS_INDEX_DIR, kb_id)
        if os.path.exists(index_dir):
            shutil.rmtree(index_dir)
        os.makedirs(index_dir, exist_ok=True)
        faiss_index.save_local(index_dir)

        # 5. 更新缓存
        _index_cache[kb_id] = faiss_index

        # 6. 更新 chunk 的 vector_id 和 embedding_status
        # FAISS 索引的内部 id 从 0 开始，与 texts 列表顺序一致
        for i, chunk in enumerate(chunks):
            chunk.vector_id = i
            chunk.embedding_status = 'embedded'
        db.session.commit()

        # 7. 更新知识库的 embedding_config
        from app.models.knowledge_base import KnowledgeBase
        kb = KnowledgeBase.query.filter_by(id=kb_id).first()
        if kb:
            kb.embedding_config = json.dumps(embedding_config, ensure_ascii=False)
            db.session.commit()

        return True, {
            'kb_id': kb_id,
            'vector_count': len(chunks),
            'doc_count': len(docs),
        }

    except Exception as e:
        db.session.rollback()
        # 标记失败的 chunks
        for chunk in chunks:
            chunk.embedding_status = 'failed'
        db.session.commit()
        return False, f'构建索引失败: {str(e)}'


def incremental_embed_doc(doc_id, embedding_config):
    """
    增量向量化单个文档（文档上传后自动触发）

    流程：
    1. 获取文档的 pending chunks
    2. 加载知识库的已有 FAISS 索引（或创建新的）
    3. 将新 chunks 的向量添加到索引
    4. 保存索引
    5. 更新 chunk 状态

    参数：
        doc_id: 文档 ID
        embedding_config: Embedding 配置

    返回：
        (success, result_or_error)
    """
    doc = memory_store.get_document(doc_id)
    if not doc:
        return False, '文档不存在'

    chunks = Chunk.query.filter_by(doc_id=doc_id, embedding_status='pending').all()
    if not chunks:
        return True, '没有需要向量化的文本块'

    try:
        embeddings = embedding_service.get_embeddings(embedding_config)
        texts = [c.content for c in chunks]
        metadatas = [{'chunk_id': c.id, 'doc_id': c.doc_id} for c in chunks]

        from langchain_community.vectorstores import FAISS

        kb_id = doc.kb_id
        index_dir = os.path.join(Config.FAISS_INDEX_DIR, kb_id)

        # 加载已有索引或创建新的
        if kb_id in _index_cache:
            faiss_index = _index_cache[kb_id]
        elif os.path.exists(os.path.join(index_dir, 'index.faiss')):
            faiss_index = FAISS.load_local(
                index_dir, embeddings,
                allow_dangerous_deserialization=True,
            )
        else:
            # 首次创建索引
            os.makedirs(index_dir, exist_ok=True)
            faiss_index = FAISS.from_texts(
                texts=texts,
                embedding=embeddings,
                metadatas=metadatas,
            )
            # 设置 vector_id（首次创建时 id 从 0 开始）
            for i, chunk in enumerate(chunks):
                chunk.vector_id = i
                chunk.embedding_status = 'embedded'
            faiss_index.save_local(index_dir)
            _index_cache[kb_id] = faiss_index
            db.session.commit()
            return True, {
                'doc_id': doc_id,
                'new_vectors': len(chunks),
                'mode': 'create',
            }

        # 增量添加：获取当前索引大小作为起始 vector_id
        existing_count = faiss_index.index.ntotal
        faiss_index.add_texts(
            texts=texts,
            metadatas=metadatas,
        )

        # 更新 vector_id
        for i, chunk in enumerate(chunks):
            chunk.vector_id = existing_count + i
            chunk.embedding_status = 'embedded'

        # 保存索引
        faiss_index.save_local(index_dir)
        _index_cache[kb_id] = faiss_index
        db.session.commit()

        return True, {
            'doc_id': doc_id,
            'new_vectors': len(chunks),
            'mode': 'incremental',
        }

    except Exception as e:
        db.session.rollback()
        for chunk in chunks:
            chunk.embedding_status = 'failed'
        db.session.commit()
        return False, f'向量化失败: {str(e)}'


def search(kb_id, query, embedding_config, top_k=3):
    """
    向量检索

    参数：
        kb_id: 知识库 ID
        query: 用户查询文本
        embedding_config: Embedding 配置
        top_k: 返回最相关的 K 个结果

    返回：
        [
            {'chunk_id': int, 'content': str, 'score': float,
             'doc_id': str, 'page_start': int, 'page_end': int},
            ...
        ]
    """
    from langchain_community.vectorstores import FAISS

    embeddings = embedding_service.get_embeddings(embedding_config)
    index_dir = os.path.join(Config.FAISS_INDEX_DIR, kb_id)

    # 加载索引
    if kb_id in _index_cache:
        faiss_index = _index_cache[kb_id]
    elif os.path.exists(os.path.join(index_dir, 'index.faiss')):
        faiss_index = FAISS.load_local(
            index_dir, embeddings,
            allow_dangerous_deserialization=True,
        )
        _index_cache[kb_id] = faiss_index
    else:
        return []

    # 检索
    results = faiss_index.similarity_search_with_score(
        query=query,
        k=top_k,
    )

    # 组装结果
    output = []
    for doc, score in results:
        chunk_id = doc.metadata.get('chunk_id')
        doc_id = doc.metadata.get('doc_id')

        # 从数据库获取完整的 chunk 信息
        chunk = Chunk.query.filter_by(id=chunk_id).first() if chunk_id else None

        output.append({
            'chunk_id': chunk_id,
            'doc_id': doc_id,
            'content': doc.page_content,
            'score': float(score),
            'page_start': chunk.page_start if chunk else None,
            'page_end': chunk.page_end if chunk else None,
            'char_count': chunk.char_count if chunk else len(doc.page_content),
        })

    return output


def delete_doc_vectors(doc_id):
    """
    从 FAISS 索引中删除文档的所有向量

    FAISS 不支持原生删除，策略是标记后重建。
    当文档删除时，其 chunks 的 embedding_status 改回 pending，
    并建议用户重建索引。

    参数：
        doc_id: 文档 ID

    返回：
        (success, message)
    """
    chunks = Chunk.query.filter_by(doc_id=doc_id, embedding_status='embedded').all()
    if not chunks:
        return True, '无需处理'

    # 标记为 pending（逻辑删除）
    for chunk in chunks:
        chunk.vector_id = None
        chunk.embedding_status = 'pending'
    db.session.commit()

    # 清除缓存，下次检索时会触发全量重建
    doc = memory_store.get_document(doc_id)
    if doc:
        _invalidate_cache(doc.kb_id)

    return True, f'已标记 {len(chunks)} 个向量为待重建'


def get_index_status(kb_id):
    """
    获取知识库的索引状态

    返回：
        {
            'indexed': bool,
            'vector_count': int,
            'total_chunks': int,
            'embedded_chunks': int,
            'pending_chunks': int,
            'failed_chunks': int,
        }
    """
    docs = Document.query.filter_by(kb_id=kb_id, status='processed').all()
    doc_ids = [doc.id for doc in docs]

    if not doc_ids:
        return {
            'indexed': False,
            'vector_count': 0,
            'total_chunks': 0,
            'embedded_chunks': 0,
            'pending_chunks': 0,
            'failed_chunks': 0,
        }

    total = Chunk.query.filter(Chunk.doc_id.in_(doc_ids)).count()
    embedded = Chunk.query.filter(Chunk.doc_id.in_(doc_ids), Chunk.embedding_status == 'embedded').count()
    pending = Chunk.query.filter(Chunk.doc_id.in_(doc_ids), Chunk.embedding_status == 'pending').count()
    failed = Chunk.query.filter(Chunk.doc_id.in_(doc_ids), Chunk.embedding_status == 'failed').count()

    # 检查索引文件是否存在
    index_dir = os.path.join(Config.FAISS_INDEX_DIR, kb_id)
    index_exists = os.path.exists(os.path.join(index_dir, 'index.faiss'))

    return {
        'indexed': index_exists and embedded > 0,
        'vector_count': embedded,
        'total_chunks': total,
        'embedded_chunks': embedded,
        'pending_chunks': pending,
        'failed_chunks': failed,
    }


def delete_kb_index(kb_id):
    """
    删除知识库的整个 FAISS 索引目录（知识库删除时调用）

    参数：
        kb_id: 知识库 ID
    """
    _invalidate_cache(kb_id)
    index_dir = os.path.join(Config.FAISS_INDEX_DIR, kb_id)
    if os.path.exists(index_dir):
        shutil.rmtree(index_dir)


def _invalidate_cache(kb_id):
    """清除指定知识库的索引缓存"""
    if kb_id in _index_cache:
        del _index_cache[kb_id]
