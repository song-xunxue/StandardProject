import os
from asyncio.windows_events import NULL

from cozepy import Coze,TokenAuth,COZE_CN_BASE_URL
#加载环境变量
from dotenv import load_dotenv
load_dotenv()

# 获取Space的列表
def Get_Space_List():
    # Coze_API=os.environ.get("COZE_API_TOKEN")
    Coze_API=os.getenv("COZE_API_TOKEN")
    if(Coze_API==None):
        print("Coze_API_TOKEN environment variable not set")
        exit()
    coze=Coze(
        #令牌
        auth=TokenAuth(Coze_API),
        #域名
        base_url=COZE_CN_BASE_URL,
    )
    try:
        spaces_list=coze.workspaces.list()
        if hasattr(spaces_list,"items"):
            return spaces_list.items
    except Exception as ex:
        print("访问空间列表失败：{}".format(ex))
        exit()
    return NULL

if __name__ == "__main__":
    spaces_list=Get_Space_List()
    print(spaces_list)