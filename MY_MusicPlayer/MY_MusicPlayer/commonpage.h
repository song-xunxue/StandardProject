#ifndef COMMONPAGE_H
#define COMMONPAGE_H

#include <QWidget>
#include <listitembox.h>

namespace Ui {
class CommonPage;
}

class CommonPage : public QWidget
{
    Q_OBJECT

public:
    explicit CommonPage(QWidget *parent = nullptr);
    ~CommonPage();

    void setCommonPage(const QString& title,const QString& imagePath);

private:
    Ui::CommonPage *ui;
};

#endif // COMMONPAGE_H
