#ifndef MUSICLIST_H
#define MUSICLIST_H

#include "musicitem.h"
#include <QList>
#include <QVector>
#include <QUrl>
#include <QSet>


typedef QVector<MusicItem>::iterator iterator;

class MusicList
{
public:
    MusicList();
    void    addMusicByUrls(const QList<QUrl>& urls );
    bool isEmpty();
    iterator begin();
    iterator end();
    iterator findMusicByID(const QString& musicId);

    void WriteToDB();
    void ReadFromDB();
private:
    QVector<MusicItem> musicList;
    QSet<QString> musicUrls;
};

#endif // MUSICLIST_H
