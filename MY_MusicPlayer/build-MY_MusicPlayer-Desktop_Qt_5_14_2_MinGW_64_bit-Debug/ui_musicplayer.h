/********************************************************************************
** Form generated from reading UI file 'musicplayer.ui'
**
** Created by: Qt User Interface Compiler version 5.14.2
**
** WARNING! All changes made in this file will be lost when recompiling UI file!
********************************************************************************/

#ifndef UI_MUSICPLAYER_H
#define UI_MUSICPLAYER_H

#include <QtCore/QVariant>
#include <QtWidgets/QApplication>
#include <QtWidgets/QGridLayout>
#include <QtWidgets/QHBoxLayout>
#include <QtWidgets/QLabel>
#include <QtWidgets/QLineEdit>
#include <QtWidgets/QPushButton>
#include <QtWidgets/QScrollArea>
#include <QtWidgets/QSpacerItem>
#include <QtWidgets/QStackedWidget>
#include <QtWidgets/QVBoxLayout>
#include <QtWidgets/QWidget>
#include <commonpage.h>
#include <localform.h>
#include <musicslider.h>
#include <onlineform.h>
#include <recbox.h>

QT_BEGIN_NAMESPACE

class Ui_MusicPlayer
{
public:
    QVBoxLayout *verticalLayout;
    QWidget *Background;
    QVBoxLayout *verticalLayout_2;
    QWidget *Head;
    QHBoxLayout *horizontalLayout;
    QWidget *HeadLeft;
    QHBoxLayout *horizontalLayout_2;
    QLabel *Logo;
    QWidget *HeadRight;
    QHBoxLayout *horizontalLayout_3;
    QWidget *SearchBox;
    QHBoxLayout *horizontalLayout_4;
    QLineEdit *SearchlineEdit;
    QWidget *SettingBox;
    QHBoxLayout *horizontalLayout_5;
    QSpacerItem *horizontalSpacer;
    QPushButton *skin;
    QPushButton *max;
    QPushButton *min;
    QPushButton *quit;
    QWidget *Body;
    QHBoxLayout *horizontalLayout_6;
    QWidget *BodyLeft;
    QVBoxLayout *verticalLayout_3;
    QWidget *LeftBox;
    QVBoxLayout *verticalLayout_4;
    QWidget *OnlineMusic;
    QVBoxLayout *verticalLayout_5;
    QWidget *OnlineBox;
    QHBoxLayout *horizontalLayout_7;
    OnlineForm *rec;
    OnlineForm *radio;
    QWidget *addmodule;
    QWidget *LocalMusic;
    QVBoxLayout *verticalLayout_6;
    QLabel *LoclText;
    LocalForm *like;
    LocalForm *local;
    LocalForm *recent;
    QWidget *SongList;
    QVBoxLayout *verticalLayout_7;
    QWidget *SongListHead;
    QHBoxLayout *horizontalLayout_8;
    QPushButton *self;
    QPushButton *save;
    QPushButton *addlist;
    QStackedWidget *Songlist;
    QWidget *Mylist;
    QWidget *Favoritelist;
    QSpacerItem *verticalSpacer;
    QWidget *BodyRight;
    QVBoxLayout *verticalLayout_8;
    QStackedWidget *stackedWidget;
    QWidget *recPage;
    QHBoxLayout *horizontalLayout_12;
    QScrollArea *scrollArea;
    QWidget *scrollAreaWidgetContents;
    QVBoxLayout *verticalLayout_9;
    QLabel *recMainText;
    QLabel *recText;
    RecBox *recmusicBox;
    QLabel *suppText;
    RecBox *supplymusicBox;
    QWidget *radioPage;
    QScrollArea *scrollArea_2;
    QWidget *scrollAreaWidgetContents_2;
    CommonPage *recentPage;
    CommonPage *likePage;
    CommonPage *localPage;
    MusicSlider *progressbar;
    QWidget *control;
    QHBoxLayout *horizontalLayout_9;
    QWidget *play1;
    QGridLayout *gridLayout;
    QLabel *songimage;
    QLabel *songname;
    QLabel *signer;
    QWidget *play2;
    QHBoxLayout *horizontalLayout_11;
    QPushButton *playMode;
    QPushButton *playUp;
    QPushButton *play;
    QPushButton *playDown;
    QPushButton *volumn;
    QPushButton *addlocal;
    QWidget *play3;
    QHBoxLayout *horizontalLayout_10;
    QLabel *labelNull;
    QLabel *currentTime;
    QLabel *line;
    QLabel *totalTime;
    QPushButton *lrcword;
    QPushButton *palayList;

