#练习流式输出
from typing import Iterator, List

from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnableLambda

model=init_chat_model(
    model="deepseek-chat",
    model_provider="deepseek",
    max_tokens=300,
)

message=[
    HumanMessage("写一个200字的笑话,每一句话使用。分隔")
]
parser = StrOutputParser()

# chain = model | parser

# print(chain.invoke(message))
#
# for chunk in chain.stream(message):
#     print(chunk,end="|",flush=True)

def split_into_list(input:Iterator[str])->Iterator[List[str]]:
    buffer=""
    for item in input:
        buffer+=item
        if item==','or item=='。' or item == '.':
            yield [buffer]
            buffer=""
    yield [buffer]

chain = model | parser | RunnableLambda(split_into_list)
for chunk in chain.stream(message):
    print(chunk,end="|",flush=True)