/********************************************************************************
** Form generated from reading UI file 'recbox.ui'
**
** Created by: Qt User Interface Compiler version 5.14.2
**
** WARNING! All changes made in this file will be lost when recompiling UI file!
********************************************************************************/

#ifndef UI_RECBOX_H
#define UI_RECBOX_H

#include <QtCore/QVariant>
#include <QtWidgets/QApplication>
#include <QtWidgets/QHBoxLayout>
#include <QtWidgets/QPushButton>
#include <QtWidgets/QVBoxLayout>
#include <QtWidgets/QWidget>

QT_BEGIN_NAMESPACE

class Ui_RecBox
{
public:
    QHBoxLayout *horizontalLayout;
    QWidget *LeftPage;
    QVBoxLayout *verticalLayout;
    QPushButton *BoxUp;
    QWidget *recMusicBox;
    QVBoxLayout *verticalLayout_3;
    QWidget *recBoxListUp;
    QHBoxLayout *horizontalLayout_4;
    QHBoxLayout *recListUphorizontalLayout;
    QWidget *recBoxListDown;
    QHBoxLayout *horizontalLayout_5;
    QHBoxLayout *recListDownhorizontalLayout;
    QWidget *RightPage;
    QVBoxLayout *verticalLayout_2;
    QPushButton *BoxDown;

    void setupUi(QWidget *RecBox)
    {
        if (RecBox->objectName().isEmpty())
            RecBox->setObjectName(QString::fromUtf8("RecBox"));
        RecBox->resize(780, 440);
        horizontalLayout = new QHBoxLayout(RecBox);
        horizontalLayout->setSpacing(0);
        horizontalLayout->setObjectName(QString::fromUtf8("horizontalLayout"));
        horizontalLayout->setContentsMargins(0, 0, 0, 0);
        LeftPage = new QWidget(RecBox);
        LeftPage->setObjectName(QString::fromUtf8("LeftPage"));
        LeftPage->setMinimumSize(QSize(30, 0));
        LeftPage->setMaximumSize(QSize(30, 16777215));
        verticalLayout = new QVBoxLayout(LeftPage);
        verticalLayout->setSpacing(0);
        verticalLayout->setObjectName(QString::fromUtf8("verticalLayout"));
        verticalLayout->setContentsMargins(0, 0, 0, 0);
        BoxUp = new QPushButton(LeftPage);
        BoxUp->setObjectName(QString::fromUtf8("BoxUp"));
        BoxUp->setMinimumSize(QSize(20, 180));
        BoxUp->setStyleSheet(QString::fromUtf8("QPushButton \n"
"{ \n"
"	background-repeat:no-repeat; \n"
"	border:none; \n"
"	background-image : url(:/images/up_page.png); \n"
"	background-position:center center; \n"
"} \n"
"QPushButton:hover \n"
"{\n"
"	background-color:#1ECD97;\n"
"}"));

        verticalLayout->addWidget(BoxUp);


        horizontalLayout->addWidget(LeftPage);

        recMusicBox = new QWidget(RecBox);
        recMusicBox->setObjectName(QString::fromUtf8("recMusicBox"));
        verticalLayout_3 = new QVBoxLayout(recMusicBox);
        verticalLayout_3->setSpacing(0);
        verticalLayout_3->setObjectName(QString::fromUtf8("verticalLayout_3"));
        verticalLayout_3->setContentsMargins(0, 0, 0, 0);
        recBoxListUp = new QWidget(recMusicBox);
        recBoxListUp->setObjectName(QString::fromUtf8("recBoxListUp"));
        recBoxListUp->setMaximumSize(QSize(720, 16777215));
        horizontalLayout_4 = new QHBoxLayout(recBoxListUp);
        horizontalLayout_4->setSpacing(0);
        horizontalLayout_4->setObjectName(QString::fromUtf8("horizontalLayout_4"));
        horizontalLayout_4->setContentsMargins(0, 0, 0, 0);
        recListUphorizontalLayout = new QHBoxLayout();
        recListUphorizontalLayout->setSpacing(10);
        recListUphorizontalLayout->setObjectName(QString::fromUtf8("recListUphorizontalLayout"));

        horizontalLayout_4->addLayout(recListUphorizontalLayout);


        verticalLayout_3->addWidget(recBoxListUp);

        recBoxListDown = new QWidget(recMusicBox);
        recBoxListDown->setObjectName(QString::fromUtf8("recBoxListDown"));
        recBoxListDown->setMaximumSize(QSize(720, 16777215));
        horizontalLayout_5 = new QHBoxLayout(recBoxListDown);
        horizontalLayout_5->setSpacing(0);
        horizontalLayout_5->setObjectName(QString::fromUtf8("horizontalLayout_5"));
        horizontalLayout_5->setContentsMargins(0, 0, 0, 0);
        recListDownhorizontalLayout = new QHBoxLayout();
        recListDownhorizontalLayout->setSpacing(10);
        recListDownhorizontalLayout->setObjectName(QString::fromUtf8("recListDownhorizontalLayout"));

        horizontalLayout_5->addLayout(recListDownhorizontalLayout);


        verticalLayout_3->addWidget(recBoxListDown);


        horizontalLayout->addWidget(recMusicBox);

        RightPage = new QWidget(RecBox);
        RightPage->setObjectName(QString::fromUtf8("RightPage"));
        RightPage->setMinimumSize(QSize(30, 0));
        RightPage->setMaximumSize(QSize(30, 16777215));
        verticalLayout_2 = new QVBoxLayout(RightPage);
        verticalLayout_2->setSpacing(0);
        verticalLayout_2->setObjectName(QString::fromUtf8("verticalLayout_2"));
        verticalLayout_2->setContentsMargins(0, 0, 0, 0);
        BoxDown = new QPushButton(RightPage);
        BoxDown->setObjectName(QString::fromUtf8("BoxDown"));
        BoxDown->setMinimumSize(QSize(20, 180));
        BoxDown->setStyleSheet(QString::fromUtf8("QPushButton \n"
"{ \n"
"	background-repeat:no-repeat; \n"
"	border:none; \n"
"	background-image : url(:/images/down_page.png); \n"
"	background-position:center center; \n"
"} \n"
"QPushButton:hover \n"
"{\n"
"	background-color:#1ECD97;\n"
"}"));

        verticalLayout_2->addWidget(BoxDown);


        horizontalLayout->addWidget(RightPage);


        retranslateUi(RecBox);

        QMetaObject::connectSlotsByName(RecBox);
    } // setupUi

    void retranslateUi(QWidget *RecBox)
    {
        RecBox->setWindowTitle(QCoreApplication::translate("RecBox", "Form", nullptr));
        BoxUp->setText(QString());
        BoxDown->setText(QString());
    } // retranslateUi

};

namespace Ui {
    class RecBox: public Ui_RecBox {};
} // namespace Ui

QT_END_NAMESPACE

#endif // UI_RECBOX_H
