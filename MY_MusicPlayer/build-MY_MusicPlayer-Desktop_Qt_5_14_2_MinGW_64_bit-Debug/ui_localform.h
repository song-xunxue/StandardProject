/********************************************************************************
** Form generated from reading UI file 'localform.ui'
**
** Created by: Qt User Interface Compiler version 5.14.2
**
** WARNING! All changes made in this file will be lost when recompiling UI file!
********************************************************************************/

#ifndef UI_LOCALFORM_H
#define UI_LOCALFORM_H

#include <QtCore/QVariant>
#include <QtWidgets/QApplication>
#include <QtWidgets/QHBoxLayout>
#include <QtWidgets/QLabel>
#include <QtWidgets/QWidget>

QT_BEGIN_NAMESPACE

class Ui_LocalForm
{
public:
    QHBoxLayout *horizontalLayout;
    QWidget *LFStyle;
    QHBoxLayout *horizontalLayout_2;
    QLabel *LFIcon;
    QLabel *LFText;
    QWidget *LFLineBox;
    QHBoxLayout *horizontalLayout_3;
    QLabel *line1;
    QLabel *line2;
    QLabel *line3;
    QLabel *line4;

    void setupUi(QWidget *LocalForm)
    {
        if (LocalForm->objectName().isEmpty())
            LocalForm->setObjectName(QString::fromUtf8("LocalForm"));
        LocalForm->resize(180, 40);
        LocalForm->setMinimumSize(QSize(0, 40));
        LocalForm->setMaximumSize(QSize(180, 40));
        horizontalLayout = new QHBoxLayout(LocalForm);
        horizontalLayout->setSpacing(0);
        horizontalLayout->setObjectName(QString::fromUtf8("horizontalLayout"));
        horizontalLayout->setContentsMargins(0, 0, 0, 0);
        LFStyle = new QWidget(LocalForm);
        LFStyle->setObjectName(QString::fromUtf8("LFStyle"));
        LFStyle->setStyleSheet(QString::fromUtf8("#LFStyle:hover\n"
"{\n"
"	background-color:#D8D8D8;\n"
"}\n"
""));
        horizontalLayout_2 = new QHBoxLayout(LFStyle);
        horizontalLayout_2->setObjectName(QString::fromUtf8("horizontalLayout_2"));
        LFIcon = new QLabel(LFStyle);
        LFIcon->setObjectName(QString::fromUtf8("LFIcon"));
        LFIcon->setMaximumSize(QSize(30, 16777215));

        horizontalLayout_2->addWidget(LFIcon);

        LFText = new QLabel(LFStyle);
        LFText->setObjectName(QString::fromUtf8("LFText"));
        LFText->setMaximumSize(QSize(90, 16777215));

        horizontalLayout_2->addWidget(LFText);

        LFLineBox = new QWidget(LFStyle);
        LFLineBox->setObjectName(QString::fromUtf8("LFLineBox"));
        LFLineBox->setStyleSheet(QString::fromUtf8(".QLabel\n"
"{\n"
"	background-color:#FFFFFF;\n"
"}"));
        horizontalLayout_3 = new QHBoxLayout(LFLineBox);
        horizontalLayout_3->setSpacing(0);
        horizontalLayout_3->setObjectName(QString::fromUtf8("horizontalLayout_3"));
        horizontalLayout_3->setContentsMargins(0, 0, 0, 0);
        line1 = new QLabel(LFLineBox);
        line1->setObjectName(QString::fromUtf8("line1"));
        line1->setMinimumSize(QSize(2, 0));
        line1->setMaximumSize(QSize(2, 16777215));

        horizontalLayout_3->addWidget(line1);

        line2 = new QLabel(LFLineBox);
        line2->setObjectName(QString::fromUtf8("line2"));
        line2->setMinimumSize(QSize(2, 0));
        line2->setMaximumSize(QSize(2, 16777215));

        horizontalLayout_3->addWidget(line2);

        line3 = new QLabel(LFLineBox);
        line3->setObjectName(QString::fromUtf8("line3"));
        line3->setMinimumSize(QSize(2, 0));
        line3->setMaximumSize(QSize(2, 16777215));

        horizontalLayout_3->addWidget(line3);

        line4 = new QLabel(LFLineBox);
        line4->setObjectName(QString::fromUtf8("line4"));
        line4->setMinimumSize(QSize(2, 0));
        line4->setMaximumSize(QSize(2, 16777215));

        horizontalLayout_3->addWidget(line4);


        horizontalLayout_2->addWidget(LFLineBox);


        horizontalLayout->addWidget(LFStyle);


        retranslateUi(LocalForm);

        QMetaObject::connectSlotsByName(LocalForm);
    } // setupUi

    void retranslateUi(QWidget *LocalForm)
    {
        LocalForm->setWindowTitle(QCoreApplication::translate("LocalForm", "Form", nullptr));
        LFIcon->setText(QCoreApplication::translate("LocalForm", "\345\233\276", nullptr));
        LFText->setText(QCoreApplication::translate("LocalForm", "\346\226\207\345\255\227\346\217\217\350\277\260", nullptr));
        line1->setText(QString());
        line2->setText(QString());
        line3->setText(QString());
        line4->setText(QString());
    } // retranslateUi

};

namespace Ui {
    class LocalForm: public Ui_LocalForm {};
} // namespace Ui

QT_END_NAMESPACE

#endif // UI_LOCALFORM_H
