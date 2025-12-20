/********************************************************************************
** Form generated from reading UI file 'lrcpage.ui'
**
** Created by: Qt User Interface Compiler version 5.14.2
**
** WARNING! All changes made in this file will be lost when recompiling UI file!
********************************************************************************/

#ifndef UI_LRCPAGE_H
#define UI_LRCPAGE_H

#include <QtCore/QVariant>
#include <QtWidgets/QApplication>
#include <QtWidgets/QHBoxLayout>
#include <QtWidgets/QLabel>
#include <QtWidgets/QPushButton>
#include <QtWidgets/QSpacerItem>
#include <QtWidgets/QVBoxLayout>
#include <QtWidgets/QWidget>

QT_BEGIN_NAMESPACE

class Ui_LrcPage
{
public:
    QVBoxLayout *verticalLayout;
    QWidget *LrcStyle;
    QVBoxLayout *verticalLayout_5;
    QWidget *LrcHead;
    QHBoxLayout *horizontalLayout;
    QPushButton *hideBtn;
    QWidget *HeadBox;
    QVBoxLayout *verticalLayout_2;
    QLabel *musicSinger;
    QLabel *musicName;
    QWidget *LrcBody;
    QVBoxLayout *verticalLayout_3;
    QWidget *LrcContent;
    QVBoxLayout *verticalLayout_4;
    QSpacerItem *verticalSpacer;
    QLabel *label;
    QLabel *label_2;
    QLabel *label_3;
    QLabel *labelcenter;
    QLabel *label_4;
    QLabel *label_5;
    QLabel *label_6;
    QSpacerItem *verticalSpacer_2;

