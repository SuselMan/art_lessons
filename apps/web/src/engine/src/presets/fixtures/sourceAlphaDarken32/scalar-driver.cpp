#include <xmmintrin.h>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <iomanip>
#include <array>
#include <limits>
#include <string>
using quint8=uint8_t;using quint32=uint32_t;using qint32=int32_t;using qreal=double;
#define ALWAYS_INLINE inline
#define Q_UNUSED(v) (void)(v)
#define Q_DECL_CONSTEXPR constexpr
#define Q_REQUIRED_RESULT
#define Q_DECL_UNUSED
struct KoCompositeOp {struct ParameterInfo {float opacity{0};float flow{0};float _lastOpacityData{0};float*lastOpacity{0};void setOpacityAndAverage(float,float);};};
// NATIVE_BODIES
struct SseRoundReceipt{};
void pixel(const quint8*p){std::cout<<'['<<int(p[0])<<','<<int(p[1])<<','<<int(p[2])<<','<<int(p[3])<<']';}
template<class Wrapper>void emit(const char*variant,const quint8*src,quint8*dst,int selection,double opacity,double average,double flow){
 quint8 before[4];memcpy(before,dst,4);float avg=float(average);KoCompositeOp::ParameterInfo params;params.opacity=float(opacity);params.flow=float(flow);params.lastOpacity=&avg;Wrapper p(params);quint8 m=selection<0?0:selection;
 if(selection<0)NativeAlphaDarken<quint8,quint32,Wrapper>::template compositeOnePixelScalar<false,SseRoundReceipt>(src,dst,nullptr,float(opacity),p);
 else NativeAlphaDarken<quint8,quint32,Wrapper>::template compositeOnePixelScalar<true,SseRoundReceipt>(src,dst,&m,float(opacity),p);
 std::cout<<"{\"variant\":\""<<variant<<"\",\"src\":";pixel(src);std::cout<<",\"dst\":";pixel(before);std::cout<<",\"mask\":"<<selection<<",\"opacity\":"<<opacity<<",\"averageOpacity\":"<<average<<",\"flow\":"<<flow<<",\"wrapped\":{\"opacity\":"<<p.opacity<<",\"averageOpacity\":"<<p.averageOpacity<<",\"flow\":"<<p.flow<<"},\"expected\":";pixel(dst);std::cout<<'}';
}
void emitCase(int variant,const quint8*src,quint8*dst,int selection,double opacity,double average,double flow){if(variant)emit<KoAlphaDarkenParamsWrapperHard>("hard",src,dst,selection,opacity,average,flow);else emit<KoAlphaDarkenParamsWrapperCreamy>("creamy",src,dst,selection,opacity,average,flow);}
uint32_t bits(float f){uint32_t u;std::memcpy(&u,&f,4);return u;}
void parameterCases(){std::cout<<"{\"source\":\"unchanged ParameterInfo::setOpacityAndAverage(float,float) + Qt5.15.7 qFuzzyCompare(float,float), qreal narrowed before compare, SSE noFMA\",\"cases\":[";bool first=true;
auto emit=[&](const char*label,double opacity,double average,double flow){KoCompositeOp::ParameterInfo p;p.flow=float(flow);p.setOpacityAndAverage(float(opacity),float(average));if(!first)std::cout<<',';first=false;std::cout<<"{\"label\":\""<<label<<"\",\"raw\":{\"opacity\":"<<opacity<<",\"averageOpacity\":"<<average<<",\"flow\":"<<flow<<"},\"expected\":{\"opacity\":"<<p.opacity<<",\"averageOpacity\":"<<*p.lastOpacity<<",\"flow\":"<<p.flow<<",\"averageAliased\":"<<(p.lastOpacity==&p.opacity?"true":"false")<<"},\"bits\":{\"opacity\":"<<bits(p.opacity)<<",\"averageOpacity\":"<<bits(*p.lastOpacity)<<",\"flow\":"<<bits(p.flow)<<"}}";};
for(float opacity:std::array<float,11>{std::ldexp(9999999.f,-24),0,std::numeric_limits<float>::denorm_min(),std::numeric_limits<float>::min(),.000001f,.01f,.1f,.25f,.5f,.99999f,1}){
 for(double flow:std::array<double,3>{0,.4,1}){emit("equal",opacity,opacity,flow);emit("opacity-zero",0,opacity,flow);emit("average-zero",opacity,0,flow);}
 for(int direction:std::array<int,2>{-1,1}){double target=direction<0?double(opacity)*100000.0/100001.0:double(opacity)*1.00001;float center=float(target);for(int n=-4;n<=4;n++){float average=center;for(int j=0;j<std::abs(n);j++)average=std::nextafter(average,n<0?0.f:std::numeric_limits<float>::infinity());if(average<0||average>1)continue;for(double flow:std::array<double,3>{0,.4,1})emit("f32-neighbor-threshold",opacity,average,flow);}
  if(target>=0&&target<=1){emit("f64-before-narrow-down",std::nextafter(double(opacity),0.),std::nextafter(target,0.),.4);emit("f64-before-narrow-up",std::nextafter(double(opacity),1.),std::nextafter(target,1.),.4);}
 }
}
for(double opacity:std::array<double,7>{0.,-0.,std::numeric_limits<double>::denorm_min(),double(std::numeric_limits<float>::denorm_min())/2,double(std::numeric_limits<float>::denorm_min()),.5,1.})for(double average:std::array<double,7>{0.,-0.,std::numeric_limits<double>::denorm_min(),double(std::numeric_limits<float>::denorm_min())/2,double(std::numeric_limits<float>::denorm_min()),.5,1.})for(double flow:std::array<double,2>{-0.,double(std::numeric_limits<float>::denorm_min())})emit("zero-subnormal-signedzero",opacity,average,flow);
std::cout<<"]}\n";}
int main(int argc,char**argv){_mm_setcsr(0x1f80);std::cout<<std::setprecision(17);
 if(argc>1&&std::string(argv[1])=="--param-info"){parameterCases();return 0;}
 if(argc>1){std::cout<<"{\"source\":\"unchanged KisPainter::blendAverageOpacity qreal=double exponent=float0.1 noFMA\",\"sequences\":[";
 for(int series=0;series<5;++series){if(series)std::cout<<',';double avg=0;std::cout<<"{\"series\":"<<series<<",\"initial\":0,\"steps\":[";int count=series==1?512:32;for(int i=0;i<count;++i){double opacity=series==0?std::array<double,8>{1,.2,.4,0,.9,.1,1,0}[i%8]:series==1?(i==0?1:0):series==2?(double(i)/31):series==3?std::array<double,4>{.4999999850988388,.5000000298023224,.9999999701976776,1e-12}[i%4]:.6;double before=avg;avg=KisPainter::blendAverageOpacity(opacity,avg);if(i)std::cout<<',';std::cout<<"{\"opacity\":"<<opacity<<",\"before\":"<<before<<",\"expected\":"<<avg<<",\"floatExpected\":"<<float(avg)<<'}';}std::cout<<"]}";}std::cout<<"]}\n";return 0;}
 unsigned rng=0x19a5b31c;auto raw=[&](){rng^=rng<<13;rng^=rng>>17;rng^=rng<<5;return rng;};std::cout<<"{\"source\":\"unchanged optimizedAlphaDarken32 scalar+wrappers+Arithmetic float blend; hostSSE nearest-even noFMA, not SIMD/ARM dispatch\",\"mxcsr\":"<<_mm_getcsr()<<",\"cases\":[";
 for(int variant=0;variant<2;++variant)for(int i=0;i<640;++i){alignas(16)quint8 src[4],dst[4];for(int j=0;j<4;++j){src[j]=raw()&255;dst[j]=raw()&255;}double opacity=double(raw())/4294967295.,avg=double(raw())/4294967295.,flow=std::array<double,3>{0,.4,1}[i%3];int mask=i%2?-1:int(raw()&255);
 if(i%17==0)dst[3]=0;if(i%19==0)dst[3]=255;if(i%23==0)src[3]=0;if(i%29==0)src[3]=255;
 if(i<12){src[0]=i%2?255:1;src[1]=127;src[2]=128;src[3]=i<4?255:1;dst[0]=0;dst[1]=128;dst[2]=127;dst[3]=i<6?255:0;opacity=i%3==0?.5:i%3==1?0:1;avg=i%2?.9:.2;mask=i%4==0?-1:i%4==1?255:i%4==2?0:1;}
 if(variant||i)std::cout<<',';emitCase(variant,src,dst,mask,opacity,avg,flow);}
 std::cout<<"],\"overlaps\":[";
 for(int variant=0;variant<2;++variant)for(int series=0;series<27;++series){if(variant||series)std::cout<<',';quint8 dst[4]={17,129,243,quint8(series%3==0?0:series%3==1?128:255)};double average=0,flow=std::array<double,3>{0,.4,1}[(series/3)%3];std::cout<<"{\"variant\":\""<<(variant?"hard":"creamy")<<"\",\"label\":\""<<(series/9==0?"constant":series/9==1?"falling":"rising")<<"-flow-"<<flow<<"-dst-"<<int(dst[3])<<"\",\"steps\":[";
 for(int i=0;i<24;++i){double opacity=series/9==0?.65:series/9==1?1-double(i)/25:double(i)/25;average=KisPainter::blendAverageOpacity(opacity,average);quint8 src[4]={quint8(i%2?223:31),quint8(i%2?47:191),quint8(i%2?109:73),quint8(std::array<int,6>{255,128,1,0,254,64}[i%6])};if(i)std::cout<<',';emitCase(variant,src,dst,i%3==0?-1:i%3==1?255:129,opacity,average,flow);}std::cout<<"]}";}
 std::cout<<"]}\n";}
