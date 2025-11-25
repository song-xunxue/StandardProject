#pragma once
#include "Common.h"
#include "ObjectPool.h"
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
	std::unordered_map<PAGE_ID, Span*> _idSpanMap;
private:
	PageList _spanLists[NPAGE];//128页 按照页号映射的哈希表
	ObjectPool<Span> _spanPool;

private:
	PageCache()
	{}
	PageCache(const PageCache&) = delete;
	static PageCache _pInst;
};
