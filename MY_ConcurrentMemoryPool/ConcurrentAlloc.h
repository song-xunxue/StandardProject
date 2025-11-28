#include "ThreadCache.h"
#include "PageCache.h"
#include "Common.h"
static void* ConcurrentAlloc(size_t size)
{
	if (size > MAX_BYTES)
	{
		size_t align = SizeClass::RounUp(size);
		//申请的页数
		size_t kpage = align >> PAGE_SHIFT;

		auto page = PageCache::GetInstance();
		page->_pageMtx.lock();
		Span* span=page->NewSpan(kpage);//直接向page申请页
		span->_objSize = size;//优化为释放不传size所添加
		page->_pageMtx.unlock();

		void* ptr = (void*)(span->_pageID << PAGE_SHIFT);
		return ptr;

	}
	else
	{
		if (pTLSThreadCache == nullptr)
		{
			pTLSThreadCache = new ThreadCache;
		}
		//cout <<"线程：" << std::this_thread::get_id() << "ThreaCache初始化成功"<<endl;
		return pTLSThreadCache->Allocate(size);
	}
}

//static void ConcurrentDeallocate(void* ptr, size_t size)
static void ConcurrentFree(void* ptr)
{
	Span*span=PageCache::GetInstance()->GetSpanFromPAGE_ID(ptr);
	size_t size = span->_objSize;
	if (size > MAX_BYTES)
	{
		//PageCache::GetInstance()->_pageMtx.lock();
		//PageCache::GetInstance()->RealeaseSpanToPageCache(span);
		//PageCache::GetInstance()->_pageMtx.unlock();

		auto page = PageCache::GetInstance();
		page->_pageMtx.lock();
		page->RealeaseSpanToPageCache(span);
		page->_pageMtx.unlock();
	}
	else
	{
		assert(pTLSThreadCache);
		pTLSThreadCache->Deallocate(ptr, size);
	}
}
