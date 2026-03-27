#测试一下工具定义的另一个接口
#使用StructuredTool类提供的函数进行创建工具 注意和@tool冲突


from langchain_core.tools import StructuredTool
from pydantic import BaseModel,Field


def mutiply(a:int, b:int) -> int:
    """mutiply function"""
    return a * b
# 方法一
# mutiply_tool=StructuredTool.from_function(func=mutiply)

#方法二
# 加入配置Pydantic类
# class MultiplyInput(BaseModel):
#     a:int =Field(description = "第一个参数")
#     b:int =Field(description = "第二个参数")
#
# mutiply_tool = StructuredTool.from_function(
#     func=mutiply,
#     name="Mutiply",
#     description="mutiply function",
#     args_schema=MultiplyInput,
# )

#方法三
# 加入content_and_artifact 参数
class MultiplyInput(BaseModel):
    a:int =Field(description = "第一个参数")
    b:int =Field(description = "第二个参数")

def mutiply(a:int, b:int) -> tuple[str,list[int]]:
    num=[a,b]
    content=f"{num}的结果是{a*b}"
    return content , num
#工具的返回是tuple [ conten , dict | list ]


mutiply_tool = StructuredTool.from_function(
    func=mutiply,
    name="mutiply",
    description="mutiply tool",
    args_schema=MultiplyInput,
    response_format="content_and_artifact"
)
if __name__ == "__main__":
    print(mutiply_tool.description)
    print(mutiply_tool.name)
    print(mutiply_tool.args_schema)
    message=mutiply_tool.invoke(
        {
            "name": "mutiply",
            "args":{"a":1,"b":2},
            "id" : 123,
            "type": "tool_call",
        }
    )
    print(message.content)
    print(message.artifact)
    print(message.id)
    print(message.type)