    void setupUi(QWidget *MusicPlayer)
    {
        if (MusicPlayer->objectName().isEmpty())
            MusicPlayer->setObjectName(QString::fromUtf8("MusicPlayer"));
        MusicPlayer->resize(1040, 700);
        MusicPlayer->setMinimumSize(QSize(1040, 700));
        verticalLayout = new QVBoxLayout(MusicPlayer);
        verticalLayout->setSpacing(0);
        verticalLayout->setObjectName(QString::fromUtf8("verticalLayout"));
        verticalLayout->setContentsMargins(5, 5, 5, 5);
        Background = new QWidget(MusicPlayer);
        Background->setObjectName(QString::fromUtf8("Background"));
        Background->setStyleSheet(QString::fromUtf8(""));
        verticalLayout_2 = new QVBoxLayout(Background);
        verticalLayout_2->setSpacing(0);
        verticalLayout_2->setObjectName(QString::fromUtf8("verticalLayout_2"));
        verticalLayout_2->setContentsMargins(0, 0, 0, 0);
        Head = new QWidget(Background);
        Head->setObjectName(QString::fromUtf8("Head"));
        Head->setMinimumSize(QSize(0, 100));
        Head->setMaximumSize(QSize(16777215, 100));
        Head->setStyleSheet(QString::fromUtf8("#HeadLeft\n"
"{\n"
"	background-color:#F0F0F0;\n"
"}\n"
"#HeadRight\n"
"{\n"
"	background-color:#F5F5F5;\n"
"}\n"
""));
        horizontalLayout = new QHBoxLayout(Head);
        horizontalLayout->setSpacing(0);
        horizontalLayout->setObjectName(QString::fromUtf8("horizontalLayout"));
        horizontalLayout->setContentsMargins(0, 0, 0, 0);
        HeadLeft = new QWidget(Head);
        HeadLeft->setObjectName(QString::fromUtf8("HeadLeft"));
        HeadLeft->setMinimumSize(QSize(200, 0));
        HeadLeft->setMaximumSize(QSize(200, 16777215));
        HeadLeft->setStyleSheet(QString::fromUtf8("#Logo {\n"
"\n"
"    background-image: url(\":/images/Logo.png\");\n"
"    background-repeat: no-repeat;\n"
"    background-position: center center; \n"
"	border:none;\n"
"\n"
"}"));
        horizontalLayout_2 = new QHBoxLayout(HeadLeft);
        horizontalLayout_2->setObjectName(QString::fromUtf8("horizontalLayout_2"));
        horizontalLayout_2->setContentsMargins(10, 10, 10, 10);
        Logo = new QLabel(HeadLeft);
        Logo->setObjectName(QString::fromUtf8("Logo"));
        Logo->setStyleSheet(QString::fromUtf8(""));
        Logo->setAlignment(Qt::AlignCenter);

        horizontalLayout_2->addWidget(Logo);


        horizontalLayout->addWidget(HeadLeft);

        HeadRight = new QWidget(Head);
        HeadRight->setObjectName(QString::fromUtf8("HeadRight"));
        HeadRight->setStyleSheet(QString::fromUtf8(""));
        horizontalLayout_3 = new QHBoxLayout(HeadRight);
        horizontalLayout_3->setSpacing(0);
        horizontalLayout_3->setObjectName(QString::fromUtf8("horizontalLayout_3"));
        SearchBox = new QWidget(HeadRight);
        SearchBox->setObjectName(QString::fromUtf8("SearchBox"));
        SearchBox->setMinimumSize(QSize(340, 0));
        SearchBox->setMaximumSize(QSize(340, 16777215));
        SearchBox->setStyleSheet(QString::fromUtf8("#SearchlineEdit\n"
"{ \n"
"	background-color: #E3E3E3; /*\350\256\276\347\275\256\350\203\214\346\231\257\351\242\234\342\276\212*/ 		\n"
"	border-radius: 20px; /*\350\256\276\347\275\256\345\233\233\344\270\252\342\273\206\347\232\204\345\234\206\342\273\206*/ 			\n"
"	padding-left: 17px; /*\345\206\205\351\203\250\342\275\202\345\255\227\345\210\260\350\276\271\347\232\204\350\267\235\347\246\273*/\n"
"	border:none;\n"
"}"));
        horizontalLayout_4 = new QHBoxLayout(SearchBox);
        horizontalLayout_4->setSpacing(0);
        horizontalLayout_4->setObjectName(QString::fromUtf8("horizontalLayout_4"));
        horizontalLayout_4->setContentsMargins(5, 1, 5, 1);
        SearchlineEdit = new QLineEdit(SearchBox);
        SearchlineEdit->setObjectName(QString::fromUtf8("SearchlineEdit"));
        SearchlineEdit->setMinimumSize(QSize(40, 40));
        SearchlineEdit->setStyleSheet(QString::fromUtf8(""));
        SearchlineEdit->setFrame(false);

        horizontalLayout_4->addWidget(SearchlineEdit);


        horizontalLayout_3->addWidget(SearchBox);

        SettingBox = new QWidget(HeadRight);
        SettingBox->setObjectName(QString::fromUtf8("SettingBox"));
        SettingBox->setMinimumSize(QSize(0, 0));
        SettingBox->setMaximumSize(QSize(16777215, 16777215));
        SettingBox->setStyleSheet(QString::fromUtf8("QPushButton\n"
"{\n"
"	border:none;\n"
"	border-radius:10ps;\n"
"	background-repeat:no-repeat;\n"
"	background-position:center center;\n"
"}\n"
"QPushButton:hover\n"
"{\n"
"	background-color:rgba(230,0,0,0.5);\n"
"}"));
        horizontalLayout_5 = new QHBoxLayout(SettingBox);
        horizontalLayout_5->setSpacing(4);
        horizontalLayout_5->setObjectName(QString::fromUtf8("horizontalLayout_5"));
        horizontalLayout_5->setContentsMargins(0, 0, 0, 0);
        horizontalSpacer = new QSpacerItem(40, 20, QSizePolicy::Expanding, QSizePolicy::Minimum);

        horizontalLayout_5->addItem(horizontalSpacer);

        skin = new QPushButton(SettingBox);
        skin->setObjectName(QString::fromUtf8("skin"));
        skin->setMinimumSize(QSize(30, 30));
        skin->setMaximumSize(QSize(30, 30));
        skin->setStyleSheet(QString::fromUtf8("#skin\n"
"{\n"
"	background-image:url(\":/images/skin.png\");\n"
"}"));

        horizontalLayout_5->addWidget(skin);

        max = new QPushButton(SettingBox);
        max->setObjectName(QString::fromUtf8("max"));
        max->setMinimumSize(QSize(30, 30));
        max->setMaximumSize(QSize(30, 30));
        max->setStyleSheet(QString::fromUtf8("#max\n"
"{\n"
"	background-image:url(\":/images/max.png\");\n"
"}"));

        horizontalLayout_5->addWidget(max);

        min = new QPushButton(SettingBox);
        min->setObjectName(QString::fromUtf8("min"));
        min->setMinimumSize(QSize(30, 30));
        min->setMaximumSize(QSize(30, 30));
        min->setStyleSheet(QString::fromUtf8("#min\n"
"{\n"
"	background-image:url(\":/images/min.png\");\n"
"}"));

        horizontalLayout_5->addWidget(min);

        quit = new QPushButton(SettingBox);
        quit->setObjectName(QString::fromUtf8("quit"));
        quit->setMinimumSize(QSize(30, 30));
        quit->setMaximumSize(QSize(30, 30));
        quit->setStyleSheet(QString::fromUtf8("#quit\n"
"{\n"
"	background-image:url(\":/images/quit.png\");\n"
"}"));

        horizontalLayout_5->addWidget(quit);


        horizontalLayout_3->addWidget(SettingBox);


        horizontalLayout->addWidget(HeadRight);


        verticalLayout_2->addWidget(Head);

        Body = new QWidget(Background);
        Body->setObjectName(QString::fromUtf8("Body"));
        Body->setStyleSheet(QString::fromUtf8("#BodyLeft\n"
"{\n"
"	background-color:#F0F0F0;\n"
"\n"
"}\n"
"#BodyRight\n"
"{\n"
"	background-color:#F5F5F5;\n"
"}\n"
""));
        horizontalLayout_6 = new QHBoxLayout(Body);
        horizontalLayout_6->setSpacing(0);
        horizontalLayout_6->setObjectName(QString::fromUtf8("horizontalLayout_6"));
        horizontalLayout_6->setContentsMargins(0, 0, 0, 0);
        BodyLeft = new QWidget(Body);
        BodyLeft->setObjectName(QString::fromUtf8("BodyLeft"));
        BodyLeft->setMinimumSize(QSize(200, 0));
        BodyLeft->setMaximumSize(QSize(200, 16777215));
        BodyLeft->setStyleSheet(QString::fromUtf8(""));
        verticalLayout_3 = new QVBoxLayout(BodyLeft);
        verticalLayout_3->setSpacing(0);
        verticalLayout_3->setObjectName(QString::fromUtf8("verticalLayout_3"));
        verticalLayout_3->setContentsMargins(0, 0, 0, 0);
        LeftBox = new QWidget(BodyLeft);
        LeftBox->setObjectName(QString::fromUtf8("LeftBox"));
        verticalLayout_4 = new QVBoxLayout(LeftBox);
        verticalLayout_4->setSpacing(0);
        verticalLayout_4->setObjectName(QString::fromUtf8("verticalLayout_4"));
        verticalLayout_4->setContentsMargins(0, 0, 0, 0);
        OnlineMusic = new QWidget(LeftBox);
        OnlineMusic->setObjectName(QString::fromUtf8("OnlineMusic"));
        OnlineMusic->setMinimumSize(QSize(0, 100));
        OnlineMusic->setMaximumSize(QSize(16777215, 100));
        OnlineMusic->setStyleSheet(QString::fromUtf8(""));
        verticalLayout_5 = new QVBoxLayout(OnlineMusic);
        verticalLayout_5->setObjectName(QString::fromUtf8("verticalLayout_5"));
        verticalLayout_5->setContentsMargins(0, 0, 0, 0);
        OnlineBox = new QWidget(OnlineMusic);
        OnlineBox->setObjectName(QString::fromUtf8("OnlineBox"));
        OnlineBox->setMaximumSize(QSize(16777215, 40));
        OnlineBox->setStyleSheet(QString::fromUtf8(""));
        horizontalLayout_7 = new QHBoxLayout(OnlineBox);
        horizontalLayout_7->setSpacing(0);
        horizontalLayout_7->setObjectName(QString::fromUtf8("horizontalLayout_7"));
        horizontalLayout_7->setContentsMargins(0, 0, 0, 0);
        rec = new OnlineForm(OnlineBox);
        rec->setObjectName(QString::fromUtf8("rec"));
        rec->setMinimumSize(QSize(100, 40));
        rec->setMaximumSize(QSize(100, 40));
        rec->setStyleSheet(QString::fromUtf8(""));

        horizontalLayout_7->addWidget(rec);

        radio = new OnlineForm(OnlineBox);
        radio->setObjectName(QString::fromUtf8("radio"));
        radio->setMinimumSize(QSize(100, 40));
        radio->setMaximumSize(QSize(100, 40));
        radio->setStyleSheet(QString::fromUtf8(""));

        horizontalLayout_7->addWidget(radio);


        verticalLayout_5->addWidget(OnlineBox);

        addmodule = new QWidget(OnlineMusic);
        addmodule->setObjectName(QString::fromUtf8("addmodule"));
        addmodule->setMinimumSize(QSize(200, 40));
        addmodule->setMaximumSize(QSize(200, 16777215));
        addmodule->setStyleSheet(QString::fromUtf8("/*\n"
"#addmodule\n"
"{\n"
"	border-image: url(:/images/addmodule.png);\n"
"    border: none;\n"
"    padding: 5px; \n"
"}\n"
"*/"));

        verticalLayout_5->addWidget(addmodule);


        verticalLayout_4->addWidget(OnlineMusic);

        LocalMusic = new QWidget(LeftBox);
        LocalMusic->setObjectName(QString::fromUtf8("LocalMusic"));
        LocalMusic->setStyleSheet(QString::fromUtf8(""));
        verticalLayout_6 = new QVBoxLayout(LocalMusic);
        verticalLayout_6->setSpacing(1);
        verticalLayout_6->setObjectName(QString::fromUtf8("verticalLayout_6"));
        verticalLayout_6->setContentsMargins(0, 0, 0, 0);
        LoclText = new QLabel(LocalMusic);
        LoclText->setObjectName(QString::fromUtf8("LoclText"));
        LoclText->setMinimumSize(QSize(200, 40));
        LoclText->setMaximumSize(QSize(200, 35));
        LoclText->setStyleSheet(QString::fromUtf8(""));
        LoclText->setMargin(10);

        verticalLayout_6->addWidget(LoclText);

        like = new LocalForm(LocalMusic);
        like->setObjectName(QString::fromUtf8("like"));
        like->setMinimumSize(QSize(0, 40));
        like->setMaximumSize(QSize(16777215, 40));
        like->setStyleSheet(QString::fromUtf8(""));

        verticalLayout_6->addWidget(like);

        local = new LocalForm(LocalMusic);
        local->setObjectName(QString::fromUtf8("local"));
        local->setMinimumSize(QSize(0, 40));
        local->setMaximumSize(QSize(16777215, 40));
        local->setStyleSheet(QString::fromUtf8(""));

        verticalLayout_6->addWidget(local);

        recent = new LocalForm(LocalMusic);
        recent->setObjectName(QString::fromUtf8("recent"));
        recent->setMinimumSize(QSize(0, 40));
        recent->setMaximumSize(QSize(16777215, 40));
        recent->setStyleSheet(QString::fromUtf8(""));

        verticalLayout_6->addWidget(recent);


        verticalLayout_4->addWidget(LocalMusic);

        SongList = new QWidget(LeftBox);
        SongList->setObjectName(QString::fromUtf8("SongList"));
        SongList->setMaximumSize(QSize(16777215, 300));
        SongList->setStyleSheet(QString::fromUtf8(""));
        verticalLayout_7 = new QVBoxLayout(SongList);
        verticalLayout_7->setObjectName(QString::fromUtf8("verticalLayout_7"));
        verticalLayout_7->setContentsMargins(5, 0, 5, 0);
        SongListHead = new QWidget(SongList);
        SongListHead->setObjectName(QString::fromUtf8("SongListHead"));
        SongListHead->setMinimumSize(QSize(0, 40));
        SongListHead->setMaximumSize(QSize(16777215, 40));
        SongListHead->setStyleSheet(QString::fromUtf8("\n"
".QPushButton\n"
"{\n"
"	border:none;\n"
"	border-radius:10px;\n"
"}\n"
".QPushButton:hover\n"
"{\n"
"	background-color:#D8D8D8;\n"
"}\n"
""));
        horizontalLayout_8 = new QHBoxLayout(SongListHead);
        horizontalLayout_8->setSpacing(3);
        horizontalLayout_8->setObjectName(QString::fromUtf8("horizontalLayout_8"));
        horizontalLayout_8->setContentsMargins(0, 0, 0, 0);
        self = new QPushButton(SongListHead);
        self->setObjectName(QString::fromUtf8("self"));

        horizontalLayout_8->addWidget(self);

        save = new QPushButton(SongListHead);
        save->setObjectName(QString::fromUtf8("save"));
        save->setStyleSheet(QString::fromUtf8(""));

        horizontalLayout_8->addWidget(save);

        addlist = new QPushButton(SongListHead);
        addlist->setObjectName(QString::fromUtf8("addlist"));
        addlist->setMinimumSize(QSize(15, 0));
        addlist->setMaximumSize(QSize(15, 16777215));

        horizontalLayout_8->addWidget(addlist);


        verticalLayout_7->addWidget(SongListHead);

        Songlist = new QStackedWidget(SongList);
        Songlist->setObjectName(QString::fromUtf8("Songlist"));
        Songlist->setMinimumSize(QSize(0, 150));
        Songlist->setMaximumSize(QSize(16777215, 150));
        Mylist = new QWidget();
        Mylist->setObjectName(QString::fromUtf8("Mylist"));
        Songlist->addWidget(Mylist);
        Favoritelist = new QWidget();
        Favoritelist->setObjectName(QString::fromUtf8("Favoritelist"));
        Songlist->addWidget(Favoritelist);

        verticalLayout_7->addWidget(Songlist);

        verticalSpacer = new QSpacerItem(20, 40, QSizePolicy::Minimum, QSizePolicy::Expanding);

        verticalLayout_7->addItem(verticalSpacer);


        verticalLayout_4->addWidget(SongList);


        verticalLayout_3->addWidget(LeftBox);


        horizontalLayout_6->addWidget(BodyLeft);

        BodyRight = new QWidget(Body);
        BodyRight->setObjectName(QString::fromUtf8("BodyRight"));
        BodyRight->setStyleSheet(QString::fromUtf8(""));
        verticalLayout_8 = new QVBoxLayout(BodyRight);
        verticalLayout_8->setSpacing(0);
        verticalLayout_8->setObjectName(QString::fromUtf8("verticalLayout_8"));
        verticalLayout_8->setContentsMargins(0, 0, 0, 0);
        stackedWidget = new QStackedWidget(BodyRight);
        stackedWidget->setObjectName(QString::fromUtf8("stackedWidget"));
        recPage = new QWidget();
        recPage->setObjectName(QString::fromUtf8("recPage"));
        horizontalLayout_12 = new QHBoxLayout(recPage);
        horizontalLayout_12->setSpacing(0);
        horizontalLayout_12->setObjectName(QString::fromUtf8("horizontalLayout_12"));
        horizontalLayout_12->setContentsMargins(5, 5, 5, 5);
        scrollArea = new QScrollArea(recPage);
        scrollArea->setObjectName(QString::fromUtf8("scrollArea"));
        scrollArea->setMaximumSize(QSize(16777215, 16777215));
        scrollArea->setWidgetResizable(true);
        scrollAreaWidgetContents = new QWidget();
        scrollAreaWidgetContents->setObjectName(QString::fromUtf8("scrollAreaWidgetContents"));
        scrollAreaWidgetContents->setGeometry(QRect(0, 0, 818, 498));
        scrollAreaWidgetContents->setMaximumSize(QSize(16777215, 16777215));
        verticalLayout_9 = new QVBoxLayout(scrollAreaWidgetContents);
        verticalLayout_9->setSpacing(5);
        verticalLayout_9->setObjectName(QString::fromUtf8("verticalLayout_9"));
        verticalLayout_9->setContentsMargins(5, 5, 5, 5);
        recMainText = new QLabel(scrollAreaWidgetContents);
        recMainText->setObjectName(QString::fromUtf8("recMainText"));
        recMainText->setMaximumSize(QSize(16777215, 50));
        QFont font;
        font.setPointSize(24);
        recMainText->setFont(font);
        recMainText->setStyleSheet(QString::fromUtf8(""));

        verticalLayout_9->addWidget(recMainText);

        recText = new QLabel(scrollAreaWidgetContents);
        recText->setObjectName(QString::fromUtf8("recText"));
        recText->setMaximumSize(QSize(16777215, 30));
        QFont font1;
        font1.setPointSize(16);
        recText->setFont(font1);

        verticalLayout_9->addWidget(recText);

        recmusicBox = new RecBox(scrollAreaWidgetContents);
        recmusicBox->setObjectName(QString::fromUtf8("recmusicBox"));
        recmusicBox->setMaximumSize(QSize(810, 16777215));

        verticalLayout_9->addWidget(recmusicBox);

        suppText = new QLabel(scrollAreaWidgetContents);
        suppText->setObjectName(QString::fromUtf8("suppText"));
        suppText->setMaximumSize(QSize(16777215, 30));
        suppText->setFont(font1);

        verticalLayout_9->addWidget(suppText);

        supplymusicBox = new RecBox(scrollAreaWidgetContents);
        supplymusicBox->setObjectName(QString::fromUtf8("supplymusicBox"));
        supplymusicBox->setMaximumSize(QSize(810, 16777215));

        verticalLayout_9->addWidget(supplymusicBox);

        scrollArea->setWidget(scrollAreaWidgetContents);

        horizontalLayout_12->addWidget(scrollArea);

        stackedWidget->addWidget(recPage);
        radioPage = new QWidget();
        radioPage->setObjectName(QString::fromUtf8("radioPage"));
        scrollArea_2 = new QScrollArea(radioPage);
        scrollArea_2->setObjectName(QString::fromUtf8("scrollArea_2"));
        scrollArea_2->setGeometry(QRect(270, 170, 120, 80));
        scrollArea_2->setWidgetResizable(true);
        scrollAreaWidgetContents_2 = new QWidget();
        scrollAreaWidgetContents_2->setObjectName(QString::fromUtf8("scrollAreaWidgetContents_2"));
        scrollAreaWidgetContents_2->setGeometry(QRect(0, 0, 118, 78));
        scrollArea_2->setWidget(scrollAreaWidgetContents_2);
        stackedWidget->addWidget(radioPage);
        recentPage = new CommonPage();
        recentPage->setObjectName(QString::fromUtf8("recentPage"));
        stackedWidget->addWidget(recentPage);
        likePage = new CommonPage();
        likePage->setObjectName(QString::fromUtf8("likePage"));
        stackedWidget->addWidget(likePage);
        localPage = new CommonPage();
        localPage->setObjectName(QString::fromUtf8("localPage"));
        stackedWidget->addWidget(localPage);

        verticalLayout_8->addWidget(stackedWidget);

        progressbar = new MusicSlider(BodyRight);
        progressbar->setObjectName(QString::fromUtf8("progressbar"));
        progressbar->setMinimumSize(QSize(0, 20));
        progressbar->setStyleSheet(QString::fromUtf8(""));

        verticalLayout_8->addWidget(progressbar);

        control = new QWidget(BodyRight);
        control->setObjectName(QString::fromUtf8("control"));
        control->setMinimumSize(QSize(0, 60));
        control->setStyleSheet(QString::fromUtf8(""));
        horizontalLayout_9 = new QHBoxLayout(control);
        horizontalLayout_9->setSpacing(0);
        horizontalLayout_9->setObjectName(QString::fromUtf8("horizontalLayout_9"));
        horizontalLayout_9->setContentsMargins(0, 0, 0, 0);
        play1 = new QWidget(control);
        play1->setObjectName(QString::fromUtf8("play1"));
        play1->setStyleSheet(QString::fromUtf8(""));
        gridLayout = new QGridLayout(play1);
        gridLayout->setObjectName(QString::fromUtf8("gridLayout"));
        songimage = new QLabel(play1);
        songimage->setObjectName(QString::fromUtf8("songimage"));

        gridLayout->addWidget(songimage, 0, 0, 2, 1);

        songname = new QLabel(play1);
        songname->setObjectName(QString::fromUtf8("songname"));

        gridLayout->addWidget(songname, 0, 1, 1, 1);

        signer = new QLabel(play1);
        signer->setObjectName(QString::fromUtf8("signer"));

        gridLayout->addWidget(signer, 1, 1, 1, 1);


        horizontalLayout_9->addWidget(play1);

        play2 = new QWidget(control);
        play2->setObjectName(QString::fromUtf8("play2"));
        play2->setStyleSheet(QString::fromUtf8("QPushButton\n"
"{\n"
"	border:none;\n"
"	background-repeat:no-repeat;\n"
"	background-position:center center;\n"
"}\n"
"QPushButton:hover\n"
"{\n"
"	background-color:rgba(255,0,0,0.5);\n"
"}\n"
"/*\n"
"#playMode\n"
"{\n"
"	background-image:url(\":/images/list_play.png\");\n"
"}\n"
"*/\n"
"#playUp\n"
"{\n"
"	background-image:url(\":/images/up.png\");\n"
"}\n"
"#playDown\n"
"{\n"
"	background-image:url(\":/images/down.png\");\n"
"}\n"
"\n"
"/*#play\n"
"{\n"
"	background-image:url(\":/images/play.png\");\n"
"}*/\n"
"#volumn\n"
"{\n"
"	background-image:url(\":/images/volumn.png\");\n"
"}\n"
"#addlocal\n"
"{\n"
"	background-image:url(\":/images/add.png\");\n"
"}\n"
""));
        horizontalLayout_11 = new QHBoxLayout(play2);
        horizontalLayout_11->setObjectName(QString::fromUtf8("horizontalLayout_11"));
        playMode = new QPushButton(play2);
        playMode->setObjectName(QString::fromUtf8("playMode"));
        playMode->setMinimumSize(QSize(0, 25));

        horizontalLayout_11->addWidget(playMode);

        playUp = new QPushButton(play2);
        playUp->setObjectName(QString::fromUtf8("playUp"));
        playUp->setMinimumSize(QSize(0, 25));

        horizontalLayout_11->addWidget(playUp);

        play = new QPushButton(play2);
        play->setObjectName(QString::fromUtf8("play"));
        play->setMinimumSize(QSize(0, 25));

        horizontalLayout_11->addWidget(play);

        playDown = new QPushButton(play2);
        playDown->setObjectName(QString::fromUtf8("playDown"));
        playDown->setMinimumSize(QSize(0, 25));

        horizontalLayout_11->addWidget(playDown);

        volumn = new QPushButton(play2);
        volumn->setObjectName(QString::fromUtf8("volumn"));
        volumn->setMinimumSize(QSize(0, 25));

        horizontalLayout_11->addWidget(volumn);

        addlocal = new QPushButton(play2);
        addlocal->setObjectName(QString::fromUtf8("addlocal"));
        addlocal->setMinimumSize(QSize(0, 25));

        horizontalLayout_11->addWidget(addlocal);


        horizontalLayout_9->addWidget(play2);

        play3 = new QWidget(control);
        play3->setObjectName(QString::fromUtf8("play3"));
        play3->setStyleSheet(QString::fromUtf8("#lrcword\n"
"{\n"
"	border: none; /* \345\216\273\351\231\244\350\276\271\346\241\206 */ \n"
"	background-repeat:no-repeat; \n"
"	background-position:center center; \n"
"}"));
        horizontalLayout_10 = new QHBoxLayout(play3);
        horizontalLayout_10->setObjectName(QString::fromUtf8("horizontalLayout_10"));
        labelNull = new QLabel(play3);
        labelNull->setObjectName(QString::fromUtf8("labelNull"));
        labelNull->setMinimumSize(QSize(100, 0));
        labelNull->setStyleSheet(QString::fromUtf8(""));

        horizontalLayout_10->addWidget(labelNull);

        currentTime = new QLabel(play3);
        currentTime->setObjectName(QString::fromUtf8("currentTime"));
        currentTime->setMinimumSize(QSize(30, 0));
        currentTime->setMaximumSize(QSize(50, 16777215));
        currentTime->setStyleSheet(QString::fromUtf8(""));

        horizontalLayout_10->addWidget(currentTime);

        line = new QLabel(play3);
        line->setObjectName(QString::fromUtf8("line"));
        line->setMinimumSize(QSize(10, 0));
        line->setMaximumSize(QSize(10, 16777215));
        line->setStyleSheet(QString::fromUtf8(""));

        horizontalLayout_10->addWidget(line);

        totalTime = new QLabel(play3);
        totalTime->setObjectName(QString::fromUtf8("totalTime"));
        totalTime->setMinimumSize(QSize(30, 0));
        totalTime->setMaximumSize(QSize(50, 16777215));
        totalTime->setStyleSheet(QString::fromUtf8(""));

        horizontalLayout_10->addWidget(totalTime);

        lrcword = new QPushButton(play3);
        lrcword->setObjectName(QString::fromUtf8("lrcword"));
        lrcword->setMaximumSize(QSize(30, 30));

        horizontalLayout_10->addWidget(lrcword);

        palayList = new QPushButton(play3);
        palayList->setObjectName(QString::fromUtf8("palayList"));
        palayList->setMinimumSize(QSize(25, 25));
        palayList->setMaximumSize(QSize(25, 25));
        palayList->setStyleSheet(QString::fromUtf8("border:none;\n"
"background-image:url(\":/images/order_play.png\");\n"
"background-repeat:norepeat;\n"
"background-position:center center;"));

        horizontalLayout_10->addWidget(palayList);


        horizontalLayout_9->addWidget(play3);


        verticalLayout_8->addWidget(control);


        horizontalLayout_6->addWidget(BodyRight);


        verticalLayout_2->addWidget(Body);


        verticalLayout->addWidget(Background);


        retranslateUi(MusicPlayer);

        stackedWidget->setCurrentIndex(3);


        QMetaObject::connectSlotsByName(MusicPlayer);
    } // setupUi

