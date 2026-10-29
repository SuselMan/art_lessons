// Authored whole-buffer driver. Scalar native composite headers and alpha-mask
// bodies are unmodified; no native paint device, colour conversion or SIMD claim.
#include "QtGlobal"
#include <array>
#include <vector>
#include <string>
#include <iostream>
#include <iomanip>
#include "KoColorSpaceMaths.h"
#include "KoColorSpaceMaths.cpp"
#include "KoCompositeOpOver.h"
#include "KoCompositeOpGeneric.h"
#include "KoAlphaDarkenParamsWrapper.h"
#include "KoCompositeOpAlphaDarken.h"
#include "native-parts.h"
#include "native-mask.h"
struct Trait{using channels_type=quint8;static constexpr int channels_nb=4,alpha_pos=3,pixelSize=4;};
struct Identity{static quint8 toAdditiveSpace(quint8 x){return x;}static quint8 fromAdditiveSpace(quint8 x){return x;}};
KoColorSpace cs;KoCompositeOpOver<Trait>over(&cs);KoCompositeOpGenericSC<Trait,cfAddition<quint8>,Identity>add(&cs,"add","mix");KoCompositeOpAlphaDarken<Trait,KoAlphaDarkenParamsWrapperCreamy>wash(&cs);
struct Rect{int x,y,w,h;};
using Buffer=std::vector<quint8>;
void hex(const Buffer&b){std::cout<<'"'<<std::hex<<std::setfill('0');for(auto v:b)std::cout<<std::setw(2)<<int(v);std::cout<<std::dec<<'"';}
void rect(Rect r){std::cout<<'['<<r.x<<','<<r.y<<','<<r.w<<','<<r.h<<']';}
void compose(int mode,const Buffer&src,Rect sr,Buffer&dst,Rect dr,double opacity,double flow,double avg){int x=std::max(sr.x,dr.x),y=std::max(sr.y,dr.y),right=std::min(sr.x+sr.w,dr.x+dr.w),bottom=std::min(sr.y+sr.h,dr.y+dr.h);if(x>=right||y>=bottom)return;float last=avg;KoCompositeOp::ParameterInfo p;p.srcRowStart=src.data()+4*((y-sr.y)*sr.w+x-sr.x);p.dstRowStart=dst.data()+4*((y-dr.y)*dr.w+x-dr.x);p.srcRowStride=sr.w*4;p.dstRowStride=dr.w*4;p.rows=bottom-y;p.cols=right-x;p.opacity=opacity;p.flow=flow;p.lastOpacity=&last;if(mode==0)over.composite(p);else if(mode==1)add.composite(p);else wash.composite(p);}
struct Particle{Rect r;Buffer before,masked;double opacity;};
int main(){std::cout<<std::setprecision(17)<<"{\"maskTableHex\":\""<<std::hex<<std::setfill('0');for(int a=0;a<256;++a)for(int m=0;m<256;++m){quint8 p[4]={128,64,32,quint8(a)},mask=m;NativeMask::applyAlphaU8Mask(p,&mask,1);std::cout<<std::setw(2)<<int(p[3]);}std::cout<<std::dec<<"\",\"cases\":[";bool first=true;std::string name;
while(std::cin>>name){Rect dest;std::cin>>dest.x>>dest.y>>dest.w>>dest.h;assert(dest.w>=0&&dest.h>=0&&dest.w<=32&&dest.h<=32);Buffer output(dest.w*dest.h*4);for(auto&v:output){int n;std::cin>>n;v=n;}int count;std::cin>>count;assert(count>=0&&count<=8);std::vector<Particle>particles;Rect group{0,0,0,0};bool hasGroup=false;
for(int j=0;j<count;++j){Particle p;std::cin>>p.r.x>>p.r.y>>p.r.w>>p.r.h>>p.opacity;assert(p.r.w>=0&&p.r.h>=0&&p.r.w<=16&&p.r.h<=16);p.before.resize(p.r.w*p.r.h*4);for(auto&v:p.before){int n;std::cin>>n;v=n;}int override;std::cin>>override;if(override>=0)NativeMask::setOpacity(p.before.data(),quint8(override),p.r.w*p.r.h);p.masked=p.before;Buffer mask(p.r.w*p.r.h);for(auto&v:mask){int n;std::cin>>n;v=n;}NativeMask::applyAlphaU8Mask(p.masked.data(),mask.data(),p.r.w*p.r.h);Buffer one=p.before;for(int k=0;k<p.r.w*p.r.h;++k)NativeMask::applyAlphaU8Mask(one.data()+4*k,mask.data()+k,1);assert(one==p.masked);if(p.r.w&&p.r.h){if(!hasGroup){group=p.r;hasGroup=true;}else{int x=std::min(group.x,p.r.x),y=std::min(group.y,p.r.y);group={x,y,std::max(group.x+group.w,p.r.x+p.r.w)-x,std::max(group.y+group.h,p.r.y+p.r.h)-y};}}particles.push_back(p);}
int explicitBounds;std::cin>>explicitBounds;if(explicitBounds){Rect requested;std::cin>>requested.x>>requested.y>>requested.w>>requested.h;assert(!hasGroup||(requested.x<=group.x&&requested.y<=group.y&&requested.x+requested.w>=group.x+group.w&&requested.y+requested.h>=group.y+group.h));group=requested;}assert(group.w>=0&&group.h>=0&&group.w<=64&&group.h<=64);Buffer groupData(group.w*group.h*4);int mode;double opacity,flow,avg;std::cin>>mode>>opacity>>flow>>avg;if(!first)std::cout<<',';first=false;std::cout<<"{\"name\":\""<<name<<"\",\"groupBounds\":";rect(group);std::cout<<",\"trace\":[";
for(size_t j=0;j<particles.size();++j){auto&p=particles[j];compose(0,p.masked,p.r,groupData,group,p.opacity,1,1);if(j)std::cout<<',';std::cout<<"{\"beforeMaskHex\":";hex(p.before);std::cout<<",\"maskedHex\":";hex(p.masked);std::cout<<",\"groupHex\":";hex(groupData);std::cout<<'}';}
compose(mode,groupData,group,output,dest,opacity,flow,avg);std::cout<<"],\"groupHex\":";hex(groupData);std::cout<<",\"outputHex\":";hex(output);std::cout<<'}';}
std::cout<<"]}\n";}
