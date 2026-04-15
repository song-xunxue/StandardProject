# 联系结构化绑定
from typing import TypedDict, Annotated, Union

from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage
from langchain_tavily import TavilySearch
from pydantic import BaseModel, Field

model=init_chat_model(
    model="deepseek-chat",
    model_provider="deepseek",
)

message=[
    HumanMessage("写一个50字的笑话")
]

class History(BaseModel):
    """给用户写一个故事"""
    name: str =Field(description="故事的名称\n")
    line: list[str] =Field(description="故事的主体")

class Joke(TypedDict):
    name: Annotated[int, ...,"笑话的名称"]
    line: list[str] =Field(deprecated="笑话的内容")

class FindResult(TypedDict):
    """返回查询的结果"""
    query: str = Field(description="搜索查询")
    findings: str = Field(description="调查结果摘要")

class ReturnSturct(BaseModel):
    response:Union[History ,Joke,FindResult]

model=model.with_structured_output(ReturnSturct)
# res=model.invoke(message)
# print(res)


#结合查询工具绑定结构化输出

tool=TavilySearch(max_results=4)

model=model.bind_tools([tool])

res=model.invoke([HumanMessage("今天北京天气如何")])
print(res)