    void retranslateUi(QWidget *MusicPlayer)
    {
        MusicPlayer->setWindowTitle(QCoreApplication::translate("MusicPlayer", "MusicPlayer", nullptr));
        Logo->setText(QString());
        SearchlineEdit->setText(QString());
        skin->setText(QString());
        max->setText(QString());
        min->setText(QString());
        quit->setText(QString());
        LoclText->setText(QCoreApplication::translate("MusicPlayer", "\346\210\221\347\232\204\351\237\263\344\271\220", nullptr));
        self->setText(QCoreApplication::translate("MusicPlayer", "\350\207\252\345\273\272\346\255\214\345\215\225", nullptr));
        save->setText(QCoreApplication::translate("MusicPlayer", "\346\224\266\350\227\217\346\255\214\345\215\225", nullptr));
        addlist->setText(QCoreApplication::translate("MusicPlayer", "+", nullptr));
        recMainText->setText(QCoreApplication::translate("MusicPlayer", "\346\216\250\350\215\220", nullptr));
        recText->setText(QCoreApplication::translate("MusicPlayer", "\344\273\212\346\227\245\346\216\250\350\215\220", nullptr));
        suppText->setText(QCoreApplication::translate("MusicPlayer", "\344\275\240\347\232\204\346\255\214\346\233\262\350\241\245\347\273\231\347\253\231", nullptr));
        songimage->setText(QCoreApplication::translate("MusicPlayer", "\346\255\214\346\233\262\345\233\276\347\211\207", nullptr));
        songname->setText(QCoreApplication::translate("MusicPlayer", "\346\255\214\345\220\215", nullptr));
        signer->setText(QCoreApplication::translate("MusicPlayer", "\346\255\214\346\211\213", nullptr));
        playMode->setText(QString());
        playUp->setText(QString());
        play->setText(QString());
        playDown->setText(QString());
        volumn->setText(QString());
        addlocal->setText(QString());
        labelNull->setText(QString());
        currentTime->setText(QCoreApplication::translate("MusicPlayer", "1.31", nullptr));
        line->setText(QCoreApplication::translate("MusicPlayer", "/", nullptr));
        totalTime->setText(QCoreApplication::translate("MusicPlayer", "4.32", nullptr));
        lrcword->setText(QCoreApplication::translate("MusicPlayer", "\350\257\215", nullptr));
        palayList->setText(QString());
    } // retranslateUi

};

namespace Ui {
    class MusicPlayer: public Ui_MusicPlayer {};
} // namespace Ui

QT_END_NAMESPACE

#endif // UI_MUSICPLAYER_H
