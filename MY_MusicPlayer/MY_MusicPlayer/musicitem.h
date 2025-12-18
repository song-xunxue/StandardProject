#ifndef MUSICITEM_H
#define MUSICITEM_H

#include <QUrl>

class MusicItem
{
public:
    MusicItem();
    MusicItem(const QUrl& url);
    bool GetisLike();
    bool GetisHistory();

    QString GetMusicName();
    QString GetMusicSinger();
    QString GetMusicAlbum();
    qint64 GetMusicDuration();
    QUrl GetMusicUrl();
    QString GetMusicID();
    QString GetLrcFilePath();
    void setIsLike(bool like);
    void setIsHistory(bool like);

private:
    void parseMediaMetaData();


    bool isLike;
    bool isHistory;

    QString musicName;
    QString musicSinger;
    QString musicAlbum;
    qint64 duration;

    QUrl musicUrl;
    QString musicId;//唯一标识

};

#endif // MUSICITEM_H
