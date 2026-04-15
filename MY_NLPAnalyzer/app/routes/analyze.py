"""
分析路由

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 新建分析路由蓝图，支持文本分析和 PDF 分析
  2. 接收前端传来的模型配置参数，透传给多模型服务
"""

from flask import Blueprint, request

from app.middleware.auth_guard import login_required
from app.services.llm_service import analyze_text
from app.services.pdf_parser import parse_pdf
from app.utils import error_response

analyze_bp = Blueprint('analyze', __name__, url_prefix='/api')


@analyze_bp.route('/analyze_text', methods=['POST'])
@login_required
def analyze_text_api():
    """文本分析"""
    data = request.get_json()
    if not data:
        return error_response('请求数据为空')

    text = data.get('text', '').strip()
    if not text:
        return error_response('请输入需要分析的文本')

    # 获取模型配置
    model_config = data.get('params', {})
    if not model_config.get('provider'):
        model_config['provider'] = 'coze'  # 默认使用 Coze

    # 截断
    truncate_length = int(model_config.get('params', {}).get('truncate-length', 1500))
    text = text[:truncate_length]

    result = analyze_text(text, model_config)
    from flask import jsonify
    return jsonify(result)


@analyze_bp.route('/analyze_pdf', methods=['POST'])
@login_required
def analyze_pdf_api():
    """PDF 分析"""
    if 'file' not in request.files:
        return error_response('未收到文件')

    file = request.files['file']
    if file.filename == '':
        return error_response('文件名为空')

    # 解析 PDF
    success, text_or_error = parse_pdf(file)
    if not success:
        return error_response(text_or_error)

    # 获取模型配置
    import json
    params_str = request.form.get('params', '{}')
    try:
        model_config = json.loads(params_str) if isinstance(params_str, str) else {}
    except json.JSONDecodeError:
        model_config = {}

    if not model_config.get('provider'):
        model_config['provider'] = 'coze'

    result = analyze_text(text_or_error, model_config)
    from flask import jsonify
    return jsonify(result)
