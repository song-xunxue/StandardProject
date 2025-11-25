#include "Common.h"
#include "objectPool.h"
#include "ThreadCache.h"
#include "ConcurrentAlloc.h"
using  std::cout;
using  std::cin;

void func1()
{
	cout << "Ïß³Ìid£º" << std::this_thread::get_id()<<endl<<endl;
	for (size_t i = 1; i < 100; i++)
	{
		void* threadcache=ConcurrentAlloc(1024);
		cout<< " ÉêÇë¿Õ¼ä£º "<<threadcache << endl;
	}
}
void func2()
{
	for (size_t i = 1; i < 7; i++)
	{
		void* threadcache = ConcurrentAlloc(7);
		cout << "Ïß³Ìid£º" << std::this_thread::get_id() << " ÉêÇë¿Õ¼ä£º " << threadcache << endl;
	}
}

void TestThreadCache()
{
	thread t1(func1);
	t1.join();

	//thread t2(func1);
	//t2.join();
}
void TestAlloc()
{
	void* threadcache1 = ConcurrentAlloc(7);
	void* threadcache11 = ConcurrentAlloc(7);
	void* threadcache12 = ConcurrentAlloc(7);
	void* threadcache13 = ConcurrentAlloc(7);
	void* threadcache2 = ConcurrentAlloc(100);
	cout << " ÉêÇë¿Õ¼ä£º " << threadcache1 << endl;
	cout << " ÉêÇë¿Õ¼ä£º " << threadcache11 << endl;
	cout << " ÉêÇë¿Õ¼ä£º " << threadcache12 << endl;
	cout << " ÉêÇë¿Õ¼ä£º " << threadcache13 << endl;
	cout << " ÉêÇë¿Õ¼ä£º " << threadcache2 << endl;
}

void TestBigAlloc()
{
	void* threadcache2 = ConcurrentAlloc(128 * 8 * 1024);
	void* threadcache3 = ConcurrentAlloc(256 *8 * 1024);
	cout << " ÉêÇë¿Õ¼ä£º " << threadcache2 << endl;
	cout << " ÉêÇë¿Õ¼ä£º " << threadcache3 << endl;
	ConcurrentDeallocate(threadcache2, 128 * 8 * 1024);
	ConcurrentDeallocate(threadcache3, 256 * 8 * 1024);

}
int main()
{
	//TestObjectPool();
	//TestThreadCache();
	//TestAlloc();
	//while (1)
	//{
	//	int n;
	//	cout << " ÉêÇëÄÚ´æ£º";
	//	cin >> n;
	//	cout << "¶ÔÆëÊý£º" << SizeClass::RounUp(n) << "  ¶ÔÆëµÄÎ»ÖÃ£º" << SizeClass::Index(n) << endl;
	//}
	TestBigAlloc();

	return 0;
}