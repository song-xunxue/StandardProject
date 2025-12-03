#include "onlineform.h"
#include "ui_onlineform.h"

OnlineForm::OnlineForm(QWidget *parent) :
    QWidget(parent),
    ui(new Ui::OnlineForm)
{
    ui->setupUi(this);
}

OnlineForm::~OnlineForm()
{
    delete ui;
}

void OnlineForm::setInfo(const QString &Icon, const QString &Text, size_t ID)
{
    ui->OFIcon->setPixmap(QPixmap(Icon));
    ui->OFText->setText(Text);
    pageID=ID;
}

void OnlineForm::mousePressEvent(QMouseEvent *event)
{
    (void)event;
    ui->OFStyle->setStyleSheet("#OFStyle{background-color: rgb(30,206,154);} * {color:#F6F6F6;}");
    emit(OFchecked(pageID));
}

void OnlineForm::clearBackground()
{
    ui->OFStyle->setStyleSheet("#OFStyle:hover{background-color:#D8D8D8;}");
}

size_t OnlineForm::getID()
{
    return pageID;
}


