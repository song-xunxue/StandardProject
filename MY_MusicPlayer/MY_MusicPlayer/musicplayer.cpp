#include "musicplayer.h"
#include "ui_musicplayer.h"
#include <QDebug>
#include <QPushButton>
#include <QMouseEvent>
#include <QLabel>
#include <QGraphicsDropShadowEffect>
#include <QList>
#include <QJsonArray>
#include <QVector>
#include <QJsonObject>
#include <QMessageBox>



MusicPlayer::MusicPlayer(QWidget *parent)
    : QWidget(parent)
    , ui(new Ui::MusicPlayer)
{
    ui->setupUi(this);
    InitUI();
    InitPlayer();
    InitPageMusic();
    InitMusicDB();
    InitMusicList();
    ConnectSignalWithSlot();

}

MusicPlayer::~MusicPlayer()
{
    delete ui;
}

void MusicPlayer::ConnectSignalWithSlot()
{
    //切换页面
    connect(ui->rec,&OnlineForm::OFchecked,this,&MusicPlayer::onLeftFormClick);
    connect(ui->radio,&OnlineForm::OFchecked,this,&MusicPlayer::onLeftFormClick);

    connect(ui->recent,&LocalForm::LFchecked,this,&MusicPlayer::onLeftFormClick);
    connect(ui->like,&LocalForm::LFchecked,this,&MusicPlayer::onLeftFormClick);
    connect(ui->local,&LocalForm::LFchecked,this,&MusicPlayer::onLeftFormClick);

    //响应 喜欢 按键
    connect(ui->recentPage,&CommonPage::refreshLikeMusic,this,&MusicPlayer::onrefreshLikeMusic);
    connect(ui->localPage,&CommonPage::refreshLikeMusic,this,&MusicPlayer::onrefreshLikeMusic);
    connect(ui->likePage,&CommonPage::refreshLikeMusic,this,&MusicPlayer::onrefreshLikeMusic);

    //响应全部播放
    connect(ui->recentPage,&CommonPage::playAllMusic,this,&MusicPlayer::onPlayAllMusic);
    connect(ui->localPage,&CommonPage::playAllMusic,this,&MusicPlayer::onPlayAllMusic);
    connect(ui->likePage,&CommonPage::playAllMusic,this,&MusicPlayer::onPlayAllMusic);

    //响应双击歌曲播放
    connect(ui->recentPage,&CommonPage::MusicItemdoubleClicked,this,&MusicPlayer::onMusicItemdoubleClicked);
    connect(ui->localPage,&CommonPage::MusicItemdoubleClicked,this,&MusicPlayer::onMusicItemdoubleClicked);
    connect(ui->likePage,&CommonPage::MusicItemdoubleClicked,this,&MusicPlayer::onMusicItemdoubleClicked);

    //响应拖拽进度条
    connect(ui->musicSlider,&MusicSlider::setMusicSliderPosition,this ,&MusicPlayer::onSetMusicSliderPosition);

    //设置音量大小
    connect(volumetool,&VolumeTool::MusicVolumeChange,this,&MusicPlayer::onMusicVolumeChange);
    //同步控制栏的歌手 图片 专辑 有效歌曲文件切换信号
    connect(player,&QMediaPlayer::metaDataAvailableChanged,this,&MusicPlayer::onMetaDataAvailableChanged);

    //系统托盘双击显示
    connect(trayIcon,&QSystemTrayIcon::activated,this,&MusicPlayer::onTrayIconActivate);
}

