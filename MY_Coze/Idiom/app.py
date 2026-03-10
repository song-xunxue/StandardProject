import os
import random
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
            auth=(self.apitoken),
            base_url=COZE_CN_BASE_URL,
        )
        # 初始化成语
        self.current_idiom = self.Get_random_idiom()
        #初始化历史记录
        self.Game_history = []


    def Get_random_idiom(self):
        return random.choice(COMMON_IDIOMS)

    def Add_to_histroy(self, user_idiom,sdk_repsonse):
        record={
            "user:":user_idiom,
            "ai":sdk_repsonse,
            "time":datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        # 头插只保存最新的记录
        self.Game_history.insert(0,record)
        if(len(self.Game_history)>100):
            self.Game_history = self.Game_history[100]

    # 针对
    def Get_sdk_repsonse(self,user_input):
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
                    chat_id=chat.chat_id
                )
                timeout+=1
                sleep(1)
            if(timeout >=30):
                return {"success:":False,'error':"ai响应超时"}
            if(chat.status == ChatStatus.COMPLETED):
                messages = self.coze.chat.messages.list(
                    conversation_id=chat.conversation_id,
                    chat_id=chat.chat_id
                )
                sdk_repsonse = None
                for message in messages:
                    if(hasattr(message,"role") and message.role=="repsonse"):
                        sdk_repsonse = message.content.strip() #移除首尾空白
                        sdk_response = "".join(filter(lambda x: '\u4e00' <= x <= '\u9fff', sdk_response)) #只保留中文

                    if sdk_repsonse and len(sdk_repsonse)==4:
                        self.Add_to_histroy(user_input,sdk_repsonse)
                        self.current_idiom = sdk_repsonse
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
            return {"success": False, "error": f'服务器处理错误: {str(e)}'
                    