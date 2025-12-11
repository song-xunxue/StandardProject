#include "commonpage.h"
#include "ui_commonpage.h"
#include <QDebug>

CommonPage::CommonPage(QWidget *parent) :
    QWidget(parent),
    ui(new Ui::CommonPage)
{
    ui->setupUi(this);
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
    qDebug()<<"addMusicToMusicPage 调用";
    musicIdOfPage.clear();
    for(auto& e : musiclist)
    {
        QString musicId=e.GetMusicID();
        qDebug()<<"pageType:"<<pageType;
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
        qDebug()<<"musicIdOfpag 为空";
        return ;
    }
    qDebug()<< "开始添加"<<musicIdOfPage.size()<<"个box";
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
    }
    //刷新界面  恢复信号和更新，触发一次重绘
//    qDebug()<<"开始刷新界面";
//    repaint();
    ui->pageMusicList->setUpdatesEnabled(true);
    ui->pageMusicList->blockSignals(false);
    ui->pageMusicList->update(); // 替代repaint，异步高效重绘
//    qDebug()<<"刷新成功";
}

void CommonPage::addMusicToPlayList(MusicList &musiclist)
{
    (void) musiclist;
}


