#联系一下RAG的基本流程
from langchain_community.document_loaders import PyPDFLoader
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import TextSplitter, CharacterTextSplitter

#1.加载本地的文件
file_path="./北京理工大学研究生学位论文撰写规范.pdf"
loader = PyPDFLoader(file_path)
docs=loader.load()
# for page in docs:
    # print(page.page_content,end='\n\n')

# 2.切割文本
text_splitter = CharacterTextSplitter(
    separator='\n\n',
    chunk_size=100,
    chunk_overlap=20,
    length_function=len,
    is_separator_regex=False,
)

# 3.嵌入模型转向量
texts=text_splitter.split_documents(docs)
# for text in texts:
#     print("*"*30)
    # print(text)

embeddings = OpenAIEmbeddings(model="text-embedding-3-large")

#这里需要字符串列表
embeddings_vector= embeddings.embed_documents(texts)
for vector in texts:
    print("*"*30)
    print(vector)