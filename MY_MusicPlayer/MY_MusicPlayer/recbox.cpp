#include "recbox.h"
#include "ui_recbox.h"
//#include <QDebug>
#include <math.h>

RecBox::RecBox(QWidget *parent) :
    QWidget(parent),
    ui(new Ui::RecBox),
    _row(1),
    _col(4),
    currentIndex(0)
{
    ui->setupUi(this);

}


RecBox::~RecBox()
{
    delete ui;
}

void RecBox::InitRecBox(QJsonArray data, int row)
{
    //初始化
    _imageArray=data;
    _row=row;
    _col=8;
    if(row==1)
    {
        ui->recBoxListDown->hide();
        _col=4;
    }
    count=ceil(_imageArray.size()/_col);//向上取整
//    qDebug()<<count;
    AddRecBoxitem();

}

void RecBox::AddRecBoxitem()
{
    //为实现翻页功能，实现将之前添加的item删除
    QList<RecBoxItem*> list=ui->recBoxListUp->findChildren<RecBoxItem*>();
    for(auto i:list)
    {
        ui->recListUphorizontalLayout->removeWidget(i);
        delete i;
    }
   list=ui->recBoxListDown->findChildren<RecBoxItem*>();
    for(auto i:list)
    {
        ui->recListDownhorizontalLayout->removeWidget(i);
        delete i;
    }

    int index=0;//用于判断上下
    for(int i=currentIndex*_col;i<_col+_col*currentIndex;++i)
    {
        RecBoxItem* item=new RecBoxItem();
        QJsonObject obj=_imageArray[i].toObject();
//        qDebug()<<obj.value("path").toString();
        item->setRecBoxItemImage(obj.value("path").toString());
        item->setRecBoxItemText(obj.value("text").toString());

        if(index>=_col/2 && _row==2)
        {
            ui->recListDownhorizontalLayout->addWidget(item);
//            qDebug()<<"ListDown Add";
        }
        else
        {
            ui->recListUphorizontalLayout->addWidget(item);
//             qDebug()<<"ListUp Add";
        }
        index++;
    }
}

void RecBox::on_BoxUp_clicked()
{
    //向前显示四张图片
//    qDebug()<<"Up";
    currentIndex--;
    if(currentIndex<0)
    {
        currentIndex=count-1;
    }
    AddRecBoxitem();
}

void RecBox::on_BoxDown_clicked()
{
    currentIndex++;
    if(currentIndex>=count)
    {
        currentIndex=0;
    }
    AddRecBoxitem();
}
