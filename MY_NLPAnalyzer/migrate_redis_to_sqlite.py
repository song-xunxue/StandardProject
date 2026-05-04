"""
Redis → SQLite 数据迁移脚本

作者: 李文煜
日期: 2026-05-04

2026-05-04
变更说明：
  1. 新建一次性迁移脚本，将 Redis 中的数据迁移到 SQLite
  2. API Key 迁移时使用 Fernet 加密
  3. 幂等设计，已存在的记录跳过

使用方法：
  python migrate_redis_to_sqlite.py
"""

import json
import os
import sys
from datetime import datetime, timezone

# 确保项目根目录在 sys.path 中
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

import redis as redis_lib
from cryptography.fernet import Fernet

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.knowledge_base import KnowledgeBase
from app.models.conversation import Conversation, Message
from app.models.api_key import ApiKey
from app.models.param_preset import ParamPreset
from app.services import crypto_service


def get_redis_client():
    """获取 Redis 客户端"""
    redis_url = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
    return redis_lib.Redis.from_url(redis_url, decode_responses=True)


def parse_datetime(iso_str):
    """将 ISO 格式字符串转为 datetime 对象"""
    if not iso_str:
        return datetime.now(timezone.utc)
    try:
        return datetime.fromisoformat(iso_str)
    except (ValueError, TypeError):
        return datetime.now(timezone.utc)


def scan_keys(client, pattern):
    """使用 SCAN 命令安全地遍历匹配的 key"""
    cursor = 0
    keys = []
    while True:
        cursor, batch = client.scan(cursor=cursor, match=pattern, count=100)
        keys.extend(batch)
        if cursor == 0:
            break
    return keys


def migrate_users(client):
    """迁移用户数据"""
    print("\n=== 迁移用户数据 ===")
    keys = scan_keys(client, 'nlp:user:*')
    # 排除索引 key
    keys = [k for k in keys if not k.endswith(':emails')]
    count = 0
    skipped = 0

    for key in keys:
        data = client.hgetall(key)
        if not data:
            continue
        email = data.get('email')
        if not email:
            continue

        # 检查是否已存在
        if User.query.filter_by(email=email).first():
            skipped += 1
            continue

        user = User(
            email=email,
            password_hash=data.get('password_hash', ''),
            nickname=data.get('nickname', email.split('@')[0]),
            role=data.get('role', 'user'),
            created_at=parse_datetime(data.get('created_at')),
        )
        db.session.add(user)
        count += 1

    db.session.commit()
    print(f"  迁移: {count} 条, 跳过（已存在）: {skipped} 条")
    return count


def migrate_knowledge_bases(client):
    """迁移知识库数据"""
    print("\n=== 迁移知识库数据 ===")
    keys = scan_keys(client, 'nlp:kb:*')
    # 排除带后缀的 key（如 :messages）
    keys = [k for k in keys if k.startswith('nlp:kb:') and ':' not in k[7:]]
    count = 0
    skipped = 0

    for key in keys:
        data = client.hgetall(key)
        if not data:
            continue
        kb_id = data.get('id')
        if not kb_id:
            continue

        if KnowledgeBase.query.filter_by(id=kb_id).first():
            skipped += 1
            continue

        docs = data.get('docs', '[]')
        if isinstance(docs, (list, dict)):
            docs = json.dumps(docs, ensure_ascii=False)

        kb = KnowledgeBase(
            id=kb_id,
            user_email=data.get('user_email', ''),
            name=data.get('name', ''),
            description=data.get('description', ''),
            mode=data.get('mode', 'multi_doc'),
            docs=docs,
            created_at=parse_datetime(data.get('created_at')),
        )
        db.session.add(kb)
        count += 1

    db.session.commit()
    print(f"  迁移: {count} 条, 跳过（已存在）: {skipped} 条")
    return count


def migrate_conversations_and_messages(client):
    """迁移对话和消息数据"""
    print("\n=== 迁移对话和消息 ===")
    # 获取对话元数据 key（排除 :messages 后缀）
    keys = scan_keys(client, 'nlp:conv:*')
    conv_keys = [k for k in keys if not k.endswith(':messages')]
    conv_count = 0
    msg_count = 0
    skipped = 0

    for key in conv_keys:
        data = client.hgetall(key)
        if not data:
            continue
        conv_id = data.get('id')
        if not conv_id:
            continue

        if Conversation.query.filter_by(id=conv_id).first():
            skipped += 1
            continue

        conv = Conversation(
            id=conv_id,
            kb_id=data.get('kb_id', ''),
            user_email=data.get('user_email', ''),
            title=data.get('title', ''),
            created_at=parse_datetime(data.get('created_at')),
        )
        db.session.add(conv)
        conv_count += 1

        # 迁移消息
        msg_key = f'nlp:conv:{conv_id}:messages'
        messages_data = client.get(msg_key)
        if messages_data:
            try:
                messages = json.loads(messages_data)
                for msg in messages:
                    message = Message(
                        conv_id=conv_id,
                        role=msg.get('role', ''),
                        content=msg.get('content', ''),
                        timestamp=parse_datetime(msg.get('timestamp')),
                    )
                    db.session.add(message)
                    msg_count += 1
            except (json.JSONDecodeError, TypeError):
                print(f"  警告: 对话 {conv_id} 的消息解析失败")

    db.session.commit()
    print(f"  对话: {conv_count} 条, 消息: {msg_count} 条, 跳过（已存在）: {skipped} 条")
    return conv_count, msg_count


