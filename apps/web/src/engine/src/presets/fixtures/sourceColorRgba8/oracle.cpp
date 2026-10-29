// Authored driver; active color/composite methods come from pinned source.
#include "QtGlobal"
#include <iostream>
#include <iomanip>
#include <array>
#include <vector>
#include "KoColorSpaceMaths.h"
#include "KoColorSpaceMaths.cpp"
#include "KoCompositeOpOver.h"
#include "KoCompositeOpGeneric.h"
#include "KoAlphaDarkenParamsWrapper.h"
#include "KoCompositeOpAlphaDarken.h"
#include "native-parts.h"
struct Trait{using channels_type=quint8;static constexpr int channels_nb=4,alpha_pos=3,pixelSize=4;};
struct Identity{static quint8 toAdditiveSpace(quint8 x){return x;}static quint8 fromAdditiveSpace(quint8 x){return x;}};
using Pixel=std::array<quint8,4>;
KoColorSpace cs;KoCompositeOpOver<Trait>over(&cs);KoCompositeOpGenericSC<Trait,cfAddition<quint8>,Identity>add(&cs,"add","mix");KoCompositeOpAlphaDarken<Trait,KoAlphaDarkenParamsWrapperCreamy>wash(&cs);
Pixel compose(int mode,Pixel src,Pixel dst,int mask,double opacity,double flow,double average){KoCompositeOp::ParameterInfo p;p.srcRowStart=src.data();p.dstRowStart=dst.data();quint8 maskByte=quint8(mask);p.maskRowStart=mask<0?nullptr:&maskByte;p.opacity=opacity;p.flow=flow;float last=average;p.lastOpacity=&last;if(mode==0)over.composite(p);else if(mode==1)add.composite(p);else wash.composite(p);return dst;}
void write(Pixel p){std::cout<<'['<<int(p[0])<<','<<int(p[1])<<','<<int(p[2])<<','<<int(p[3])<<']';}
int main(){std::cout<<std::setprecision(17);unsigned state=0x45911383;auto raw=[&](){state^=state<<13;state^=state>>17;state^=state<<5;return state;};auto byte=[&](){return quint8(raw()&255);};
std::cout<<"{\"hsl\":[";const double amplitudes[4][3]={{15./180,-.1,.35},{0,0,0},{58./180,.32,.19},{38./180,0,0}};
for(int i=0;i<384;++i){if(i)std::cout<<',';Pixel in={byte(),byte(),byte(),byte()},out=in;if(i<4)in={quint8(i==0?0:255),quint8(i==1?255:0),quint8(i==2?255:0),128};NativeHSL t;t.m_adj_h=amplitudes[i%4][0]*double(raw())/4294967295.;t.m_adj_s=amplitudes[i%4][1]*double(raw())/4294967295.;t.m_adj_v=amplitudes[i%4][2]*double(raw())/4294967295.;if(i>=256){t.m_adj_h=double(raw())/4294967295.*2-1;t.m_adj_s=double(raw())/4294967295.*2-1;t.m_adj_v=double(raw())/4294967295.*2-1;}if(i==256){in={129,129,129,0};t.m_adj_h=1;t.m_adj_s=1;t.m_adj_v=-.5;}if(i==257){in={255,0,0,255};t.m_adj_h=-1;t.m_adj_s=0;t.m_adj_v=0;}if(i==258){in={1,0,0,255};t.m_adj_h=0;t.m_adj_s=0;t.m_adj_v=1;}if(i==259){in={255,255,255,255};t.m_adj_h=0;t.m_adj_s=-1;t.m_adj_v=-1;}t.transform(in.data(),out.data(),1);double opacity=double(raw())/4294967295.;Pixel alpha=out;NativeAlpha::setOpacity(alpha.data(),opacity,1);std::cout<<"{\"input\":";write(in);std::cout<<",\"adjust\":["<<t.m_adj_h<<','<<t.m_adj_s<<','<<t.m_adj_v<<"],\"expected\":";write(out);std::cout<<",\"opacity\":"<<opacity<<",\"alpha\":";write(alpha);std::cout<<'}';}
std::cout<<"],\"composite\":[";
for(int i=0;i<384;++i){if(i)std::cout<<',';Pixel src={byte(),byte(),byte(),byte()},dst={byte(),byte(),byte(),byte()};if(i%7==0)dst[3]=0;if(i%11==0)dst[3]=255;if(i%13==0)src[3]=0;if(i%17==0)src[3]=255;int mask=i%2?int(byte()):-1;double opacity=double(raw())/4294967295.,flow=i%3?1:double(raw())/4294967295.,avg=double(raw())/4294967295.;if(i<3)opacity=1;int mode=i%3;std::cout<<"{\"mode\":"<<mode<<",\"src\":";write(src);std::cout<<",\"dst\":";write(dst);std::cout<<",\"mask\":"<<int(mask)<<",\"opacity\":"<<opacity<<",\"flow\":"<<flow<<",\"average\":"<<avg<<",\"expected\":";write(compose(mode,src,dst,mask,opacity,flow,avg));std::cout<<'}';}
std::cout<<"],\"groups\":[";
for(int i=0;i<64;++i){if(i)std::cout<<',';int family=i%4,count[4]={12,2,3,1};bool perParticle=family!=2,randomOpacity=family!=0;Pixel foreground={byte(),byte(),byte(),byte()},dst={byte(),byte(),byte(),byte()},ink=foreground,group={0,0,0,0};double localOpacity=1;int mode=i%3;double outerOpacity=double(raw())/4294967295.,average=double(raw())/4294967295.,flow=i%2?1:.35;
std::cout<<"{\"family\":"<<family<<",\"perParticle\":"<<(perParticle?"true":"false")<<",\"foreground\":";write(foreground);std::cout<<",\"destination\":";write(dst);std::cout<<",\"particles\":[";
for(int j=0;j<count[family];++j){if(j)std::cout<<',';double dh=0,ds=0,dv=0,randomAlpha=-1;if(j==0||perParticle){ink=foreground;NativeHSL t;t.m_adj_h=dh=amplitudes[family][0]*double(raw())/4294967295.;t.m_adj_s=ds=amplitudes[family][1]*double(raw())/4294967295.;t.m_adj_v=dv=amplitudes[family][2]*double(raw())/4294967295.;if(family!=1)t.transform(foreground.data(),ink.data(),1);if(randomOpacity){localOpacity=randomAlpha=double(raw())/4294967295.;NativeAlpha::setOpacity(ink.data(),randomAlpha,1);}}
quint8 mask=byte();group=compose(0,ink,group,mask,localOpacity,1,1);std::cout<<"{\"color\":";write(ink);std::cout<<",\"opacity\":"<<localOpacity<<",\"mask\":"<<int(mask)<<",\"freshColor\":"<<((j==0||perParticle)?"true":"false")<<",\"adjust\":["<<dh<<','<<ds<<','<<dv<<"],\"randomAlpha\":"<<randomAlpha<<'}';}
std::cout<<"],\"outer\":{\"mode\":"<<mode<<",\"opacity\":"<<outerOpacity<<",\"flow\":"<<flow<<",\"average\":"<<average<<"},\"group\":";write(group);std::cout<<",\"expected\":";write(compose(mode,group,dst,255,outerOpacity,flow,average));std::cout<<'}';}
std::cout<<"]}\n";}
