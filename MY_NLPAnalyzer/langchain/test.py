import asyncio


async def boil_water_async():
    print("==boil_water_async: begin==")
    await asyncio.sleep(1)
    print("==boil_water_async:end==")

async def task_run():
    print("==task_run: begin==")
    task = asyncio.create_task(boil_water_async())
    await asyncio.sleep(1)
    print("==task_run:end==")

if __name__ == "__main__":
    asyncio.run(task_run())

import langchain_openai.chat_models.base
# class langchain_openai.chat_models.base.BaseChatOpenAI