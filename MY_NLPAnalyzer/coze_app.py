import os
import tempfile
import re
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from cozepy import Coze, TokenAuth, COZE_CN_BASE_URL, Message, ChatStatus
from dotenv import load_dotenv

from langchain_community.document_loaders import PyPDFLoader

load_dotenv()

required_vars = ['COZE_API_TOKEN', 'BOT_ID', 'USER_ID']
missing_vars = [var for var in required_vars if var not in os.environ]
if missing_vars:
    raise EnvironmentError(f"缺少必要的环境变量，请检查.env文件: {', '.join(missing_vars)}")

# Flask 应用实例化
app = Flask(__name__)
CORS(app)  # 允许跨域请求


# 定义 NLP 处理智能体类
class NLPAgent:
    def __init__(self):
        self.apitoken = os.environ.get('COZE_API_TOKEN')
        self.botid = os.environ.get('BOT_ID')
        self.userid = os.environ.get('USER_ID')
        # 初始化coze实例
        self.coze = Coze(
            auth=TokenAuth(token=self.apitoken),
            base_url=COZE_CN_BASE_URL,
        )

    def get_nlp_analysis(self, text):
        """调用 AI 进行文本分词和分析"""
        try:
            # 设定 Prompt 让 AI 执行 NLP 分词任务
            prompt = (
                "请对下面这段文本进行分词处理"
                "并提取出 3-5 个【核心关键词】。\n"
                "请直接返回结果，格式如下：\n"
                "【分词结果】：...\n"
                "【核心关键词】：...\n\n"
                f"待处理文本如下：\n{text}"
            )

            messages = [
                Message(
                    role="user",
                    content=prompt,
                    content_type="text",
                    type="question"
                )
            ]

            # 使用 create_and_poll 阻塞等待结果
            chat_poll = self.coze.chat.create_and_poll(
                bot_id=self.botid,
                user_id=self.userid,
                additional_messages=messages,
                auto_save_history=True,#这里设置保存历史记录 存疑 不保存有报错
            )
            chat = chat_poll.chat

            # if chat.status == ChatStatus.COMPLETED:
            #     messages = self.coze.chat.messages.list(
            #         conversation_id=chat.conversation_id,
            #         chat_id=chat.id
            #     )
            #
            #     for msg in messages:
            #         if hasattr(msg, 'role') and msg.role == 'assistant':
            #             ai_response = msg.content.strip() #移除首尾空白
            #             ai_response = "".join(filter(lambda x: '\u4e00' <= x <= '\u9fff', ai_response))  # 只保留中文
            #             return {'success': True, 'result': ai_response}
            #     return {'success': False, 'error': '未找到 AI 的回复内容'}

            # 对其他语言的处理支持 但是智能体暂不支持
            if chat.status == ChatStatus.COMPLETED:
                # 1. 从 chat_poll 中获取消息
                messages = self.coze.chat.messages.list(
                    conversation_id=chat.conversation_id,
                    chat_id=chat.id
                )

                print(dir(messages),end="\n\n")

                ai_response = ""
                # 2. 遍历消息，提取助手最终回复
                for msg in messages:
                    # 只看 AI 助手的消息
                    if hasattr(msg, 'role') and msg.role == "assistant":
                        print(msg,end="\n\n")
                        #  情况1：有 tool_responses
                        if msg.type == "answer":
                            print(msg,end="\n")
                            ai_response = msg.content.strip()
                            print(" 插件调用 ")
                            break


                # 3. 结果判断
                if not ai_response:
                    return {"success": False, "error": "未获取到AI返回结果"}

                # 4. 仅格式化空格换行，不删除任何内容
                import re
                ai_response = re.sub(r' +', ' ', ai_response).strip()

                return {"success": True, "result": ai_response}

            else:
                return {'success': False, 'error': f'AI 处理未完成，状态: {chat.status}'}

        except Exception as e:
            return {"success": False, "error": f'请求 Coze 服务器错误: {str(e)}'}


# 创建智能体实例
nlp_agent = NLPAgent()






# ---------------- API 路由部分 ----------------
@app.route('/')
def serve_index():
    """点击链接访问根目录时，直接返回 index.html 页面"""
    return send_file('./index.html')


@app.route('/style.css')
def serve_css():
    """返回样式表"""
    return send_file('style.css')


@app.route('/api/analyze_text', methods=['POST'])
def analyze_text():
    """接收前端传来的纯文本进行分析"""
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': '请求数据为空'}), 400

    text = data.get('text', '').strip()
    if not text:
        return jsonify({'success': False, 'error': '请输入需要分析的文本'}), 400

    # 限制字数防止 API 超限 (Phase 1 临时方案)
    text = text[:1500]

    result = nlp_agent.get_nlp_analysis(text)
    return jsonify(result)


@app.route('/api/analyze_pdf', methods=['POST'])
def analyze_pdf():
    """接收前端上传的 PDF 文件，使用 Langchain 解析文本后进行分析"""
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': '未收到文件'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'error': '文件名为空'}), 400

    temp_filepath = None
    try:
        # 1. 临时保存前端传来的文件
        # Langchain 的 Loader 通常需要一个本地的物理文件路径来加载
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
            file.save(temp_file.name)
            temp_filepath = temp_file.name

        # 2. 使用 Langchain 的 PyPDFLoader 读取 PDF
        loader = PyPDFLoader(temp_filepath)
        # load() 方法会返回一个 Document 对象列表，每个对象代表 PDF 的一页
        pages = loader.load()

        text = ""
        # 3. 提取文本（为了 Demo 演示，我们依然只读取前 2 页）
        num_pages = min(2, len(pages))
        for i in range(num_pages):
            # Langchain 提取好的文本存放在 Document.page_content 中
            text += pages[i].page_content + "\n"

        if not text.strip():
            return jsonify({'success': False, 'error': '未能从该 PDF 中提取到有效文本'}), 400

        # 4. 截取前 1500 字防止超限
        text = text[:1500]

        # 5. 将提取的文本交给 AI 处理
        result = nlp_agent.get_nlp_analysis(text)

        return jsonify(result)

    except Exception as e:
        return jsonify({'success': False, 'error': f'PDF 解析失败: {str(e)}'}), 500

    finally:
        # 6. 无论成功或失败，最后都要清理本地的临时文件，防止占满磁盘
        if temp_filepath and os.path.exists(temp_filepath):
            os.remove(temp_filepath)


if __name__ == "__main__":
    # text =input()
    # result = nlp_agent.get_nlp_analysis(text)
    # print(result)
    port = int(os.environ.get('PORT', 5001))
    app.run(debug=True, port=port, use_reloader=False)