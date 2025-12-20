/********************************************************************************
** Form generated from reading UI file 'listitembox.ui'
**
** Created by: Qt User Interface Compiler version 5.14.2
**
** WARNING! All changes made in this file will be lost when recompiling UI file!
********************************************************************************/

#ifndef UI_LISTITEMBOX_H
#define UI_LISTITEMBOX_H

#include <QtCore/QVariant>
#include <QtWidgets/QApplication>
#include <QtWidgets/QHBoxLayout>
#include <QtWidgets/QLabel>
#include <QtWidgets/QPushButton>
#include <QtWidgets/QSpacerItem>
#include <QtWidgets/QWidget>

QT_BEGIN_NAMESPACE

class Ui_ListItemBox
{
public:
    QHBoxLayout *horizontalLayout;
    QWidget *musicNameBox;
    QHBoxLayout *horizontalLayout_2;
    QPushButton *likeBtn;
    QLabel *muscieNameLabel;
    QLabel *VIPLabel;
    QLabel *SQLabel;
    QSpacerItem *horizontalSpacer;
    QWidget *musicSingerBox;
    QHBoxLayout *horizontalLayout_3;
    QLabel *musicSingerLabel;
    QWidget *musicAlbumBox;
    QHBoxLayout *horizontalLayout_4;
    QLabel *musicAlbumLabel;

