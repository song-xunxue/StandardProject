#include "Common.h"
#include "ThreadCache.h"
#include "CentralCache.h"

void* ThreadCache::Allocate(size_t size)
{


	assert(size <= MAX_BYTES);
	//计算内存对齐数和哈希桶位置
	size_t alignsize = SizeClass::RounUp(size);
	size_t index = SizeClass::Index(size);
	if (!_freelists[index].Empty())
	{
		return _freelists[index].pop();
	}
	else
	{
		return FetchFromCentralCache(index, alignsize);
	}
	return nullptr;
}
void ThreadCache::Deallocate(void* ptr, size_t size)
{
	size_t index = SizeClass::Index(size);
	_freelists[index].push(ptr);

	if (_freelists[index].Size() >= _freelists[index].MaxSize())
	{
		//freelist太长就回收给centralcache，这个单位空间为size
		ListTooLong(_freelists[index], size);
	}
}


// 从上级centralCache缓存获取对象 
void* ThreadCache::FetchFromCentralCache(size_t index, size_t size)
{
	size_t batchNum = min(_freelists[index].MaxSize(),SizeClass::NumMoveSize(size));
	if (_freelists[index].MaxSize() == batchNum)
	{
		_freelists[index].MaxSize() += 1;
	}
	//从Spanlist申请的一段链表的头尾结点,其中start返回给需求
	void* start = nullptr;
	void* end = nullptr;
	size_t actualNum = CentralCache::GetInstance()->FetchRangeObj(start, end, batchNum, size);
	assert(actualNum > 0);
	if (actualNum == 1)
	{
		assert(start == end);
		return start;
	}
	else
	{
		_freelists[index].PushRange(ObjectNext(start), end, actualNum - 1);
		return start;
	}

	return nullptr;
}
void ThreadCache::ListTooLong(FreeList& list, size_t size)
{
	void* start = nullptr;
	void* end = nullptr;
	list.PopRange(start, end, list.MaxSize());

	CentralCache::GetInstance()->RealeaseListToSpan(start, size);
}