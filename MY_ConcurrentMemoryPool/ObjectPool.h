#pragma once
#include "Common.h"

template<class T>
class ObjectPool
{
public:
	T* New()
	{
		T * obj = nullptr;

		//3.优先使用释放内存链表中的内存
		if (_freelist != nullptr)
		{
			//void*next=*(void**)_freelist;
			//obj = (T*)_freelist;
			//_freelist = next;


			//头删
			obj = (T*)_freelist;
			_freelist = *(void**)obj;
		}
		else
		{

			//1.不足new一个T或者为空时 就再次申请大空间
			if (surplusSize < sizeof(T))
			{
				//surplusSize = 128 * 1024;
				//_memory = (char*)malloc(surplusSize);//128

				_memory = (char*)SystemAlloc(128);//128个8kb 即1MB
				if (_memory == nullptr)
				{
					throw std::bad_alloc();
				}
			}

			//2.new对象
			obj = (T*)_memory;
			size_t TSize = sizeof(T) < sizeof(void*) ? sizeof(void*) : sizeof(T);
			surplusSize -= TSize;
			_memory += TSize;
		}
		new(obj)T;//定位new
		return obj;
	}
	
	void Delete(T* obj)
	{
		//显示调用析构进行对象的清除
		obj->~T();

		//使用头插，合并_freelist==nullptr的情况
		*(void**)obj = _freelist;//*(void**)让系统自动判断是32还是64，保证obj前指针大小指向下一个内存块的首地址处
		_freelist = obj;
		 
	}
private:
	char* _memory = nullptr;//申请的定长内存池大小
	size_t surplusSize = 0;//剩余的字节数
	void* _freelist = nullptr;//释放的内存 将其组织为链表

};

//struct TreeNode
//{
//	int _val;
//	TreeNode* _left;
//	TreeNode* _right;
//
//	TreeNode()
//		:_val(0)
//		, _left(nullptr)
//		, _right(nullptr)
//	{}
//};
//
//void TestObjectPool()
//{
//	// 申请释放的轮次
//	const size_t Rounds = 5;
//
//	// 每轮申请释放多少次
//	const size_t N = 100000;
//
//	std::vector<TreeNode*> v1;
//	v1.reserve(N);
//
//	size_t begin1 = clock();
//	for (size_t j = 0; j < Rounds; ++j)
//	{
//		for (int i = 0; i < N; ++i)
//		{
//			v1.push_back(new TreeNode);
//		}
//		for (int i = 0; i < N; ++i)
//		{
//			delete v1[i];
//		}
//		v1.clear();
//	}
//
//	size_t end1 = clock();
//
//	std::vector<TreeNode*> v2;
//	v2.reserve(N);
//
//	ObjectPool<TreeNode> TNPool;
//	size_t begin2 = clock();
//	for (size_t j = 0; j < Rounds; ++j)
//	{
//		for (int i = 0; i < N; ++i)
//		{
//			v2.push_back(TNPool.New());
//		}
//		for (int i = 0; i < N; ++i)
//		{
//			TNPool.Delete(v2[i]);
//		}
//		v2.clear();
//	}
//	size_t end2 = clock();
//
//	cout << "new cost time:" << end1 - begin1 << endl;
//	cout << "object pool cost time:" << end2 - begin2 << endl;
//}