    void setupUi(QWidget *ListItemBox)
    {
        if (ListItemBox->objectName().isEmpty())
            ListItemBox->setObjectName(QString::fromUtf8("ListItemBox"));
        ListItemBox->resize(800, 45);
        ListItemBox->setStyleSheet(QString::fromUtf8(""));
        horizontalLayout = new QHBoxLayout(ListItemBox);
        horizontalLayout->setSpacing(0);
        horizontalLayout->setObjectName(QString::fromUtf8("horizontalLayout"));
        horizontalLayout->setContentsMargins(0, 0, 0, 0);
        musicNameBox = new QWidget(ListItemBox);
        musicNameBox->setObjectName(QString::fromUtf8("musicNameBox"));
        musicNameBox->setMinimumSize(QSize(400, 0));
        musicNameBox->setMaximumSize(QSize(400, 16777215));
        musicNameBox->setStyleSheet(QString::fromUtf8("\n"
"#VIPLabel\n"
"{\n"
"	border:1px solid #1ECD96;\n"
"	color:#1ECD96; \n"
"	border-radius:2px;\n"
"}\n"
"#SQLabel \n"
"{ \n"
"	border:1px solid #FF6600; \n"
"	color:#FF6600; \n"
"	border-radius:2px; \n"
"}"));
        horizontalLayout_2 = new QHBoxLayout(musicNameBox);
        horizontalLayout_2->setSpacing(10);
        horizontalLayout_2->setObjectName(QString::fromUtf8("horizontalLayout_2"));
        horizontalLayout_2->setContentsMargins(10, 0, 0, 0);
        likeBtn = new QPushButton(musicNameBox);
        likeBtn->setObjectName(QString::fromUtf8("likeBtn"));
        likeBtn->setMinimumSize(QSize(25, 25));
        likeBtn->setMaximumSize(QSize(25, 25));
        likeBtn->setStyleSheet(QString::fromUtf8("border:none;"));

        horizontalLayout_2->addWidget(likeBtn);

        muscieNameLabel = new QLabel(musicNameBox);
        muscieNameLabel->setObjectName(QString::fromUtf8("muscieNameLabel"));
        muscieNameLabel->setMinimumSize(QSize(130, 0));
        muscieNameLabel->setMaximumSize(QSize(130, 16777215));

        horizontalLayout_2->addWidget(muscieNameLabel);

        VIPLabel = new QLabel(musicNameBox);
        VIPLabel->setObjectName(QString::fromUtf8("VIPLabel"));
        VIPLabel->setMinimumSize(QSize(30, 15));
        VIPLabel->setMaximumSize(QSize(30, 15));
        QFont font;
        font.setPointSize(12);
        VIPLabel->setFont(font);

        horizontalLayout_2->addWidget(VIPLabel);

        SQLabel = new QLabel(musicNameBox);
        SQLabel->setObjectName(QString::fromUtf8("SQLabel"));
        SQLabel->setMinimumSize(QSize(25, 15));
        SQLabel->setMaximumSize(QSize(25, 15));
        SQLabel->setFont(font);

        horizontalLayout_2->addWidget(SQLabel);

        horizontalSpacer = new QSpacerItem(177, 20, QSizePolicy::Expanding, QSizePolicy::Minimum);

        horizontalLayout_2->addItem(horizontalSpacer);


        horizontalLayout->addWidget(musicNameBox);

        musicSingerBox = new QWidget(ListItemBox);
        musicSingerBox->setObjectName(QString::fromUtf8("musicSingerBox"));
        musicSingerBox->setMinimumSize(QSize(200, 0));
        musicSingerBox->setMaximumSize(QSize(0, 16777215));
        horizontalLayout_3 = new QHBoxLayout(musicSingerBox);
        horizontalLayout_3->setSpacing(0);
        horizontalLayout_3->setObjectName(QString::fromUtf8("horizontalLayout_3"));
        horizontalLayout_3->setContentsMargins(5, 0, 0, 0);
        musicSingerLabel = new QLabel(musicSingerBox);
        musicSingerLabel->setObjectName(QString::fromUtf8("musicSingerLabel"));
        musicSingerLabel->setMinimumSize(QSize(200, 0));
        musicSingerLabel->setMaximumSize(QSize(220, 16777215));

        horizontalLayout_3->addWidget(musicSingerLabel);


        horizontalLayout->addWidget(musicSingerBox);

        musicAlbumBox = new QWidget(ListItemBox);
        musicAlbumBox->setObjectName(QString::fromUtf8("musicAlbumBox"));
        musicAlbumBox->setMinimumSize(QSize(200, 0));
        musicAlbumBox->setMaximumSize(QSize(200, 16777215));
        horizontalLayout_4 = new QHBoxLayout(musicAlbumBox);
        horizontalLayout_4->setSpacing(0);
        horizontalLayout_4->setObjectName(QString::fromUtf8("horizontalLayout_4"));
        horizontalLayout_4->setContentsMargins(0, 0, 0, 0);
        musicAlbumLabel = new QLabel(musicAlbumBox);
        musicAlbumLabel->setObjectName(QString::fromUtf8("musicAlbumLabel"));
        musicAlbumLabel->setMinimumSize(QSize(200, 0));

        horizontalLayout_4->addWidget(musicAlbumLabel);


        horizontalLayout->addWidget(musicAlbumBox);


        retranslateUi(ListItemBox);

        QMetaObject::connectSlotsByName(ListItemBox);
    } // setupUi

    void retranslateUi(QWidget *ListItemBox)
    {
        ListItemBox->setWindowTitle(QCoreApplication::translate("ListItemBox", "Form", nullptr));
        likeBtn->setText(QString());
        muscieNameLabel->setText(QCoreApplication::translate("ListItemBox", "\351\225\277\346\255\214\344\270\224\350\241\214", nullptr));
        VIPLabel->setText(QCoreApplication::translate("ListItemBox", "VIP", nullptr));
        SQLabel->setText(QCoreApplication::translate("ListItemBox", "SQ", nullptr));
        musicSingerLabel->setText(QCoreApplication::translate("ListItemBox", "\345\256\213\346\270\205\346\265\224", nullptr));
        musicAlbumLabel->setText(QCoreApplication::translate("ListItemBox", "\346\234\210\344\270\213\350\277\275\346\242\246", nullptr));
    } // retranslateUi

};

namespace Ui {
    class ListItemBox: public Ui_ListItemBox {};
} // namespace Ui

QT_END_NAMESPACE

#endif // UI_LISTITEMBOX_H
