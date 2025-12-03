#ifndef RECBOX_H
#define RECBOX_H

#include <QWidget>

namespace Ui {
class RecBox;
}

class RecBox : public QWidget
{
    Q_OBJECT

public:
    explicit RecBox(QWidget *parent = nullptr);
    ~RecBox();

private:
    Ui::RecBox *ui;
};

#endif // RECBOX_H
