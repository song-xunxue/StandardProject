#测试一下工具定义接口
#使用@tool装饰器进行定义
from langchain_core.tools import tool
from pydantic import BaseModel, Field


#定义工具：函数名+字符串文档+类型提示
#

# 方法一
# @tool
# def add(a:int,b:int)->int:
#     """
#     加法
#
#     :param a:
#     :param b:
#     :return: a+b
#     """
#     return a+b


# print(add.invoke({"a":1,"b":2})) #invoke的input只接受dict方法


# 方法二
# class AddInput(BaseModel):
#     """ 加法 """
#     a:int = Field(...,description="第一个整数")
#     b:int = Field(...,description="第二个整数")
#
# @tool(args_schema=AddInput)
# def add(a:int,b:int)->int:
#     return a+b
#
#
# print(add.invoke({"a": 1, "b": 2}))

#方法三
from typing_extensions import Annotated
@tool
def multiply(
        a: Annotated[int, ..., "First integer"],
        b: Annotated[int, ..., "Second integer"] ) -> int:
    """Multiply two integers."""
    return a * b


print(multiply.invoke({"a": 1, "b": 2}))
print(multiply.name)
print(multiply.args)
print(multiply.description)

