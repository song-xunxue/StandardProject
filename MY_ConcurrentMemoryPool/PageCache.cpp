#include "PageCache.h"
#include "Common.h"
PageCache PageCache::_pInst;

//申请k页的span
Page* PageCache::NewSpan(size_t k)
{
	//大块内存申请
	if (k > NPAGE - 1)
	{
		////直接向系统进行申请k个内存页
		//void* ptr=SystemAlloc(k);
		//Span* span = new Span;//注意delete
		//span->n = k;
		//span->_pageID = (PAGE_ID)ptr >> PAGE_SHIFT;

		//////建立索引
		////for (size_t i = 0; i < k; ++i)
		////{
		////	_idSpanMap[span->_pageID + i] = span;
		////}
		////不需要建立索引，因为整个span的空间都给出去了
		//// 浪费空间不超过一个span
		////当释放的时候也是整个换回来的
		//_idSpanMap[span->_pageID] = span;
		//return span;



		//d搭配定长内存池进行使用
		void* ptr = SystemAlloc(k);
		Span* span = _spanPool.New();//注意delete
		span->n = k;
		span->_pageID = (PAGE_ID)ptr >> PAGE_SHIFT;

		////建立索引
		//for (size_t i = 0; i < k; ++i)
		//{
		//	_idSpanMap[span->_pageID + i] = span;
		//}
		//不需要建立索引，因为整个span的空间都给出去了
		// 浪费空间不超过一个span
		//当释放的时候也是整个换回来的
		_idSpanMap[span->_pageID] = span;
		return span;
	}

	//先查看Span[k]是否还有Span
	if (!_spanLists[k].Empty())
	{
		//返回一个span，让centralCache自己去划分空间
		Span* kspan= _spanLists[k].PopFront();
		for (size_t i = 0; i < kspan->n; i++)
		{
			_idSpanMap[kspan->_pageID + i]= kspan;
		}

		return kspan;
	}
	else
	{
		//_spanLists[k]为空，向上的页号进行查找，然后进行切分
		for (int i = k + 1; i < NPAGE; i++)
		{
			//if (i == NPAGE - 1)
			//{
			//	cout << "NewSpan" << endl;
			//}
			if (!_spanLists[i].Empty())
			{

				Span* nspan = _spanLists[i].PopFront();
				Span* kspan = new Span;//划分的k页空间
				kspan->n = k;
				nspan->n -= k;

				//头切一个k页的span
				kspan->_pageID = nspan->_pageID;
				nspan->_pageID += k;

				_spanLists[nspan->n].PushFront(nspan);//余下的空间挂回对应的哈希桶
				for (size_t i = 0; i < kspan->n; i++)
				{
					_idSpanMap[kspan->_pageID + i] = kspan;
				}
				//建立映射
				_idSpanMap[nspan->_pageID] = nspan;
				_idSpanMap[nspan->_pageID+nspan->n-1] = nspan;


				return kspan;

			}
		}

		//如果没有大块空间，就向堆进行申请
		Span* Bigspan = new Span;
		void* ptr = SystemAlloc(NPAGE-1);
		Bigspan->_pageID = (PAGE_ID)ptr >> PAGE_SHIFT;
		Bigspan->n = NPAGE - 1;
		_spanLists[NPAGE - 1].PushFront(Bigspan);
		return NewSpan(k);//递归调用 此时大块空间申请
	}
}

Span* PageCache::GetSpanFromPAGE_ID(void* ptr)
{
	//理论上一定能够找到的
	PAGE_ID id = ((PAGE_ID)ptr >> PAGE_SHIFT);
	auto it = _idSpanMap.find(id);
	if (it != _idSpanMap.end())
	{
		return it->second;
	}
	else
	{
		assert(false);
		return nullptr;
	}
}
void PageCache::RealeaseSpanToPageCache(Span* span)
{
	//大块内存的释放
	if (span->n > NPAGE - 1)
	{
		////删除大块内存的索引
		//for (size_t i = 0; i < span->n; ++i)
		//{
		//	_idSpanMap.erase(span->_pageID+i);
		//}
		_idSpanMap.erase(span->_pageID);
		
		//释放
		void* ptr = (void*)(span->_pageID << PAGE_SHIFT);
		SystemFree(ptr);
		//delete span;
		_spanPool.Delete(span);
		return;
	}


	//前向合并
	while (1)
	{
		PAGE_ID prev_id = span->_pageID - 1;
		auto it = _idSpanMap.find(prev_id);
		//没有找到，还没有回收前面的空间
		if (it == _idSpanMap.end())
		{
			break;
		}
		Span* prev_span = it->second;
		//找到了，但是合并之后会大于128页，无法管理
		if (prev_span->n + span->n > NPAGE)
		{
			break;
		}
		//找到了，但是前面的span正在使用
		if (prev_span->_isUse)
		{
			break;
		}
		//此处开始合并
		//旧的映射关系删除
		_idSpanMap.erase(prev_id);
		span->_pageID = prev_span->_pageID;
		span->n += prev_span->n;
		_spanLists[prev_span->n].Erase(prev_span);
		//_spanLists[span->n].PushFront(span);
		//清除对象
		delete prev_span;

	}
	//前后合并
	while (1)
	{
		PAGE_ID next_id = span->_pageID + span->n;
		auto it = _idSpanMap.find(next_id);
		//没有找到，还没有回收前面的空间
		if (it == _idSpanMap.end())
		{
			break;
		}
		Span* next_span = it->second;
		//找到了，但是合并之后会大于128页，无法管理
		if (next_span->n + span->n > NPAGE)
		{
			break;
		}
		//找到了，但是前面的span正在使用
		if (next_span->_isUse)
		{
			break;
		}
		//旧的映射关系删除
		_idSpanMap.erase(next_id);
		span->n += next_span->n;
		_spanLists[next_span->n].Erase(next_span);
		//清除对象
		delete next_span;
	}
	//合并完之后再插入，减少操作和重复插入删除
	_spanLists[span->n].PushFront(span);
	span->_isUse = false;
	//新的映射关系插入
	_idSpanMap[span->_pageID] = span;
	_idSpanMap[span->_pageID+span->n] = span;
}