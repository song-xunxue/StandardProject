"""
多提供商 Embedding 服务

作者: 李文煜
日期: 2026-05-07

2026-05-07
变更说明：
  1. 新建 Embedding 服务，支持 OpenAI/DeepSeek/Ollama 三个提供商
  2. OpenAI/DeepSeek 使用 langchain_openai.OpenAIEmbeddings
  3. Ollama 使用 langchain_ollama.OllamaEmbeddings
"""

from app.config import Config, SUPPORTED_PROVIDERS


def get_embeddings(embedding_config):
    """
    获取 Embeddings 实例（工厂方法）

    参数：
        embedding_config: {
            'provider': 'openai' | 'deepseek' | 'ollama',
            'api_key': '...',
            'model': 'text-embedding-3-small',
            'base_url': 'https://...',
        }

    返回：
        LangChain Embeddings 实例
    """
    provider = embedding_config.get('provider', Config.DEFAULT_EMBEDDING_PROVIDER)
    model_name = embedding_config.get('model', Config.DEFAULT_EMBEDDING_MODEL)
    api_key = embedding_config.get('api_key', '')
    base_url = embedding_config.get('base_url', '')

    provider_info = SUPPORTED_PROVIDERS.get(provider)
    if not provider_info:
        raise ValueError(f'不支持的 Embedding 提供商: {provider}')

    if provider in ('openai', 'deepseek'):
        # OpenAI / DeepSeek 使用 OpenAIEmbeddings（DeepSeek 兼容 OpenAI 接口）
        from langchain_openai import OpenAIEmbeddings

        kwargs = {'model': model_name}
        if api_key:
            kwargs['api_key'] = api_key
        # base_url：优先用传入值，否则用提供商默认值
        effective_url = base_url or provider_info.get('default_base', '')
        if effective_url:
            kwargs['base_url'] = effective_url
        return OpenAIEmbeddings(**kwargs)

    elif provider == 'ollama':
        # Ollama 使用 OllamaEmbeddings
        from langchain_ollama import OllamaEmbeddings

        kwargs = {'model': model_name}
        effective_url = base_url or provider_info.get('default_base', 'http://localhost:11434')
        kwargs['base_url'] = effective_url
        return OllamaEmbeddings(**kwargs)

    else:
        raise ValueError(f'提供商 {provider} 不支持 Embedding 功能')


def embed_texts(texts, embedding_config):
    """
    批量文本向量化

    参数：
        texts: str 列表
        embedding_config: 提供商配置字典

    返回：
        List[List[float]] 向量列表
    """
    embeddings = get_embeddings(embedding_config)
    return embeddings.embed_documents(texts)


def embed_query(query, embedding_config):
    """
    单条查询向量化（检索时使用）

    参数：
        query: 用户查询字符串
        embedding_config: 提供商配置字典

    返回：
        List[float] 单条向量
    """
    embeddings = get_embeddings(embedding_config)
    return embeddings.embed_query(query)


def get_default_embedding_config():
    """
    获取默认 Embedding 配置

    返回：
        dict 默认配置
    """
    return {
        'provider': Config.DEFAULT_EMBEDDING_PROVIDER,
        'model': Config.DEFAULT_EMBEDDING_MODEL,
        'api_key': '',
        'base_url': SUPPORTED_PROVIDERS.get(Config.DEFAULT_EMBEDDING_PROVIDER, {}).get('default_base', ''),
    }


def get_embedding_providers():
    """
    获取支持 Embedding 的提供商及其模型列表

    返回：
        list [{'id': 'openai', 'name': 'OpenAI', 'models': [...], 'dimension': 1536}, ...]
    """
    result = []
    for key, info in SUPPORTED_PROVIDERS.items():
        models = info.get('embedding_models', [])
        if not models:
            continue
        result.append({
            'id': key,
            'name': info['name'],
            'models': models,
            'dimension': info.get('embedding_dimension', 0),
            'need_key': info['need_key'],
        })
    return result
