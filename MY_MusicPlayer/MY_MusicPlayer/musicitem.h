#ifndef MUSICITEM_H
#define MUSICITEM_H

#include <QUrl>
#include <QSqlQuery>
#include <QSqlError>


class MusicItem
{
public:
    MusicItem();
    MusicItem(const QUrl& url);
    bool GetisLike();
    bool GetisHistory();

    QString GetMusicID();
    QString GetMusicName();
    QString GetMusicSinger();
    QString GetMusicAlbum();
    QString GetLrcFilePath();
    qint64 GetMusicDuration();
    QUrl GetMusicUrl();
    void setIsLike(bool like);
    void setIsHistory(bool like);
    void parseMediaMetaData();
    void InsertToDB();

    void setMusicID(const QString& s);
    void setMusicName(const QString& s);
    void setMusicSinger(const QString& s);
    void setMusicAlbum(const QString& s);
    void setMusicDuration(qint64 time);
    void setMusicUrl(const QString& s);
private:
    QString musicId;//唯一标识
    QString musicName;
    QString musicSinger;
    QString musicAlbum;
    qint64 duration;

    QUrl musicUrl;
    bool isLike;
    bool isHistory;

};

#endif // MUSICITEM_H
