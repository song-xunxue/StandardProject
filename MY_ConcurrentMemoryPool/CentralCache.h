#include "Common.h"

//单例模式设计 
class CentralCache
{
public:
	static CentralCache* GetInstance()
	{
		return &_sInst;
	}
	// 获取一个非空的span
	Span* GetOneSpan(SpanList& list, size_t byte_size);
	size_t FetchRangeObj(void*& start, void*& end, size_t batchNum, size_t size);//从spanlist中下方batchNum个内存桶
	void RealeaseListToSpan(void* start,size_t size);              
private:
	SpanList _spanLists[Freelist_MAXNUM];
private:
	CentralCache()
	{}
	CentralCache(const CentralCache&) = delete;
	static CentralCache _sInst;

};