    void setupUi(QWidget *LrcPage)
    {
        if (LrcPage->objectName().isEmpty())
            LrcPage->setObjectName(QString::fromUtf8("LrcPage"));
        LrcPage->resize(1040, 700);
        LrcPage->setMinimumSize(QSize(1010, 670));
        LrcPage->setStyleSheet(QString::fromUtf8("#LrcStyle{\n"
"	border-image:url(\":/images/bg.png\");\n"
"}\n"
"\n"
"\n"
"*{\n"
"	color:#FFFFFF;\n"
"}\n"
"\n"
""));
        verticalLayout = new QVBoxLayout(LrcPage);
        verticalLayout->setSpacing(0);
        verticalLayout->setObjectName(QString::fromUtf8("verticalLayout"));
        verticalLayout->setContentsMargins(5, 5, 5, 5);
        LrcStyle = new QWidget(LrcPage);
        LrcStyle->setObjectName(QString::fromUtf8("LrcStyle"));
        LrcStyle->setMinimumSize(QSize(0, 50));
        verticalLayout_5 = new QVBoxLayout(LrcStyle);
        verticalLayout_5->setSpacing(0);
        verticalLayout_5->setObjectName(QString::fromUtf8("verticalLayout_5"));
        verticalLayout_5->setContentsMargins(0, 0, 0, 0);
        LrcHead = new QWidget(LrcStyle);
        LrcHead->setObjectName(QString::fromUtf8("LrcHead"));
        LrcHead->setMaximumSize(QSize(16777215, 50));
        horizontalLayout = new QHBoxLayout(LrcHead);
        horizontalLayout->setSpacing(0);
        horizontalLayout->setObjectName(QString::fromUtf8("horizontalLayout"));
        horizontalLayout->setContentsMargins(0, 0, 0, 0);
        hideBtn = new QPushButton(LrcHead);
        hideBtn->setObjectName(QString::fromUtf8("hideBtn"));
        hideBtn->setMaximumSize(QSize(30, 50));
        hideBtn->setStyleSheet(QString::fromUtf8("background-image:url(\":/images/xiala.png\");\n"
"background-position:center center;\n"
"background-repeat:no-repeat;\n"
"border:none;"));

        horizontalLayout->addWidget(hideBtn);

        HeadBox = new QWidget(LrcHead);
        HeadBox->setObjectName(QString::fromUtf8("HeadBox"));
        HeadBox->setMinimumSize(QSize(0, 50));
        HeadBox->setMaximumSize(QSize(16777215, 50));
        verticalLayout_2 = new QVBoxLayout(HeadBox);
        verticalLayout_2->setSpacing(0);
        verticalLayout_2->setObjectName(QString::fromUtf8("verticalLayout_2"));
        verticalLayout_2->setContentsMargins(0, 0, 25, 0);
        musicSinger = new QLabel(HeadBox);
        musicSinger->setObjectName(QString::fromUtf8("musicSinger"));
        musicSinger->setAlignment(Qt::AlignCenter);

        verticalLayout_2->addWidget(musicSinger);

        musicName = new QLabel(HeadBox);
        musicName->setObjectName(QString::fromUtf8("musicName"));
        musicName->setAlignment(Qt::AlignCenter);

        verticalLayout_2->addWidget(musicName);


        horizontalLayout->addWidget(HeadBox);


        verticalLayout_5->addWidget(LrcHead);

        LrcBody = new QWidget(LrcStyle);
        LrcBody->setObjectName(QString::fromUtf8("LrcBody"));
        verticalLayout_3 = new QVBoxLayout(LrcBody);
        verticalLayout_3->setSpacing(0);
        verticalLayout_3->setObjectName(QString::fromUtf8("verticalLayout_3"));
        verticalLayout_3->setContentsMargins(0, 0, 0, 0);
        LrcContent = new QWidget(LrcBody);
        LrcContent->setObjectName(QString::fromUtf8("LrcContent"));
        verticalLayout_4 = new QVBoxLayout(LrcContent);
        verticalLayout_4->setObjectName(QString::fromUtf8("verticalLayout_4"));
        verticalSpacer = new QSpacerItem(20, 94, QSizePolicy::Minimum, QSizePolicy::Expanding);

        verticalLayout_4->addItem(verticalSpacer);

        label = new QLabel(LrcContent);
        label->setObjectName(QString::fromUtf8("label"));
        label->setMinimumSize(QSize(0, 50));
        label->setMaximumSize(QSize(16777215, 50));
        QFont font;
        font.setPointSize(15);
        label->setFont(font);
        label->setAlignment(Qt::AlignCenter);

        verticalLayout_4->addWidget(label);

        label_2 = new QLabel(LrcContent);
        label_2->setObjectName(QString::fromUtf8("label_2"));
        label_2->setMinimumSize(QSize(0, 50));
        label_2->setMaximumSize(QSize(16777215, 50));
        label_2->setFont(font);
        label_2->setAlignment(Qt::AlignCenter);

        verticalLayout_4->addWidget(label_2);

        label_3 = new QLabel(LrcContent);
        label_3->setObjectName(QString::fromUtf8("label_3"));
        label_3->setMinimumSize(QSize(0, 50));
        label_3->setMaximumSize(QSize(16777215, 50));
        label_3->setFont(font);
        label_3->setAlignment(Qt::AlignCenter);

        verticalLayout_4->addWidget(label_3);

        labelcenter = new QLabel(LrcContent);
        labelcenter->setObjectName(QString::fromUtf8("labelcenter"));
        labelcenter->setMinimumSize(QSize(0, 80));
        labelcenter->setMaximumSize(QSize(16777215, 80));
        QFont font1;
        font1.setPointSize(23);
        labelcenter->setFont(font1);
        labelcenter->setStyleSheet(QString::fromUtf8("color:#1ECE9A;"));
        labelcenter->setAlignment(Qt::AlignCenter);

        verticalLayout_4->addWidget(labelcenter);

        label_4 = new QLabel(LrcContent);
        label_4->setObjectName(QString::fromUtf8("label_4"));
        label_4->setMinimumSize(QSize(0, 50));
        label_4->setMaximumSize(QSize(16777215, 50));
        label_4->setFont(font);
        label_4->setAlignment(Qt::AlignCenter);

        verticalLayout_4->addWidget(label_4);

        label_5 = new QLabel(LrcContent);
        label_5->setObjectName(QString::fromUtf8("label_5"));
        label_5->setMinimumSize(QSize(0, 50));
        label_5->setMaximumSize(QSize(16777215, 50));
        label_5->setFont(font);
        label_5->setAlignment(Qt::AlignCenter);

        verticalLayout_4->addWidget(label_5);

        label_6 = new QLabel(LrcContent);
        label_6->setObjectName(QString::fromUtf8("label_6"));
        label_6->setMinimumSize(QSize(0, 50));
        label_6->setMaximumSize(QSize(16777215, 50));
        label_6->setFont(font);
        label_6->setAlignment(Qt::AlignCenter);

        verticalLayout_4->addWidget(label_6);

        verticalSpacer_2 = new QSpacerItem(20, 94, QSizePolicy::Minimum, QSizePolicy::Expanding);

        verticalLayout_4->addItem(verticalSpacer_2);


        verticalLayout_3->addWidget(LrcContent);


        verticalLayout_5->addWidget(LrcBody);


        verticalLayout->addWidget(LrcStyle);


        retranslateUi(LrcPage);

        QMetaObject::connectSlotsByName(LrcPage);
    } // setupUi

    void retranslateUi(QWidget *LrcPage)
    {
        LrcPage->setWindowTitle(QCoreApplication::translate("LrcPage", "Form", nullptr));
        hideBtn->setText(QString());
        musicSinger->setText(QString());
        musicName->setText(QString());
        label->setText(QString());
        label_2->setText(QString());
        label_3->setText(QString());
        labelcenter->setText(QCoreApplication::translate("LrcPage", "\346\232\202\346\227\240\346\222\255\346\224\276\346\255\214\346\233\262", nullptr));
        label_4->setText(QString());
        label_5->setText(QString());
        label_6->setText(QString());
    } // retranslateUi

};

namespace Ui {
    class LrcPage: public Ui_LrcPage {};
} // namespace Ui

QT_END_NAMESPACE

#endif // UI_LRCPAGE_H
