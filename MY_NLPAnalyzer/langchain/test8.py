# 测试一下redis

import os
import redis
from dotenv import load_dotenv
load_dotenv()

redis_url=os.getenv('REDIS_URL')
print(redis_url)

redis_client = redis.from_url(redis_url)
print(redis_client.ping())
