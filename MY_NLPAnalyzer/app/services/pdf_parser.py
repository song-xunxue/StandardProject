"""
PDF 解析服务

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 从 coze_app.py 提取 PDF 解析逻辑为独立服务
"""

import os
import tempfile

from langchain_community.document_loaders import PyPDFLoader


def parse_pdf(file_storage, max_pages=2, max_chars=1500):
    """
    解析上传的 PDF 文件

    参数：
        file_storage: Flask FileStorage 对象
        max_pages: 最大读取页数
        max_chars: 最大字符数

    返回：
        (success, text_or_error)
    """
    temp_filepath = None
    try:
        # 保存到临时文件
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
            file_storage.save(temp_file.name)
            temp_filepath = temp_file.name

        # 使用 Langchain PyPDFLoader 读取
        loader = PyPDFLoader(temp_filepath)
        pages = loader.load()

        text = ""
        num_pages = min(max_pages, len(pages))
        for i in range(num_pages):
            text += pages[i].page_content + "\n"

        if not text.strip():
            return False, '未能从该 PDF 中提取到有效文本'

        # 截取
        text = text[:max_chars]
        return True, text

    except Exception as e:
        return False, f'PDF 解析失败: {str(e)}'

    finally:
        if temp_filepath and os.path.exists(temp_filepath):
            os.remove(temp_filepath)


def parse_pdf_from_path(filepath, max_pages=None, max_chars=1500):
    """
    从文件路径解析 PDF

    参数：
        filepath: PDF 文件路径
        max_pages: 最大页数（None 表示全部）
        max_chars: 最大字符数

    返回：
        (success, text_or_error)
    """
    try:
        loader = PyPDFLoader(filepath)
        pages = loader.load()

        text = ""
        page_count = len(pages) if max_pages is None else min(max_pages, len(pages))
        for i in range(page_count):
            text += pages[i].page_content + "\n"

        if not text.strip():
            return False, '未能从该 PDF 中提取到有效文本'

        if max_chars:
            text = text[:max_chars]

        return True, text

    except Exception as e:
        return False, f'PDF 解析失败: {str(e)}'