void MusicPlayer::InitUI()
{
    //添加到系统托盘
    trayIcon=new QSystemTrayIcon(this);
    trayIcon->setIcon(QIcon(":/images/tubiao.png"));
    QMenu* trayMenu=new QMenu(this);
    trayMenu->addAction("退出",this,&MusicPlayer::quitMusic);
    trayIcon->setContextMenu(trayMenu);
    trayIcon->show();

    this->setWindowFlag(Qt::FramelessWindowHint);//设置无边框
    //无边框有两个问题
    //1.无法移动窗口
    //2.无法关闭
    //重写鼠标单击和移动事件
    setWindowIcon(QIcon(":/images/tubiao.png"));

    //设置透明度
    this->setAttribute(Qt::WA_TranslucentBackground);
    //设置阴影
//    QGraphicsDropShadowEffect * dropshadoweffect=new QGraphicsDropShadowEffect(this);
//    dropshadoweffect->setOffset(0,0);
//    dropshadoweffect->setColor("#000000");
//    dropshadoweffect->setBlurRadius(10);
//    this->setGraphicsEffect(dropshadoweffect);
    //这个一注释，动画效果的错误全部解决
//    QGraphicsDropShadowEffect 的实现依赖 Qt 的图形视图框架，
//    而 WA_TranslucentBackground+FramelessWindowHint 是直接调用 Windows 的分层窗口接口，两者同时用会导致：
//    阴影效果强行扩展了窗口的 “脏区域”（dirty 参数），超出了 Windows 允许的范围；
//    分层窗口的渲染参数被阴影效果篡改，出现负数 / 超大值，触发 “参数错误”。

    InitOnlineMusicUI();
    InitLocalMusicUI();

     srand(time(NULL));//随机化种子
    ui->recmusicBox->InitRecBox(RandomPiction(),1);
    ui->supplymusicBox->InitRecBox(RandomPiction(),2);

    ui->musicImgLabel->setPixmap(QPixmap(":/images/default_cover.png"));

    //实例化音量调节窗口
    volumetool=new VolumeTool(this);
    ui->play->setIcon(QIcon(":/images/play_2.png"));
    ui->playMode->setIcon(QIcon(":/images/list_play.png"));
    ui->playMode->setToolTip("随机播放");
    ui->stackedWidget->setCurrentIndex(0);
    //实例化歌词界面
    lrcpage=new LrcPage(this);
    lrcpage->setFixedSize(1040,700);
    lrcpage->hide();
    lrcAnimation=new QPropertyAnimation(lrcpage,"geometry",this);
    lrcAnimation->setDuration(250);
    lrcAnimation->setStartValue(QRect(0, 10+this->height(), lrcpage->width(), lrcpage->height()));
    lrcAnimation->setEndValue(QRect(0,0,lrcpage->width(), lrcpage->height()));
//    qDebug()<<this->geometry();
//    qDebug()<<lrcpage->geometry();
}

void MusicPlayer::InitPlayer()
{
    player=new QMediaPlayer(this);
    playList=new QMediaPlaylist(this);

    //设置默认的播放模式 循环播放
    playList->setPlaybackMode(QMediaPlaylist::Loop);
    //设置播放源的播放列表
    player->setPlaylist(playList);
    //设置默认的音量
    player->setVolume(20);
    connect(player,&QMediaPlayer::stateChanged,this,&MusicPlayer::onPalyerStateChanged);
    //最近播放  以及 控制栏的信息更新
    connect(playList, &QMediaPlaylist::currentIndexChanged, this, &MusicPlayer::onCurrentIndexChanged);
    //总时间更新
    connect(player,&QMediaPlayer::durationChanged,this,&MusicPlayer::onDurationChanged);
    //播放时间更新
    connect(player,&QMediaPlayer::positionChanged,this,&MusicPlayer::onPositionChanged);
}

//protected:
void MusicPlayer::InitLocalMusicUI()
{
    ui->recent->setInfo(":/images/recent.png","最近播放", 2 );
    ui->like->setInfo(":/images/like.png","我喜欢", 3 );
    ui->local->setInfo(":/images/local.png","本地播放", 4 );

    ui->recentPage->setCommonPageUI("最近播放", ":/images/recentbg.png");
    ui->likePage->setCommonPageUI("我喜欢", ":/images/ilikebg.png");
    ui->localPage->setCommonPageUI("本地⾳乐", ":/images/localbg.png");
}

