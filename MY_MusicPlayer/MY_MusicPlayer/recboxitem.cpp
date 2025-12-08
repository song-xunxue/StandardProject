#include "recboxitem.h"
#include "ui_recboxitem.h"

RecBoxItem::RecBoxItem(QWidget *parent) :
    QWidget(parent),
    ui(new Ui::RecBoxItem)
{
    ui->setupUi(this);
}

RecBoxItem::~RecBoxItem()
{
    delete ui;
}

void RecBoxItem::setRecBoxItemImage(const QString &path)
{
    QString style="border-image:url("+path+");";
    ui->recboximage->setStyleSheet(style);
}


void RecBoxItem::setRecBoxItemText(const QString &text)
{
    ui->recboxText->setText(text);
}
