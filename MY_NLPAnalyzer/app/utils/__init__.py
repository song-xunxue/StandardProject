"""
统一响应格式封装

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 新建统一响应格式工具模块
"""

from flask import jsonify


def success_response(data=None, message='操作成功'):
    """成功响应"""
    response = {'success': True, 'message': message}
    if data is not None:
        response['data'] = data
    return jsonify(response)


def error_response(error='操作失败', code=400):
    """错误响应"""
    return jsonify({'success': False, 'error': error}), code


def unauthorized_response(message='未登录或登录已过期'):
    """未授权响应"""
    return jsonify({'success': False, 'error': message}), 401