void MusicPlayer::InitOnlineMusicUI()
{
    ui->rec->setInfo(":/images/rec.png","推荐",0);
    ui->radio->setInfo(":/images/radio.png","电台",1);
}

void MusicPlayer::InitPageMusic()
{
    ui->recentPage->setPageType(PageType::RECENT_PAGE);
    ui->recentPage->reFresh(musiclist);

    ui->likePage->setPageType(PageType::LIKE_PAGE);
    ui->likePage->reFresh(musiclist);

    ui->localPage->setPageType(PageType::LOCAL_PAGE);
    ui->localPage->reFresh(musiclist);

    ui->localPage->addMusicToPlayList(musiclist,playList);//直接添加local到播放列表中
}

void MusicPlayer::InitMusicDB()
{
    musicdb=QSqlDatabase::addDatabase("QSQLITE");
    musicdb.setDatabaseName("QQmusic.db");//设置数据库名称
    if(!musicdb.open())
    {
        QMessageBox::critical(this, "打开QQMusicDB失败", musicdb.lastError().text());
        return;
    }
    qDebug()<<"数据库链接成功";
    //创建MusicInfo
    QString sql="CREATE TABLE IF NOT EXISTS MusicInfo(\
            id INTEGER PRIMARY KEY AUTOINCREMENT,\
            musicId varchar(200) UNIQUE,\
            musicName varchar(50) ,\
            musicSinger varchar(50) ,\
            musicAlbum varchar(50),\
            duration BIGINT,\
            musicUrl varchar(256),\
            isLike INTEGER,\
            isHistory INTEGER)";
    QSqlQuery query;
    if(!query.exec(sql))
    {
        QMessageBox::critical(this, "创建MusicInfo失败", query.lastError().text());
        return;
    }
    qDebug()<<"打开MusicInfo成功";

}

void MusicPlayer::InitMusicList()
{
    //从数据库加载数据到MusicList
    musiclist.ReadFromDB();
    onrefreshLikeMusic();//三个页面的刷新

}

void MusicPlayer::mouseMoveEvent(QMouseEvent *event)
{
    if(event->buttons()==Qt::LeftButton && drag)
    {
        //移动窗口的左上角
        move(event->globalPos()-dragPosition);
        return;
    }
    //交给widget处理其他的事件
    QWidget::mouseMoveEvent(event);
}

void MusicPlayer::mousePressEvent(QMouseEvent *event)
{
    if(event->button()==Qt::LeftButton)
    {
        drag=true;
        //记录相对坐标
        //鼠标相对屏幕的坐标减去窗口左上角相对屏幕的坐标
//       dragPosition = event->globalPos()-frameGeometry().topLeft();
       dragPosition = event->globalPos()-pos();//窗口有边框用这个
       return;
    }

    QWidget::mousePressEvent(event);
}

QJsonArray MusicPlayer::RandomPiction()
{
    QVector<QString> vecImageName;
    vecImageName<<"001.png"<<"003.png"<<"004.png"<<"005.png"<<"006.png" <<"007.png" <<"008.png"<<"009.png"<<"010.png"
                                              <<"011.png"<<"012.png" <<"013.png" <<"014.png"<<"015.png"<<"016.png"<<"017.png"<<"018.png" <<"019.png" <<"020.png"
                                             <<"021.png"<<"022.png"<<"023.png"<<"024.png" <<"025.png" <<"026.png"<<"027.png"<<"028.png"<<"029.png"<<"030.png"
                                            <<"031.png"<<"032.png"<<"033.png"<<"034.png" <<"035.png" <<"036.png"<<"037.png"<<"038.png"<<"039.png"<<"040.png";

    std::random_shuffle(vecImageName.begin(),vecImageName.end());//打乱顺序
    QJsonArray objArray;
    for(int i = 0; i < vecImageName.size(); ++i)
    {
        QJsonObject obj;
        obj.insert("path", ":/images/rec/"+vecImageName[i]);
        QString strText = QString("推荐-%1").arg(i, 3, 10, QChar('0'));
        obj.insert("text", strText);
        objArray.append(obj);
    }
    return objArray;
}

