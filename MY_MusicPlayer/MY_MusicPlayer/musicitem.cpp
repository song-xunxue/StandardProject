#include "musicitem.h"
#include <QUuid>
#include <QMediaPlayer>
#include <QCoreApplication>
#include<QDebug>

MusicItem::MusicItem()
{

}

MusicItem::MusicItem(const QUrl &url)
    :musicUrl(url),
     isLike(false),
     isHistory(false)
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

QString MusicItem::GetMusicID()
{
    return musicId;
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

QString MusicItem::GetLrcFilePath()
{
    QString filepath=musicUrl.toLocalFile();
    filepath.replace(".mp3",".lrc");
    filepath.replace(".mpga",".lrc");
    filepath.replace(".flac",".lrc");
    return filepath;
}

qint64 MusicItem::GetMusicDuration()
{
    return duration;
}

QUrl MusicItem::GetMusicUrl()
{
    return musicUrl;
}

void MusicItem::setIsLike(bool like)
{
    isLike=like;
}

void MusicItem::setIsHistory(bool History)
{
    isHistory=History;
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
    qDebug()<<"此歌曲信息"<<musicName<<"  "<<musicSinger<<" "<<musicAlbum<<" "<<musicUrl.toLocalFile();
}

void MusicItem::InsertToDB()
{
//    首先确认数据库存在
    QSqlQuery query;
    query.prepare("SELECT EXISTS(SELECT 1 FROM MusicInfo WHERE musicId =? )");
    query.addBindValue(musicId);
    if(!query.exec())
    {
        qDebug()<<"查询失败："<<query.lastError().text();
        return;
    }
    if(query.next())
    {
        bool isExists = query.value(0).toBool();
        if(isExists)
        {
            //如果数据存在 就更新数据
            query.prepare("UPDATE MusicInfo SET isLike = ?, isHistory= ? WHERE musicId= ?");
            query.addBindValue(isLike ? 1:0);
            query.addBindValue(isHistory? 1:0);
            query.addBindValue(musicId);
            if(!query.exec())
            {
                qDebug()<<"更新数据失败"<<query.lastError().text();
            }
            qDebug()<<"更新成功";
        }
        else
        {
            //如果数据不存在 就插入数据
            query.prepare("INSERT INTO MusicInfo(musicId,musicName,musicSinger,musicAlbum,\
                                duration,musicUrl,isLike,isHistory)\
                        VALUES(?,?,?,?,?,?,?,?)");
            query.addBindValue(musicId);
            query.addBindValue(musicName);
            query.addBindValue(musicSinger);
            query.addBindValue(musicAlbum);
            query.addBindValue(duration);
            query.addBindValue(musicUrl.toLocalFile());
            query.addBindValue(isLike ? 1:0);
            query.addBindValue(isHistory? 1:0);
            if(!query.exec())
            {
                qDebug()<<"插入数据失败"<<query.lastError().text();
            }

            qDebug()<<"插入数据："<<musicName<<"-"<<musicId;
        }
    }
}

void MusicItem::setMusicID(const QString &s)
{
    musicId=s;
}

void MusicItem::setMusicName(const QString &s)
{
    musicName=s;
}

void MusicItem::setMusicSinger(const QString &s)
{
    musicSinger=s;
}

void MusicItem::setMusicAlbum(const QString &s)
{
    musicAlbum=s;
}

void MusicItem::setMusicDuration(qint64 time)
{
    duration=time;
}

void MusicItem::setMusicUrl(const QString &s)
{
    musicUrl=s;
}




