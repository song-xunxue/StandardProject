#ifndef MUSICPLAYER_H
#define MUSICPLAYER_H

#include <QWidget>
#include <QFileDialog>

#include "localform.h"
#include "onlineform.h"
#include "recbox.h"
#include "volumetool.h"
#include "musiclist.h"
#include  "commonpage.h"

QT_BEGIN_NAMESPACE
namespace Ui { class MusicPlayer; }
QT_END_NAMESPACE

class MusicPlayer : public QWidget
{
    Q_OBJECT

public:
    MusicPlayer(QWidget *parent = nullptr);
    ~MusicPlayer();
    void InitUI();
    void  ConnectSignalWithSlot();

protected:
    void InitOnlineMusic();//在线音乐栏初始化
    void InitLocalMusic();//本地音乐栏初始化
    void InitPageMusic();//音乐页面初始化
    void mouseMoveEvent(QMouseEvent *event) ;
    void mousePressEvent(QMouseEvent *event) ;
    QJsonArray  RandomPiction();

private slots:
    void on_quit_clicked();
    void onLeftFormClick(size_t pageID);

    void on_volumn_clicked();

    void on_addlocal_clicked();

private:
    Ui::MusicPlayer *ui;
    QPoint dragPosition ;
    VolumeTool* volumetool;
    MusicList musiclist;
};
#endif // MUSICPLAYER_H
