"""
文档管理路由

作者: 李文煜
日期: 2026-05-04

2026-05-04
变更说明：
  1. 新建文档管理蓝图，支持文档详情、chunks 列表、重新切分、删除
"""

import os

from flask import Blueprint, request, g

from app.config import Config
from app.services import memory_store, doc_service
from app.middleware.auth_guard import login_required
from app.utils import success_response, error_response

doc_bp = Blueprint('doc', __name__, url_prefix='/api/docs')


@doc_bp.route('/<doc_id>', methods=['GET'])
@login_required
def get_doc(doc_id):
    """获取文档详情"""
    doc = memory_store.get_document(doc_id)
    if not doc:
        return error_response('文档不存在', 404)

    # 权限验证：通过知识库所属用户判断
    kb = memory_store.get_kb(doc.kb_id, g.user['email'])
    if not kb:
        return error_response('无权访问该文档', 403)

    return success_response(doc.to_dict())


@doc_bp.route('/<doc_id>/chunks', methods=['GET'])
@login_required
def get_chunks(doc_id):
    """获取文档的 chunks（分页）"""
    doc = memory_store.get_document(doc_id)
    if not doc:
        return error_response('文档不存在', 404)

    # 权限验证
    kb = memory_store.get_kb(doc.kb_id, g.user['email'])
    if not kb:
        return error_response('无权访问该文档', 403)

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)

    result = memory_store.get_chunks_by_doc(doc_id, page=page, per_page=per_page)
    result['doc_id'] = doc_id
    return success_response(result)


@doc_bp.route('/<doc_id>/rechunk', methods=['POST'])
@login_required
def rechunk(doc_id):
    """重新切分文档"""
    doc = memory_store.get_document(doc_id)
    if not doc:
        return error_response('文档不存在', 404)

    # 权限验证
    kb = memory_store.get_kb(doc.kb_id, g.user['email'])
    if not kb:
        return error_response('无权操作该文档', 403)

    data = request.get_json() or {}
    chunk_size = data.get('chunk_size', 500)
    chunk_overlap = data.get('chunk_overlap', 50)

    success, result = doc_service.rechunk_document(doc_id, chunk_size, chunk_overlap)
    if success:
        return success_response(result, '重新切分成功')
    else:
        return error_response(result)


@doc_bp.route('/<doc_id>', methods=['DELETE'])
@login_required
def delete_doc(doc_id):
    """删除文档（含磁盘文件）"""
    doc = memory_store.get_document(doc_id)
    if not doc:
        return error_response('文档不存在', 404)

    # 权限验证
    kb = memory_store.get_kb(doc.kb_id, g.user['email'])
    if not kb:
        return error_response('无权操作该文档', 403)

    # 删除数据库记录（级联删除 chunks）
    success, file_path = memory_store.delete_document(doc_id)
    if not success:
        return error_response('删除失败')

    # 删除磁盘文件
    if file_path:
        full_path = os.path.join(Config.UPLOAD_FOLDER, file_path)
        if os.path.exists(full_path):
            os.remove(full_path)

    return success_response(message='文档已删除')
