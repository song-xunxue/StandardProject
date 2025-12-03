#ifndef ONLINEFORM_H
#define ONLINEFORM_H

#include <QWidget>

namespace Ui {
class OnlineForm;
}

class OnlineForm : public QWidget
{
    Q_OBJECT

public:
    explicit OnlineForm(QWidget *parent = nullptr);
    ~OnlineForm();
    void  setInfo(const QString& Icon,const QString& Text,size_t ID);
     void mousePressEvent(QMouseEvent *event);
     void  clearBackground();//清除背景颜色
     size_t  getID();

signals:
    void OFchecked(size_t pageID);

private:
    Ui::OnlineForm *ui;
    size_t pageID;
};

#endif // ONLINEFORM_H
