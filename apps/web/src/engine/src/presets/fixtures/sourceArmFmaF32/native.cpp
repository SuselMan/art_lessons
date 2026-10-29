// Authored independent host-libm oracle. No Krita/ARM/Qt source bodies copied.
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <cfenv>
#include <vector>
#include <array>
#include <xmmintrin.h>
float value(uint32_t bits){float result;memcpy(&result,&bits,4);return result;}
uint32_t bits(float v){uint32_t result;memcpy(&result,&v,4);return result;}
int main(){std::fesetround(FE_TONEAREST);_mm_setcsr(0x1f80);std::vector<std::array<uint32_t,3>> cases;
const uint32_t edge[]={0,0x80000000,1,2,3,0x007fffff,0x00800000,0x00800001,0x33800000,0x3f000000,0x3f000001,0x3f7fffff,0x3f800000,0x3f800001,0x3fc00000,0x40000000,0x4b000000,0x7f000000,0x7f7fffff};
for(uint32_t a:edge)for(uint32_t b:edge)for(uint32_t c:{0u,0x80000000u,1u,0x80000001u,0x3f800000u,0xbf800000u,0x7f7fffffu,0xff7fffffu})cases.push_back({a,b,c});
// Exact cancellation of a rounded product versus truly fused product.
for(uint32_t a:{0x3f800001u,0x3f7fffffu,0x3f000001u,0x40000001u,0x00800001u,0x7f000001u})for(uint32_t b:{0x3f800001u,0x3f7fffffu,0x3f000001u,0x00800000u,0x7f000000u}){float p=value(a)*value(b);if(std::isfinite(p)){uint32_t c=bits(-p);cases.push_back({a,b,c});cases.push_back({a|0x80000000,b,c^0x80000000});}}
// Half-way normal and subnormal stores, adjacent cancellations and overflow ties.
for(uint32_t sign:{0u,0x80000000u})for(uint32_t a:{1u,3u,5u,0x007fffffu,0x00800001u,0x3f800001u,0x7f7fffffu})for(uint32_t c:{0u,1u,0x007fffffu,0x00800000u})cases.push_back({a|sign,0x3f000000,c|sign});
uint32_t state=0x52f4a317;auto random=[&](){state^=state<<13;state^=state>>17;state^=state<<5;return state;};for(int i=0;i<8192;i++){std::array<uint32_t,3> c;for(auto&v:c){do{v=random();}while((v&0x7f800000)==0x7f800000);}cases.push_back(c);}
for(uint32_t sign:{0u,0x80000000u})for(uint32_t c:{0x72ffffffu,0x73000000u,0x73000001u})cases.push_back({0x7f7fffffu|sign,0x3f800000,c|sign});
cases.push_back({0x7f7fffFF,0x40000000,0xff7fffff});cases.push_back({0xff7fffff,0x40000000,0x7f7fffff});
std::cout<<"{\"scope\":\"host std::fma(float,float,float) RNE; true fused f32 baseline, NOT actualARM instruction receipt\",\"cases\":[";bool first=true;for(auto c:cases){if(!first)std::cout<<',';first=false;float result=std::fma(value(c[0]),value(c[1]),value(c[2]));std::cout<<'['<<c[0]<<','<<c[1]<<','<<c[2]<<','<<bits(result)<<']';}std::cout<<"]}\n";}
