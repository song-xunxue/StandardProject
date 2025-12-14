#include "musicitem.h"
#include <QUuid>
#include <QMediaPlayer>
#include <QCoreApplication>
#include<QDebug>

MusicItem::MusicItem()
{

}

MusicItem::MusicItem(const QUrl &url)
    :isLike(false),
      isHistory(false),
    musicUrl(url)
{
    musicId = QUuid::createUuid().toString();
    //解析数据
//    qDebug()<<"解析数据";
    parseMediaMetaData();
}

bool MusicItem::GetisLike()
{
    return isLike;
}

bool MusicItem::GetisHistory()
{
    return isHistory;
}

QString MusicItem::GetMusicName()
{
    return musicName;
}

QString MusicItem::GetMusicSinger()
{
    return musicSinger;
}

QString MusicItem::GetMusicAlbum()
{
    return musicAlbum;
}

qint64 MusicItem::GetMusicDuration()
{
    return duration;
}

QUrl MusicItem::GetMusicUrl()
{
    return musicUrl;
}

QString MusicItem::GetMusicID()
{
    return musicId;
}

void MusicItem::parseMediaMetaData()
{
    QMediaPlayer player;
    if(musicUrl.isEmpty())
    {
        qDebug()<<"MusicUrl access failed";
    }
    player.setMedia(musicUrl);//设置播放源

    //循环检测
    while(!player.isMetaDataAvailable())
    {
//        让程序在 “阻塞式操作” 中主动处理待办的 GUI 事件，避免界面卡死。
        QCoreApplication::processEvents();
    }

//    qDebug()<<"数据解析成功";
    if(player.isMetaDataAvailable())
    {
        musicName = player.metaData("Title").toString();
        musicSinger = player.metaData("Author").toString();
        musicAlbum= player.metaData("AlbumTitle").toString();
        duration=player.duration();

        //"Akie秋绘 - 天ノ弱 (天之弱)_H"
        QString filename=musicUrl.fileName();
        int index=filename.indexOf("-");
        if(musicName.isEmpty())
        {
            if(index!=-1)
            {
                musicName=filename.mid(0,index).trimmed();
            }
            else
            {
                musicName="歌名未知";
            }
        }
        if(musicSinger.isEmpty())
        {
            if(index!=-1)
            {
                musicSinger=filename.mid(index+1,filename.indexOf(".")).trimmed();
            }
            else {
                musicSinger="歌手未知";
            }
        }
        if(musicAlbum.isEmpty())
        {
            musicAlbum="专辑未知";
        }
    }
    qDebug()<<"此歌曲信息"<<musicName<<"  "<<musicSinger<<" "<<musicAlbum;
}


