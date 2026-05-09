"""
RAG 检索与 Prompt 组装服务

作者: 李文煜
日期: 2026-05-09

2026-05-09
变更说明：
  1. 新建 RAG 服务，封装向量检索 + Prompt 组装逻辑
  2. 实现 retrieve / build_rag_messages / format_references / extract_sources
"""

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage


# ========== Prompt 模板 ==========

RAG_SYSTEM_PROMPT = """你是「NLP 文献解析助手」，一个专业的学术文献问答助手。
你的职责是基于用户提供的知识库内容，准确、专业地回答用户的问题。

## 回答规则：
1. 优先使用【检索到的参考内容】回答问题
2. 如果参考内容不足以回答问题，可以结合你的知识补充，但需要明确说明
3. 回答要条理清晰，使用 Markdown 格式（标题、列表、加粗等）
4. 回答使用中文

{context_section}

## 对话历史：
{chat_history}"""

RAG_CONTEXT_TEMPLATE = """## 检索到的参考内容：
{references}"""

SINGLE_REF_TEMPLATE = """【来源 {index}】文档: {doc_filename}, {page_info}
内容: {content}"""

NO_CONTEXT_HINT = "注意：当前没有检索到相关的知识库内容，请基于你的知识回答用户的问题。如果无法回答，请告知用户。"


# ========== 核心函数 ==========

def retrieve(kb_id, query, embedding_config, top_k=3):
    """
    执行 RAG 检索

    参数：
        kb_id: 知识库 ID
        query: 用户查询文本
        embedding_config: Embedding 配置字典
        top_k: 返回最相关的 K 个结果

    返回：
        list[dict] 检索结果，每项含 content / score / doc_id / doc_filename / page_start / page_end
    """
    from app.services import faiss_service, memory_store

    # FAISS 向量检索
    raw_results = faiss_service.search(kb_id, query, embedding_config, top_k=top_k)

    # 补充文档文件名
    enriched = []
    for item in raw_results:
        doc = memory_store.get_document(item.get('doc_id', ''))
        enriched.append({
            **item,
            'doc_filename': doc.filename if doc else '未知文档',
        })

    return enriched


def build_rag_messages(query, chat_history, retrieved_results):
    """
    构建完整的 RAG Prompt 消息列表

    参数：
        query: 用户当前问题
        chat_history: 历史消息列表 [{'role': 'user'|'assistant', 'content': str}, ...]
        retrieved_results: retrieve() 的返回值

    返回：
        list[BaseMessage] LangChain 消息列表，可直接传给 ChatModel
    """
    # 构建上下文段落
    if retrieved_results:
        references = format_references(retrieved_results)
        context_section = RAG_CONTEXT_TEMPLATE.format(references=references)
    else:
        context_section = NO_CONTEXT_HINT

    # 格式化历史对话（System Prompt 中的简要摘要）
    history_parts = []
    for msg in chat_history[-10:]:
        role_label = "用户" if msg.get('role') == 'user' else "助手"
        history_parts.append(f"{role_label}: {msg.get('content', '')}")
    chat_history_text = '\n'.join(history_parts) if history_parts else '（无历史对话）'

    # 组装 System Prompt
    system_content = RAG_SYSTEM_PROMPT.format(
        context_section=context_section,
        chat_history=chat_history_text,
    )

    # 构建消息列表
    messages = [SystemMessage(content=system_content)]

    # 添加历史消息（最近 6 轮 = 12 条）
    for msg in chat_history[-12:]:
        if msg.get('role') == 'user':
            messages.append(HumanMessage(content=msg['content']))
        elif msg.get('role') == 'assistant':
            messages.append(AIMessage(content=msg['content']))

    # 添加当前用户消息
    messages.append(HumanMessage(content=query))

    return messages


def format_references(retrieved_results):
    """
    将检索结果格式化为 Prompt 中的参考文本

    参数：
        retrieved_results: retrieve() 的返回值

    返回：
        str 格式化后的参考文本
    """
    if not retrieved_results:
        return ''

    ref_parts = []
    for i, item in enumerate(retrieved_results, 1):
        ps = item.get('page_start')
        pe = item.get('page_end')
        if ps is not None and pe is not None:
            page_info = f"第 {ps + 1}-{pe + 1} 页"
        elif ps is not None:
            page_info = f"第 {ps + 1} 页"
        else:
            page_info = "页码未知"

        ref_parts.append(SINGLE_REF_TEMPLATE.format(
            index=i,
            doc_filename=item.get('doc_filename', '未知文档'),
            page_info=page_info,
            content=item.get('content', ''),
        ))

    return '\n\n'.join(ref_parts)


def extract_sources(retrieved_results):
    """
    从检索结果中提取引用来源摘要（用于前端展示）

    参数：
        retrieved_results: retrieve() 的返回值

    返回：
        list[dict] 引用来源列表
    """
    sources = []
    for item in retrieved_results:
        ps = item.get('page_start')
        pe = item.get('page_end')
        snippet = item.get('content', '')
        sources.append({
            'doc_filename': item.get('doc_filename', '未知文档'),
            'page_start': ps + 1 if ps is not None else None,
            'page_end': pe + 1 if pe is not None else None,
            'score': round(item.get('score', 0), 4),
            'snippet': snippet[:100] + '...' if len(snippet) > 100 else snippet,
        })
    return sources
