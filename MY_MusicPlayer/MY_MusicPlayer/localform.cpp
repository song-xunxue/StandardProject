#include "localform.h"
#include "ui_localform.h"

LocalForm::LocalForm(QWidget *parent) :
    QWidget(parent),
    ui(new Ui::LocalForm)
{
    ui->setupUi(this);
    InitAnimation();
}

LocalForm::~LocalForm()
{
    delete ui;
}

void LocalForm::setInfo(const QString &Icon, const QString &Text, const size_t ID)
{
    ui->LFIcon->setPixmap(QPixmap(Icon));
    ui->LFText->setText(Text);
    pageId=ID;
}

void LocalForm::mousePressEvent(QMouseEvent *event)
{
    (void)event;
    ui->LFStyle->setStyleSheet("#LFStyle{background-color: rgb(30,206,154);}* {color:#F6F6F6;}");
    ui->LFLineBox->show();
    line1Animation->start();
    line2Animation->start();
    line3Animation->start();
    line4Animation->start();
    emit(LFchecked(pageId));
}


void LocalForm::clearBackground()
{
    ui->LFStyle->setStyleSheet("#LFStyle:hover{background-color:#D8D8D8;}");
    ui->LFLineBox->hide();
//    line1Animation->stop();
//    line2Animation->stop();
//    line3Animation->stop();
//    line4Animation->stop();
}

size_t LocalForm::getID()
{
    return pageId;
}

void LocalForm::InitAnimation()
{
    ui->LFLineBox->hide();
    line1Animation=new QPropertyAnimation(ui->line1,"geometry",this);
    line1Animation->setDuration(1200);
    line1Animation->setKeyValueAt(0,QRect(8,22,2,0));
    line1Animation->setKeyValueAt(0.5,QRect(8,0,2,22));
    line1Animation->setKeyValueAt(1,QRect(8,22,2,0));
    line1Animation->setLoopCount(-1);

    line2Animation=new QPropertyAnimation(ui->line2,"geometry",this);
    line2Animation->setDuration(1400);
    line2Animation->setKeyValueAt(0,QRect(18,22,2,0));
    line2Animation->setKeyValueAt(0.5,QRect(18,0,2,22));
    line2Animation->setKeyValueAt(1,QRect(18,22,2,0));
    line2Animation->setLoopCount(-1);

    line3Animation=new QPropertyAnimation(ui->line3,"geometry",this);
    line3Animation->setDuration(1300);
    line3Animation->setKeyValueAt(0,QRect(28,22,2,0));
    line3Animation->setKeyValueAt(0.5,QRect(28,0,2,22));
    line3Animation->setKeyValueAt(1,QRect(28,22,2,0));
    line3Animation->setLoopCount(-1);

    line4Animation=new QPropertyAnimation(ui->line4,"geometry",this);
    line4Animation->setDuration(1600);
    line4Animation->setKeyValueAt(0,QRect(38,22,2,0));
    line4Animation->setKeyValueAt(0.5,QRect(38,0,2,22));
    line4Animation->setKeyValueAt(1,QRect(38,22,2,0));
    line4Animation->setLoopCount(-1);
}
