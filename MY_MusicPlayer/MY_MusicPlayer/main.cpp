#include "musicplayer.h"

#include <QApplication>
#include <QSharedMemory>
#include <QMessageBox>

int main(int argc, char *argv[])
{
    QApplication a(argc, argv);
    //使用共享变量实现只创建一个实例
    QSharedMemory sharedMemory("MusicPlayer");
    if(sharedMemory.attach())
    {
        QMessageBox::information(nullptr,"MusicPlayer","MusicPlayer已经在运行....");
        return 0;
    }
    sharedMemory.create(1);


//    MusicPlayer w;//栈上创建
    MusicPlayer * w= new MusicPlayer;
    w->show();
    return a.exec();
}
