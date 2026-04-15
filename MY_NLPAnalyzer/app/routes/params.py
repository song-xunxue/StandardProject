"""
参数配置路由

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 新建参数配置路由蓝图，提供默认参数和预设管理
"""

from flask import Blueprint, request, g

from app.services import memory_store
from app.middleware.auth_guard import login_required
from app.utils import success_response, error_response

params_bp = Blueprint('params', __name__, url_prefix='/api/params')

# 默认参数配置
DEFAULT_PARAMS = {
    'model': {
        'provider': 'deepseek',
        'model': 'deepseek-chat',
        'temperature': 0.7,
        'top-p': 0.95,
        'top-k': 40,
        'max-tokens': 2048,
    },
    'nlp': {
        'chunk-size': 500,
        'chunk-overlap': 50,
        'keyword-count': 5,
        'truncate-length': 1500,
    }
}


@params_bp.route('/default', methods=['GET'])
def get_default_params():
    """获取默认参数配置"""
    return success_response(DEFAULT_PARAMS)


@params_bp.route('/presets', methods=['GET'])
@login_required
def list_presets():
    """获取用户的参数预设列表"""
    presets = memory_store.list_presets(g.user['email'])
    return success_response(presets)


@params_bp.route('/presets', methods=['POST'])
@login_required
def save_preset():
    """保存当前参数为预设"""
    data = request.get_json()
    if not data:
        return error_response('请求数据为空')

    name = data.get('name', '').strip()
    if not name:
        return error_response('预设名称不能为空')

    config = data.get('config', {})
    preset = memory_store.save_preset(g.user['email'], name, config)
    return success_response(preset, '预设保存成功')


@params_bp.route('/presets/<preset_id>', methods=['DELETE'])
@login_required
def delete_preset(preset_id):
    """删除参数预设"""
    ok = memory_store.delete_preset(preset_id, g.user['email'])
    if not ok:
        return error_response('预设不存在', 404)
    return success_response(message='预设已删除')
