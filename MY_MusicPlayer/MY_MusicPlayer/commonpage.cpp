#include "commonpage.h"
#include "ui_commonpage.h"
//#include <QDebug>

CommonPage::CommonPage(QWidget *parent) :
    QWidget(parent),
    ui(new Ui::CommonPage)
{
    ui->setupUi(this);

    //移除水平滚动条
    ui->pageMusicList->setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
}

CommonPage::~CommonPage()
{
    delete ui;
}

void CommonPage::setCommonPageUI(const QString &title, const QString &imagePath)
{
    ui->pageTittle->setText(title);

    ui->musicImageLabel->setPixmap(QPixmap(imagePath));
    ui->musicImageLabel->setScaledContents(true);

    //测试listitemBox
//    ListItemBox* listItemBox = new ListItemBox(this);
//    QListWidgetItem* listWidgetItem = new QListWidgetItem(ui->pageMusicList);
//    listWidgetItem->setSizeHint(QSize(ui->pageMusicList->width(), 45));
//    ui->pageMusicList->setItemWidget(listWidgetItem, listItemBox);
}

void CommonPage::setPageType(PageType pagetype)
{
    this->pageType=pagetype;
}

void CommonPage::addMusicToMusicPage(MusicList &musiclist)
{
//    qDebug()<<"addMusicToMusicPage 调用";
    musicIdOfPage.clear();
    for(auto& e : musiclist)
    {
        QString musicId=e.GetMusicID();
//        qDebug()<<"pageType:"<<pageType;
        switch (pageType) {
            case RECENT_PAGE :
                if(e.GetisHistory())
                {
                    musicIdOfPage.push_back(musicId);
                }
                 break;
            case LIKE_PAGE:
                if(e.GetisLike())
                {
                    musicIdOfPage.push_back(musicId);
                }
                 break;
            case LOCAL_PAGE:
                musicIdOfPage.push_back(musicId);
                break;
        }
    }
}

void CommonPage::reFresh(MusicList &musiclist)
{
    ui->pageMusicList->clear();//删除界面中之前的item
    addMusicToMusicPage(musiclist);//更新界面的musicOfPage
    if(musicIdOfPage.isEmpty())
    {
        qDebug()<< pageType<<"musicIdOfpag 为空";
        return ;
    }
//    qDebug()<< "开始添加"<<musicIdOfPage.size()<<"个box";
    // 批量添加项：临时阻塞信号+禁止更新，提升性能
    ui->pageMusicList->blockSignals(true);
    ui->pageMusicList->setUpdatesEnabled(false);

    for(auto& musicID:musicIdOfPage)
    {
        //通过每个Page专属的musicOfPage来添加，实现不同界面不同内容
        //通过ID查找music
            auto it=musiclist.findMusicByID(musicID);
            if(it==musiclist.end())
            {
                //直接跳过这个ID
                qDebug()<<"跳过ID："<<musicID;
                continue;
            }
//            qDebug()<< "构建 第"<<count<<"个组件";
//            构建组件
            ListItemBox* listitemBox = new ListItemBox(ui->pageMusicList);
            listitemBox->setMusicName(it->GetMusicName());
            listitemBox->setMusicSinger(it->GetMusicSinger());
            listitemBox->setmusicAlbum(it->GetMusicAlbum());
            listitemBox->setLikeIcon(it->GetisLike());
            //自定义的组件绑定来添加到界面中
            QListWidgetItem* listWidgetItem = new QListWidgetItem(ui->pageMusicList);
//            listWidgetItem->setSizeHint(QSize(ui->pageMusicList->width(), 45));
            listWidgetItem->setSizeHint(QSize(0, 45));
            ui->pageMusicList->setItemWidget(listWidgetItem, listitemBox);//间接绑定
//            qDebug()<< "绑定 第"<<count<<"个组件";

            //绑定每一个listitem和槽函数 发送更新喜欢列表的信号让musiceplayer处理
            connect(listitemBox,&ListItemBox::setIsLike,this,[=](bool isLike){
                it->setIsLike(isLike);
                //如果不在此处修改就需要传递ID
                //在上层进行查找和修改like
                emit refreshLikeMusic();
            });
    }
    //刷新界面  恢复信号和更新，触发一次重绘
//    qDebug()<<"开始刷新界面";
//    repaint();
    ui->pageMusicList->setUpdatesEnabled(true);
    ui->pageMusicList->blockSignals(false);
//    ui->pageMusicList->update(); // 替代repaint，异步高效重绘
    ui->pageMusicList->repaint();
//    qDebug()<<"刷新成功";
}

void CommonPage::addMusicToPlayList(MusicList &musiclist, QMediaPlaylist* playlist)
{
    for(auto& music : musiclist)
    {
        switch (pageType) {
            case RECENT_PAGE :
                if(music.GetisHistory())
                {
                    playlist->addMedia(music.GetMusicUrl());
                }
                 break;
            case LIKE_PAGE:
                if(music.GetisLike())
                {
                    playlist->addMedia(music.GetMusicUrl());
                }
                 break;
            case LOCAL_PAGE:
                playlist->addMedia(music.GetMusicUrl());
                break;
            default:
                break;
        }
    }
}

QString CommonPage::GetMusicIDByIndex(int index)
{
    return musicIdOfPage[index];
}

void CommonPage::setImage(QPixmap p)
{
    qDebug()<<"设置当前页面的图片";
    ui->musicImageLabel->setPixmap(p);
}

void CommonPage::on_playAllBtn_clicked()
{
    //播放全部
//    addMusicToPlayList();
    emit playAllMusic(this);
}

void CommonPage::on_pageMusicList_doubleClicked(const QModelIndex &index)
{
    emit MusicItemdoubleClicked(this,index);
}

