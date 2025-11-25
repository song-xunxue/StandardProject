#pragma once
#include<iostream>
#include<vector>
#include<unordered_map>
#include<algorithm>

#include<thread>
#include<mutex>

#include<assert.h>
using std::cout;
using std::endl;
using std::thread;


static const int Freelist_MAXNUM  = 208;
static const int MAX_BYTES = 256 * 1024;//对于ThreadCache申请的最大kb
static const int NPAGE = 129;
static const int PAGE_SHIFT = 13;

#ifdef _WIN32
#include <windows.h>
#else
// ...
#endif

#ifdef _WIN64
	typedef unsigned long long PAGE_ID;
#elif _WIN32
	typedef size_t PAGE_ID;
#else
// linux
#endif

//堆上申请空间
inline static void* SystemAlloc(size_t kpage)
{
#ifdef _WIN32
	void* ptr = VirtualAlloc(0, kpage << 13, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
#else
	// linux下brk mmap等
#endif

	if (ptr == nullptr)
		throw std::bad_alloc();

	return ptr;
}

inline static void SystemFree(void* ptr) {
#ifdef _WIN32 
	VirtualFree(ptr, 0, MEM_RELEASE); 
#else 
	// sbrk unmmap等 #endif
#endif
}

static inline void*& ObjectNext(void* ptr)
{
	return  *(void**)ptr;
}



//管理切分的空间的哈希桶链表
class FreeList
{
public:
	void push(void*ptr)
	{
		//头插
		ObjectNext(ptr) = _Freelist;
		_Freelist = ptr;
		++_size;
	}

	void* pop()
	{
		assert(_Freelist);
		void* obj = _Freelist;
		_Freelist = ObjectNext(_Freelist);
		--_size;
		return obj;
	}
	void PushRange(void* start,void* end,size_t n)
	{
		ObjectNext(end) = _Freelist;
		_Freelist = start;

		_size += n;
	}
	void PopRange(void* start, void* end, size_t n)
	{
		_size -= n;
		start = _Freelist;
		end = start;
		while (--n)
		{
			end = ObjectNext(end);
		}
		_Freelist = ObjectNext(end);
		ObjectNext(end) = nullptr;

	}
	size_t& MaxSize()
	{
		return maxSize;
	}
	size_t& Size()
	{
		return _size;
	}
	bool Empty()
	{
		return _Freelist == nullptr;
	}
private:
	void* _Freelist=nullptr;//缺省初始化
	size_t maxSize=1;//最开始只有一个结点
	size_t _size=0;
};


class SizeClass
{
public:
	//映射关系
	// 申请空间bytes        对齐数    哈希桶 表的位置
	// [1-128]               8byte        _freelists[0-16)   16桶
	// [128+1,1024]           16          _freelists[16-72)  7*8 56桶
	// [1024+1,8*1024]        128         _freelists[72-128)  7*8 56桶
	// [8*1024+1,64*1024]      1024       _freelists[128-184)  7*8 56桶
	// [64*1024+1,256*1024]    8*1024     _freelists[184-208)  3                        *8 24桶
	static inline size_t _RounUp(size_t bytes, size_t align)
	{
		return ((bytes + align - 1) & ~(align - 1));
	}

	static size_t RounUp(size_t bytes)
	{
		assert(bytes);
		if (bytes <= 128)
		{
			return _RounUp(bytes, 8);
		}
		else if (bytes <= 1024)
		{
			return _RounUp(bytes, 16);
		}
		else if (bytes <= 8*1024)
		{
			return _RounUp(bytes, 128);
		}
		else if (bytes <= 64*1024)
		{
			return _RounUp(bytes, 1024);
		}
		else if (bytes <= 256*1024)
		{
			return _RounUp(bytes, 8*1024);
		}
		else
		{
			//只映射256kb之内的
			//assert(false);
			//按照页对齐
			return _RounUp(bytes, 1 << PAGE_SHIFT);
		}
		return -1;
	}
	static inline size_t _Index(size_t bytes, size_t align_shift)
	{
		return ((bytes + (1 << align_shift) - 1) >> align_shift) - 1;
	}

	static size_t Index(size_t bytes)
	{
		assert(bytes<= MAX_BYTES);
		//桶表
		//size_t arr[] = { 16, 56,56,56 };
		size_t arr[] = { 16, 72,128,184 };

		if (bytes <= 128)
		{
			return _Index(bytes, 3);
		}
		else if (bytes <= 1024)
		{
			return _Index(bytes-128, 4) + arr[0];
		}
		else if (bytes <= 8*1024)
		{
			return _Index(bytes-1024, 7) + arr[1];
		}
		else if (bytes <= 64*1024)
		{
			return _Index(bytes-8*1024, 10) + arr[2];
		}
		else if (bytes <= 256*1024)
		{
			return _Index(bytes-64*1024, 13) + arr[3];
		}
		else
		{
			//暂时只映射256kb之内的
			assert(false);
		}
		return -1;
	}

	static size_t NumMoveSize(size_t size)
	{
		assert(size > 0);

		// [2, 512]，一次批量移动多少个对象的(慢启动)上限值
		// 小对象一次批量上限高
		// 小对象一次批量上限低
		size_t num = MAX_BYTES / size;
		if (num < 2)
			num = 2;

		if (num > 512)
			num = 512;

		return num;
	}
	static size_t NumMovePage(size_t size)
	{
		size_t num = NumMoveSize(size);
		size_t npage = num * size;

		npage >>= PAGE_SHIFT;
		if (npage == 0)
			npage = 1;

		return npage;
	}
};


//分好的大块内存，包含多个页内存
struct Span
{
	PAGE_ID _pageID = 0;//其实页号
	size_t n;//页内存的数量

	//双向链表组织Span
	Span* _next = nullptr;
	Span* _prev = nullptr;

	//Span内存划分的内存 链表
	void* _freelist = nullptr;
	size_t _objSize = 0;//切好的内存对象大小
	size_t _useCount = 0;//分配给ThreadCache的数量

	bool _isUse = false;//该Span是否正在使用，用于pagecache合并时保证线程安全

};

class SpanList
{
public:
	SpanList()
	{
		_head = new Span;
		_head->_next = _head;
		_head->_prev = _head;
	}
	Span* Begin()
	{
		return _head->_next;
	}
	Span* End()
	{
		return _head;
	}
	void PushFront(Span* span)
	{
		Insert(Begin(), span);
	}
	//头删并返回第一个span
	Span* PopFront()
	{
		assert(_head->_next != _head);
		Span* ret = _head->_next;
		Erase(ret);
		return ret;
	}

	//删除指定的span
	void Erase(Span*span)
	{
		Span* prev = span->_prev;
		prev->_next = span->_next;
		span->_next->_prev = prev;
	}

	//在before之前插入newspan
	void Insert(Span* before, Span* newspan)
	{
		assert(before);
		assert(newspan);
		Span* prev = before->_prev;
		prev->_next = newspan;
		newspan->_prev = prev;
		newspan->_next = before;
		before->_prev = newspan;
	}
	bool Empty()
	{
		return _head->_next == _head;
	}

private:
	Span* _head;
public:
	std::mutex _mtx;//针对 正在申请内存的 桶锁
};

