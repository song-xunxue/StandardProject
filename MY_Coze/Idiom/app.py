import os
import random
import sys
import time
from datetime import datetime
from time import sleep

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from cozepy import Coze, TokenAuth, COZE_CN_BASE_URL, Message, ChatStatus
from  dotenv import load_dotenv
load_dotenv()

required_vars = ['COZE_API_TOKEN', 'BOT_ID', 'USER_ID']
missing_vars=[var for var in required_vars if var not in os.environ]
if missing_vars:
    # 抛出环境异常
    raise  EnvironmentError(f"缺少必要的环境变量，请检查.env文件: {', '.join(missing_vars)}")

# Flask 应用本质是一个基于 Flask 框架创建的 Web 服务实例，它是你编写的 Python 代码与 HTTP 网络请求之间的 “桥梁”
app=Flask(__name__)
CORS(app)  # 允许所有来源的跨域请求
"""
先理解「跨域」：
当你的前端页面（比如 http://localhost:3000）想请求 Flask 后端接口（http://localhost:5000）时
浏览器会因为「域名 / 端口不同」拦截请求（这是浏览器的安全机制，叫同源策略）
CORS(app) 就是给 Flask 应用添加跨域响应头，告诉浏览器 “允许这个请求”。
"""
# 默认的成语变量
COMMON_IDIOMS = ['一心一意', '三心二意', '百发百中', '千方百计', '万无一失']

