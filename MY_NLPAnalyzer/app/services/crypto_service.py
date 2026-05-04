"""
Fernet 对称加密服务

作者: 李文煜
日期: 2026-05-04

2026-05-04
变更说明：
  1. 新建加密服务，用于 API Key 的加密存储
  2. 密钥从 .env 的 FERNET_KEY 读取
"""

from cryptography.fernet import Fernet

from app.config import Config

_fernet = None


def _get_fernet():
    """获取 Fernet 实例（延迟初始化）"""
    global _fernet
    if _fernet is None:
        key = Config.FERNET_KEY
        if not key:
            raise RuntimeError("FERNET_KEY 未配置，请在 .env 中设置")
        _fernet = Fernet(key.encode())
    return _fernet


def encrypt(plaintext):
    """
    加密明文字符串

    参数：
        plaintext: 明文字符串

    返回：
        Base64 编码的密文字符串
    """
    f = _get_fernet()
    return f.encrypt(plaintext.encode('utf-8')).decode('utf-8')


def decrypt(ciphertext):
    """
    解密密文字符串

    参数：
        ciphertext: Base64 编码的密文字符串

    返回：
        明文字符串
    """
    f = _get_fernet()
    return f.decrypt(ciphertext.encode('utf-8')).decode('utf-8')
