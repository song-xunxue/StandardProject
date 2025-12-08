#include "volumetool.h"
#include "ui_volumetool.h"
#include <QGraphicsDropShadowEffect>
#include <QPainter>

VolumeTool::VolumeTool(QWidget *parent) :
    QWidget(parent),
    ui(new Ui::VolumeTool)
{
    ui->setupUi(this);
    //Popup设置弹出界面  禁用边框 禁用下落格式
    setWindowFlags(Qt::Popup  |  Qt::FramelessWindowHint | Qt::NoDropShadowWindowHint);
    setAttribute(Qt::WA_TranslucentBackground);

    QGraphicsDropShadowEffect* shadoweffect=new QGraphicsDropShadowEffect(this);
    shadoweffect->setOffset(0,0);
    shadoweffect->setColor("#646464");
    shadoweffect->setBlurRadius(10);
    setGraphicsEffect(shadoweffect);

    ui->silenceBtn->setIcon(QIcon(":/images/volumn.png"));
    //设置默认音量为20%
    ui->outSlider->setGeometry(ui->outSlider->x(), 25+144, ui->outSlider->width(), 36);
    ui->sliderBtn->move(ui->sliderBtn->x(), ui->outSlider->y() - ui->sliderBtn->height()/2);
    ui->volumeRatio->setText("20%");


}

VolumeTool::~VolumeTool()
{
    delete ui;
}

void VolumeTool::paintEvent(QPaintEvent *event)
{
    (void)event;

    //创建绘图对象  QPainter是栈对象优先的轻量级类
    QPainter painter(this);//这里不用new 会导致绘制上下文冲突
    painter.setRenderHint(QPainter::Antialiasing, true);//设置抗锯齿

    //设置画笔和画刷颜色
    painter.setPen(Qt::NoPen);
    painter.setBrush(Qt::white);

    //设置一个三角形
    QPolygon polygon;
    polygon.append(QPoint(30,310));
    polygon.append(QPoint(70,310));
    polygon.append(QPoint(50,330));

    painter.drawPolygon(polygon);

}
