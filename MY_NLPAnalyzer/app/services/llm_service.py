"""
多模型统一服务

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 新建多模型服务，支持 DeepSeek/OpenAI/Ollama/Coze 四种提供商
  2. 使用 Langchain init_chat_model 统一接口
  3. 保留 Coze SDK 独立路径

2026-05-09
变更说明：
  1. 新增 create_chat_model() — 创建裸 ChatModel 实例（通用，不绑定 Prompt）
  2. 新增 chat_completion() — 通用非流式对话补全
  3. 新增 chat_completion_stream() — 流式对话补全（逐 token yield）
"""

import re
from cozepy import Coze, TokenAuth, COZE_CN_BASE_URL, Message, ChatStatus

from app.config import Config, SUPPORTED_PROVIDERS


# Coze 智能体单例
_coze_agent = None


def _get_coze_agent():
    """获取 Coze 智能体实例"""
    global _coze_agent
    if _coze_agent is None:
        _coze_agent = CozeAgent()
    return _coze_agent


class CozeAgent:
    """Coze 智能体封装（保留 Phase 1 逻辑）"""

    def __init__(self):
        self.apitoken = Config.COZE_API_TOKEN
        self.botid = Config.COZE_BOT_ID
        self.userid = Config.COZE_USER_ID
        self.coze = Coze(
            auth=TokenAuth(token=self.apitoken),
            base_url=COZE_CN_BASE_URL,
        )

    def analyze(self, text):
        """调用 Coze 智能体分析文本"""
        try:
            prompt = (
                "请对下面这段文本进行分词处理"
                "并提取出 3-5 个【核心关键词】。\n"
                "请直接返回结果，格式如下：\n"
                "【分词结果】：...\n"
                "【核心关键词】：...\n\n"
                f"待处理文本如下：\n{text}"
            )

            messages = [
                Message(
                    role="user",
                    content=prompt,
                    content_type="text",
                    type="question"
                )
            ]

            chat_poll = self.coze.chat.create_and_poll(
                bot_id=self.botid,
                user_id=self.userid,
                additional_messages=messages,
                auto_save_history=True,
            )
            chat = chat_poll.chat

            if chat.status == ChatStatus.COMPLETED:
                msgs = self.coze.chat.messages.list(
                    conversation_id=chat.conversation_id,
                    chat_id=chat.id
                )

                ai_response = ""
                for msg in msgs:
                    if hasattr(msg, 'role') and msg.role == "assistant":
                        if msg.type == "answer":
                            ai_response = msg.content.strip()
                            break

                if not ai_response:
                    return {"success": False, "error": "未获取到AI返回结果"}

                ai_response = re.sub(r' +', ' ', ai_response).strip()
                return {"success": True, "result": ai_response}
            else:
                return {'success': False, 'error': f'AI 处理未完成，状态: {chat.status}'}

        except Exception as e:
            return {"success": False, "error": f'请求 Coze 服务器错误: {str(e)}'}


def analyze_text(text, model_config):
    """
    统一文本分析入口

    参数：
        text: 待分析文本
        model_config: 模型配置字典
            {
                'provider': 'deepseek' | 'openai' | 'ollama' | 'coze',
                'api_key': '...',
                'model': 'deepseek-chat',
                'base_url': 'https://...',
                'bot_id': '...',  # Coze 专用
                'params': {
                    'temperature': 0.7,
                    'top-p': 0.95,
                    'max-tokens': 2048,
                    ...
                }
            }

    返回：
        {"success": bool, "result": str} 或 {"success": bool, "error": str}
    """
    provider = model_config.get('provider', 'coze')

    try:
        if provider == 'coze':
            return _get_coze_agent().analyze(text)

        # 使用 Langchain init_chat_model
        from langchain.chat_models import init_chat_model

        provider_info = SUPPORTED_PROVIDERS.get(provider)
        if not provider_info:
            return {"success": False, "error": f'不支持的提供商: {provider}'}

        model_name = model_config.get('model', provider_info['models'][0])
        api_key = model_config.get('api_key', '')
        base_url = model_config.get('base_url', '') or provider_info['default_base']
        params = model_config.get('params', {})

        # 构建模型参数
        temperature = float(params.get('temperature', 0.7))
        max_tokens = int(params.get('max-tokens', 2048))

        lc_provider = provider_info['langchain_provider']

        # init_chat_model 参数
        model_kwargs = {
            'model': model_name,
            'model_provider': lc_provider,
            'temperature': temperature,
            'max_tokens': max_tokens,
        }

        # API Key（OpenAI 兼容提供商需要）
        if provider_info['need_key'] and api_key:
            model_kwargs['api_key'] = api_key

        # Base URL
        if base_url and lc_provider == 'openai':
            model_kwargs['base_url'] = base_url

        # Ollama 特殊处理
        if provider == 'ollama' and base_url:
            model_kwargs['base_url'] = base_url

        model = init_chat_model(**model_kwargs)

        # 构建 Prompt
        prompt = (
            "请对下面这段文本进行分词处理"
            "并提取出 3-5 个【核心关键词】。\n"
            "请直接返回结果，格式如下：\n"
            "【分词结果】：...\n"
            "【核心关键词】：...\n\n"
            f"待处理文本如下：\n{text}"
        )

        from langchain_core.messages import HumanMessage
        response = model.invoke([HumanMessage(content=prompt)])

        result = response.content.strip()
        result = re.sub(r' +', ' ', result)

        return {"success": True, "result": result}

    except ImportError as e:
        return {"success": False, "error": f'缺少依赖包: {str(e)}，请使用 conda install 安装'}
    except Exception as e:
        return {"success": False, "error": f'模型调用失败: {str(e)}'}


