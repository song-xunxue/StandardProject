#include "musiclist.h"
#include <QMimeDatabase>
#include <QDebug>

MusicList::MusicList()
{

}

void MusicList::addMusicByUrls(const QList<QUrl>& urls)
{
    for(auto musicUrl:urls)
    {
        //再次过滤有效的音乐文件
        QMimeDatabase db;
        QMimeType mime = db.mimeTypeForFile(musicUrl.toLocalFile());
        if(mime.name() != "audio/mpeg" && mime.name() != "audio/flac")
        {
            continue;
        }
        qDebug()<<"读取成功";
        musicList.push_back(musicUrl);
    }
}

bool MusicList::isEmpty()
{
    return musicList.isEmpty();
}

iterator MusicList::begin()
{
    return musicList.begin();
}

iterator MusicList::end()
{
    return musicList.end();
}

iterator MusicList::findMusicByID(const QString &musicId)
{
    auto it=begin();
    while(it!=end())
    {
        if(it->GetMusicID()==musicId)
        {
            return it;
        }
        it++;
    }
//    return it;
    return end();
}

