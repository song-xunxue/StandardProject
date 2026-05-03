"""
MY_NLPAnalyzer - 智能NLP文献解析助手

启动入口文件

作者: 李文煜
日期: 2026-04-15

2026-04-15
变更说明：
  1. 精简为启动入口，所有逻辑移至 app/ 模块
  2. 使用 Flask 应用工厂模式
"""

from dotenv import load_dotenv
from app import create_app
import os

load_dotenv()
app = create_app()


if __name__ == "__main__":

    port = int(os.environ.get('PORT', 5001))
    print(f"""
    ╔══════════════════════════════════════════╗
    ║   NLP 文献解析助手 启动成功                  ║
    ║   地址: http://127.0.0.1:{port}           ║
    ╚══════════════════════════════════════════╝
    """)
    app.run(debug=True, port=port, use_reloader=False)
