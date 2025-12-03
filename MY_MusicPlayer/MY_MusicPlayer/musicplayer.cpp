#include "musicplayer.h"
#include "ui_musicplayer.h"
#include <QDebug>
#include <QPushButton>
#include <QMouseEvent>
#include <QLabel>
#include <QGraphicsDropShadowEffect>
#include <QList>

MusicPlayer::MusicPlayer(QWidget *parent)
    : QWidget(parent)
    , ui(new Ui::MusicPlayer)
{
    ui->setupUi(this);

    ConnectSignalWithSlot();
    InitUI();
}

MusicPlayer::~MusicPlayer()
{
    delete ui;
}

void MusicPlayer::ConnectSignalWithSlot()
{
    connect(ui->rec,&OnlineForm::OFchecked,this,&MusicPlayer::onLeftFormClick);
    connect(ui->radio,&OnlineForm::OFchecked,this,&MusicPlayer::onLeftFormClick);

    connect(ui->recent,&LocalForm::LFchecked,this,&MusicPlayer::onLeftFormClick);
    connect(ui->like,&LocalForm::LFchecked,this,&MusicPlayer::onLeftFormClick);
    connect(ui->local,&LocalForm::LFchecked,this,&MusicPlayer::onLeftFormClick);
}

void MusicPlayer::InitUI()
{
    this->setWindowFlag(Qt::FramelessWindowHint);//设置无边框
    //无边框有两个问题
    //1.无法移动窗口
    //2.无法关闭
    //重写鼠标单击和移动事件


    //设置透明度
    this->setAttribute(Qt::WA_TranslucentBackground);
    //设置阴影
    QGraphicsDropShadowEffect * dropshadoweffect=new QGraphicsDropShadowEffect(this);
    dropshadoweffect->setOffset(0,0);
    dropshadoweffect->setColor("#000000");
    dropshadoweffect->setBlurRadius(10);
    this->setGraphicsEffect(dropshadoweffect);
    InitOnlineMusic();
    InitLocalMusic();
}

void MusicPlayer::InitLocalMusic()
{
    ui->recent->setInfo(":/images/recent.png","最近播放", 2 );
    ui->like->setInfo(":/images/like.png","我喜欢", 3 );
    ui->local->setInfo(":/images/local.png","本地播放", 4 );
}



void MusicPlayer::InitOnlineMusic()
{
    ui->rec->setInfo(":/images/rec.png","推荐",0);
    ui->radio->setInfo(":/images/radio.png","电台",1);
}


void MusicPlayer::mouseMoveEvent(QMouseEvent *event)
{
    if(event->buttons()==Qt::LeftButton)
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
        //记录相对坐标
        //鼠标相对屏幕的坐标减去窗口左上角相对屏幕的坐标
//       dragPosition = event->globalPos()-frameGeometry().topLeft();
       dragPosition = event->globalPos()-pos();//窗口有边框用这个
       return;
    }

    QWidget::mousePressEvent(event);
}


void MusicPlayer::on_quit_clicked()
{
    //关闭按钮
    close();
}

void MusicPlayer::onLeftFormClick(size_t pageID)
{
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
