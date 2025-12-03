#ifndef LOCALFORM_H
#define LOCALFORM_H

#include <QWidget>
#include <QMouseEvent>
#include <QPropertyAnimation>
namespace Ui {
class LocalForm;
}

class LocalForm : public QWidget
{
    Q_OBJECT

public:
    explicit LocalForm(QWidget *parent = nullptr);
    ~LocalForm();
    void setInfo(const QString& Icon,const QString& Text,const size_t ID);
    void mousePressEvent(QMouseEvent *event);
    void  clearBackground();//清除背景颜色和动画
    size_t  getID();
    void  InitAnimation();//动画初始化

signals:
    void  LFchecked(size_t pageId);

private:
    Ui::LocalForm *ui;
    size_t pageId;
    QPropertyAnimation* line1Animation;
    QPropertyAnimation* line2Animation;
    QPropertyAnimation* line3Animation;
    QPropertyAnimation* line4Animation;
};

#endif // LOCALFORM_H
