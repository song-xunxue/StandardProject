#include "musicplayer.h"

#include <QApplication>

int main(int argc, char *argv[])
{
    QApplication a(argc, argv);
//    MusicPlayer w;//栈上创建
    MusicPlayer * w= new MusicPlayer;
    w->show();
    return a.exec();
}
