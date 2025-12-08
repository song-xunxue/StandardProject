#include "commonpage.h"
#include "ui_commonpage.h"

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

void CommonPage::setCommonPage(const QString &title, const QString &imagePath)
{
    ui->pageTittle->setText(title);

    ui->musicImageLabel->setPixmap(QPixmap(imagePath));
    ui->musicImageLabel->setScaledContents(true);

    //测试listitemBox
    ListItemBox* listItemBox = new ListItemBox(this);
    QListWidgetItem* listWidgetItem = new QListWidgetItem(ui->pageMusicList);
    listWidgetItem->setSizeHint(QSize(ui->pageMusicList->width(), 45));
    ui->pageMusicList->setItemWidget(listWidgetItem, listItemBox);
}


