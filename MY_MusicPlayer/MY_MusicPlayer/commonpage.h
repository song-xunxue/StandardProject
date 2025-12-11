#ifndef COMMONPAGE_H
#define COMMONPAGE_H

#include <QWidget>
#include <listitembox.h>
#include "musiclist.h"

namespace Ui {
class CommonPage;
}
enum PageType
{
    RECENT_PAGE,
    LIKE_PAGE,
    LOCAL_PAGE
};

class CommonPage : public QWidget
{
    Q_OBJECT

public:
    explicit CommonPage(QWidget *parent = nullptr);
    ~CommonPage();

    void setCommonPageUI(const QString& title,const QString& imagePath);
    void  setPageType(PageType pagetype);

    void  addMusicToMusicPage(MusicList &musiclist);//添加音乐到每一个page专属的musicIDOfPage
    void  reFresh(MusicList& musiclist);//更新界面 通过Musiclist构建listitemBox 添加到界面
    void  addMusicToPlayList(MusicList& musiclist);//添加音乐到播放队列

private:
    Ui::CommonPage *ui;
    QVector<QString> musicIdOfPage;//通过ID来记录music，而不是MusicList 这样不会重复
    PageType pageType;
};

#endif // COMMONPAGE_H
