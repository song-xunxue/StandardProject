QT       += core gui  multimedia sql

greaterThan(QT_MAJOR_VERSION, 4): QT += widgets

CONFIG += c++11

#CONFIG += debug
#CONFIG -= release
QMAKE_CXXFLAGS_DEBUG += -O0


# 自动区分Debug/Release模式，设置输出目录
CONFIG(debug, debug|release) {
    # Debug模式：输出到debug文件夹
    DESTDIR = debug
    # 启用调试信息
    QMAKE_CXXFLAGS += -g
} else {
    # Release模式：输出到release文件夹
    DESTDIR = release
    # 启用优化
    QMAKE_CXXFLAGS += -O2
}
# The following define makes your compiler emit warnings if you use
# any Qt feature that has been marked deprecated (the exact warnings
# depend on your compiler). Please consult the documentation of the
# deprecated API in order to know how to port your code away from it.
DEFINES += QT_DEPRECATED_WARNINGS

# You can also make your code fail to compile if it uses deprecated APIs.
# In order to do so, uncomment the following line.
# You can also select to disable deprecated APIs only up to a certain version of Qt.
#DEFINES += QT_DISABLE_DEPRECATED_BEFORE=0x060000    # disables all the APIs deprecated before Qt 6.0.0

SOURCES += \
    commonpage.cpp \
    listitembox.cpp \
    localform.cpp \
    lrcpage.cpp \
    main.cpp \
    musicitem.cpp \
    musiclist.cpp \
    musicplayer.cpp \
    musicslider.cpp \
    onlineform.cpp \
    recbox.cpp \
    recboxitem.cpp \
    volumetool.cpp

HEADERS += \
    commonpage.h \
    listitembox.h \
    localform.h \
    lrcpage.h \
    musicitem.h \
    musiclist.h \
    musicplayer.h \
    musicslider.h \
    onlineform.h \
    recbox.h \
    recboxitem.h \
    volumetool.h

FORMS += \
    commonpage.ui \
    listitembox.ui \
    localform.ui \
    lrcpage.ui \
    musicplayer.ui \
    musicslider.ui \
    onlineform.ui \
    recbox.ui \
    recboxitem.ui \
    volumetool.ui

# Default rules for deployment.
qnx: target.path = /tmp/$${TARGET}/bin
else: unix:!android: target.path = /opt/$${TARGET}/bin
!isEmpty(target.path): INSTALLS += target

RESOURCES += \
    Resources.qrc
