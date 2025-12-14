#include "volumetool.h"
#include "ui_volumetool.h"

#include <QGraphicsDropShadowEffect>
#include <QPainter>

//#include <QDebug>

VolumeTool::VolumeTool(QWidget *parent) :
    QWidget(parent),
    ui(new Ui::VolumeTool),
    isMuted(false),
    volumeRatio(20)
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
    ui->volumeRatioLabel->setText("20%");

    //安装事件过滤器
    ui->sliderBox->installEventFilter(this);
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

bool VolumeTool::eventFilter(QObject *object, QEvent *event)
{
    if(object == ui->sliderBox)
    {
        if(event->type() == QEvent::MouseButtonPress)
        {
            setVolumn();
        }
        else if(event->type() == QEvent::MouseMove)
        {
            // 如果是⿏标滚动事件，修改sliderBtn和outLine的位置，并计算 volumeRation
            setVolumn();
            // 并发射setMusicVolume信号
            emit MusicVolumeChange(volumeRatio);
        }
        else if(event->type() == QEvent::MouseButtonRelease)
        {

            // 如果是⿏标释放事件，直接发射setMusicVolume信号
            emit MusicVolumeChange(volumeRatio);
        }
    }
    return true;
}

void VolumeTool::setVolumn()
{
    //获取鼠标坐标 只需要高度即可
    int height=ui->sliderBox->mapFromGlobal(QCursor().pos()).y();
    height=height < 25 ? 25 : height;
    height=height > 205 ? 205 : height;
//    qDebug()<<"调节："<<height;

    //移动Outline
    ui->outSlider->setGeometry(ui->outSlider->x(),height , 4 ,205-height);

    //移动SliderBtn
    ui->sliderBtn->move(ui->sliderBtn->x(), height - ui->sliderBtn->height()/2);

    //计算音量并显示
    volumeRatio = (int)((int)ui->outSlider->height()/(float)180*100);
    ui->volumeRatioLabel->setText(QString::number(volumeRatio)+"%");
    emit MusicVolumeChange(volumeRatio);
}


void VolumeTool::on_silenceBtn_clicked()
{
    isMuted=!isMuted;
    if(isMuted)
    {
        ui->silenceBtn->setIcon(QIcon(":/images/silent.png"));
        //简化
//        ui->outSlider->setGeometry(ui->outSlider->x(),205,4,0);
//        ui->sliderBtn->move(ui->sliderBtn->x(), 205);
//        ui->volumeRatio->setText("0%");
    }
    else
    {
        ui->silenceBtn->setIcon(QIcon(":/images/volumn.png"));
    }
    emit MutedChange(isMuted);
}
