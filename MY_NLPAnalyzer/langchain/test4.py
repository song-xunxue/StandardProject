#测试一些工具绑定的接口
from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage
from langchain_core.tools import tool, StructuredTool
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field


# deepseek_model=init_chat_model(
#     model="deepseek-chat",
#     model_provider="deepseek",
#     # max_tokens=200,
# )
# 这个模型一次只能调用一个工具不能并行调用

model=ChatOpenAI(model="gpt-4o-mini")

@tool
def deepseek_add_tool(a:int,b:int)->tuple[str,list[int]]:
    """
    deepseek_add_tool
    :param a:
    :param b:
    :return:
    """
    num=[a,b]
    content="{0}+{1}的结果是{2}".format(a, b , a+b)
    return content,num

def multiply_tool(a:int,b:int)->tuple[str,list[int]]:
    num=[a,b]
    content="{0}*{1}的结果是{2}".format(a,b,a*b)
    return content,num

class MutiplyInput(BaseModel):
    a:int = Field(...,)
    b:int = Field(...,)

deepseek_multiply_tool=StructuredTool.from_function(
    func=multiply_tool,
    name="deepseek_multiply_tool",
    description="deepseek_multiply_tool",
    response_format="content_and_artifact",
)

tools=[deepseek_add_tool,deepseek_multiply_tool]
model_with_tool = model.bind_tools(tools,tool_choice="auto")

# res=model_with_tool.invoke("2+3 = ?")
# print(res,end="\n\n")

# print(res.tool_calls)

#ai没有给出真正的返回
message= [
    HumanMessage("123456789 × 987654321 =? 313131 + 3154642 = ？")
]

ai_msg=model_with_tool.invoke(message)
message.append(ai_msg)

print(ai_msg,end="\n\n")


for tool_call in ai_msg.tool_calls:
    select_tools={"deepseek_multiply_tool":deepseek_multiply_tool,"deepseek_add_tool":deepseek_add_tool}[tool_call["name"].lower()]
    tool_msg=select_tools.invoke(tool_call)
    message.append(tool_msg)

print(message,end="\n\n")

# res=deepseek_model.invoke(message)
# print(res.content)
#
# res=deepseek_model.invoke("123456789 × 987654321 =?")
# print(res.content)


"""
为什么需要这样做，
不 bind tools → 没有工具调用流程 → 只能靠模型自己猜
bind tools :用户输入 → AI思考 → 调用工具 → AI回答
LLM是语言模型，只输出意图不执行实际的动作


Alright, let's multiply \( 123456789 \times 987654321 \) step by step.

---

### 1. Break \( 987654321 \) into parts
We can write:
\[
987654321 = 987654321
\]
But perhaps easier: note that \( 987654321 = 10^9 - 112345679 \) is not so nice. Let's instead use the distributive property by splitting \( 987654321 \) into \( 987600
Disconnected from server

"""

""" https://python.langchain.com/docs/integrations/tools/  官方工具包"""