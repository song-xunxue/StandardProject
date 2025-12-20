#include "lrcpage.h"
#include "ui_lrcpage.h"
#include <QDebug>

LrcPage::LrcPage(QWidget *parent) :
    QWidget(parent),
    ui(new Ui::LrcPage)
{
    ui->setupUi(this);
    setWindowFlag(Qt::FramelessWindowHint);
//    qDebug()<<geometry();
    lrcAnimation = new QPropertyAnimation(this,"geometry",this);
    lrcAnimation->setDuration(250);
    lrcAnimation->setStartValue(QRect(5,5,width(),height()));
    lrcAnimation->setEndValue(QRect(5,height(),width(),height()));

    connect(ui->hideBtn,&QPushButton::clicked,this,[=](){
        lrcAnimation->start();
    });
    // 动画结束时，将窗⼝隐藏
    connect(lrcAnimation,&QPropertyAnimation::finished,this,[=](){
        hide();
    });

}

LrcPage::~LrcPage()
{
    delete ui;
}

bool LrcPage::LrcProcess(const QString &lrcpath)
{
    LrcLines.clear();
    QFile lrcfile(lrcpath);
    if(!lrcfile.open(QFile::ReadOnly))
    {

        qDebug()<<"Open file failed:"<<lrcpath;
        return false;
    }
    QTextStream file(&lrcfile);
    file.setCodec("GBK"); // LRC文件常用编码，也可以试"GB2312"
    int count=5;
    while(!file.atEnd())
    {
//        "[03:13.11]'Til we fall again 'til we fall\n"
        QString line=file.readLine(1024);
        if(count)
        {
//            跳过前五次处理
            count--;
            continue;
        }
//        qDebug()<<line;
        //解析时间
        int left=line.indexOf("[");
        int right=line.indexOf("]");
        QString lineTimeStr=line.mid(left,right-left+1);
        qint64 linetime=0;
        int start=1,end=lineTimeStr.indexOf(":");
        //分钟  转为毫秒 便于和posotion比对
        linetime+=lineTimeStr.mid(start,end-start).toInt()*60*1000;

        //秒
        start=end+1;
        end=lineTimeStr.indexOf(".");
        linetime+=lineTimeStr.mid(start,end-start).toInt()*1000;

        //毫秒
        start=end+1;
        end=lineTimeStr.indexOf(".");
        linetime+=lineTimeStr.mid(start,end-start).toInt();

        //解析歌词
        QString lineword = line.mid(right+1).trimmed();

        this->LrcLines.push_back(LrcWordLine(linetime,lineword));

    }

//    for(auto& e:LrcLines)
//    {
//        qDebug()<<e.lrctime<<":"<<e.lrcwords;
//    }
    lrcfile.close();
    return true;
}

void LrcPage::setMusicName(const QString &str)
{
    ui->musicName->setText(str);
}

void LrcPage::setMusicSinger(const QString &str)
{
    ui->musicSinger->setText(str);
}

void LrcPage::setWordLine(qint64 position)
{
    //首先通过时间获取中间行的index
    int index=GetWordLineIndex(position);
    if(index!=-1)
    {
        ui->label->setText(GetWordLine(index-3));
        ui->label_2->setText(GetWordLine(index-2));
        ui->label_3->setText(GetWordLine(index-1));
        ui->labelcenter->setText(GetWordLine(index));
        ui->label_4->setText(GetWordLine(index+1));
        ui->label_5->setText(GetWordLine(index+2));
        ui->label_6->setText(GetWordLine(index+3));
    }
}



int LrcPage::GetWordLineIndex(qint64 pos)
{
    if(pos<= 0 || LrcLines.isEmpty())  return -1;
    if(LrcLines[0].lrctime > pos)   return 0;//第一句歌词之前
    for(int i=1;i<LrcLines.size();i++)
    {
        if(LrcLines[i-1].lrctime<pos &&
             LrcLines[i].lrctime>=pos)
            return i-1;
    }
    return LrcLines.size()-1;
}

QString LrcPage::GetWordLine(int index)
{
    if(index<0 || index>=LrcLines.size())   return "";
    return LrcLines[index].lrcwords;
}


