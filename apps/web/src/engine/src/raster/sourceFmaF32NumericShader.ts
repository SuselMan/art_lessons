/** Diagnostic numeric boundary only. Caller supplies zero sign explicitly.
 * General numeric subnormal entry FAILED actual Samsung gate. Consumers may
 * use only a proved normal-or-zero domain; component fallback is required.
 * A numeric value
 * flushed before entry cannot be recovered by this function. No active hooks. */
export const SOURCE_FMA_F32_NUMERIC_GLSL=/* glsl */`
// class0 finite,1 infinity,2 NaN. No raw U32 in a float, no log/exp.
vec4 sourceF32Decompose(float value,float zeroNegative){
 float negative=value<0.0?1.0:0.0;
 float v=abs(value);
 if(value!=value)return vec4(0.0,0.0,0.0,2.0);
 if(v==0.0)return vec4(zeroNegative,0.0,-149.0,0.0);
 if(v>3.4028234663852886e38)return vec4(negative,0.0,0.0,1.0);
 int exponent=0;
 for(int i=0;i<8;i++){
  float factor=2.0;float inverse=0.5;int step=1;
  if(i<2){factor=18446744073709551616.0;inverse=5.421010862427522e-20;step=64;}
  else if(i==2){factor=4294967296.0;inverse=2.3283064365386963e-10;step=32;}
  else if(i==3){factor=65536.0;inverse=0.0000152587890625;step=16;}
  else if(i==4){factor=256.0;inverse=0.00390625;step=8;}
  else if(i==5){factor=16.0;inverse=0.0625;step=4;}
  else if(i==6){factor=4.0;inverse=0.25;step=2;}
  if(v>=factor){v*=inverse;exponent+=step;}
  else if(v<inverse){v*=factor;exponent-=step;}
 }
 if(v<1.0){v*=2.0;exponent--;}
 float significand=v*8388608.0;
 if(exponent< -126){for(int i=0;i<23;i++){if(exponent< -126){significand*=0.5;exponent++;}}return vec4(negative,significand,-149.0,0.0);}
 return vec4(negative,significand,float(exponent-23),0.0);
}
`;
/** Finite reconstruction is separately GPU-gated, including subnormal result.
 * Nonfinite classes stay outside the finite compositor arithmetic contract. */
export const SOURCE_FMA_F32_COMPOSE_GLSL=/* glsl */`
float sourceF32ComposeFinite(vec4 parts){
 float v=parts.y;int exponent=int(parts.z);
 for(int i=0;i<3;i++){
  if(exponent>=64){v*=18446744073709551616.0;exponent-=64;}
  else if(exponent<=-64){v*=5.421010862427522e-20;exponent+=64;}
 }
 for(int i=0;i<63;i++){if(exponent>0){v*=2.0;exponent--;}else if(exponent<0){v*=0.5;exponent++;}}
 return parts.x>0.5?-v:v;
}
float sourceFmaFiniteNumbers(float a,float b,float c){
 vec4 x=sourceF32Decompose(a,0.0);vec4 y=sourceF32Decompose(b,0.0);vec4 z=sourceF32Decompose(c,0.0);
 vec4 result=sourceFmaF32(x.xyz,y.xyz,z.xyz);
 return sourceF32ComposeFinite(result);
}
`;