void MusicPlayer::PlayByIndex(CommonPage *page,int index)
{
    playList->clear();
    page->addMusicToPlayList(musiclist,playList);
    playList->setCurrentIndex(index);
    player->play();

}

//private slots:

void MusicPlayer::on_quit_clicked()
{
    hide();
}

void MusicPlayer::onLeftFormClick(size_t pageID)
{
    drag=false;
    ui->stackedWidget->setCurrentIndex(pageID);
    QList<LocalForm*>  list=this->findChildren<LocalForm*>();
    QList<OnlineForm*> list2=this->findChildren<OnlineForm*>();
    for(auto localform : list)
    {
        if(localform->getID()!=pageID)
        {
            localform->clearBackground();
        }
    }
    for(auto onlineform : list2)
    {
        if(onlineform->getID()!=pageID)
        {
//            qDebug()<<"清除Onileform";
            onlineform->clearBackground();
        }
    }
}

void MusicPlayer::on_volumn_clicked()
{
    QPoint point=ui->volumn->mapToGlobal(QPoint(0,0));
    QPoint volumeLeftTop=point-QPoint((volumetool->width()-ui->volumn->width())/2,volumetool->height());

    volumetool->move(volumeLeftTop);
    volumetool->show();

    connect(volumetool,&VolumeTool::MutedChange,this,[=](bool isMuted){
            player->setMuted(isMuted);
    });
}

void MusicPlayer::on_lrcword_clicked()
{
//    qDebug()<<"lrcpage 显示";
    lrcpage->show();
    lrcAnimation->start();
//    repaint();
    //还是卡顿 已解决
}

void MusicPlayer::on_addlocal_clicked()
{
    //添加本地音乐
    QFileDialog filedialog(this);
    filedialog.setWindowTitle("添加本地音乐");
    //设置打开格式
    filedialog.setAcceptMode(QFileDialog::AcceptOpen);
    //设置接受多个文件
    filedialog.setFileMode(QFileDialog::ExistingFiles);
    //设置打开路径
    QDir currentpath(QDir::currentPath());
//    qDebug()<<currentpath;
    currentpath.cdUp();
    QString despath=currentpath.path();//转QString
    despath+="/MY_MusicPlayer/QQMusics";
//    qDebug()<<despath;
    filedialog.setDirectory(despath);

    //设置MIME类型的过滤器
    QStringList mimefiterlist;
    mimefiterlist<<"application/octet-stream";
    filedialog.setMimeTypeFilters(mimefiterlist);

    //模态对话框
    if(filedialog.exec() == QFileDialog::Accepted)
    {
        ui->stackedWidget->setCurrentIndex(4);
        QList<QUrl> musicUrls=filedialog.selectedUrls();
//        qDebug()<<"打印Urls";

//        for(auto u:musicUrls)
//        {
//            qDebug()<<u;
//        }
        musiclist.addMusicByUrls(musicUrls);
        if(musiclist.isEmpty())
        {
            qDebug()<<"musiclist 为空 addMusicByUrls Failed";
        }
        ui->localPage->reFresh(musiclist);

        ui->localPage->addMusicToPlayList(musiclist,playList);
    }

}

void MusicPlayer::onrefreshLikeMusic()
{
    ui->localPage->reFresh(musiclist);
    ui->recentPage->reFresh(musiclist);
    ui->likePage->reFresh(musiclist);
}

void MusicPlayer::on_play_clicked()
{
//    qDebug()<<"点击播放";
    if(playList->isEmpty())
    {
        qDebug()<<"播放列表为空";
    }
    if(player->state() == QMediaPlayer::PlayingState)
    {
        player->pause();//转为暂停
    }
    else
    {
        player->play();
    }
//    else if(player->state() == QMediaPlayer::PausedState)
//    {
//        player->play();
//    }
//    else if(player->state() == QMediaPlayer::StoppedState)
//    {
//        player->play();
//    }
}

