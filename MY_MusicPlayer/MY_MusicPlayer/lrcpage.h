#ifndef LRCPAGE_H
#define LRCPAGE_H

#include <QWidget>
#include <QPropertyAnimation>
#include <QVector>
#include <QFile>


struct LrcWordLine
{
    LrcWordLine(const qint64& time,const QString& words)
    {
        lrctime=time;
        lrcwords=words;
    }

    qint64 lrctime;
    QString lrcwords;
};

namespace Ui {
class LrcPage;
}

class LrcPage : public QWidget
{
    Q_OBJECT

public:
    explicit LrcPage(QWidget *parent = nullptr);
    ~LrcPage();
    bool LrcProcess(const QString& lrcpath);
    void setMusicName(const QString& str);
    void setMusicSinger(const QString& str);
    void setWordLine(qint64 position);
protected:
    int GetWordLineIndex(qint64 position);
    QString GetWordLine(int index);
private:
    Ui::LrcPage *ui;
    QPropertyAnimation* lrcAnimation;
    QVector<LrcWordLine> LrcLines;
};

#endif // LRCPAGE_H
