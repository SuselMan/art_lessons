// Authored native-call capture stubs, NOT native pixel/colour/path implementations.
#include <algorithm>
#include <array>
#include <cassert>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iomanip>
#include <iostream>
#include <map>
#include <memory>
#include <string>
#include <vector>
using qreal=double;using quint8=uint8_t;using quint32=uint32_t;using qint16=int16_t;using quint16=uint16_t;using qint32=int32_t;
using QString=std::string;using QVariant=double;template<class K,class V>using QHash=std::map<K,V>;
template<class T>T qMax(T a,T b){return std::max(a,b);}int qRound(double a){return std::floor(a+.5);}double deg2rad(double a){return a*M_PI/180;}double rad2deg(double a){return a*180/M_PI;}double pow2(double a){return a*a;}double linearInterpolation(double a,double b,double t){return a+(b-a)*t;}
#define Q_ASSERT(x) assert(x)
#define KIS_SAFE_ASSERT_RECOVER_RETURN(x) if(!(x))return
#define KIS_SAFE_ASSERT_RECOVER_RETURN_VALUE(x,v) if(!(x))return(v)
namespace kismpl{template<class C,class T>auto mem_less(T C::*member){return[member](const C&a,const C&b){return a.*member<b.*member;};}}
// SOURCE_DISTRIBUTION
struct Draw{std::string kind;double value;};std::vector<Draw> tape;
std::vector<uint32_t> rawTape;
class KisRandomSource{size_t cursor=0;uint32_t raw(){assert(cursor<rawTape.size());return rawTape[cursor++];}public:explicit KisRandomSource(unsigned){}double generateNormalized(){double v=double(raw())/4294967295.0;tape.push_back({"U",v});return v;}int generate(int a,int b){int v=a+raw()%unsigned(b-a+1);tape.push_back({"I",double(v)});return v;}};using KisRandomSourceSP=std::shared_ptr<KisRandomSource>;
struct QPointF{double a=0,b=0;QPointF()=default;QPointF(double x,double y):a(x),b(y){}double x()const{return a;}double y()const{return b;}QPointF operator-(const QPointF&o)const{return{a-o.a,b-o.b};}};
using QPoint=QPointF;
struct QSize{int w=0,h=0;QSize()=default;QSize(int x,int y):w(x),h(y){}int width()const{return w;}int height()const{return h;}};
struct QRect{int x()const{return 0;}int y()const{return 0;}int width()const{return 0;}int height()const{return 0;}};
struct QTransform{double a=0,sx=1,sy=1;void reset(){a=0;sx=sy=1;}void rotateRadians(double v){a+=v;}void rotate(double v){a+=deg2rad(v);}void scale(double x,double y){sx*=x;sy*=y;}void map(double x,double y,double*outX,double*outY)const{*outX=x*sx*std::cos(a)-y*sy*std::sin(a);*outY=x*sx*std::sin(a)+y*sy*std::cos(a);}};
namespace Qt{enum{SmoothTransformation};}
struct QImage{bool isNull()const{return true;}QImage scaled(QSize)const{return{};}QImage transformed(QTransform,int)const{return{};}QRect rect()const{return{};}};
struct KoColorTransformation;
struct KoMixColorsOp{void mixColors(const quint8**,qint16*,int,quint8*){assert(false&&"surface mixing not admitted in fixture");}};
struct KoColorSpace{int pixelSize()const;KoColorTransformation*createColorTransformation(const char*,QHash<QString,QVariant>);KoMixColorsOp*mixColorsOp(){static KoMixColorsOp k;return&k;}};
struct KoColor{double opacity=1;std::array<double,3>hsv{0,0,0};const KoColorSpace*colorSpace()const{static KoColorSpace c;return&c;}quint8*data(){return reinterpret_cast<quint8*>(this);}const quint8*data()const{return reinterpret_cast<const quint8*>(this);}void setOpacity(double a){opacity=a;}};
int KoColorSpace::pixelSize()const{return sizeof(KoColor);}
struct KoColorTransformation{QHash<QString,QVariant>p;void setParameters(QHash<QString,QVariant>x){p=x;}void setParameter(int,double){}void transform(quint8*,quint8*out,int count){assert(count==1);auto*c=reinterpret_cast<KoColor*>(out);c->hsv={p["h"],p["s"],p["v"]};}};
KoColorTransformation*KoColorSpace::createColorTransformation(const char*,QHash<QString,QVariant>){return new KoColorTransformation;}
struct Accessor{std::array<quint8,256>d{};void moveTo(int,int){}quint8*rawData(){return d.data();}};using KisRandomAccessorSP=std::shared_ptr<Accessor>;
struct Device{KisRandomAccessorSP createRandomAccessorNG(){return std::make_shared<Accessor>();}KoColorSpace*colorSpace(){static KoColorSpace c;return&c;}int pixelSize(){return sizeof(KoColor);}void clear(){}void convertFromQImage(QImage,int){}};
struct KisPaintDevice:Device{explicit KisPaintDevice(KoColorSpace*){}};
struct KisPaintDeviceSP{std::shared_ptr<Device>value;KisPaintDeviceSP()=default;KisPaintDeviceSP(std::shared_ptr<Device>p):value(p){}KisPaintDeviceSP(Device*p):value(p){}KisPaintDeviceSP&operator=(Device*p){value.reset(p);return*this;}Device*operator->()const{return value.get();}};
struct KisPaintInformation{QPointF point;double direction;KisRandomSourceSP random;QPointF pos()const{return point;}KisRandomSourceSP randomSource()const{return random;}double drawingAngle()const{return direction;}double pressure()const{return 1;}};
struct KisDabShape{double a,b,c;KisDabShape(double x,double y,double z):a(x),b(y),c(z){}};
struct FixedDab{QRect bounds(){return{};}KoColorSpace*colorSpace(){static KoColorSpace c;return&c;}quint8*data(){return nullptr;}};using KisFixedPaintDeviceSP=std::shared_ptr<FixedDab>;
struct MaskRecord{double scale=1,angle=0,fx=0,fy=0;int frame=-1;KoColor color;};MaskRecord maskRecord;
struct KisBrush{double width=0,height=0;int frames=0,frame=-1;QPointF hotSpot(KisDabShape,const KisPaintInformation&){return{0,0};}void prepareForSeqNo(const KisPaintInformation&i,int seq){assert(seq==0);frame=frames?i.randomSource()->generate(0,frames-1):-1;}int brushApplication(){return 0;}void mask(KisFixedPaintDeviceSP,KoColor c,KisDabShape s,const KisPaintInformation&,double x,double y){maskRecord={s.a,s.c,x,y,frame,c};}KisFixedPaintDeviceSP paintDevice(KoColorSpace*,KisDabShape,const KisPaintInformation&,double,double){assert(false);return{};}};using KisBrushSP=std::shared_ptr<KisBrush>;
constexpr int IMAGESTAMP=1;
struct KisCrossDeviceColorSampler{KisCrossDeviceColorSampler(KisPaintDeviceSP,KoColor&){}void sampleOldColor(double,double,quint8*){assert(false&&"surface sampling not admitted in fixture");}};
struct Particle{double x,y,angle,scale,width,height,ink,painter;std::array<double,3>hsv;int frame;};std::vector<Particle>particles;
struct KisPainter{KoColor color;double opacity=1;enum{FillStyleForegroundColor};KisPainter(KisPaintDeviceSP){}void setFillStyle(int){}void setMaskImageSize(int,int){}void setPaintColor(KoColor c){color=c;}void setOpacityF(double a){opacity=a;}void bitBlt(QPointF,KisPaintDeviceSP,QRect){assert(false);}void bltFixed(QPointF p,KisFixedPaintDeviceSP,QRect){particles.push_back({p.x()+maskRecord.fx,p.y()+maskRecord.fy,-maskRecord.angle,maskRecord.scale,0,0,maskRecord.color.opacity,opacity,maskRecord.color.hsv,maskRecord.frame});}};
struct KisPaintOp{static void splitCoordinate(double p,qint32*i,double*f){*i=std::floor(p);*f=p-*i;}};
struct KisSprayOpOptionData{double diameter=1,scale=1,aspect=1,brushRotation=0,jitterAmount=0,coverage=0;bool jitterMovement=false,useDensity=false;quint32 particleCount=1;};
struct KisSprayOpOption{KisSprayOpOptionData data;};
struct KisColorOptionData{bool useRandomHSV=false,useRandomOpacity=false,sampleInputColor=false,mixBgColor=false,fillBackground=false,colorPerParticle=true;double hue=0,saturation=0,value=0;};
struct KisSprayShapeOptionData{bool enabled=false,proportional=false;int shape=0;double width=1,height=1;QImage image;QSize effectiveSize(double d,double scale){return proportional?QSize(qRound(width*d*scale/100),qRound(height*d*scale/100)):QSize(width,height);}};
struct KisSprayShapeDynamicsOptionData{bool enabled=true,fixedRotation=false,randomRotation=false,followCursor=false,followDrawingAngle=false,randomSize=true;double fixedAngle=0,randomRotationWeight=0,followCursorWeight=0,followDrawingAngleWeight=0;};
class SprayBrush{public:int m_dabSeqNo=0;KisSprayOpOptionData*m_sprayOpOptionData;KisSprayOpOption*m_sprayOpOption;KisColorOptionData*m_colorProperties;KisSprayShapeOptionData*m_shapeProperties;KisSprayShapeDynamicsOptionData*m_shapeDynamicsProperties;KisBrushSP m_brush;KisPainter*m_painter=nullptr;KoColorTransformation*m_transfo=nullptr;QImage m_brushQImage,m_transformed;KisPaintDeviceSP m_imageDevice;KisFixedPaintDeviceSP m_fixedDab=std::make_shared<FixedDab>();int m_dabPixelSize=sizeof(KoColor);KoColor m_inkColor;double m_radius=1;quint32 m_particlesCount=1;
~SprayBrush(){delete m_painter;delete m_transfo;}
double rotationAngle(KisRandomSourceSP);
template<class A,class R>void paintImpl(KisPaintDeviceSP,KisPaintDeviceSP,const KisPaintInformation&,double,double,double,const KoColor&,const KoColor&,const A&,const R&);
void capture(KisPainter*p,double x,double y,double w,double h,double angle){particles.push_back({x,y,angle,0,w,h,p->color.opacity,p->opacity,p->color.hsv,-1});}
void paintCircle(KisPainter*p,double x,double y,double r){capture(p,x,y,r*2,r*2,0);}void paintEllipse(KisPainter*p,double x,double y,double a,double b,double angle){capture(p,x,y,a*2,b*2,angle);}void paintRectangle(KisPainter*,double,double,int,int,double){assert(false);}void paintParticle(KisRandomAccessorSP&,KoColor,double,double){assert(false);}
};
// SOURCE_ROTATION_AND_PAINT
struct Uniform{bool isValid()const{return true;}double operator()(KisRandomSourceSP r)const{return r->generateNormalized();}};
struct Normal{NativeDistribution*table;bool isValid()const{return true;}double operator()(KisRandomSourceSP r)const{return table->generate(r->generateNormalized());}};
int main(){std::cout<<std::setprecision(17);NativeDistribution cdf;double sigma=.5,c1=1/(sigma*std::sqrt(2*M_PI)),c2=2*sigma*sigma;cdf.initialize(1000,0,5*sigma,[&](double x){return c1*std::exp(-x*x/c2);});std::cout<<"{\"cdf\":[";for(size_t i=0;i<cdf.samples.size();++i){if(i)std::cout<<',';auto s=cdf.samples[i];std::cout<<'['<<s.x<<','<<s.cdfAtX<<','<<s.oneOverCdfDy<<']';}std::cout<<"],\"cases\":[";bool first=true;std::string name;unsigned seed;while(std::cin>>name>>seed){KisSprayOpOption op;KisColorOptionData color;KisSprayShapeOptionData shape;KisSprayShapeDynamicsOptionData dynamics;int normal,frames;double px,py,size,lod,angle,direction,foreground;
std::cin>>op.data.diameter>>op.data.aspect>>op.data.scale>>op.data.brushRotation>>op.data.particleCount>>normal>>shape.enabled>>shape.width>>shape.height>>shape.proportional>>dynamics.randomSize>>dynamics.fixedRotation>>dynamics.fixedAngle>>dynamics.randomRotation>>dynamics.randomRotationWeight>>dynamics.followCursor>>dynamics.followCursorWeight>>dynamics.followDrawingAngle>>dynamics.followDrawingAngleWeight>>color.colorPerParticle>>color.useRandomHSV>>color.hue>>color.saturation>>color.value>>color.useRandomOpacity>>frames>>px>>py>>size>>lod>>angle>>direction>>foreground;
size_t rawCount;std::cin>>rawCount;rawTape.resize(rawCount);for(auto&value:rawTape)std::cin>>value;
SprayBrush brush;brush.m_sprayOpOptionData=&op.data;brush.m_sprayOpOption=&op;brush.m_colorProperties=&color;brush.m_shapeProperties=&shape;brush.m_shapeDynamicsProperties=&dynamics;brush.m_brush=std::make_shared<KisBrush>();brush.m_brush->frames=frames;
auto rng=std::make_shared<KisRandomSource>(seed);KisPaintInformation info{{px,py},direction,rng};KoColor foregroundColor;foregroundColor.opacity=foreground;particles.clear();tape.clear();auto device=std::make_shared<Device>();
if(normal)brush.paintImpl(device,device,info,angle,size,lod,foregroundColor,KoColor{},Uniform{},Normal{&cdf});else brush.paintImpl(device,device,info,angle,size,lod,foregroundColor,KoColor{},Uniform{},Uniform{});
if(!first)std::cout<<',';
first=false;std::cout<<"{\"name\":\""<<name<<"\",\"particles\":[";
for(size_t i=0;i<particles.size();i++){if(i)std::cout<<',';auto p=particles[i];std::cout<<"{\"x\":"<<p.x<<",\"y\":"<<p.y<<",\"angle\":"<<p.angle<<",\"scale\":"<<p.scale<<",\"width\":"<<p.width<<",\"height\":"<<p.height<<",\"ink\":"<<p.ink<<",\"painter\":"<<p.painter<<",\"hsv\":["<<p.hsv[0]<<','<<p.hsv[1]<<','<<p.hsv[2]<<"],\"frame\":"<<p.frame<<'}';}
std::cout<<"],\"draws\":[";for(size_t i=0;i<tape.size();i++){if(i)std::cout<<',';std::cout<<"{\"kind\":\""<<tape[i].kind<<"\",\"value\":"<<tape[i].value<<'}';}std::cout<<"]}";}
std::cout<<"]}\n";}
