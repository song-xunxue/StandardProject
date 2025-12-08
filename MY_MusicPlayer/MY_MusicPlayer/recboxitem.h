#ifndef RECBOXITEM_H
#define RECBOXITEM_H

#include <QWidget>

namespace Ui {
class RecBoxItem;
}

class RecBoxItem : public QWidget
{
    Q_OBJECT

public:
    explicit RecBoxItem(QWidget *parent = nullptr);
    ~RecBoxItem();
    void setRecBoxItemImage(const QString& path);//给RecBox创建item
    void setRecBoxItemText(const QString& text);

private:
    Ui::RecBoxItem *ui;
};

#endif // RECBOXITEM_H
