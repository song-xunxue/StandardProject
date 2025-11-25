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
		return pTLSThreadCache->Allocate(size);
	}
}

static void ConcurrentDeallocate(void* ptr, size_t size)
{
	if (size > MAX_BYTES)
	{
		PageCache::GetInstance()->_pageMtx.lock();
		Span*span=PageCache::GetInstance()->GetSpanFromPAGE_ID(ptr);
		PageCache::GetInstance()->RealeaseSpanToPageCache(span);
		PageCache::GetInstance()->_pageMtx.unlock();

		auto page = PageCache::GetInstance();
		page->_pageMtx.lock();
		//找到span
		Span* span = page->GetSpanFromPAGE_ID(ptr);
		page->RealeaseSpanToPageCache(span);
		page->_pageMtx.unlock();

	}
	else
	{
		assert(pTLSThreadCache);
		pTLSThreadCache->Deallocate(ptr, size);
	}
}