void MusicPlayer::onPalyerStateChanged()
{
    if(player->state()==QMediaPlayer::PlayingState)
    {
        ui->play->setIcon(QIcon(":/images/play_on.png"));
    }
    else
    {
        ui->play->setIcon(QIcon(":/images/play3.png"));
    }
}

//这里通过信号来改变播放图标，因为还有播放全部按钮需要改变
void MusicPlayer::on_playMode_clicked()
{
//    qDebug()<<"调整播放模式"<<playList->playbackMode();

    if(playList->playbackMode()==QMediaPlaylist::Loop)//循环播放
    {
        playList->setPlaybackMode(QMediaPlaylist::Random);
        ui->playMode->setToolTip("随机播放");
        ui->playMode->setIcon(QIcon(":/images/shuffle_2.png"));
        qDebug()<<"切换为随机播放";

    }
    else if(playList->playbackMode()==QMediaPlaylist::Random)//随机播放
    {
        playList->setPlaybackMode(QMediaPlaylist::CurrentItemInLoop);
        ui->playMode->setToolTip("单曲循环");
        ui->playMode->setIcon(QIcon(":/images/single_play.png"));
        qDebug()<<"切换为单曲循环";
    }
    else if (playList->playbackMode()==QMediaPlaylist::CurrentItemInLoop)//单曲循环
    {
        playList->setPlaybackMode(QMediaPlaylist::Loop);
        ui->playMode->setToolTip("循环播放");
        ui->playMode->setIcon(QIcon(":/images/list_play.png"));
        qDebug()<<"切换为循环播放";
    }
}

void MusicPlayer::on_playDown_clicked()
{
    playList->next();
    player->play();
}

void MusicPlayer::on_playUp_clicked()
{
    playList->previous();
    player->play();
}

void MusicPlayer::onPlayAllMusic(CommonPage *page)
{
    currentPage=page;
//    player->play();
    PlayByIndex(page,0);
}

void MusicPlayer::onMusicItemdoubleClicked(CommonPage *page, const QModelIndex & index)
{
//    qDebug()<<"接受双击信号"<<index;
//    ui->stackedWidget->setCurrentWidget(page);
    currentPage=page;
    PlayByIndex(page,index.row());
}

//在此处添加控制栏的信息更新
void MusicPlayer::onCurrentIndexChanged(int index)
{
    const QString& musicID=currentPage->GetMusicIDByIndex(index);
    this->currentIndex=index;
    auto it = musiclist.findMusicByID(musicID);
//    QString musicName("未知歌曲"),musicSinger("未知歌手"),musicAlbum("未知专辑");
    if(it!=musiclist.end())
    {
        it->setIsHistory(true);
//        musicName=it->GetMusicName();
//        musicSinger=it->GetMusicSinger();
//        musicAlbum=it->GetMusicAlbum();
    }
    ui->recentPage->reFresh(musiclist);
//    ui->musicName->setText(musicName);
//    ui->musicSinger->setText(musicSinger);
//    QVariant Image=player->metaData("ThumbnailImage");
//    if(Image.isValid())
//    {
//        QImage image=Image.value<QImage>();
//        ui->musicImgLabel->setPixmap(QPixmap::fromImage(image));
//        ui->musicImgLabel->setScaledContents(true);
//        currentPage->setImage(QPixmap::fromImage(image));
//    }
//    else
//    {
////        ":/images/localbg.png"
//        ui->musicImgLabel->setPixmap(QPixmap(":/images/localbg.png"));
//        ui->musicImgLabel->setScaledContents(true);
//        qDebug()<<"歌曲无封面图";
//    }

}

void MusicPlayer::onMusicVolumeChange(int volumnRadio)
{
    player->setVolume(volumnRadio);
}

