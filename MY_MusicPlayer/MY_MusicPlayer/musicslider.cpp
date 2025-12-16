#include "musicslider.h"
#include "ui_musicslider.h"
//#include <QDebug>

MusicSlider::MusicSlider(QWidget *parent) :
    QWidget(parent),
    ui(new Ui::MusicSlider),
    currentpos(0)
{
    ui->setupUi(this);
    maxWidth=ui->inLine->width();
}

MusicSlider::~MusicSlider()
{
    delete ui;
}

void MusicSlider::mousePressEvent(QMouseEvent *event)
{
    currentpos=event->pos().x();
    setMusicSlider();
}

void MusicSlider::mouseMoveEvent(QMouseEvent *event)
{
    //这个拖拽在进度条外也会生效，如果想要不生效应该使用RQect的contains进行比对
//    QRect rect = QRect(0, 0, width(), height());
//    QPoint pos = event->pos();
//    if(!rect.contains(pos))  return;
    //拖拽不是很流畅  舍弃

    if(event->buttons() == Qt::LeftButton )
    {
        currentpos=event->pos().x();
        currentpos = currentpos > maxWidth ? maxWidth : currentpos;
        currentpos = currentpos < 0 ? 0 : currentpos;
        setMusicSlider();
    }
}

void MusicSlider::mouseReleaseEvent(QMouseEvent *event)
{
    currentpos=event->pos().x();
    setMusicSlider();
}

void MusicSlider::setMusicSlider()
{
    ui->outLine->setGeometry(0,8,currentpos,4);
    emit setMusicSliderPosition((float)currentpos/(float)maxWidth);
}

void MusicSlider::setMusicSliderByRatio(float Ratio)
{
    currentpos = maxWidth * Ratio;
    ui->outLine->setGeometry(0,8,currentpos,4);
}
