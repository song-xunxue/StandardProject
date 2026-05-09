"""
LangGraph RAG 对话编排服务

作者: 李文煜
日期: 2026-05-09

2026-05-09
变更说明：
  1. 新建 LangGraph 编排服务，定义 RAG 对话工作流
  2. 简化设计：不做意图路由，所有对话都走 RAG 检索路径
  3. 图结构：START -> retrieve_node -> generate_node -> END

设计说明：
  流式场景在路由层直接调用 rag_service + llm_service，不在 LangGraph 内处理。
  LangGraph 用于非流式回退场景和整体工作流编排。
"""

from typing import TypedDict, List, Dict, Any, Optional

from langgraph.graph import StateGraph, START, END


# ========== State 定义 ==========

class RAGState(TypedDict, total=False):
    """
    LangGraph 状态定义
    所有节点共享此状态字典，节点函数读取输入字段、写入输出字段。
    """
    # 输入字段（由调用方传入）
    query: str                                 # 用户当前问题
    kb_id: str                                 # 知识库 ID
    embedding_config: Dict[str, Any]           # Embedding 配置
    model_config: Dict[str, Any]               # LLM 模型配置
    chat_history: List[Dict[str, str]]         # 历史消息列表

    # 中间字段（节点间传递）
    retrieved_results: Optional[List[Dict[str, Any]]]  # 检索结果

    # 输出字段（最终结果）
    answer: Optional[str]                      # LLM 回答
    sources: Optional[List[Dict[str, Any]]]    # 引用来源
    error: Optional[str]                       # 错误信息


# ========== 节点函数 ==========

def retrieve_node(state: RAGState) -> dict:
    """
    检索节点：调用 FAISS 检索相关文档片段

    输入：query, kb_id, embedding_config
    输出：retrieved_results, sources
    """
    from app.services.rag_service import retrieve, extract_sources

    query = state.get('query', '')
    kb_id = state.get('kb_id', '')
    embedding_config = state.get('embedding_config', {})

    if not query or not kb_id:
        return {'retrieved_results': [], 'sources': []}

    try:
        results = retrieve(
            kb_id=kb_id,
            query=query,
            embedding_config=embedding_config,
            top_k=3,
        )
        sources = extract_sources(results)
        return {'retrieved_results': results, 'sources': sources}
    except Exception as e:
        print(f"[LangGraph] 检索节点失败: {e}")
        return {'retrieved_results': [], 'sources': [], 'error': f'检索失败: {str(e)}'}


def generate_node(state: RAGState) -> dict:
    """
    生成节点：组装 Prompt 并调用 LLM（非流式）

    输入：query, chat_history, retrieved_results, model_config
    输出：answer, error
    """
    from app.services.rag_service import build_rag_messages
    from app.services.llm_service import chat_completion

    query = state.get('query', '')
    chat_history = state.get('chat_history', [])
    retrieved_results = state.get('retrieved_results', [])
    model_config = state.get('model_config', {})

    try:
        messages = build_rag_messages(query, chat_history, retrieved_results)
        result = chat_completion(messages, model_config)

        if result['success']:
            return {'answer': result['result']}
        else:
            return {'answer': None, 'error': result.get('error', '生成失败')}
    except Exception as e:
        return {'answer': None, 'error': f'生成失败: {str(e)}'}


# ========== 图构建 ==========

_compiled_graph = None


def get_rag_graph():
    """
    获取编译后的 RAG StateGraph（单例）

    图结构：START → retrieve → generate → END
    """
    global _compiled_graph
    if _compiled_graph is None:
        graph = StateGraph(RAGState)
        graph.add_node('retrieve', retrieve_node)
        graph.add_node('generate', generate_node)
        graph.add_edge(START, 'retrieve')
        graph.add_edge('retrieve', 'generate')
        graph.add_edge('generate', END)
        _compiled_graph = graph.compile()
    return _compiled_graph
