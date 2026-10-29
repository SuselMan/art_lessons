#include <xmmintrin.h>
#include <emmintrin.h>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <iostream>
#include <iomanip>
#include <limits>
using quint8=uint8_t;using quint32=uint32_t;using qint32=int32_t;
#define ALWAYS_INLINE inline
#define Q_UNUSED(x) (void)x
#define BLOCKDEBUG 0
// ARITHMETIC
struct QBitArray{bool at(int)const{return true;}};
struct V{__m128 v;static constexpr int size=4;using batch_bool_type=V;V(){} V(float a):v(_mm_set1_ps(a)){} V(__m128 a):v(a){} V&operator*=(V b){v=_mm_mul_ps(v,b.v);return *this;}};
V operator+(V a,V b){return _mm_add_ps(a.v,b.v);} V operator-(V a,V b){return _mm_sub_ps(a.v,b.v);}V operator*(V a,V b){return _mm_mul_ps(a.v,b.v);}V operator==(V a,V b){return _mm_cmpeq_ps(a.v,b.v);}
struct U{using value_type=uint32_t;__m128i v;U(uint32_t a):v(_mm_set1_epi32(a)){}};
float armEstimate(float);float armDivide(float,float);
V operator/(V a,V b){alignas(16)float aa[4],bb[4];_mm_store_ps(aa,a.v);_mm_store_ps(bb,b.v);for(int i=0;i<4;i++)aa[i]=armDivide(aa[i],bb[i]);return _mm_load_ps(aa);}
V operator>(V a,V b){return _mm_cmpgt_ps(a.v,b.v);}
namespace xsimd{bool all(V a){return _mm_movemask_ps(a.v)==15;}bool none(V a){return _mm_movemask_ps(a.v)==0;}V select(V mask,V yes,V no){return _mm_or_ps(_mm_and_ps(mask.v,yes.v),_mm_andnot_ps(mask.v,no.v));} V reciprocal(V a){alignas(16)float data[4];_mm_store_ps(data,a.v);for(float&v:data)v=armEstimate(v);return _mm_load_ps(data);}template<class T>T*vector_aligned_malloc(size_t n){return (T*)_mm_malloc(n*sizeof(T),16);}void vector_aligned_free(const void*p){_mm_free((void*)p);}}
struct KoCompositeOp{struct ParameterInfo{quint8*dstRowStart;const quint8*srcRowStart;const quint8*maskRowStart;int rows,cols,srcRowStride,dstRowStride,maskRowStride;float opacity;QBitArray channelFlags;float flow=1.f,_lastOpacityData=1.f;float*lastOpacity=&_lastOpacityData;void setOpacityAndAverage(float,float);};};
// ARM_SHIM
float armEstimate(float v){return vgetq_lane_f32(vrecpeq_f32(vdupq_n_f32(v)),0);}
float armStep(float a,float b){return float(2.-double(a)*double(b));}
float armDivide(float a,float b){float r=armEstimate(b);r=armStep(b,r)*r;r=armStep(b,r)*r;return a*r;}
// QT_PARAMS
// ROUND
// DIV
int scalarCalls=0,vectorCalls=0;
struct StreamIO{
 template<bool aligned>static V fetch_alpha_32(const void*p){auto b=(const quint8*)p;return _mm_setr_ps(b[3],b[7],b[11],b[15]);}
 template<bool aligned>static void fetch_colors_32(const void*p,V&a,V&b,V&c){auto x=(const quint8*)p;a=_mm_setr_ps(x[0],x[4],x[8],x[12]);b=_mm_setr_ps(x[1],x[5],x[9],x[13]);c=_mm_setr_ps(x[2],x[6],x[10],x[14]);}
 static V fetch_mask_8(const quint8*p){return _mm_setr_ps(p[0],p[1],p[2],p[3]);}
 static void write_channels_32(void*p,V alpha,V a,V b,V c){alignas(16)float v[4][4];_mm_store_ps(v[0],a.v);_mm_store_ps(v[1],b.v);_mm_store_ps(v[2],c.v);_mm_store_ps(v[3],alpha.v);auto x=(quint8*)p;for(int i=0;i<4;i++)for(int k=0;k<4;k++){float z=v[k][i];int32_t n=std::isnan(z)?0:z>=2147483648.f?INT32_MAX:z<=-2147483648.f?INT32_MIN:int32_t(std::nearbyint(z));x[i*4+k]=(quint8)n;}}

};
// STREAM
// OVER
// ALPHA
struct Arch{};
template<class Base>struct Count:Base{using ParamsWrapper=typename Base::ParamsWrapper;template<bool mask,class A>static void compositeOnePixelScalar(const quint8*s,quint8*d,const quint8*m,float o,const ParamsWrapper&p){scalarCalls++;Base::template compositeOnePixelScalar<mask,A>(s,d,m,o,p);}template<bool mask,bool align,class A>static void compositeVector(const quint8*s,quint8*d,const quint8*m,float o,const ParamsWrapper&p){vectorCalls++;Base::template compositeVector<mask,align,A>(s,d,m,o,p);}};
void bytes(const quint8*p,int n){std::cout<<'[';for(int i=0;i<n;i++){if(i)std::cout<<',';std::cout<<int(p[i]);}std::cout<<']';}
template<bool mask>void dispatch(int op,const KoCompositeOp::ParameterInfo&p){if(op==0)KoStreamedMath<Arch>::genericComposite<mask,false,Count<Over<quint8,quint32,false,true>>,4>(p);else if(op==1)KoStreamedMath<Arch>::genericComposite<mask,true,Count<Alpha<quint8,quint32,KoAlphaDarkenParamsWrapperCreamy>>,4>(p);else KoStreamedMath<Arch>::genericComposite<mask,true,Count<Alpha<quint8,quint32,KoAlphaDarkenParamsWrapperHard>>,4>(p);}
int main(){_mm_setcsr(0x1f80);unsigned rng=0x52bad123;auto raw=[&](){rng^=rng<<13;rng^=rng>>17;rng^=rng<<5;return rng;};int id=0;std::cout<<std::setprecision(17)<<"{\"profile\":\"unchanged pinned stream/vector/scalar; host4lane ARMtypedsemantics noFMA; NOT actualARMexecution\",\"cases\":[";for(int op=0;op<3;op++)for(int cols:{1,3,4,5,8,9,13})for(int offset:{0,4,8,12})for(int srcOffset:{0,4})for(int mode=0;mode<4;mode++)for(int masked=0;masked<2;masked++)for(int constant=0;constant<2;constant++){
 alignas(16)quint8 src[1024],dst[1024],before[1024],mask[256];int stride=cols*4+4;for(int i=0;i<1024;i++){src[i]=raw()&255;dst[i]=raw()&255;}for(auto &b:mask)b=raw()&255;for(int row=0;row<2;row++)for(int col=0;col<cols;col++){dst[offset+row*stride+col*4+3]=mode==0?0:mode==1?255:mode==2?(col%2?255:0):dst[offset+row*stride+col*4+3];if(id%11==0)src[srcOffset+row*stride+col*4+3]=0;if(id%13==0)src[srcOffset+row*stride+col*4+3]=255;}if(id%53==0&&cols>=4){for(int row=0;row<2;row++){src[srcOffset+row*stride+3]=0;dst[offset+row*stride+3]=0;src[srcOffset+row*stride+7]=255;dst[offset+row*stride+7]=255;}}memcpy(before,dst,1024);float opacity=id%4==0?0.f:id%4==1?1.f:id%4==2?.5f:.3240908086299896f,average=id%3==0?.8f:opacity,flow=id%7==0?0.f:id%3==0?1.f:.4f;if(id%127==0){opacity=std::numeric_limits<float>::denorm_min();average=opacity*2.f;flow=1.f;}KoCompositeOp::ParameterInfo p{dst+offset,src+srcOffset,masked?mask:nullptr,2,cols,constant?0:stride,stride,cols,opacity,{}};p.flow=flow;p.setOpacityAndAverage(opacity,average);scalarCalls=vectorCalls=0;if(masked)dispatch<true>(op,p);else dispatch<false>(op,p);if(id++)std::cout<<',';std::cout<<"{\"op\":"<<op<<",\"cols\":"<<cols<<",\"rows\":2,\"offset\":"<<offset<<",\"sourceOffset\":"<<srcOffset<<",\"constant\":"<<constant<<",\"mode\":"<<mode<<",\"opacity\":"<<opacity<<",\"averageOpacity\":"<<average<<",\"flow\":"<<flow<<",\"scalar\":"<<scalarCalls<<",\"vector\":"<<vectorCalls<<",\"src\":";bytes(src+srcOffset,constant?4:stride+cols*4);std::cout<<",\"dst\":";bytes(before+offset,stride+cols*4);std::cout<<",\"mask\":";if(masked)bytes(mask,cols*2);else std::cout<<"null";std::cout<<",\"result\":";bytes(dst+offset,stride+cols*4);std::cout<<'}';}std::cout<<"]}\n";}
