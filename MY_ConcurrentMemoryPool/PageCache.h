#pragma once
#include "Common.h"
#include "ObjectPool.h"
#include "SpanMap.h"
typedef SpanList PageList;
typedef Span Page;

class PageCache
{
public:
	static PageCache* GetInstance()
	{
		return &_pInst;
	}
	Page* NewSpan(size_t k);//申请多少页的Span
	Span* GetSpanFromPAGE_ID(void* ptr);
	void RealeaseSpanToPageCache(Span* span);
	std::mutex _pageMtx;
	//std::unordered_map<PAGE_ID, Span*> _idSpanMap;
	//std::map<PAGE_ID, Span*> _idSpanMap;
	//竞态条件主要在对这个映射关系的访问上，尤其是加锁和解锁的消耗
	//这是不可避免的，例如map使用的红黑树，会有节点的旋转问题
	// 如果不加锁，当一个线程在遍历查找时，另一个线程删除每一个节点会导致树的结构发生改变
	//可能导致要查找的节点到已经遍历过的范围区域内，这也就解释了为什么在3线程下测试时，有时候能够运行有时候不能

	TCMalloc_PageMap1<32 - PAGE_SHIFT> _idSpanMap;

private:
	PageList _spanLists[NPAGE];//128页 按照页号映射的哈希表
	ObjectPool<Span> _spanPool;
private:
	PageCache()
	{}
	PageCache(const PageCache&) = delete;
	static PageCache _pInst;
};
