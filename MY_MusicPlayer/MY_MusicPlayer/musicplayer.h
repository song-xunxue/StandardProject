#ifndef MUSICPLAYER_H
#define MUSICPLAYER_H

#include <QWidget>
#include "localform.h"
#include "onlineform.h"
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
    void mouseMoveEvent(QMouseEvent *event) ;
    void mousePressEvent(QMouseEvent *event) ;

private slots:
    void on_quit_clicked();
    void onLeftFormClick(size_t pageID);

private:
    Ui::MusicPlayer *ui;
    QPoint dragPosition ;
};
#endif // MUSICPLAYER_H
