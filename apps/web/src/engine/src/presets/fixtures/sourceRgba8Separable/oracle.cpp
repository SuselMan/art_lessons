// Authored driver; byte arithmetic and SC functors are unchanged pinned sources.
#include "QtGlobal"
#include <array>
#include <iostream>
#include "KoCompositeOpGeneric.h"
#include "native-functions.h"
struct Trait{using channels_type=quint8;static constexpr int channels_nb=4,alpha_pos=3,pixelSize=4;};
struct Identity{static quint8 toAdditiveSpace(quint8 x){return x;}static quint8 fromAdditiveSpace(quint8 x){return x;}};
using M=KoCompositeOpGenericSC<Trait,cfMultiply<quint8>,Identity>;
using L=KoCompositeOpGenericSC<Trait,cfLightenOnly<quint8>,Identity>;
using D=KoCompositeOpGenericSCFunctor<Trait,KoCompositeOpClampPolicy::FunctorWithSDRClampPolicy<CFColorDodge,quint8>,Identity>;
using O=KoCompositeOpGenericSCFunctor<Trait,CFOverlay<quint8>,Identity>;
int main(int argc,char**){static_assert((-1>>8)==-1);KoColorSpace cs;M m(&cs,"multiply","mix");L l(&cs,"lighten","mix");D d(&cs,"dodge","mix");O o(&cs,"overlay","mix");KoCompositeOp* ops[]={&m,&l,&d,&o};
 if(argc>1){for(int op=0;op<4;op++)for(int s=0;s<256;s++)for(int t=0;t<256;t++){quint8 v=op==0?cfMultiply(quint8(s),quint8(t)):op==1?cfLightenOnly(quint8(s),quint8(t)):op==2?KoCompositeOpClampPolicy::FunctorWithSDRClampPolicy<CFColorDodge,quint8>::composeChannel(s,t):CFOverlay<quint8>::composeChannel(s,t);std::cout.put(char(v));}return 0;}
 int op,mask,x;double opacity;while(std::cin>>op){std::array<quint8,4>s,t;for(auto&v:s){std::cin>>x;v=x;}for(auto&v:t){std::cin>>x;v=x;}std::cin>>mask>>opacity;quint8 mb=mask;KoCompositeOp::ParameterInfo p;p.srcRowStart=s.data();p.dstRowStart=t.data();p.maskRowStart=mask<0?nullptr:&mb;p.opacity=opacity;ops[op]->composite(p);for(auto v:t)std::cout.put(char(v));}
}