def migrate_api_keys(client):
    """迁移 API Key（明文 → Fernet 加密）"""
    print("\n=== 迁移 API Key 数据 ===")
    keys = scan_keys(client, 'nlp:apikey:*')
    count = 0
    skipped = 0

    for key in keys:
        data = client.hgetall(key)
        if not data:
            continue

        # 从 key 中解析 email 和 provider
        # 格式: nlp:apikey:{email}:{provider}
        parts = key.split(':')
        if len(parts) < 4:
            continue
        email = parts[2]
        provider = parts[3]

        if ApiKey.query.filter_by(user_email=email, provider=provider).first():
            skipped += 1
            continue

        api_key_plain = data.get('api_key', '')
        if not api_key_plain:
            continue

        encrypted = crypto_service.encrypt(api_key_plain)

        api_key_record = ApiKey(
            user_email=email,
            provider=provider,
            encrypted_key=encrypted,
            model_name=data.get('model_name', ''),
            base_url=data.get('base_url', ''),
        )
        db.session.add(api_key_record)
        count += 1

    db.session.commit()
    print(f"  迁移: {count} 条, 跳过（已存在）: {skipped} 条")
    return count


def migrate_presets(client):
    """迁移参数预设"""
    print("\n=== 迁移参数预设 ===")
    keys = scan_keys(client, 'nlp:preset:*')
    # 排除索引 key
    keys = [k for k in keys if k.startswith('nlp:preset:') and ':' not in k[11:]]
    count = 0
    skipped = 0

    for key in keys:
        data = client.hgetall(key)
        if not data:
            continue
        preset_id = data.get('id')
        if not preset_id:
            continue

        if ParamPreset.query.filter_by(id=preset_id).first():
            skipped += 1
            continue

        config = data.get('config', '{}')
        if isinstance(config, (dict, list)):
            config = json.dumps(config, ensure_ascii=False)

        preset = ParamPreset(
            id=preset_id,
            user_email=data.get('user_email', ''),
            name=data.get('name', ''),
            config=config,
            created_at=parse_datetime(data.get('created_at')),
        )
        db.session.add(preset)
        count += 1

    db.session.commit()
    print(f"  迁移: {count} 条, 跳过（已存在）: {skipped} 条")
    return count


def verify_migration(client):
    """验证迁移结果"""
    print("\n=== 验证迁移结果 ===")

    checks = [
        ('用户', scan_keys(client, 'nlp:user:*'), User.query.count()),
        ('知识库', [k for k in scan_keys(client, 'nlp:kb:*') if ':' not in k[7:]], KnowledgeBase.query.count()),
        ('对话', [k for k in scan_keys(client, 'nlp:conv:*') if not k.endswith(':messages')], Conversation.query.count()),
        ('API Key', scan_keys(client, 'nlp:apikey:*'), ApiKey.query.count()),
        ('参数预设', [k for k in scan_keys(client, 'nlp:preset:*') if ':' not in k[11:]], ParamPreset.query.count()),
    ]

    all_ok = True
    for name, redis_keys, db_count in checks:
        redis_count = len(redis_keys)
        status = '✓' if redis_count == db_count else '✗'
        if redis_count != db_count:
            all_ok = False
        print(f"  {status} {name}: Redis {redis_count} 条 → SQLite {db_count} 条")

    # 消息数单独统计
    msg_keys = [k for k in scan_keys(client, 'nlp:conv:*:messages')]
    total_redis_msgs = 0
    for mk in msg_keys:
        msgs = client.get(mk)
        if msgs:
            try:
                total_redis_msgs += len(json.loads(msgs))
            except (json.JSONDecodeError, TypeError):
                pass
    db_msgs = Message.query.count()
    status = '✓' if total_redis_msgs == db_msgs else '✗'
    if total_redis_msgs != db_msgs:
        all_ok = False
    print(f"  {status} 消息: Redis {total_redis_msgs} 条 → SQLite {db_msgs} 条")

    return all_ok


def main():
    print("=" * 50)
    print("Redis → SQLite 数据迁移")
    print("=" * 50)

    # 检查 FERNET_KEY
    fernet_key = os.environ.get('FERNET_KEY', '')
    if not fernet_key:
        print("\n错误: FERNET_KEY 未配置！")
        print("请在 .env 中添加 FERNET_KEY（可通过以下命令生成）：")
        print("  python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"")
        sys.exit(1)

    # 创建 Flask 应用上下文
    app = create_app()

    with app.app_context():
        # 连接 Redis
        try:
            client = get_redis_client()
            client.ping()
            print("[Redis] 连接成功")
        except Exception as e:
            print(f"[Redis] 连接失败: {e}")
            sys.exit(1)

        # 执行迁移
        try:
            migrate_users(client)
            migrate_knowledge_bases(client)
            migrate_conversations_and_messages(client)
            migrate_api_keys(client)
            migrate_presets(client)

            # 验证
            all_ok = verify_migration(client)

            print("\n" + "=" * 50)
            if all_ok:
                print("迁移完成，数据验证通过！")
            else:
                print("迁移完成，但部分数据数量不一致，请检查。")
            print("=" * 50)

        except Exception as e:
            print(f"\n迁移失败: {e}")
            db.session.rollback()
            raise


if __name__ == '__main__':
    main()
