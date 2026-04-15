"""
知识库路由

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 新建知识库路由蓝图，支持 CRUD 操作
"""

from flask import Blueprint, request, g

from app.services import memory_store
from app.middleware.auth_guard import login_required
from app.utils import success_response, error_response

kb_bp = Blueprint('kb', __name__, url_prefix='/api/kb')


@kb_bp.route('', methods=['GET'])
@login_required
def list_kbs():
    """获取知识库列表"""
    kbs = memory_store.list_kbs(g.user['email'])
    return success_response(kbs)


@kb_bp.route('', methods=['POST'])
@login_required
def create_kb():
    """创建知识库"""
    data = request.get_json()
    if not data:
        return error_response('请求数据为空')

    name = data.get('name', '').strip()
    if not name:
        return error_response('知识库名称不能为空')

    description = data.get('description', '').strip()
    mode = data.get('mode', 'multi_doc')

    kb = memory_store.create_kb(g.user['email'], name, description, mode)
    return success_response(kb, '知识库创建成功')


@kb_bp.route('/<kb_id>', methods=['GET'])
@login_required
def get_kb(kb_id):
    """获取知识库详情"""
    kb = memory_store.get_kb(kb_id, g.user['email'])
    if not kb:
        return error_response('知识库不存在', 404)
    return success_response(kb)


@kb_bp.route('/<kb_id>', methods=['PUT'])
@login_required
def update_kb(kb_id):
    """更新知识库"""
    data = request.get_json()
    if not data:
        return error_response('请求数据为空')

    kb = memory_store.update_kb(kb_id, g.user['email'], **data)
    if not kb:
        return error_response('知识库不存在', 404)
    return success_response(kb, '知识库更新成功')


@kb_bp.route('/<kb_id>', methods=['DELETE'])
@login_required
def delete_kb(kb_id):
    """删除知识库"""
    ok = memory_store.delete_kb(kb_id, g.user['email'])
    if not ok:
        return error_response('知识库不存在', 404)
    return success_response(message='知识库已删除')


@kb_bp.route('/<kb_id>/docs', methods=['GET'])
@login_required
def list_docs(kb_id):
    """获取知识库下的文档列表"""
    kb = memory_store.get_kb(kb_id, g.user['email'])
    if not kb:
        return error_response('知识库不存在', 404)
    return success_response(kb.get('docs', []))


@kb_bp.route('/<kb_id>/docs', methods=['POST'])
@login_required
def upload_doc(kb_id):
    """上传文档到知识库"""
    kb = memory_store.get_kb(kb_id, g.user['email'])
    if not kb:
        return error_response('知识库不存在', 404)

    if 'file' not in request.files:
        return error_response('未收到文件')

    file = request.files['file']
    if file.filename == '':
        return error_response('文件名为空')

    # Phase 2.2: 简单记录到 docs 列表
    doc = {
        'filename': file.filename,
        'status': 'uploaded',
    }
    kb['docs'].append(doc)
    return success_response(doc, '文档上传成功')