void MusicPlayer::onDurationChanged(qint64 duration)
{
    //.arg(数值, 宽度, 进制, 填充字符)
    ui->totalTime->setText(QString("%1:%2").arg(duration/1000/60,2,10,QChar('0'))
                           .arg(duration/1000%60,2,10,QChar('0')));
    currentDuration=duration;
}

void MusicPlayer::onPositionChanged(qint64 position)
{
    //当前时间
    ui->currentTime->setText(QString("%1:%2").arg(position/1000/60,2,10,QChar('0'))
                             .arg(position/1000%60,2,10,QChar('0')));
    //同步进度条
    ui->musicSlider->setMusicSliderByRatio(position/(float)currentDuration);

    //同步lrcPage歌词
    lrcpage->setWordLine(position);
}

void MusicPlayer::onSetMusicSliderPosition(float Ratio)
{
    qint64 position =(qint64)currentDuration * Ratio;
    ui->currentTime->setText(QString("%1:%2").arg(position/1000/60,2,10,QChar('0'))
                             .arg(position/1000%60,2,10,QChar('0')));
    player->setPosition(position);
}

void MusicPlayer::onMetaDataAvailableChanged(bool)
{
    //通过onCurrentIndexChanged（）记录当前的音乐index
    const QString& musicID=currentPage->GetMusicIDByIndex(currentIndex);
    auto it = musiclist.findMusicByID(musicID);
    QString musicName("未知歌曲"),musicSinger("未知歌手"),musicAlbum("未知专辑");
    if(it!=musiclist.end())
    {
        musicName=it->GetMusicName();
        musicSinger=it->GetMusicSinger();
        musicAlbum=it->GetMusicAlbum();
    }
    ui->musicName->setText(musicName);
    ui->musicSinger->setText(musicSinger);
    QVariant Image=player->metaData("ThumbnailImage");
    if(Image.isValid())
    {
        QImage image=Image.value<QImage>();
        ui->musicImgLabel->setPixmap(QPixmap::fromImage(image));
        ui->musicImgLabel->setScaledContents(true);
        currentPage->setImage(QPixmap::fromImage(image));
    }
    else
    {
//        ":/images/localbg.png"
        ui->musicImgLabel->setPixmap(QPixmap(":/images/localbg.png"));
        ui->musicImgLabel->setScaledContents(true);
//        qDebug()<<"歌曲无封面图";
    }

    //解析歌词数据
    if(!lrcpage->LrcProcess(it->GetLrcFilePath()))
    {
        qDebug()<<"歌词获取失败";
        return;
    }
    lrcpage->setMusicName(it->GetMusicName());
    lrcpage->setMusicSinger(it->GetMusicSinger());



}

void MusicPlayer::on_min_clicked()
{
    showMinimized();
}

void MusicPlayer::on_max_clicked()
{
//    由于一些窗口设置了最大尺寸，无法实现自动缩放尺寸
//    因此这个最大化功能取消
//    showMaximized();
    QMessageBox::information(this, "温馨提示", "最大化功能正在紧急维护中...");
}

void MusicPlayer::on_skin_clicked()
{
    QMessageBox::information(this, "温馨提示", "换肤功能正在紧急维护中...");
}

void MusicPlayer::onTrayIconActivate(QSystemTrayIcon::ActivationReason reason)
{
    if(reason ==QSystemTrayIcon::DoubleClick)
    {
        this->show();
        this->raise();//顶制窗口
        if (this->isMinimized()) {
            this->showNormal();
        }
        return;
    }
//    单击切换显示还是不显示
//    if(reason ==QSystemTrayIcon::Trigger)
//    {
//        if(this->isHidden())
//            this->show();
//        else
//            this->hide();
//    }
}

void MusicPlayer::quitMusic()
{
    //关闭之前把数据更新到数据库中
    musiclist.WriteToDB();
    //关闭数据库连接
    musicdb.close();
    //关闭按钮
    close();
}
