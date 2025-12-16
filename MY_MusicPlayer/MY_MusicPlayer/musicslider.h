#ifndef MUSICSLIDER_H
#define MUSICSLIDER_H

#include <QWidget>
#include <QMouseEvent>

namespace Ui {
class MusicSlider;
}

class MusicSlider : public QWidget
{
    Q_OBJECT

public:
    explicit MusicSlider(QWidget *parent = nullptr);
    ~MusicSlider();

    //实现该进度条的功能 本质和音量调节一样 需要拦截事件 发送信号
    //此处为突出差异 采用事件重写而不是拦截器
    void mousePressEvent(QMouseEvent *event);
    void mouseMoveEvent(QMouseEvent *event);
    void mouseReleaseEvent(QMouseEvent *event);
    void setMusicSlider();
    void setMusicSliderByRatio(float Ratio);
signals:
    void setMusicSliderPosition(float Ratio);

private:
    Ui::MusicSlider *ui;
    int currentpos;//[(0,8),800,4]
    int maxWidth;

};

#endif // MUSICSLIDER_H
