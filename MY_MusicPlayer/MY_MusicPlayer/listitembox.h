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

signals:
    void  setIsLike(bool);
protected:
    //自带hover，但是不符合主题需要重写事件

    void enterEvent(QEvent *event);
    void leaveEvent(QEvent *event);

private slots:
    void on_likeBtn_clicked();

private:
    Ui::ListItemBox *ui;
    bool  isLike;
};

#endif // LISTITEMBOX_H
