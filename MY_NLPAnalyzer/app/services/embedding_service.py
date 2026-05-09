"""
多提供商 Embedding 服务

作者: 李文煜
日期: 2026-05-07

2026-05-07
变更说明：
  1. 新建 Embedding 服务，支持 OpenAI/DeepSeek/Ollama 三个提供商
  2. OpenAI/DeepSeek 使用 langchain_openai.OpenAIEmbeddings
  3. Ollama 使用 langchain_ollama.OllamaEmbeddings

2026-05-09
变更说明：
  1. 新增 detect_available_embedding_config() 自动检测可用的 API Key
  2. 给 OpenAIEmbeddings 增加请求超时（60s）防止挂死
  3. 新增智谱 GLM embedding-3 支持（通过 OpenAI 兼容接口）
"""

# 智谱 GLM Embedding 配置
ZHIPU_EMBEDDING_CONFIG = {
    'provider': 'zhipu',
    'model': 'embedding-3',
    'base_url': 'https://open.bigmodel.cn/api/paas/v4',
    'dimension': 2048,
}

from app.config import Config, SUPPORTED_PROVIDERS


def get_embeddings(embedding_config):
    """
    获取 Embeddings 实例（工厂方法）

    参数：
        embedding_config: {
            'provider': 'openai' | 'deepseek' | 'ollama' | 'zhipu',
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

    if provider in ('openai', 'deepseek', 'zhipu'):
        # OpenAI / DeepSeek / 智谱 均使用 OpenAIEmbeddings（兼容 OpenAI 接口）
        from langchain_openai import OpenAIEmbeddings

        kwargs = {
            'model': model_name,
            'request_timeout': 60,
        }
        if api_key:
            kwargs['api_key'] = api_key
        # base_url：优先用传入值
        effective_url = base_url
        if not effective_url:
            if provider == 'zhipu':
                effective_url = ZHIPU_EMBEDDING_CONFIG['base_url']
            else:
                provider_info = SUPPORTED_PROVIDERS.get(provider, {})
                effective_url = provider_info.get('default_base', '')
        if effective_url:
            kwargs['base_url'] = effective_url
        return OpenAIEmbeddings(**kwargs)

    elif provider == 'ollama':
        from langchain_ollama import OllamaEmbeddings

        kwargs = {'model': model_name}
        effective_url = base_url or 'http://localhost:11434'
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


def detect_available_embedding_config():
    """
    自动检测可用的 Embedding 配置

    按优先级检查环境变量中的 API Key：
    1. GLM_API_KEY → 智谱 embedding-3（国内直连，推荐）
    2. OPENAI_API_KEY → OpenAI embedding（需梯子）
    3. 无可用 Key → 返回 None（跳过向量化）

    返回：
        dict | None Embedding 配置，无可用 Key 时返回 None
    """
    import os

    # 优先使用智谱 GLM（国内直连，免费额度）
    glm_key = os.environ.get('GLM_API_KEY', '')
    if glm_key:
        return {
            'provider': 'zhipu',
            'model': ZHIPU_EMBEDDING_CONFIG['model'],
            'api_key': glm_key,
            'base_url': ZHIPU_EMBEDDING_CONFIG['base_url'],
            'dimension': ZHIPU_EMBEDDING_CONFIG['dimension'],
        }

    # 其次使用 OpenAI（需梯子）
    openai_key = os.environ.get('OPENAI_API_KEY', '')
    if openai_key:
        return {
            'provider': 'openai',
            'model': Config.DEFAULT_EMBEDDING_MODEL,
            'api_key': openai_key,
            'base_url': 'https://api.openai.com/v1',
            'dimension': 1536,
        }

    # 无可用 Key
    print("[Embedding] 未检测到 GLM_API_KEY 或 OPENAI_API_KEY，跳过向量化")
    return None
