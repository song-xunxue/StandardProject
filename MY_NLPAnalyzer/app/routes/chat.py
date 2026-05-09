"""
RAG 对话路由

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 新建对话路由蓝图，支持创建对话和发送消息

2026-05-09
变更说明：
  1. 重写为 RAG 对话路由，支持知识库对话 + SSE 流式响应
  2. 新增对话列表、对话详情、对话删除接口
  3. 集成 RAG 检索 + LangGraph 工作流
  4. 保留原有 POST /api/kb/<kb_id>/conversations 和 GET messages 接口
"""

import json
from flask import Blueprint, request, g, Response, stream_with_context

from app.services import memory_store
from app.middleware.auth_guard import login_required
from app.utils import success_response, error_response

chat_bp = Blueprint('chat', __name__, url_prefix='/api')


# ========== 对话管理接口 ==========

@chat_bp.route('/kb/<kb_id>/conversations', methods=['POST'])
@login_required
def create_conversation(kb_id):
    """创建新对话"""
    kb = memory_store.get_kb(kb_id, g.user['email'])
    if not kb:
        return error_response('知识库不存在', 404)

    data = request.get_json() or {}
    title = data.get('title', '').strip()

    conv = memory_store.create_conversation(kb_id, g.user['email'], title)
    return success_response(conv, '对话创建成功')


@chat_bp.route('/kb/<kb_id>/conversations', methods=['GET'])
@login_required
def list_conversations(kb_id):
    """获取知识库的对话列表"""
    kb = memory_store.get_kb(kb_id, g.user['email'])
    if not kb:
        return error_response('知识库不存在', 404)

    convs = memory_store.get_kb_conversations(kb_id, g.user['email'])
    return success_response(convs)


@chat_bp.route('/conversations/<conv_id>', methods=['GET'])
@login_required
def get_conversation(conv_id):
    """获取对话详情（含消息列表）"""
    conv = memory_store.get_conversation(conv_id, g.user['email'])
    if not conv:
        return error_response('对话不存在', 404)
    return success_response(conv)


@chat_bp.route('/conversations/<conv_id>', methods=['DELETE'])
@login_required
def delete_conversation(conv_id):
    """删除对话"""
    from app.models.conversation import Conversation
    from app.extensions import db

    conv = Conversation.query.filter_by(
        id=conv_id, user_email=g.user['email']
    ).first()
    if not conv:
        return error_response('对话不存在', 404)

    db.session.delete(conv)
    db.session.commit()
    return success_response(message='对话已删除')


@chat_bp.route('/conversations/<conv_id>/messages', methods=['GET'])
@login_required
def get_messages(conv_id):
    """获取对话的所有消息"""
    conv = memory_store.get_conversation(conv_id, g.user['email'])
    if not conv:
        return error_response('对话不存在', 404)
    return success_response(conv.get('messages', []))


# ========== RAG 对话核心接口 ==========

