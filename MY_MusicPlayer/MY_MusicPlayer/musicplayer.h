#ifndef MUSICPLAYER_H
#define MUSICPLAYER_H

#include <QWidget>
#include <QFileDialog>

#include <QMediaPlayer>
#include <QMediaPlaylist>
#include<QPropertyAnimation>

#include <QSqlDatabase>
#include <QSqlQuery>
#include <QSqlError>

#include <QModelIndex>

#include "localform.h"
#include "onlineform.h"
#include "recbox.h"
#include "volumetool.h"
#include "lrcpage.h"
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
    void ConnectSignalWithSlot();
    void InitUI();
    void InitPlayer();


protected:
    void InitOnlineMusicUI();//在线音乐栏初始化
    void InitLocalMusicUI();//本地音乐栏初始化
    void InitPageMusic();//音乐页面初始化
    void InitMusicDB(); //初始化数据库
    void InitMusicList();//从数据库初始化musiclist
    void mouseMoveEvent(QMouseEvent *event) ;
    void mousePressEvent(QMouseEvent *event) ;
    QJsonArray  RandomPiction();
    void PlayByIndex(CommonPage *page,int index);

private slots:
    void on_quit_clicked();
    void onLeftFormClick(size_t pageID);

    void on_volumn_clicked();
    void on_lrcword_clicked();
    void on_addlocal_clicked();

    void onrefreshLikeMusic();

    void on_play_clicked();

    void onPalyerStateChanged();
    void on_playMode_clicked();

    void on_playDown_clicked();

    void on_playUp_clicked();

    void onPlayAllMusic(CommonPage* page);

    void onMusicItemdoubleClicked(CommonPage* page,const QModelIndex & index);
    void onCurrentIndexChanged(int index);

    void onMusicVolumeChange(int);
    void onDurationChanged(qint64 duration);
    void onPositionChanged(qint64 position);
    void onSetMusicSliderPosition(float Radio);
    void onMetaDataAvailableChanged(bool); //未知错误，引入currenIndex导致程序异常终止  已解决


    void on_min_clicked();

    void on_max_clicked();

    void on_skin_clicked();

private:
    Ui::MusicPlayer *ui;
    QPoint dragPosition ;
    VolumeTool* volumetool;
    LrcPage* lrcpage;
    MusicList musiclist;

    QMediaPlayer* player;//播放器
    QMediaPlaylist* playList;//播放列表
    CommonPage* currentPage;//最近播放需要记录当前播放页面
    int currentIndex; //捕获当前播放的音乐的index   这一行添加了之后异常终止
//    原因是栈溢出，main.cpp中musicplayer是栈上定义的 改为new 之后就没有问题了
    qint64 currentDuration;
    QPropertyAnimation* lrcAnimation;

    bool drag;//解决拖拽问题
    QSqlDatabase musicdb;
};
#endif // MUSICPLAYER_H
