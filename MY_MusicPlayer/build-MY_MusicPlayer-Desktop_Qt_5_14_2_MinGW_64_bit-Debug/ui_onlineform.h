/********************************************************************************
** Form generated from reading UI file 'onlineform.ui'
**
** Created by: Qt User Interface Compiler version 5.14.2
**
** WARNING! All changes made in this file will be lost when recompiling UI file!
********************************************************************************/

#ifndef UI_ONLINEFORM_H
#define UI_ONLINEFORM_H

#include <QtCore/QVariant>
#include <QtWidgets/QApplication>
#include <QtWidgets/QHBoxLayout>
#include <QtWidgets/QLabel>
#include <QtWidgets/QWidget>

QT_BEGIN_NAMESPACE

class Ui_OnlineForm
{
public:
    QHBoxLayout *horizontalLayout;
    QWidget *OFStyle;
    QHBoxLayout *horizontalLayout_2;
    QLabel *OFIcon;
    QLabel *OFText;

    void setupUi(QWidget *OnlineForm)
    {
        if (OnlineForm->objectName().isEmpty())
            OnlineForm->setObjectName(QString::fromUtf8("OnlineForm"));
        OnlineForm->resize(100, 40);
        horizontalLayout = new QHBoxLayout(OnlineForm);
        horizontalLayout->setSpacing(0);
        horizontalLayout->setObjectName(QString::fromUtf8("horizontalLayout"));
        horizontalLayout->setContentsMargins(0, 0, 0, 0);
        OFStyle = new QWidget(OnlineForm);
        OFStyle->setObjectName(QString::fromUtf8("OFStyle"));
        horizontalLayout_2 = new QHBoxLayout(OFStyle);
        horizontalLayout_2->setSpacing(0);
        horizontalLayout_2->setObjectName(QString::fromUtf8("horizontalLayout_2"));
        horizontalLayout_2->setContentsMargins(20, 0, 5, 0);
        OFIcon = new QLabel(OFStyle);
        OFIcon->setObjectName(QString::fromUtf8("OFIcon"));
        OFIcon->setMaximumSize(QSize(30, 16777215));

        horizontalLayout_2->addWidget(OFIcon);

        OFText = new QLabel(OFStyle);
        OFText->setObjectName(QString::fromUtf8("OFText"));

        horizontalLayout_2->addWidget(OFText);


        horizontalLayout->addWidget(OFStyle);


        retranslateUi(OnlineForm);

        QMetaObject::connectSlotsByName(OnlineForm);
    } // setupUi

    void retranslateUi(QWidget *OnlineForm)
    {
        OnlineForm->setWindowTitle(QCoreApplication::translate("OnlineForm", "Form", nullptr));
        OFIcon->setText(QString());
        OFText->setText(QString());
    } // retranslateUi

};

namespace Ui {
    class OnlineForm: public Ui_OnlineForm {};
} // namespace Ui

QT_END_NAMESPACE

#endif // UI_ONLINEFORM_H
