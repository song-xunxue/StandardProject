#include "listitembox.h"
#include "ui_listitembox.h"
//#include <QDebug>

ListItemBox::ListItemBox(QWidget *parent) :
    QWidget(parent),
    ui(new Ui::ListItemBox),
    isLike(false)
{
    ui->setupUi(this);
}

ListItemBox::~ListItemBox()
{
//    qDebug()<<"ListItemBox 释放";
    delete ui;
}

void ListItemBox::setMusicName(const QString &musicName)
{
    ui->muscieNameLabel->setText(musicName);
}

void ListItemBox::setMusicSinger(const QString &musicSinger)
{
    ui->musicSingerLabel->setText(musicSinger);
}

void ListItemBox::setmusicAlbum(const QString &musicAlbum)
{
    ui->musicAlbumLabel->setText(musicAlbum);
}

void ListItemBox::setLikeIcon(bool like)
{
    isLike=like;
    if(isLike)
    {
        ui->likeBtn->setIcon(QIcon(":/images/like_2.png"));
    }
    else
    {
        ui->likeBtn->setIcon(QIcon(":/images/like_3.png"));
    }
}

void ListItemBox::enterEvent(QEvent *event)
{
    (void)event;
    setStyleSheet("background-color: #EFEFEF");
}

void ListItemBox::leaveEvent(QEvent *event)
{
    (void)event;
    setStyleSheet("");
}

void ListItemBox::on_likeBtn_clicked()
{
    setLikeIcon(!isLike);
    emit setIsLike(isLike);
}
