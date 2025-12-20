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
        QString url=musicUrl.toLocalFile();
        if(musicUrls.contains(url))
        {
            continue;
        }
        musicUrls.insert(url);

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

void MusicList::WriteToDB()
{
    for(auto& music:musicList)
    {
        music.InsertToDB();
    }
}

void MusicList::ReadFromDB()
{
    QSqlQuery query;
    QString sql="SELECT musicId,musicName,musicSinger,musicAlbum,\
            duration,musicUrl,isLike,isHistory\
            FROM MusicInfo";
    if(!query.exec(sql))
    {
        qDebug()<<"查询失败："<<query.lastError().text();
    }
    while(query.next())
    {
        MusicItem music;
        music.setMusicID(query.value(0).toString());
        music.setMusicName(query.value(1).toString());
        music.setMusicSinger(query.value(2).toString());
        music.setMusicAlbum(query.value(3).toString());
        music.setMusicDuration(query.value(4).toLongLong());
        music.setMusicUrl("file:///"+query.value(5).toString());
        music.setIsLike(query.value(6).toBool());
        music.setIsHistory(query.value(7).toBool());
        musicList.push_back(music);
        musicUrls.insert(music.GetMusicUrl().toLocalFile());
    }
}



