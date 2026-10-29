#include <xmmintrin.h>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <iomanip>
using quint8=uint8_t;using quint32=uint32_t;using qint32=int32_t;
#define ALWAYS_INLINE inline
namespace Arithmetic{}
struct QBitArray{bool at(int)const{return true;}};
// NATIVE_ROUND
// NATIVE_SCALAR
struct SseReceipt{};
void pixel(const quint8*p){std::cout<<'['<<int(p[0])<<','<<int(p[1])<<','<<int(p[2])<<','<<int(p[3])<<']';}
int main(){unsigned rng=0x77a5310c;auto raw=[&](){rng^=rng<<13;rng^=rng>>17;rng^=rng<<5;return rng;};QBitArray flags;using Over=NativeOver<quint8,quint32,false,true>;Over::ParamsWrapper p{flags};std::cout<<std::setprecision(17)<<"{\"source\":\"actual optimizedOver scalar body with host SSE round/rcp; not SIMD packet or Android receipt\",\"cases\":[";
for(int i=0;i<512;++i){alignas(16)quint8 src[4],dst[4],before[4];for(int j=0;j<4;++j){src[j]=raw()&255;dst[j]=raw()&255;}float opacity=float(double(raw())/4294967295.);quint8 mask=raw()&255;bool useMask=i%2;if(i==0){src[0]=128;src[1]=64;src[2]=32;src[3]=1;memset(dst,0,4);opacity=.5f;useMask=false;}if(i==1){src[0]=255;src[1]=0;src[2]=0;src[3]=1;dst[0]=0;dst[1]=0;dst[2]=255;dst[3]=1;opacity=.5f;useMask=false;}if(i==2||i==3){src[0]=128;src[1]=64;src[2]=32;src[3]=i==2?128:1;memset(dst,0,4);opacity=.99f;useMask=i==2;mask=1;}if(i%17==0&&i>3)dst[3]=255;if(i%19==0&&i>3)dst[3]=0;memcpy(before,dst,4);if(useMask)Over::compositeOnePixelScalar<true,SseReceipt>(src,dst,&mask,opacity,p);else Over::compositeOnePixelScalar<false,SseReceipt>(src,dst,nullptr,opacity,p);
if(i)std::cout<<',';std::cout<<"{\"src\":";pixel(src);std::cout<<",\"dst\":";pixel(before);std::cout<<",\"mask\":"<<(useMask?int(mask):-1)<<",\"opacity\":"<<opacity<<",\"expected\":";pixel(dst);std::cout<<'}';}
std::cout<<"]}\n";}
