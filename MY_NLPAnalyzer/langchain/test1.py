import langchain
from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import StrOutputParser
from sympy.physics.units import temperature

# DeepSeek-V3.2

deepseek_model=init_chat_model(
    model="deepseek-chat",
    model_provider="deepseek",
    temperature=1.5,
    max_tokens=100,
    configurable_fields=("max_tokens",), #这个max_tokens后面的，是必须的，必须为元组类型
    # config_prefix="first", 前缀不是必须的
)

message=[
    SystemMessage(content="延伸出一个200字的故事"),
    HumanMessage(content="今天天气不错，___")
]
print(deepseek_model.invoke(message,config= {"configurable": { "max_tokens":20}},).content)
# parser = StrOutputParser()
# chain =deepseek_model | parser
#
# print(chain.invoke(message))




