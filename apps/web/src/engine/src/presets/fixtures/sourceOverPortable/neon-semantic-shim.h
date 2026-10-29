// Authored typed instruction semantics, NOT native ARM execution.
// ARM FPCR0 FRECPE mathematical model independently validated against155636
// actual Samsung instruction records; no per-divisor estimate fixture lookup.
#undef __SSE__
#define __ARM_NEON 1
#define XSIMD_WITH_NEON64 1
struct F4 {float v;};
struct I4 {int32_t v;};
F4 vdupq_n_f32(float v){return {v};}
float vgetq_lane_f32(F4 v,int){return v.v;}
int32_t vgetq_lane_s32(I4 v,int){return v.v;}
F4 vmulq_f32(F4 x,F4 y){return {x.v*y.v};}
F4 vrndiq_f32(F4 v){return {std::nearbyint(v.v)};}
I4 vcvtnq_s32_f32(F4 v){return {int32_t(std::nearbyint(v.v))};}
F4 vrecpeq_f32(F4 value){
 uint32_t b;memcpy(&b,&value.v,4);
 const uint32_t sign=b&0x80000000u;int exponent=(b>>23)&255;uint32_t fraction=b&0x7fffff;
 uint32_t result;
 if(exponent==255)result=fraction?(b|0x400000u):sign;
 else if(exponent==0&&fraction<0x200000)result=sign|0x7f800000u;
 else {
 if(exponent==0){exponent=1;while(fraction<0x800000){fraction*=2;--exponent;}fraction&=0x7fffff;}
 const uint32_t bin=256+(fraction>>15);
 const uint32_t estimate=((524288/(bin*2+1))+1)/2;
 int outExponent=253-exponent;uint32_t outFraction=(estimate&255)<<15;
 if(outExponent<=0){outFraction=(0x800000|outFraction)>>(1-outExponent);outExponent=0;}
 result=sign|(uint32_t(outExponent)<<23)|outFraction;
 }float output;memcpy(&output,&result,4);return {output};
}