@chat_bp.route('/conversations/<conv_id>/messages', methods=['POST'])
@login_required
def send_message(conv_id):
    """
    发送消息到对话（RAG + 流式 SSE 响应）

    请求参数（JSON）：
        content: str       用户消息内容
        model_config: dict 模型配置（provider, api_key, model 等）
        stream: bool       是否流式响应（默认 True）

    SSE 事件格式：
        event: sources  → data: {"sources": [...]}
        event: token    → data: {"content": "..."}
        event: done     → data: {"message_id": 123}
        event: error    → data: {"error": "..."}
    """
    conv = memory_store.get_conversation(conv_id, g.user['email'])
    if not conv:
        return error_response('对话不存在', 404)

    data = request.get_json()
    if not data:
        return error_response('请求数据为空')

    content = data.get('content', '').strip()
    if not content:
        return error_response('消息内容不能为空')

    use_stream = data.get('stream', True)

    # 获取知识库信息
    kb_id = conv.get('kb_id', '')
    kb = memory_store.get_kb(kb_id, g.user['email'])
    if not kb:
        return error_response('关联的知识库不存在', 404)

    # 获取 embedding 配置
    embedding_config = kb.get('embedding_config', {})
    if isinstance(embedding_config, str):
        embedding_config = json.loads(embedding_config) if embedding_config else {}
    if not embedding_config or not embedding_config.get('provider'):
        from app.services.embedding_service import get_default_embedding_config
        embedding_config = get_default_embedding_config()

    # 获取模型配置并补全 API Key
    model_config = data.get('model_config', {})
    if not model_config.get('provider'):
        model_config['provider'] = 'deepseek'
    _fill_model_config(model_config, g.user['email'])

    # 保存用户消息到 DB
    memory_store.add_message(conv_id, 'user', content)

    # 获取历史消息（不含刚保存的用户消息，conv 是之前查的）
    chat_history = conv.get('messages', [])

    if use_stream:
        return _stream_rag_response(conv_id, content, kb_id, embedding_config,
                                    model_config, chat_history)
    else:
        return _sync_rag_response(conv_id, content, kb_id, embedding_config,
                                  model_config, chat_history)


# ========== 内部辅助函数 ==========

def _stream_rag_response(conv_id, query, kb_id, embedding_config,
                         model_config, chat_history):
    """流式 RAG 响应（SSE）"""

    def generate():
        try:
            from app.services.rag_service import retrieve, extract_sources, build_rag_messages
            from app.services.llm_service import chat_completion_stream

            # 1. 检索
            retrieved = retrieve(kb_id, query, embedding_config, top_k=3)
            sources = extract_sources(retrieved)

            # 2. 发送引用来源
            if sources:
                yield f"event: sources\ndata: {json.dumps({'sources': sources}, ensure_ascii=False)}\n\n"

            # 3. 构建消息并流式生成
            messages = build_rag_messages(query, chat_history, retrieved)
            full_answer = []

            for token in chat_completion_stream(messages, model_config):
                full_answer.append(token)
                yield f"event: token\ndata: {json.dumps({'content': token}, ensure_ascii=False)}\n\n"

            # 4. 保存 AI 回复
            answer_text = ''.join(full_answer)
            ai_msg = memory_store.add_message(conv_id, 'assistant', answer_text)

            # 5. 发送完成事件
            yield f"event: done\ndata: {json.dumps({'message_id': ai_msg.get('id')}, ensure_ascii=False)}\n\n"

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        }
    )


def _sync_rag_response(conv_id, query, kb_id, embedding_config,
                       model_config, chat_history):
    """非流式 RAG 响应（回退模式）"""
    from app.services.rag_service import retrieve, extract_sources, build_rag_messages
    from app.services.llm_service import chat_completion

    retrieved = retrieve(kb_id, query, embedding_config, top_k=3)
    sources = extract_sources(retrieved)

    messages = build_rag_messages(query, chat_history, retrieved)
    result = chat_completion(messages, model_config)

    if result['success']:
        ai_msg = memory_store.add_message(conv_id, 'assistant', result['result'])
        return success_response({
            'answer': result['result'],
            'sources': sources,
            'ai_message': ai_msg,
        })
    else:
        return error_response(result.get('error', '生成失败'))


def _fill_model_config(model_config, user_email):
    """
    补全模型配置：如果前端没有传 API Key，从 DB 加载已保存的 Key

    参数：
        model_config: 模型配置字典（会被原地修改）
        user_email: 用户邮箱
    """
    provider = model_config.get('provider', '')
    if not model_config.get('api_key'):
        saved_key = memory_store.get_api_key(user_email, provider)
        if saved_key:
            model_config['api_key'] = saved_key['api_key']
            if not model_config.get('base_url') and saved_key.get('base_url'):
                model_config['base_url'] = saved_key['base_url']
            if not model_config.get('model') and saved_key.get('model_name'):
                model_config['model'] = saved_key['model_name']
