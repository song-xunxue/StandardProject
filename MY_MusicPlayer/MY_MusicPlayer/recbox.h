#ifndef RECBOX_H
#define RECBOX_H

#include <QWidget>
#include <recboxitem.h>
#include <QJsonArray>
#include <QJsonObject>

namespace Ui {
class RecBox;
}

class RecBox : public QWidget
{
    Q_OBJECT

public:
    explicit RecBox(QWidget *parent = nullptr);
    ~RecBox();
    void InitRecBox(QJsonArray data,int row);//给推荐页面调用的接口
    void  AddRecBoxitem();

private slots:
    void on_BoxUp_clicked();

    void on_BoxDown_clicked();

private:
    Ui::RecBox *ui;
    int _row;
    int _col;
    int count;
    int currentIndex;
    QJsonArray _imageArray;
};

#endif // RECBOX_H
