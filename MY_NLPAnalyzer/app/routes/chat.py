"""
对话路由

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 新建对话路由蓝图，支持创建对话和发送消息
"""

from flask import Blueprint, request, g

from app.services import memory_store
from app.middleware.auth_guard import login_required
from app.utils import success_response, error_response

chat_bp = Blueprint('chat', __name__, url_prefix='/api')


@chat_bp.route('/kb/<kb_id>/conversations', methods=['POST'])
@login_required
def create_conversation(kb_id):
    """创建新对话"""
    data = request.get_json() or {}
    title = data.get('title', '').strip()

    conv = memory_store.create_conversation(kb_id, g.user['email'], title)
    return success_response(conv, '对话创建成功')


@chat_bp.route('/conversations/<conv_id>/messages', methods=['GET'])
@login_required
def get_messages(conv_id):
    """获取对话的所有消息"""
    conv = memory_store.get_conversation(conv_id, g.user['email'])
    if not conv:
        return error_response('对话不存在', 404)
    return success_response(conv.get('messages', []))


@chat_bp.route('/conversations/<conv_id>/messages', methods=['POST'])
@login_required
def send_message(conv_id):
    """发送消息到对话"""
    conv = memory_store.get_conversation(conv_id, g.user['email'])
    if not conv:
        return error_response('对话不存在', 404)

    data = request.get_json()
    if not data:
        return error_response('请求数据为空')

    content = data.get('content', '').strip()
    if not content:
        return error_response('消息内容不能为空')

    # 添加用户消息
    user_msg = memory_store.add_message(conv_id, 'user', content)

    # 添加 AI 回复（占位）
    ai_msg = memory_store.add_message(conv_id, 'assistant', '[分析功能请使用 analyze_text/analyze_pdf 接口]')

    return success_response({
        'user_message': user_msg,
        'ai_message': ai_msg
    })
