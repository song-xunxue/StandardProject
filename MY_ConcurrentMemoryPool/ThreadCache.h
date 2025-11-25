#pragma once
#include"Common.h"


class ThreadCache
{
public:
	void* Allocate(size_t size);// 从中缓存获取对象 
	void Deallocate(void* ptr, size_t size); 
	void* FetchFromCentralCache(size_t index, size_t size); 
	void ListTooLong(FreeList& list, size_t size);// 释放对象时，链表过长时，回收内存回到中centralcache缓存 
private:
	FreeList _freelists[Freelist_MAXNUM];

	//TLS进行线程局部存储 保证线程独立性
};
//static保证只在本文件可见，链接不会出错
thread_local static ThreadCache* pTLSThreadCache = nullptr;