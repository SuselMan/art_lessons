// Authored driver. Active HSY and alpha arithmetic is unchanged pinned source.
#include "QtGlobal"
#include <array>
#include <iostream>
#include <cstring>
#include "KoColorSpaceMaths.h"
#include "KoColorSpaceMaths.cpp"
#include "KoCompositeOpGeneric.h"
#include "native-color.h"
struct Trait{using channels_type=quint8;static constexpr int channels_nb=4,alpha_pos=3,pixelSize=4,red_pos=0,green_pos=1,blue_pos=2;};
int main(){KoColorSpace cs;KoCompositeOpGenericHSLFunctor<Trait,CFColor<HSYType,quint8>>op(&cs,"color","hsy");int mask,x;double opacity;
 while(std::cin>>x){std::array<quint8,4>s,t;s[0]=x;for(int i=1;i<4;i++){std::cin>>x;s[i]=x;}for(auto&v:t){std::cin>>x;v=x;}std::cin>>mask>>opacity;
 float r=Arithmetic::scale<float>(s[0]),g=Arithmetic::scale<float>(s[1]),b=Arithmetic::scale<float>(s[2]),dr=Arithmetic::scale<float>(t[0]),dg=Arithmetic::scale<float>(t[1]),db=Arithmetic::scale<float>(t[2]);CFColor<HSYType,quint8>::composeChannels(r,g,b,dr,dg,db);
 quint8 mb=mask;KoCompositeOp::ParameterInfo p;p.srcRowStart=s.data();p.dstRowStart=t.data();p.maskRowStart=mask<0?nullptr:&mb;p.opacity=opacity;op.composite(p);for(auto v:t)std::cout.put(char(v));for(float v:{dr,dg,db}){uint32_t bits;std::memcpy(&bits,&v,4);for(int i=0;i<4;i++)std::cout.put(char(bits>>(i*8)));}}
}