# 定义游戏类
class IdiomGame:
    def __init__(self):
        self.apitoken = os.environ.get('COZE_API_TOKEN')
        self.botid = os.environ.get('BOT_ID')
        self.userid = os.environ.get('USER_ID')
        # 初始化coze实例
        self.coze = Coze(
            auth=TokenAuth(token=self.apitoken),
            base_url=COZE_CN_BASE_URL,
        )
        # 初始化成语
        self.current_idiom = self.Get_random_idiom()
        #初始化历史记录
        self.game_history = []


    def Get_random_idiom(self):
        return random.choice(COMMON_IDIOMS)

    def generate_initial_idiom(self):
        """调用AI生成初始成语，如果失败则使用默认成语"""
        seed_chars = ['天', '地', '人', '和', '山', '水', '风', '云', '春', '秋', '花', '鸟', '龙', '马', '大', '小',
                      '千', '万', '一', '心', '海', '空', '星', '辰']
        random_char = random.choice(seed_chars)
        try:
            messages = [
                Message(
                    role="user",
                    content=f"成语接龙游戏开始，请生成一个四字成语作为开头。为了保证每次不一样，请生成一个包含“{random_char}”字的成语。\
                            只需要返回成语本身，不要添加任何额外解释或文字。",
                    content_type="text",
                    type="question"
                )
            ]

            # 核心改造：用 create_and_poll 替代 create + 手动轮询
            # 内置超时（timeout=30）和轮询逻辑，直接返回最终结果
            ChatPoll = self.coze.chat.create_and_poll(
                bot_id=self.botid,
                user_id=self.userid,
                additional_messages=messages,
                auto_save_history=True
                # timeout=30,  # 显式指定超时时间（30秒）
                # poll_interval=1
            )
            chat=ChatPoll.chat
            # 无需手动判断超时：create_and_poll 超时会直接抛出异常
            if chat.status == ChatStatus.COMPLETED:
                # 原逻辑：获取消息列表并过滤助手回复
                messages = self.coze.chat.messages.list(
                    conversation_id=chat.conversation_id,
                    chat_id=chat.id
                )
                for msg in messages:
                    if hasattr(msg, 'role') and msg.role == 'assistant':
                        initial_idiom = msg.content.strip()
                        # 过滤非中文字符
                        initial_idiom = "".join(filter(lambda x: '\u4e00' <= x <= '\u9fff', initial_idiom))
                        # 校验是否为四字有效成语
                        if initial_idiom and len(initial_idiom) == 4:
                            print(f"AI生成初始成语成功: {initial_idiom}")
                            return initial_idiom

            # 若未找到有效成语，抛出异常
            raise Exception("AI生成的初始成语无效")

        except TimeoutError:
            # 捕获 create_and_poll 的超时异常（更精准）
            print(f"生成初始成语失败: AI生成初始成语超时, 使用默认成语")
            return random.choice(COMMON_IDIOMS)
        except Exception as e:
            # 捕获其他所有异常（如成语无效、接口调用失败等）
            print(f"生成初始成语失败: {e}, 使用默认成语")
            return random.choice(COMMON_IDIOMS)


    def Add_to_histroy(self, user_idiom,sdk_repsonse):
        record={
            "user:":user_idiom,
            "ai":sdk_repsonse,
            "time":datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        # 头插只保存最新的记录
        self.game_history.insert(0,record)
        if(len(self.game_history)>100):
            self.game_history = self.game_history[:100]

    # 针对
    def Get_sdk_response(self,user_input):
        try:
            messages = [
                # Message(
                #     role="user",
                #     content=f"成语接龙游戏，上一个成语是：{self.current_idiom}，请接下一个成语。只需要返回成语本身，不要添加任何额外解释或文字。",
                #     content_type="text",
                #     type="question"
                # ),
                Message(
                    role="user",
                    content=f"我对上一个成语{self.current_idiom}接的是"+user_input,
                    content_type="text",
                    type="question"
                )
            ]
            chat =self.coze.chat.create(
                bot_id=self.botid,
                user_id=self.userid,
                additional_messages=messages,
                auto_save_history=True
            )

            # 等待响应
            timeout=0
            while chat.status == ChatStatus.IN_PROGRESS and timeout < 30:
                # 更新本地的chat 信息
                chat=self.coze.chat.retrieve(
                    conversation_id=chat.conversation_id,
                    chat_id=chat.id
                )
                timeout+=1
                sleep(1)
            if(timeout >=30):
                return {"success:":False,'error':"ai响应超时"}
            if(chat.status == ChatStatus.COMPLETED):
                messages = self.coze.chat.messages.list(
                    conversation_id=chat.conversation_id,
                    chat_id=chat.id
                )
                sdk_response = None
                for message in messages:
                    if(hasattr(message,"role") and message.role=="assistant"):
                        sdk_response = message.content.strip() #移除首尾空白
                        sdk_response = "".join(filter(lambda x: '\u4e00' <= x <= '\u9fff', sdk_response)) #只保留中文

                    if sdk_response and len(sdk_response)==4:
                        self.Add_to_histroy(user_input,sdk_response)
                        self.current_idiom = sdk_response
                        return {
                            'success': True,
                            'sdk_response': sdk_response,
                            'current_idiom': self.current_idiom,
                            'history': self.game_history
                        }
                    else:
                        return {'success': False, 'error': f'AI返回无效: {sdk_response or "无响应"}'}
                else:
                    return {'success': False, 'error': f'AI处理失败，状态: {chat.status}'}
        except Exception as e:
            return {"success": False, "error": f'服务器处理错误: {str(e)}'}

    # 重置游戏状态，生成新的初始成语并清空历史记录

    def reset_game(self):
        self.current_idiom = self.generate_initial_idiom()
        self.game_history = []
        return self.current_idiom

# 创建游戏实例
game = IdiomGame()


#提供API前端接口 Flask

#提供前端页面
@app.route('/')
def serve_index():
    """点击链接访问根目录时，直接返回 index.html 页面"""
    return send_file('index.html')

@app.route('/style.css')
def serve_css():
    """返回页面的 CSS 样式文件"""
    return send_file('style.css')
@app.route('/api/play', methods=['POST'])
def play_game():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': '请求数据为空或格式错误'}), 400

        user_input = data.get('idiom', '').strip()

        if len(user_input) != 4 or not user_input:
            return jsonify({'success': False, 'error': '请输入4字成语'}), 400

        result = game.Get_sdk_response(user_input)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': f'请求处理错误: {str(e)}'}), 500

# 定义初始化接口
@app.route('/api/init', methods=['GET'])
def init_game():
    """初始化游戏，返回当前成语和历史记录"""
    return jsonify({
        'current_idiom': game.current_idiom,
        'history': game.game_history
    })

# 定义认输功能
@app.route('/api/restart', methods=['POST'])
def restart_game():
    """重置游戏"""
    try:
        new_idiom = game.reset_game()
        return jsonify({
            'success': True,
            'current_idiom': new_idiom,
            'history': game.game_history
        })
    except Exception as e:
        return jsonify({'success': False, 'error': f'重置游戏失败: {str(e)}'}), 500




if __name__ == "__main__":
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, port=port, use_reloader=False)