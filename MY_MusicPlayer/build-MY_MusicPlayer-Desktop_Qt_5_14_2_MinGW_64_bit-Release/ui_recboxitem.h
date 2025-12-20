/********************************************************************************
** Form generated from reading UI file 'recboxitem.ui'
**
** Created by: Qt User Interface Compiler version 5.14.2
**
** WARNING! All changes made in this file will be lost when recompiling UI file!
********************************************************************************/

#ifndef UI_RECBOXITEM_H
#define UI_RECBOXITEM_H

#include <QtCore/QVariant>
#include <QtWidgets/QApplication>
#include <QtWidgets/QLabel>
#include <QtWidgets/QPushButton>
#include <QtWidgets/QVBoxLayout>
#include <QtWidgets/QWidget>

QT_BEGIN_NAMESPACE

class Ui_RecBoxItem
{
public:
    QVBoxLayout *verticalLayout;
    QWidget *recboxitemStyle;
    QLabel *recboximage;
    QPushButton *recboxButton;
    QLabel *recboxText;

    void setupUi(QWidget *RecBoxItem)
    {
        if (RecBoxItem->objectName().isEmpty())
            RecBoxItem->setObjectName(QString::fromUtf8("RecBoxItem"));
        RecBoxItem->resize(150, 200);
        RecBoxItem->setMinimumSize(QSize(150, 200));
        RecBoxItem->setMaximumSize(QSize(150, 200));
        verticalLayout = new QVBoxLayout(RecBoxItem);
        verticalLayout->setSpacing(2);
        verticalLayout->setObjectName(QString::fromUtf8("verticalLayout"));
        verticalLayout->setContentsMargins(0, 0, 0, 0);
        recboxitemStyle = new QWidget(RecBoxItem);
        recboxitemStyle->setObjectName(QString::fromUtf8("recboxitemStyle"));
        recboxitemStyle->setMinimumSize(QSize(150, 150));
        recboximage = new QLabel(recboxitemStyle);
        recboximage->setObjectName(QString::fromUtf8("recboximage"));
        recboximage->setGeometry(QRect(0, 0, 150, 150));
        recboximage->setMinimumSize(QSize(150, 150));
        recboxButton = new QPushButton(recboxitemStyle);
        recboxButton->setObjectName(QString::fromUtf8("recboxButton"));
        recboxButton->setGeometry(QRect(50, 70, 50, 50));
        recboxButton->setCursor(QCursor(Qt::PointingHandCursor));
        recboxButton->setStyleSheet(QString::fromUtf8("#recboxButton\n"
"{\n"
"\n"
"	border:none;\n"
"}"));

        verticalLayout->addWidget(recboxitemStyle);

        recboxText = new QLabel(RecBoxItem);
        recboxText->setObjectName(QString::fromUtf8("recboxText"));
        recboxText->setAlignment(Qt::AlignCenter);

        verticalLayout->addWidget(recboxText);


        retranslateUi(RecBoxItem);

        QMetaObject::connectSlotsByName(RecBoxItem);
    } // setupUi

    void retranslateUi(QWidget *RecBoxItem)
    {
        RecBoxItem->setWindowTitle(QCoreApplication::translate("RecBoxItem", "Form", nullptr));
        recboximage->setText(QString());
        recboxButton->setText(QString());
        recboxText->setText(QCoreApplication::translate("RecBoxItem", "\346\216\250\350\215\220-001", nullptr));
    } // retranslateUi

};

namespace Ui {
    class RecBoxItem: public Ui_RecBoxItem {};
} // namespace Ui

QT_END_NAMESPACE

#endif // UI_RECBOXITEM_H
