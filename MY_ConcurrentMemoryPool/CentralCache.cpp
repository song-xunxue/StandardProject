#include "CentralCache.h"
#include "PageCache.h"

CentralCache CentralCache::_sInst;

Span* CentralCache::GetOneSpan(SpanList& list, size_t size)
{
	Span* it = list.Begin();
	//如果有span中划分的小块空间没有使用完就返回
	while (it != list.End())
	{
		if (it->_freelist != nullptr)
		{
			return it;
		}
		else
		{
			it = it->_next;
		}
	}
	//走到此就说明span中没有空间了，或者这个桶下面没有span
	//先解开锁，让其他的threadCache也能申请 再继续newSpan
	list._mtx.unlock();

	PageCache::GetInstance()->_pageMtx.lock();
	Span* newspan = PageCache::GetInstance()->NewSpan(SizeClass::NumMovePage(size));
	assert(newspan);
	newspan->_isUse = true;
	newspan->_objSize = size;
	PageCache::GetInstance()->_pageMtx.unlock();


	//划分申请的span大块空间
	char* start = (char*)(newspan->_pageID << PAGE_SHIFT);
	size_t bytesize = newspan->n << PAGE_SHIFT;//申请的大块空间的大小
	char* end = start + bytesize;

	newspan->_freelist = start;
	//先切一块方便尾插
	void* tail = start;
	start += size;

	while (start < end)
	{
		ObjectNext(tail) = start;
		tail = start;
		start += size;
	}

	ObjectNext(tail) = NULL;
	//int j = 0;
	//void* cur = newspan->_freelist;
	//while (cur)
	//{
	//	cur = ObjectNext(cur);
	//	++j;
	//}
	//if (j != (bytesize / size))
	//{
	//	cout << "error" << endl;
	//}



	list._mtx.lock();
	list.PushFront(newspan);
	//将这个newspan先加入到这个SpanList中
	//如果空间没有完全用完就能继续管理
	return newspan;
}

//从CentralCache获取batchNum个size大小的空间  链表组织的
size_t CentralCache::FetchRangeObj(void*& start, void*& end, size_t batchNum, size_t size)
{
	size_t index = SizeClass::Index(size);
	_spanLists[index]._mtx.lock();
	Span* span = GetOneSpan(_spanLists[index], size);
	assert(span);
	assert(span->_freelist);

	size_t  i = 0;
	int actualNum = 1;
	start = span->_freelist;
	end = start;
	while (i < batchNum - 1 && ObjectNext(end) != nullptr)
	{
		end = ObjectNext(end);
		i++;
		actualNum++;
	}
	span->_freelist = ObjectNext(end);
	ObjectNext(end) = nullptr;
	span->_useCount += actualNum;

	_spanLists[index]._mtx.unlock();

	return actualNum;
}

void CentralCache::RealeaseListToSpan(void* start, size_t size)
{
	size_t index = SizeClass::Index(size);
	_spanLists[index]._mtx.lock();
	while (start)
	{
		void* next = ObjectNext(start);
		auto page = PageCache::GetInstance();
		Span* span = page->GetSpanFromPAGE_ID(start);
		//头插回收的空间
		ObjectNext(start) = span->_freelist;
		span->_freelist = start;
		span->_useCount--;//修复之前没有--

		if (span->_useCount==0)
		{
			_spanLists[index].Erase(span);
			span->_freelist = nullptr;
			span->_next = nullptr;
			span->_prev = nullptr;
			
			_spanLists[index]._mtx.unlock();
			page->_pageMtx.lock();
			page->RealeaseSpanToPageCache(span);
			page->_pageMtx.unlock();
			//PageCache::GetInstance()->_pageMtx.lock();
			//PageCache::GetInstance()->RealeaseSpanToPageCache(span);
			//PageCache::GetInstance()->_pageMtx.unlock();
			
			_spanLists[index]._mtx.lock();//终于找到了
		}
		start = next;
	}
	_spanLists[index]._mtx.unlock();

}