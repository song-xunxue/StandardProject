"""
知识库路由

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 新建知识库路由蓝图，支持 CRUD 操作

2026-05-04
变更说明：
  1. 修复 upload_doc 文档上传未持久化的问题
  2. upload_doc 重写：保存文件到磁盘 + 创建 Document + 触发切分处理
  3. list_docs 改为查询 Document 表
  4. delete_kb 增加磁盘文件清理
"""

import os
import shutil

from flask import Blueprint, request, g
from werkzeug.utils import secure_filename

from app.config import Config
from app.services import memory_store, doc_service
from app.middleware.auth_guard import login_required
from app.utils import success_response, error_response

kb_bp = Blueprint('kb', __name__, url_prefix='/api/kb')

ALLOWED_EXTENSIONS = {'pdf'}


def _allowed_file(filename):
    """检查文件扩展名是否允许"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


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
    """删除知识库（级联删除文档、chunks 和磁盘文件）"""
    # 先检查知识库是否存在
    kb = memory_store.get_kb(kb_id, g.user['email'])
    if not kb:
        return error_response('知识库不存在', 404)

    # 清理磁盘文件：删除整个 kb_id 目录
    kb_upload_dir = os.path.join(Config.UPLOAD_FOLDER, kb_id)
    if os.path.exists(kb_upload_dir):
        shutil.rmtree(kb_upload_dir)

    # 数据库级联删除（KnowledgeBase → Document → Chunk）
    memory_store.delete_kb(kb_id, g.user['email'])
    return success_response(message='知识库已删除')


@kb_bp.route('/<kb_id>/docs', methods=['GET'])
@login_required
def list_docs(kb_id):
    """获取知识库下的文档列表"""
    kb = memory_store.get_kb(kb_id, g.user['email'])
    if not kb:
        return error_response('知识库不存在', 404)

    docs = memory_store.get_kb_documents(kb_id)
    return success_response(docs)


@kb_bp.route('/<kb_id>/docs', methods=['POST'])
@login_required
def upload_doc(kb_id):
    """上传文档到知识库（保存文件 + 解析 + 切分）"""
    # 验证知识库存在
    kb = memory_store.get_kb(kb_id, g.user['email'])
    if not kb:
        return error_response('知识库不存在', 404)

    # 验证文件
    if 'file' not in request.files:
        return error_response('未收到文件')

    file = request.files['file']
    if file.filename == '':
        return error_response('文件名为空')

    if not _allowed_file(file.filename):
        return error_response('仅支持 PDF 格式文件')

    # 获取切分参数（从表单字段或使用默认值）
    chunk_size = int(request.form.get('chunk_size', 500))
    chunk_overlap = int(request.form.get('chunk_overlap', 50))

    # 保存文件到磁盘
    safe_name = secure_filename(file.filename)
    kb_upload_dir = os.path.join(Config.UPLOAD_FOLDER, kb_id)
    os.makedirs(kb_upload_dir, exist_ok=True)

    # 创建 Document 记录
    doc = memory_store.create_document(
        kb_id=kb_id,
        filename=file.filename,
        file_path='',  # 临时为空，下面更新
        file_size=0,
    )

    # 构建实际文件路径：{kb_id}/{doc_id}_{safe_name}
    relative_path = os.path.join(kb_id, f"{doc.id}_{safe_name}")
    full_path = os.path.join(Config.UPLOAD_FOLDER, relative_path)

    file.save(full_path)
    file_size = os.path.getsize(full_path)

    # 更新文件路径和大小
    doc.file_path = relative_path
    doc.file_size = file_size
    from app.extensions import db
    db.session.commit()

    # 触发文档处理（解析 + 切分）
    success, result = doc_service.process_document(doc.id, chunk_size, chunk_overlap)

    if success:
        return success_response(result, '文档上传并处理成功')
    else:
        # 处理失败，但文件已保存，返回文档信息含错误
        doc_dict = doc.to_dict()
        return success_response(doc_dict, f'文档已上传但处理失败: {result}')
