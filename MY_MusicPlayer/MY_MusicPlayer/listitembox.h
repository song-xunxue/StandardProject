#ifndef LISTITEMBOX_H
#define LISTITEMBOX_H

#include <QWidget>
#include <QEvent>

namespace Ui {
class ListItemBox;
}

class ListItemBox : public QWidget
{
    Q_OBJECT

public:
    explicit ListItemBox(QWidget *parent = nullptr);
    ~ListItemBox();

    void  setMusicName(const QString& musicName);
    void  setMusicSinger(const QString& musicSinger);
    void  setmusicAlbum(const QString& musicAlbum);
    void  setLikeIcon(bool);

protected:
    //自带hover，但是不符合主题需要重写事件

    void enterEvent(QEvent *event);
    void leaveEvent(QEvent *event);

private:
    Ui::ListItemBox *ui;
};

#endif // LISTITEMBOX_H
