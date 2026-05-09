"""
文档处理核心服务

作者: 李文煜
日期: 2026-05-04

2026-05-04
变更说明：
  1. 新建文档处理服务，包含 PDF 解析、RecursiveCharacterTextSplitter 切分、存储
  2. 支持重新切分（参数变更时从 full_text 重新切分）

2026-05-07
变更说明：
  1. 文档处理完成后自动触发 FAISS 向量化（Phase 4.2）
  2. 重新切分后触发增量向量化
"""

import os

from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import Config
from app.extensions import db
from app.models.document import Document
from app.services import memory_store, pdf_parser


# 中文友好的分隔符优先级
CHUNK_SEPARATORS = ["\n\n", "\n", "。", "！", "？", ".", " ", ""]


def process_document(doc_id, chunk_size=500, chunk_overlap=50):
    """
    处理单个文档：解析 PDF 全文 → 切分 → 存储 chunks

    参数：
        doc_id: Document 记录 ID
        chunk_size: 切分块大小（字符数）
        chunk_overlap: 重叠字符数

    返回：
        (success: bool, result_or_error: dict or str)
    """
    doc = memory_store.get_document(doc_id)
    if not doc:
        return False, '文档不存在'

    # 更新状态为处理中
    memory_store.update_document_status(doc_id, 'processing')

    try:
        # 构建完整文件路径
        full_path = os.path.join(Config.UPLOAD_FOLDER, doc.file_path)

        if not os.path.exists(full_path):
            memory_store.update_document_status(doc_id, 'failed', error_message='文件不存在')
            return False, '文件不存在'

        # 解析 PDF 全文
        success, result = pdf_parser.parse_pdf_full(full_path)
        if not success:
            memory_store.update_document_status(doc_id, 'failed', error_message=result)
            return False, result

        # 更新文档元数据
        doc.full_text = result['full_text']
        doc.page_count = result['page_count']
        doc.total_chars = result['total_chars']
        db.session.commit()

        # 切分
        chunk_data_list = _split_documents(result['lc_documents'], chunk_size, chunk_overlap)

        # 存储 chunks
        chunk_count = memory_store.create_chunks(doc_id, chunk_data_list)

        # 更新状态为已完成
        memory_store.update_document_status(doc_id, 'processed')

        doc_dict = memory_store.get_document(doc_id).to_dict()
        doc_dict['chunk_count'] = chunk_count

        # Phase 4.2: 文档处理完成后自动触发向量化
        _auto_embed_doc(doc_id)

        return True, doc_dict

    except Exception as e:
        db.session.rollback()
        memory_store.update_document_status(doc_id, 'failed', error_message=str(e))
        return False, str(e)


def rechunk_document(doc_id, chunk_size=500, chunk_overlap=50):
    """
    基于已有 full_text 重新切分文档

    不需要重新解析 PDF，直接从 full_text 切分。
    删除旧 chunks，创建新 chunks。

    参数：
        doc_id: Document 记录 ID
        chunk_size: 切分块大小
        chunk_overlap: 重叠字符数

    返回：
        (success: bool, result_or_error)
    """
    doc = memory_store.get_document(doc_id)
    if not doc:
        return False, '文档不存在'

    if not doc.full_text:
        return False, '文档尚未解析，无法重新切分'

    if doc.status != 'processed':
        return False, f'文档当前状态为 {doc.status}，无法重新切分'

    try:
        # 删除旧 chunks
        memory_store.delete_chunks_by_doc(doc_id)

        # 从 full_text 构造 Langchain Document
        from langchain_core.documents import Document as LCDocument
        lc_doc = LCDocument(page_content=doc.full_text, metadata={})

        # 切分
        chunk_data_list = _split_documents([lc_doc], chunk_size, chunk_overlap)

        # 存储新 chunks
        chunk_count = memory_store.create_chunks(doc_id, chunk_data_list)

        # Phase 4.2: 重新切分后触发增量向量化
        _auto_embed_doc(doc_id)

        return True, {
            'doc_id': doc_id,
            'chunk_count': chunk_count,
            'chunk_size': chunk_size,
            'chunk_overlap': chunk_overlap,
        }

    except Exception as e:
        db.session.rollback()
        return False, str(e)


def _split_documents(lc_documents, chunk_size, chunk_overlap):
    """
    使用 RecursiveCharacterTextSplitter 切分文档

    参数：
        lc_documents: Langchain Document 对象列表
        chunk_size: 切分块大小
        chunk_overlap: 重叠字符数

    返回：
        chunk_data_list: [{content, char_count, page_start, page_end}, ...]
    """
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        separators=CHUNK_SEPARATORS,
    )

    split_chunks = text_splitter.split_documents(lc_documents)

    chunk_data_list = []
    for lc_chunk in split_chunks:
        page = lc_chunk.metadata.get('page', None)
        chunk_data_list.append({
            'content': lc_chunk.page_content,
            'char_count': len(lc_chunk.page_content),
            'page_start': page,
            'page_end': page,
        })

    return chunk_data_list


def _auto_embed_doc(doc_id):
    """
    自动触发文档向量化（处理/重新切分完成后调用）

    获取知识库的 embedding_config，如果已配置则自动向量化。
    自动检测可用的 API Key，优先使用有 Key 的提供商。
    向量化失败不影响文档处理状态。

    参数：
        doc_id: 文档 ID
    """
    try:
        import json
        from app.services import faiss_service, embedding_service

        doc = memory_store.get_document(doc_id)
        if not doc or not doc.kb_id:
            return

        # 获取知识库的 embedding_config
        from app.models.knowledge_base import KnowledgeBase
        kb = KnowledgeBase.query.filter_by(id=doc.kb_id).first()
        if not kb:
            return

        emb_config = kb.embedding_config
        if isinstance(emb_config, str):
            emb_config = json.loads(emb_config) if emb_config else {}

        # 如果知识库未配置 embedding，自动检测可用提供商
        if not emb_config or not emb_config.get('provider') or not emb_config.get('api_key'):
            emb_config = embedding_service.detect_available_embedding_config()

        # 没有可用的 embedding 提供商，跳过向量化
        if not emb_config:
            print(f"[FAISS] 文档 {doc_id} 跳过向量化（无可用 Embedding 提供商，可在 .env 中配置 OPENAI_API_KEY）")
            return

        success, result = faiss_service.incremental_embed_doc(doc_id, emb_config)
        if success:
            print(f"[FAISS] 文档 {doc_id} 向量化成功: {result}")
            # 成功后保存配置到知识库
            if kb:
                kb.embedding_config = json.dumps(emb_config, ensure_ascii=False)
                db.session.commit()
        else:
            print(f"[FAISS] 文档 {doc_id} 向量化失败: {result}")

    except Exception as e:
        # 向量化失败不影响文档处理
        print(f"[FAISS] 文档 {doc_id} 自动向量化异常: {e}")
