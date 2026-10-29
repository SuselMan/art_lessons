// Independent host Qt CPU coverage oracle. The executed rasterizer is the
// installed QtGui library, not a reimplementation of its coverage algorithm.
// Call-boundary provenance: Krita bd6e8d061d2f0388c5b10278786cf0fe62e3135f
// SprayBrush::paintEllipse; KisPainter::Private::fillPainterPathImpl.
#include <QtCore/QJsonArray>
#include <QtCore/QJsonDocument>
#include <QtCore/QJsonObject>
#include <QtCore/QFile>
#include <QtGui/QImage>
#include <QtGui/QPainter>
#include <QtGui/QPainterPath>
#include <QtGui/QPaintEngine>
#include <cmath>
#include <iostream>
#include <vector>
struct Case {double x,y,angle,scale,lod;bool aa,sourceClamp;int maskW,maskH;double shapeW=25,shapeH=22;};
int main(int argc,char **argv){
 if(argc!=2)return 2;
 QJsonArray cases;
 const double pi=std::acos(-1.0);
 std::vector<Case> inputs;
 for(auto center:std::vector<QPointF>{{0,0},{.25,.25},{-.25,-.25},{-13.75,8.5},{10.5,-11.25}})
  for(double angle:std::vector<double>{0,.3,pi/2})inputs.push_back({center.x(),center.y(),angle,1,1,true,true,25,22});
 for(double scale:std::vector<double>{.5,.125,1./128,1./1024,0})
  for(auto center:std::vector<QPointF>{{.25,.25},{-.25,-.25}})inputs.push_back({center.x(),center.y(),.3,scale,1,true,true,25,22});
 for(double angle:std::vector<double>{0,.3,pi/2})inputs.push_back({-.25,.25,angle,1,1,false,true,25,22});
 // Controls isolate chunking and the source minimum-size policy.
 inputs.push_back({.25,.25,.3,1,1,true,true,255,255});
 inputs.push_back({255.25,-254.75,.3,1,1,true,true,25,22});
 inputs.push_back({.25,.25,.3,1./128,1,true,false,25,22});
 inputs.push_back({.25,.25,.3,0,1,true,false,25,22});
 inputs.push_back({-.25,-.25,.3,0,.25,true,true,25,22});
 // Non-stock geometry probes use the same actual Qt painter call boundary.
 for(auto size:std::vector<QPointF>{{7.25,41.5},{43.75,3.125},{.375,1.75},{61,62}})
  for(double angle:std::vector<double>{-.71,.123456789,2.1})
   inputs.push_back({-7.375,9.8125,angle,1,1,true,false,17,13,size.x(),size.y()});
 int ordinal=0;
 for(const Case& c:inputs){
  const double width=c.sourceClamp?std::max(c.lod,c.shapeW*c.scale*c.lod):c.shapeW*c.scale*c.lod;
  const double height=c.sourceClamp?std::max(c.lod,c.shapeH*c.scale*c.lod):c.shapeH*c.scale*c.lod;
  QPainterPath path;path.addEllipse(QPointF(),width*.5,height*.5);
  QTransform transform;transform.translate(c.x,c.y);transform.rotateRadians(c.angle);path=transform.map(path);
  QRect bounds=path.boundingRect().toAlignedRect();bounds.adjust(-1,-1,1,1);
  if(bounds.width()<1||bounds.height()<1)return 3;
  QImage mask(c.maskW,c.maskH,QImage::Format_ARGB32_Premultiplied);
  const int engineType=mask.paintEngine()->type();if(engineType!=QPaintEngine::Raster)return 4;
  QPainter painter(&mask);painter.setRenderHint(QPainter::Antialiasing,c.aa);
  QByteArray coverage(bounds.width()*bounds.height(),0);int chunks=0;
  for(int x=bounds.x();x<bounds.x()+bounds.width();x+=c.maskW){
   for(int y=bounds.y();y<bounds.y()+bounds.height();y+=c.maskH){
    chunks++;mask.fill(QColor(Qt::black).rgb());painter.translate(-x,-y);painter.fillPath(path,QBrush(Qt::white));painter.translate(x,y);
    const int w=std::min(bounds.right()+1-x,c.maskW),h=std::min(bounds.bottom()+1-y,c.maskH);
    for(int row=0;row<h;row++)for(int col=0;col<w;col++)coverage[(y+row-bounds.y())*bounds.width()+x+col-bounds.x()]=char(qRed(reinterpret_cast<const QRgb*>(mask.constScanLine(row))[col]));
   }
  }
  painter.end();int sum=0,nonzero=0,partial=0,peak=0;
  for(unsigned char value:coverage){sum+=value;nonzero+=value!=0;partial+=value!=0&&value!=255;peak=std::max(peak,int(value));}
  QJsonArray elements;for(int i=0;i<path.elementCount();i++){auto e=path.elementAt(i);elements.append(QJsonArray{e.x,e.y,int(e.type)});}
  QJsonObject result{{"ordinal",ordinal},{"center",QJsonArray{c.x,c.y}},{"angle",c.angle},{"scale",c.scale},{"lod",c.lod},{"antialias",c.aa},{"sourceMinimumClamp",c.sourceClamp},{"effectiveSize",QJsonArray{c.shapeW,c.shapeH}},{"particleSize",QJsonArray{width,height}},{"maskSize",QJsonArray{c.maskW,c.maskH}},{"bounds",QJsonArray{bounds.x(),bounds.y(),bounds.width(),bounds.height()}},{"chunks",chunks},{"engineType",engineType},{"coverageHex",QString::fromLatin1(coverage.toHex())},{"sum",sum},{"nonzero",nonzero},{"partial",partial},{"peak",peak},{"pathElements",elements}};
  if(ordinal==0||ordinal==1||ordinal==2||ordinal==15||ordinal==19){
   QImage png(bounds.size(),QImage::Format_ARGB32);for(int y=0;y<bounds.height();y++)for(int x=0;x<bounds.width();x++){int v=static_cast<unsigned char>(coverage[y*bounds.width()+x]);png.setPixel(x,y,qRgb(v,v,v));}
   const QString filename=QString::fromLocal8Bit(argv[1])+QString("/native-%1.png").arg(ordinal);if(!png.save(filename,"PNG"))return 5;
  }
  cases.append(result);ordinal++;
 }
 QJsonDocument doc(QJsonObject{{"runtimeQt",qVersion()},{"headersQt",QT_VERSION_STR},{"platform","host x86_64 Qt CPU QImage raster; not Android/Krita runtime"},{"cases",cases}});
 std::cout<<doc.toJson(QJsonDocument::Compact).constData()<<"\n";
}
