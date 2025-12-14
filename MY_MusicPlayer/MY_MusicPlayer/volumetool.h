#ifndef VOLUMETOOL_H
#define VOLUMETOOL_H

#include <QWidget>
#include <QEvent>
#include <QMouseEvent>

namespace Ui {
class VolumeTool;
}

class VolumeTool : public QWidget
{
    Q_OBJECT

public:
    explicit VolumeTool(QWidget *parent = nullptr);
    ~VolumeTool();

signals:
    void MutedChange(bool);
    void MusicVolumeChange(int);
protected:
    void paintEvent(QPaintEvent *event);
    bool eventFilter(QObject* object, QEvent* event);
    void setVolumn();

private slots:
    void on_silenceBtn_clicked();

private:
    Ui::VolumeTool *ui;
    bool isMuted;
    int volumeRatio;
};

#endif // VOLUMETOOL_H