def get_providers():
    """获取支持的提供商列表"""
    result = []
    for key, info in SUPPORTED_PROVIDERS.items():
        result.append({
            'id': key,
            'name': info['name'],
            'models': info['models'],
            'need_key': info['need_key'],
            'need_bot_id': info.get('need_bot_id', False),
        })
    return result


def get_provider_models(provider_id):
    """获取指定提供商的模型列表"""
    info = SUPPORTED_PROVIDERS.get(provider_id)
    if not info:
        return None
    return info['models']


# ========== Phase 4.3：通用对话接口 ==========

def create_chat_model(model_config):
    """
    创建 LangChain ChatModel 实例（通用，不绑定特定 Prompt）

    参数：
        model_config: 模型配置字典（同 analyze_text 的 model_config 格式）

    返回：
        BaseChatModel LangChain 聊天模型实例

    异常：
        ValueError Coze 提供商不支持 / 不支持的提供商
        Exception 模型创建失败
    """
    provider = model_config.get('provider', 'coze')
    if provider == 'coze':
        raise ValueError('Coze 智能体不支持通用对话模式，请使用 DeepSeek/OpenAI/Ollama')

    from langchain.chat_models import init_chat_model

    provider_info = SUPPORTED_PROVIDERS.get(provider)
    if not provider_info:
        raise ValueError(f'不支持的提供商: {provider}')

    model_name = model_config.get('model', provider_info['models'][0])
    api_key = model_config.get('api_key', '')
    base_url = model_config.get('base_url', '') or provider_info['default_base']
    params = model_config.get('params', {})

    temperature = float(params.get('temperature', 0.7))
    max_tokens = int(params.get('max-tokens', 2048))
    lc_provider = provider_info['langchain_provider']

    model_kwargs = {
        'model': model_name,
        'model_provider': lc_provider,
        'temperature': temperature,
        'max_tokens': max_tokens,
    }

    if provider_info['need_key'] and api_key:
        model_kwargs['api_key'] = api_key

    if base_url and lc_provider == 'openai':
        model_kwargs['base_url'] = base_url

    if provider == 'ollama' and base_url:
        model_kwargs['base_url'] = base_url

    return init_chat_model(**model_kwargs)


def chat_completion(messages, model_config):
    """
    通用对话补全（非流式）

    参数：
        messages: list[BaseMessage] LangChain 消息列表
        model_config: 模型配置字典

    返回：
        {"success": bool, "result": str} 或 {"success": bool, "error": str}
    """
    try:
        model = create_chat_model(model_config)
        response = model.invoke(messages)
        return {"success": True, "result": response.content.strip()}
    except Exception as e:
        return {"success": False, "error": f'模型调用失败: {str(e)}'}


def chat_completion_stream(messages, model_config):
    """
    通用对话补全（流式）

    参数：
        messages: list[BaseMessage] LangChain 消息列表
        model_config: 模型配置字典

    返回：
        generator 逐步生成 token 字符串

    异常：
        Exception 模型创建或调用失败
    """
    model = create_chat_model(model_config)
    for chunk in model.stream(messages):
        if chunk.content:
            yield chunk.content
