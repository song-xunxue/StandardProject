#include "recbox.h"
#include "ui_recbox.h"

RecBox::RecBox(QWidget *parent) :
    QWidget(parent),
    ui(new Ui::RecBox)
{
    ui->setupUi(this);
}

RecBox::~RecBox()
{
    delete ui;
}
