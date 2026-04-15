"""
认证路由

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 新建认证路由蓝图，支持注册/登录/获取用户信息
"""

from flask import Blueprint, request, g

from app.services import auth_service, memory_store
from app.middleware.auth_guard import login_required
from app.utils import success_response, error_response

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


@auth_bp.route('/register', methods=['POST'])
def register():
    """邮箱注册"""
    data = request.get_json()
    if not data:
        return error_response('请求数据为空')

    email = data.get('email', '').strip()
    password = data.get('password', '')
    nickname = data.get('nickname', '').strip() or None

    ok, msg, user_info = auth_service.register(email, password, nickname)
    if not ok:
        return error_response(msg)

    # 注册成功后自动登录
    _, _, login_data = auth_service.login(email, password)

    return success_response({
        'token': login_data['token'],
        'user': login_data['user']
    }, msg)


@auth_bp.route('/login', methods=['POST'])
def login():
    """邮箱登录"""
    data = request.get_json()
    if not data:
        return error_response('请求数据为空')

    email = data.get('email', '').strip()
    password = data.get('password', '')

    ok, msg, data_result = auth_service.login(email, password)
    if not ok:
        return error_response(msg, 401)

    return success_response(data_result, msg)


@auth_bp.route('/me', methods=['GET'])
@login_required
def get_me():
    """获取当前用户信息"""
    user = g.user
    user_info = auth_service.get_user(user['email'])
    if not user_info:
        return error_response('用户不存在', 404)
    return success_response(user_info)


@auth_bp.route('/keys', methods=['GET'])
@login_required
def list_keys():
    """获取用户所有 API Key（脱敏）"""
    keys = memory_store.list_api_keys(g.user['email'])
    return success_response(keys)


@auth_bp.route('/keys', methods=['POST'])
@login_required
def save_key():
    """添加/更新 API Key"""
    data = request.get_json()
    if not data:
        return error_response('请求数据为空')

    provider = data.get('provider', '').strip()
    api_key = data.get('api_key', '').strip()
    model_name = data.get('model_name', '').strip()
    base_url = data.get('base_url', '').strip()

    if not provider:
        return error_response('提供商不能为空')
    if not api_key:
        return error_response('API Key 不能为空')

    memory_store.save_api_key(g.user['email'], provider, api_key, model_name, base_url)
    return success_response(message='API Key 保存成功')


@auth_bp.route('/keys/<provider>', methods=['DELETE'])
@login_required
def delete_key(provider):
    """删除指定提供商的 API Key"""
    ok = memory_store.delete_api_key(g.user['email'], provider)
    if not ok:
        return error_response('未找到该提供商的 API Key', 404)
    return success_response(message='API Key 已删除')
