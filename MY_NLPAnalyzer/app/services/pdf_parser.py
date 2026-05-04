"""
PDF 解析服务

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 从 coze_app.py 提取 PDF 解析逻辑为独立服务

2026-05-04
变更说明：
  1. 新增 parse_pdf_full() 函数，全页解析返回带页码元数据的结果
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


def parse_pdf_full(filepath):
    """
    解析完整 PDF，返回所有页的文本和元数据

    用于 Phase 3 文档切分，读取全部页面，不限字符数。

    参数：
        filepath: PDF 文件绝对路径

    返回：
        (success, result_or_error)
        result = {
            'full_text': str,        # 完整文本
            'page_count': int,       # 总页数
            'total_chars': int,      # 总字符数
            'pages': [               # 逐页数据（带 metadata）
                {'page': int, 'content': str, 'char_count': int},
                ...
            ],
            'lc_documents': list,    # Langchain Document 对象列表（用于切分）
        }
    """
    try:
        loader = PyPDFLoader(filepath)
        pages = loader.load()

        if not pages:
            return False, '未能从该 PDF 中提取到有效文本，该文件可能是扫描版'

        full_text_parts = []
        page_data = []

        for page_doc in pages:
            content = page_doc.page_content.strip()
            page_num = page_doc.metadata.get('page', 0)
            full_text_parts.append(content)
            page_data.append({
                'page': page_num,
                'content': content,
                'char_count': len(content),
            })

        full_text = '\n'.join(full_text_parts)
        total_chars = len(full_text)

        if total_chars == 0:
            return False, '未能从该 PDF 中提取到有效文本，该文件可能是扫描版'

        return True, {
            'full_text': full_text,
            'page_count': len(pages),
            'total_chars': total_chars,
            'pages': page_data,
            'lc_documents': pages,  # 保留原始 Langchain Document 对象，供切分使用
        }

    except Exception as e:
        return False, f'PDF 解析失败: {str(e)}'
