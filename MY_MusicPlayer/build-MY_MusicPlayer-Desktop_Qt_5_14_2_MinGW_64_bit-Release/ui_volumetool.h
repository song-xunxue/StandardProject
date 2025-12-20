/********************************************************************************
** Form generated from reading UI file 'volumetool.ui'
**
** Created by: Qt User Interface Compiler version 5.14.2
**
** WARNING! All changes made in this file will be lost when recompiling UI file!
********************************************************************************/

#ifndef UI_VOLUMETOOL_H
#define UI_VOLUMETOOL_H

#include <QtCore/QVariant>
#include <QtWidgets/QApplication>
#include <QtWidgets/QFrame>
#include <QtWidgets/QLabel>
#include <QtWidgets/QPushButton>
#include <QtWidgets/QWidget>

QT_BEGIN_NAMESPACE

class Ui_VolumeTool
{
public:
    QWidget *volumeWidget;
    QPushButton *silenceBtn;
    QLabel *volumeRatioLabel;
    QWidget *sliderBox;
    QFrame *inSlider;
    QFrame *outSlider;
    QPushButton *sliderBtn;

    void setupUi(QWidget *VolumeTool)
    {
        if (VolumeTool->objectName().isEmpty())
            VolumeTool->setObjectName(QString::fromUtf8("VolumeTool"));
        VolumeTool->resize(100, 350);
        volumeWidget = new QWidget(VolumeTool);
        volumeWidget->setObjectName(QString::fromUtf8("volumeWidget"));
        volumeWidget->setGeometry(QRect(10, 10, 80, 300));
        volumeWidget->setStyleSheet(QString::fromUtf8("#volumeWidget\n"
"{ \n"
"	background-color:#ffffff; \n"
"	border-radius:5px; \n"
"}"));
        silenceBtn = new QPushButton(volumeWidget);
        silenceBtn->setObjectName(QString::fromUtf8("silenceBtn"));
        silenceBtn->setGeometry(QRect(0, 260, 80, 26));
        silenceBtn->setStyleSheet(QString::fromUtf8("#silenceBtn \n"
"{ \n"
"	border:none; \n"
"} \n"
"#silenceBtn:hover\n"
"{ \n"
"	background-color:#F0F0F0; \n"
"}"));
        volumeRatioLabel = new QLabel(volumeWidget);
        volumeRatioLabel->setObjectName(QString::fromUtf8("volumeRatioLabel"));
        volumeRatioLabel->setGeometry(QRect(25, 230, 27, 30));
        volumeRatioLabel->setMinimumSize(QSize(0, 30));
        volumeRatioLabel->setMaximumSize(QSize(16777215, 30));
        volumeRatioLabel->setAlignment(Qt::AlignCenter);
        sliderBox = new QWidget(volumeWidget);
        sliderBox->setObjectName(QString::fromUtf8("sliderBox"));
        sliderBox->setGeometry(QRect(0, 0, 80, 225));
        sliderBox->setStyleSheet(QString::fromUtf8("#inSlider \n"
"{ \n"
"	background-color:#ECECEC; \n"
"}\n"
"#outSlider \n"
"{ \n"
"	background-color:#1ECC94; \n"
"}"));
        inSlider = new QFrame(sliderBox);
        inSlider->setObjectName(QString::fromUtf8("inSlider"));
        inSlider->setGeometry(QRect(38, 25, 4, 180));
        inSlider->setMinimumSize(QSize(0, 0));
        inSlider->setMaximumSize(QSize(16777215, 16777215));
        inSlider->setFrameShape(QFrame::StyledPanel);
        inSlider->setFrameShadow(QFrame::Raised);
        outSlider = new QFrame(sliderBox);
        outSlider->setObjectName(QString::fromUtf8("outSlider"));
        outSlider->setGeometry(QRect(38, 25, 4, 180));
        outSlider->setFrameShape(QFrame::StyledPanel);
        outSlider->setFrameShadow(QFrame::Raised);
        sliderBtn = new QPushButton(sliderBox);
        sliderBtn->setObjectName(QString::fromUtf8("sliderBtn"));
        sliderBtn->setGeometry(QRect(33, 20, 14, 14));
        sliderBtn->setMinimumSize(QSize(14, 14));
        sliderBtn->setMaximumSize(QSize(14, 14));
        sliderBtn->setStyleSheet(QString::fromUtf8("#sliderBtn\n"
"{\n"
"	background-color:#1ECC94;\n"
"	border-radius:7px;\n"
"}"));

        retranslateUi(VolumeTool);

        QMetaObject::connectSlotsByName(VolumeTool);
    } // setupUi

    void retranslateUi(QWidget *VolumeTool)
    {
        VolumeTool->setWindowTitle(QCoreApplication::translate("VolumeTool", "Form", nullptr));
        silenceBtn->setText(QCoreApplication::translate("VolumeTool", "\351\235\231\351\237\263", nullptr));
        volumeRatioLabel->setText(QCoreApplication::translate("VolumeTool", "20%", nullptr));
        sliderBtn->setText(QString());
    } // retranslateUi

};

namespace Ui {
    class VolumeTool: public Ui_VolumeTool {};
} // namespace Ui

QT_END_NAMESPACE

#endif // UI_VOLUMETOOL_H
