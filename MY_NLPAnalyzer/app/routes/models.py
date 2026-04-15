"""
模型信息路由

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 新建模型信息路由蓝图，提供支持的提供商和模型列表
"""

from flask import Blueprint

from app.services.llm_service import get_providers, get_provider_models
from app.utils import success_response, error_response

models_bp = Blueprint('models', __name__, url_prefix='/api/models')


@models_bp.route('/providers', methods=['GET'])
def list_providers():
    """获取所有支持的提供商列表"""
    providers = get_providers()
    return success_response(providers)


@models_bp.route('/<provider_id>/models', methods=['GET'])
def list_models(provider_id):
    """获取指定提供商的可用模型列表"""
    models = get_provider_models(provider_id)
    if models is None:
        return error_response(f'不支持的提供商: {provider_id}', 404)
    return success_response(models)
