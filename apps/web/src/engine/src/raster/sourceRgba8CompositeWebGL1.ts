import {SOURCE_RGBA8_QUANTIZED_ATAN_GLSL} from './sourceRgba8QuantizedAtan'
import { SOURCE_FMA_F32_BASE4096_GLSL } from './sourceFmaF32Base4096Shader'
import { SOURCE_FMA_F32_NUMERIC_GLSL, SOURCE_FMA_F32_COMPOSE_GLSL } from './sourceFmaF32NumericShader'

/** Explicit installed HSY numerical graph; no renderer/profile admission.
 * Exact normal-or-zero F32 operations use base4096 FMA; integer long division
 * provides U8 LUT and reciprocal boundaries without compiler contraction. */
export const SOURCE_RGBA8_INSTALLED_HSY_GLSL = SOURCE_FMA_F32_BASE4096_GLSL + SOURCE_FMA_F32_NUMERIC_GLSL + SOURCE_FMA_F32_COMPOSE_GLSL.replace('sourceFmaF32(x.xyz,y.xyz,z.xyz)', 'sourceFmaF32Base4096(x.xyz,y.xyz,z.xyz)') + /* glsl */ `
float sourceHsyFma(float a,float b,float c){
 return sourceF32ComposeFinite(sourceFmaF32Base4096(sourceF32Decompose(a,0.0).xyz,sourceF32Decompose(b,0.0).xyz,sourceF32Decompose(c,0.0).xyz));
}
// Materialize the binary32 significand as an integer before reconstruction.
// This makes separate MUL/ADD boundaries observable through floor/branches;
// normal-or-zero U8 HSY domain only (no subnormal numeric reconstruction).
float sourceHsyRound(float value){vec4 p=sourceF32Decompose(value,0.0);p.y=floor(p.y);return sourceF32ComposeFinite(p);}
float sourceHsyMul(float a,float b){return sourceHsyRound(a*b);}
float sourceHsyAdd(float a,float b){return sourceHsyRound(a+b);}
// Exact U8/255 LUT law by bounded integer long division, no GPU reciprocal.
float sourceHsyByteUnit(float byteValue){
 if(byteValue==0.0)return 0.0;
 float r=byteValue;float e=0.0;
 for(int i=0;i<8;i++){if(r<255.0){r*=2.0;e-=1.0;}}
 r-=255.0;float q=1.0;
 for(int i=0;i<23;i++){r*=2.0;q*=2.0;if(r>=255.0){r-=255.0;q+=1.0;}}
 if(r*2.0>255.0)q+=1.0;
 return sourceF32ComposeFinite(vec4(0.0,q,e-23.0,0.0));
}
// Correctly-rounded positive-normal 1/x. Remainder operations stay below2^24.
float sourceHsyReciprocal(float x){
 vec4 p=sourceF32Decompose(x,0.0);float d=p.y;
 if(d==8388608.0)return sourceF32ComposeFinite(vec4(0.0,8388608.0,-p.z-46.0,0.0));
 float r=1.0;float q=0.0;float halfD=floor(d*0.5);float odd=d-halfD*2.0;
 for(int i=0;i<47;i++){
  q*=2.0;
  if(r>=halfD+odd){r=(r-halfD)*2.0-odd;q+=1.0;}else r*=2.0;
 }
 if(r>halfD||(odd==0.0&&r==halfD&&mod(q,2.0)!=0.0))q+=1.0;
 return sourceF32ComposeFinite(vec4(0.0,q,-p.z-47.0,0.0));
}
float sourceHsyLum(vec3 v){
 float g=sourceHsyMul(v.g,0.5870000123977661);
 float t=sourceHsyFma(v.r,0.29899999499320984,g);
 return sourceHsyFma(v.b,0.11400000005960464,t);
}
// Local trusted upload invariant: stageLimit is exactly12. It is not wire data.
uniform int sourceHsyStageLimit;
vec3 sourceInstalledHsyChannels(vec3 source,vec3 destination){
 if(sourceHsyStageLimit!=12)return vec3(-16777216.0);
 vec3 s=vec3(sourceHsyByteUnit(source.r),sourceHsyByteUnit(source.g),sourceHsyByteUnit(source.b));
 vec3 d=vec3(sourceHsyByteUnit(destination.r),sourceHsyByteUnit(destination.g),sourceHsyByteUnit(destination.b));
 vec3 color=vec3(0.0);float sourceLight=0.0;float destinationLight=0.0;float temporary=0.0;
 float l=0.0;float n=0.0;float x=0.0;float inverse=1.0;float factor=1.0;bool toneActive=false;
 // Fixed original HSY order: six luminance FMADDs, then three negative-pass
 // and three original-max-pass FMADDs. Inactive/fallback branches skip them.
 // One static software-FMA callsite avoids cloning its limb arithmetic12times.
 for(int stage=0;stage<12;stage++){
  if(stage>=sourceHsyStageLimit)break;
  float a=0.0;float b=1.0;float c=0.0;
  if(stage==0){a=s.r;b=0.29899999499320984;c=sourceHsyMul(s.g,0.5870000123977661);}
  else if(stage==1){a=s.b;b=0.11400000005960464;c=temporary;}
  else if(stage==2){a=d.r;b=0.29899999499320984;c=sourceHsyMul(d.g,0.5870000123977661);}
  else if(stage==3){a=d.b;b=0.11400000005960464;c=temporary;}
  else if(stage==4){
   float delta=sourceHsyAdd(destinationLight,-sourceLight);
   color=vec3(sourceHsyAdd(s.r,delta),sourceHsyAdd(s.g,delta),sourceHsyAdd(s.b,delta));
   a=color.r;b=0.29899999499320984;c=sourceHsyMul(color.g,0.5870000123977661);
  }else if(stage==5){a=color.b;b=0.11400000005960464;c=temporary;}
  else {
   if(stage==6){
    toneActive=false;
    if(n<0.0){float stretch=sourceHsyAdd(l,-n);
     if(l<=0.000009999999747378752||stretch<0.00000011920928955078125)color=vec3(0.0);
     else {inverse=sourceHsyReciprocal(stretch);factor=l;toneActive=true;}}
   }
   if(stage==9){
    toneActive=false;
    if(x>1.0){float stretch=sourceHsyAdd(x,-l);
     if(l>1.0||stretch<0.00000011920928955078125)color=vec3(1.0);
     else {inverse=sourceHsyReciprocal(stretch);factor=sourceHsyAdd(1.0,-l);toneActive=true;}}
   }
   if(!toneActive)continue;
   float channel=(stage==6||stage==9)?color.r:(stage==7||stage==10)?color.g:color.b;
   a=sourceHsyMul(sourceHsyAdd(channel,-l),factor);b=inverse;c=l;
  }
  float result=sourceHsyFma(a,b,c);
  if(stage==0||stage==2||stage==4)temporary=result;
  else if(stage==1)sourceLight=result;
  else if(stage==3)destinationLight=result;
  else if(stage==5){l=result;n=min(color.r,min(color.g,color.b));x=max(color.r,max(color.g,color.b));}
  else if(stage==6||stage==9)color.r=result;
  else if(stage==7||stage==10)color.g=result;
  else color.b=result;
 }
 return color;
}
vec3 sourceInstalledHsyColor(vec3 source,vec3 destination){
 // Separate F32 MUL and ADD, then native half-up truncation after clamp.
 vec3 c=clamp(sourceInstalledHsyChannels(source,destination),0.0,1.0);
 return floor(vec3(sourceHsyAdd(sourceHsyMul(c.r,255.0),0.5),sourceHsyAdd(sourceHsyMul(c.g,255.0),0.5),sourceHsyAdd(sourceHsyMul(c.b,255.0),0.5)));
}
`;

/** WebGL1 scalar byte compositor. Straight RGBA8 values are integer-valued
 * highp floats, NOT premultiplied/normalized inputs. Host byte controls use
 * canonicalizeSourceRgba8Control from sourceRgba8CompositeShader.
 *
 * Require fragment HIGH_FLOAT precision >=23. All integer intermediates are
 * exact binary32: max multiply3 numerator including its fold is 16743774,
 * below 2^24. Powers of two use exact scaling/floor (including signed blend).
 * General division corrects the estimated quotient by its exact residual.
 * This is the generic scalar law, not optimized native packet/Over32 dispatch.
 * No blend state, destination storage or profile admission is implied here.
 */
const SOURCE_RGBA8_BYTE_CONTROLS_GLSL = /* glsl */ `
struct SourceRgba8CompositeControl {
  float mode;
  float opacity;
  float mask;
  bool hasMask;
  float flow;
  float average;
  bool flowIsOne;
};
float sourceRgba8Multiply(float a, float b) {
  float t = a * b + 128.0;
  return floor((floor(t * (1.0/256.0)) + t) * (1.0/256.0));
}
float sourceRgba8Multiply3(float a, float b, float c) {
  float t = a * b * c + 32603.0;
  return floor((floor(t * (1.0/128.0)) + t) * (1.0/65536.0));
}
float sourceRgba8Divide(float a, float b) {
  float numerator = a * 255.0 + floor(b * 0.5);
  float quotient = floor(numerator / b);
  float residual = numerator - quotient * b;
  return residual < 0.0 ? quotient - 1.0 : residual >= b ? quotient + 1.0 : quotient;
}
`;
const SOURCE_RGBA8_BYTE_WRAP_GLSL = /* glsl */ `float sourceRgba8Wrap(float value) { return value - floor(value * (1.0/256.0)) * 256.0; }
`;
export const SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL = SOURCE_RGBA8_QUANTIZED_ATAN_GLSL + SOURCE_RGBA8_BYTE_CONTROLS_GLSL + /* glsl */ `float sourceRgba8Blend(float source, float destination, float alpha) {
  float t = (source - destination) * alpha + 128.0;
  return floor((floor(t * (1.0/256.0)) + t) * (1.0/256.0)) + destination;
}
` + SOURCE_RGBA8_BYTE_WRAP_GLSL + /* glsl */ `// Closed IDs: 0 Over, 1 Add, 2 AlphaDarken, 3 Multiply, 4 Lighten,
// 5 ColorDodge, 6 Overlay. Extended browser functors append IDs7..27 under explicit source law.
// New channel IDs only: bounded integer numerator/denominator (<2^24).
// Correct division's rounded reciprocal before applying native integer floor.
float sourceRgba8ChannelFloorDivide(float numerator,float denominator){
 float q=floor(numerator/denominator),r=numerator-q*denominator;
 return r<0.0?q-1.0:r>=denominator?q+1.0:q;
}
float sourceRgba8QuadraticGlow(float s,float d){return d==255.0?255.0:min(255.0,sourceRgba8Divide(sourceRgba8Multiply(s,s),255.0-d));}
float sourceRgba8QuadraticHeat(float s,float d){return s==255.0?255.0:d==0.0?0.0:255.0-min(255.0,sourceRgba8Divide(sourceRgba8Multiply(255.0-s,255.0-s),d));}
float sourceRgba8QuadraticHeatGlow(float s,float d){return s+d>255.0?sourceRgba8QuadraticHeat(s,d):s==0.0?0.0:sourceRgba8QuadraticGlow(s,d);}
float sourceRgba8QuadraticFreezeReflect(float s,float d){return s+d>255.0?sourceRgba8QuadraticHeat(d,s):d==0.0?0.0:sourceRgba8QuadraticGlow(d,s);}
float sourceRgba8QuadraticGlowHeat(float s,float d){return d==255.0?255.0:s+d>255.0?sourceRgba8QuadraticGlow(s,d):sourceRgba8QuadraticHeat(s,d);}
float sourceRgba8PenumbraB(float s,float d){
 if(d==255.0)return 255.0;
 if(s+d<255.0)return floor(min(255.0,sourceRgba8Divide(s,255.0-d))*0.5);
 if(s==0.0)return 0.0;
 return 255.0-min(255.0,floor(sourceRgba8Divide(255.0-d,s)*0.5));
}
float sourceRgba8PenumbraD(float s,float d){return d==255.0?255.0:sourceRgba8QuantizedAtan(s,255.0-d);}
// Defined functional byte-bitwise graph. Exact bounded ES1 decomposition, no GPU bitops/LUT.
float sourceRgba8Binary(float mode,float s,float d){
 float result=0.0,weight=1.0;
 for(int bit=0;bit<8;bit++){
  float a=s-floor(s*0.5)*2.0,b=d-floor(d*0.5)*2.0,v=0.0;
  if(mode==53.0)v=abs(a-b);
  else if(mode==54.0)v=max(a,b);
  else if(mode==55.0)v=a*b;
  else if(mode==56.0)v=1.0-a*b;
  else if(mode==57.0)v=1.0-max(a,b);
  else if(mode==58.0)v=1.0-abs(a-b);
  else if(mode==59.0)v=max(a,1.0-b);
  else if(mode==60.0)v=(1.0-a)*b;
  else if(mode==61.0)v=max(1.0-a,b);
  else if(mode==62.0)v=a*(1.0-b);
  result+=v*weight;weight*=2.0;s=floor(s*0.5);d=floor(d*0.5);
 }
 return result;
}
float sourceScalar4FourthRoot(float s,float d);
float sourceScalar4Interpolation(float s,float d);
float sourceScalar4Tint(float s,float d);
float sourceRgba8Scalar23Round(float value){return floor(clamp(value,0.0,1.0)*255.0+.5);}
float sourceRgba8Scalar23GammaDark(float s,float d){if(d==0.0)return 0.0;if(d==255.0)return 255.0;if(s==0.0)return 0.0;return sourceRgba8Scalar23Round(pow(d/255.0,1.0/(s/255.0)));}
float sourceRgba8Scalar23Interpolation(float s,float d){if(s==0.0&&d==0.0)return 0.0;return sourceScalar4Interpolation(s,d);}
float sourceRgba8Scalar23Real(float mode,float s,float d){
 float x=s/255.0,y=d/255.0;
 if(mode==92.0)return sourceRgba8Scalar23GammaDark(s,d);
 if(mode==93.0)return d==0.0?0.0:d==255.0?255.0:sourceRgba8Scalar23Round(pow(y,x));
 if(mode==94.0)return 255.0-sourceRgba8Scalar23GammaDark(255.0-s,255.0-d);
 if(mode==95.0)return s==255.0?255.0:d==0.0?0.0:sourceRgba8Scalar23Round(pow(y,(1.0-x)*1.039999999));
 // Literal native surrogate1-.999999999999 must not collapse to zero in highp.
 if(mode==96.0)return d==0.0?0.0:sourceRgba8Scalar23Round(1.0-pow(s==255.0?0.0000000000009999778782798785:1.0-x,y*1.039999999));
 if(mode==97.0)return clamp(floor(pow(pow(d,2.3333333333333333)+pow(s,2.3333333333333333),.428571428571434)),0.0,255.0);
 if(mode==98.0)return sourceScalar4FourthRoot(s,d);
 if(mode==99.0)return sourceRgba8Scalar23Round(x<.5?1.0-pow(pow(1.0-y,2.875)+pow(1.0-2.0*x,2.875),1.0/2.875):pow(pow(y,2.875)+pow(2.0*x-1.0,2.875),1.0/2.875));
 if(mode==100.0)return sourceRgba8Scalar23Round(pow(y,pow(2.0,2.0*(.5-x))));
 if(mode==102.0)return sourceScalar4Tint(s,d);
 if(mode==103.0)return sourceRgba8Scalar23Round(1.0-((1.0-y)*x+sqrt(1.0-x)));
 if(mode==104.0)return sourceRgba8Scalar23Round(x<.5?1.0-(1.0-x)*x-(1.0-y)*(1.0-x):x-(1.0-y)*(1.0-x)+pow(1.0-x,2.0));
 if(mode==105.0)return sourceRgba8Scalar23Round(x<.5?(1.0-x)*x+x*y:x*y+x-pow(x,2.0));
 if(mode==113.0)return sourceRgba8Scalar23Interpolation(s,d);
 if(mode==114.0){float inner=sourceRgba8Scalar23Interpolation(s,d);return sourceRgba8Scalar23Interpolation(inner,inner);}
 return 0.0;
}
float sourceRgba8Scalar23Remainder(float n,float d){return n-sourceRgba8ChannelFloorDivide(n,d)*d;}
float sourceRgba8Scalar23DivContinuous(float s,float d){if(d==0.0||s==0.0)return 0.0;float rem=sourceRgba8Scalar23Remainder(d-1.0,s)+1.0,q=sourceRgba8ChannelFloorDivide(d+s-1.0,s);return sourceRgba8Divide(sourceRgba8Scalar23Remainder(q,2.0)==1.0?rem:s-rem,s);}
float sourceRgba8Scalar23Integer(float mode,float s,float d){
 if(mode==101.0)return min(255.0,sourceRgba8Multiply(d,s+d-sourceRgba8Multiply(s,d))+sourceRgba8Multiply(sourceRgba8Multiply(s,d),255.0-d));
 if(mode==106.0)return sourceRgba8Scalar23Remainder(d,s+1.0);
 if(mode==107.0)return sourceRgba8Multiply(sourceRgba8Scalar23DivContinuous(s,d),s);
 if(mode==108.0){if(d==0.0)return 0.0;if(s==0.0)return d;return sourceRgba8Divide(sourceRgba8Scalar23Remainder(d-1.0,s)+1.0,s);}
 if(mode==109.0)return sourceRgba8Scalar23DivContinuous(s,d);
 if(mode==110.0){if(s==255.0&&d==0.0)return 0.0;float sum=s+d;return sum==0.0?0.0:sourceRgba8Scalar23Remainder(sum-1.0,255.0)+1.0;}
 if(mode==111.0){float sum=s+d;return sum<=255.0?sum:510.0-sum;}
 if(mode==112.0){if(d==0.0)return 0.0;if(s==255.0)return 255.0;return min(255.0,s>=127.0?sourceRgba8ChannelFloorDivide(d*255.0,2.0*(255.0-s)):sourceRgba8ChannelFloorDivide(d*2.0*s,255.0));}
 return 0.0;
}
float sourceRgba8SeparableChannel(float mode, float source, float destination) {
  if(mode>=92.0&&mode<=114.0)return mode==101.0||(mode>=106.0&&mode<=112.0)?sourceRgba8Scalar23Integer(mode,source,destination):sourceRgba8Scalar23Real(mode,source,destination);
  if(mode>=53.0&&mode<=62.0)return sourceRgba8Binary(mode,source,destination);
  if(mode==47.0)return clamp(3.0*destination-2.0*(255.0-source),0.0,255.0);
  if(mode==48.0)return sourceRgba8PenumbraB(destination,source);
  if(mode==49.0)return sourceRgba8PenumbraB(source,destination);
  if(mode==50.0)return sourceRgba8PenumbraD(destination,source);
  if(mode==51.0)return sourceRgba8PenumbraD(source,destination);
  if(mode==52.0)return source==0.0?0.0:destination>source?sourceRgba8PenumbraB(source,destination):sourceRgba8PenumbraB(destination,source);

  if(mode==38.0)return sourceRgba8QuadraticGlow(destination,source);
  if(mode==39.0)return sourceRgba8QuadraticGlow(source,destination);
  if(mode==40.0)return sourceRgba8QuadraticHeat(destination,source);
  if(mode==41.0)return sourceRgba8QuadraticHeat(source,destination);
  if(mode==42.0)return sourceRgba8QuadraticGlowHeat(source,destination);
  if(mode==43.0)return sourceRgba8QuadraticHeatGlow(source,destination);
  if(mode==44.0)return sourceRgba8QuadraticGlowHeat(destination,source);
  if(mode==45.0)return sourceRgba8QuadraticFreezeReflect(source,destination);
  if(mode==46.0)return sourceRgba8ChannelFloorDivide((sourceRgba8QuadraticFreezeReflect(source,destination)+sourceRgba8QuadraticHeatGlow(source,destination))*127.0,255.0);

  if (mode == 3.0) return sourceRgba8Multiply(source, destination);
  if (mode == 4.0) return max(source, destination);
  if (mode == 5.0) return source == 255.0 ? (destination == 0.0 ? 0.0 : 255.0)
    : min(255.0, sourceRgba8Divide(destination, 255.0-source));
  if(mode==7.0)return min(source,destination);
  if(mode==8.0)return source+destination-sourceRgba8Multiply(source,destination);
  if(mode==9.0)return destination==255.0?255.0:source==0.0?0.0:255.0-min(255.0,sourceRgba8Divide(255.0-destination,source));
  if(mode==10.0||mode==32.0)return max(0.0,source+destination-255.0);
  if(mode==11.0)return max(0.0,destination-source);
  if(mode==12.0||mode==28.0)return abs(destination-source);
  if(mode==13.0)return clamp(source+destination-2.0*sourceRgba8Multiply(source,destination),0.0,255.0);
  if(mode==14.0)return floor(255.0*(source>127.5?destination/255.0+(2.0*source/255.0-1.0)*(sqrt(destination/255.0)-destination/255.0):destination/255.0-(1.0-2.0*source/255.0)*(destination/255.0)*(1.0-destination/255.0))+.5);
  if(mode==15.0)return source==127.0?destination:source<127.0?sourceRgba8Multiply(2.0*source,destination):(2.0*source-255.0)+destination-sourceRgba8Multiply(2.0*source-255.0,destination);
  if(mode==16.0)return destination==0.0?0.0:source==0.0?255.0:min(255.0,sourceRgba8Divide(destination,source));
  if(mode==17.0)return clamp(2.0*source+destination-255.0,0.0,255.0);
  if(mode==18.0)return source<127.0?(source==0.0?(destination==255.0?255.0:0.0):max(0.0,255.0-sourceRgba8Divide(255.0-destination,2.0*source))):(source==255.0?(destination==0.0?0.0:255.0):min(255.0,sourceRgba8Divide(destination,2.0*(255.0-source))));
  if(mode==19.0)return max(2.0*source-255.0,min(destination,2.0*source));
  if(mode==20.0)return destination>127.0?(source==255.0?(destination==0.0?0.0:255.0):min(255.0,sourceRgba8Divide(destination,255.0-source))):(destination==255.0?255.0:source==0.0?0.0:255.0-min(255.0,sourceRgba8Divide(255.0-destination,source)));
  // Append-only channel IDs28..37; old0..27 math remains unchanged.
  if(mode==29.0)return floor(255.0*abs(sqrt(destination/255.0)-sqrt(source/255.0))+.5);
  if(mode==30.0)return sourceRgba8QuantizedAtan(source,destination);
  if(mode==31.0)return 255.0-abs(255.0-source-destination);
  if(mode==33.0)return clamp(source+destination-127.0,0.0,255.0);
  if(mode==34.0)return clamp(destination-source+127.0,0.0,255.0);
  if(mode==35.0)return sourceRgba8ChannelFloorDivide((source+destination)*127.0,255.0);
  if(mode==36.0)return source==255.0&&destination==255.0?255.0:floor(255.0*sqrt((source/255.0)*(destination/255.0))+.5);
  if(mode==37.0){if(source==0.0||destination==0.0)return 0.0;float s=sourceRgba8Divide(255.0,source),d=sourceRgba8Divide(255.0,destination);return min(255.0,sourceRgba8ChannelFloorDivide(130050.0,s+d));}
  if(mode==26.0)return source+destination>255.0?255.0:0.0;
  if(mode==27.0){float y=destination/255.0,x=source/255.0;float d=y>.25?sqrt(y):((16.0*y-12.0)*y+4.0)*y;return floor(255.0*(x>.5?y+(2.0*x-1.0)*(d-y):y-(1.0-2.0*x)*y*(1.0-y))+.5);}
  if (destination == 127.0) return source;
  if (destination < 127.0) return sourceRgba8Multiply(2.0*destination, source);
  float doubled = 2.0*destination-255.0;
  return doubled+source-sourceRgba8Multiply(doubled, source);
}
float sourceRgba8GenericScChannel(float source, float destination, float sa, float da, float alpha, float cf) {
  if (da == 0.0) return source;
  if (da == 255.0) return sourceRgba8Blend(cf, destination, sa);
  if (sa == 255.0) return sourceRgba8Blend(cf, source, da);
  float premultiplied = sourceRgba8Wrap(sourceRgba8Multiply3(255.0-sa, da, destination)
    + sourceRgba8Multiply3(255.0-da, sa, source)
    + sourceRgba8Multiply3(da, sa, cf));
  return sourceRgba8Wrap(sourceRgba8Divide(premultiplied, alpha));
}
float sourceRgba8AddChannel(float source, float destination, float sa, float da, float alpha) {
  return sourceRgba8GenericScChannel(source, destination, sa, da, alpha, min(255.0, source+destination));
}
float sourceRgba8GenericScModeChannel(float mode, float source, float destination, float sa, float da, float alpha) {
  float cf = mode == 1.0 ? min(255.0, source+destination) : sourceRgba8SeparableChannel(mode, source, destination);
  return sourceRgba8GenericScChannel(source, destination, sa, da, alpha, cf);
}

// HSX29-only deterministic Q65535 law: pair=(high,low), base65536.
// Split base256 product/add intermediates are exact highp integers <2^24.
vec2 sourceHsxProduct(float a,float b){
 float ah=floor(a/256.0),al=a-ah*256.0,bh=floor(b/256.0),bl=b-bh*256.0;
 float cross=ah*bl+al*bh,carry=floor(cross/256.0);
 float low=al*bl+(cross-carry*256.0)*256.0,high=ah*bh+carry;
 float c=floor(low/65536.0);return vec2(high+c,low-c*65536.0);
}
vec2 sourceHsxPairAdd(vec2 a,vec2 b){float low=a.y+b.y,c=floor(low/65536.0);return vec2(a.x+b.x+c,low-c*65536.0);}
float sourceHsxRatio(vec2 n,float d){
 // Approximate ONLY trialquotient. Subtract exact limbs, never large rounded floats.
 float q=floor((n.x*65536.0+n.y)/d);vec2 p=sourceHsxProduct(q,d);
 float r=(n.x-p.x)*65536.0+(n.y-p.y);
 if(r<0.0){q-=1.0;r+=d;}else if(r>=d){q+=1.0;r-=d;}
 return q+(r*2.0>=d?1.0:0.0);
}
float sourceHsxMulRatio(float a,float b,float d){return sourceHsxRatio(sourceHsxProduct(abs(a),abs(b)),d)*sign(a)*sign(b);}
float sourceHsxLight(float model,vec3 c){
 float lo=min(c.r,min(c.g,c.b)),hi=max(c.r,max(c.g,c.b));
 if(model==0.0){vec3 v=c-vec3(lo);vec2 p=sourceHsxPairAdd(sourceHsxProduct(v.r,299.0),sourceHsxProduct(v.g,587.0));return lo+sourceHsxRatio(sourceHsxPairAdd(p,sourceHsxProduct(v.b,114.0)),1000.0);}
 if(model==1.0){float sum=hi+lo;return sign(sum)*sourceHsxRatio(vec2(0.0,abs(sum)),2.0);}
 if(model==2.0)return hi;
 float sum=c.r+c.g+c.b;return sign(sum)*sourceHsxRatio(vec2(0.0,abs(sum)),3.0);
}
float sourceHsxSat(float model,vec3 c){
 float hi=max(c.r,max(c.g,c.b)),lo=min(c.r,min(c.g,c.b)),chroma=hi-lo;
 if(model==0.0)return chroma;
 if(model==1.0){float d=65535.0-abs(hi+lo-65535.0);return d>0.0?sourceHsxMulRatio(chroma,65535.0,d):0.0;}
 if(model==2.0)return hi>0.0?sourceHsxMulRatio(chroma,65535.0,hi):0.0;
 return chroma>0.0?65535.0-sourceHsxMulRatio(3.0*lo,65535.0,c.r+c.g+c.b):0.0;
}
float sourceHsxOperation(float mode){
 if(mode==63.0)return -1.0;
 if(mode==64.0)return 3.0;if(mode==65.0)return 4.0;if(mode==66.0)return 6.0;if(mode==67.0)return 7.0;
 if(mode==68.0||mode==76.0||mode==84.0)return 0.0;
 if(mode==69.0||mode==77.0||mode==85.0)return 1.0;
 if(mode==70.0||mode==78.0||mode==86.0)return 2.0;
 if(mode==71.0||mode==79.0||mode==87.0)return 3.0;
 if(mode==72.0||mode==80.0||mode==88.0)return 4.0;
 if(mode==73.0||mode==81.0||mode==89.0)return 5.0;
 if(mode==74.0||mode==82.0||mode==90.0)return 6.0;
 if(mode==75.0||mode==83.0||mode==91.0)return 7.0;
 return -2.0;
}
vec3 sourceHsxBytes(vec3 c){c=clamp(c,0.0,65535.0);return vec3(sourceHsxMulRatio(c.r,255.0,65535.0),sourceHsxMulRatio(c.g,255.0,65535.0),sourceHsxMulRatio(c.b,255.0,65535.0));}
vec3 sourceHsxQuantized(float mode,vec3 source,vec3 destination){
 float Q=65535.0,model=mode<68.0?0.0:1.0+floor((mode-68.0)/8.0),op=sourceHsxOperation(mode);
 vec3 a=source*257.0,b=destination*257.0;
 float la=sourceHsxLight(model,a),lb=sourceHsxLight(model,b);
 if(op==-1.0)return sourceHsxBytes(vec3(lb)+vec3(sourceHsxMulRatio(a.r,Q-lb,Q),sourceHsxMulRatio(a.g,Q-lb,Q),sourceHsxMulRatio(a.b,Q-lb,Q)));
 vec3 c=op==0.0||op==1.0?a:b;
 if(op>=1.0&&op<=4.0){
  float sa=sourceHsxSat(model,a),sd=sourceHsxSat(model,b),target=op==1.0?sd:op==2.0?sa:op==3.0?sd+sourceHsxMulRatio(Q-sd,sa,Q):sourceHsxMulRatio(sd,sa,Q);
  float lo=min(c.r,min(c.g,c.b)),chroma=max(c.r,max(c.g,c.b))-lo;c-=vec3(lo);
  c=chroma>0.0?vec3(sourceHsxMulRatio(c.r,target,chroma),sourceHsxMulRatio(c.g,target,chroma),sourceHsxMulRatio(c.b,target,chroma)):vec3(0.0);
 }
 float delta=op<=4.0?lb-sourceHsxLight(model,c):op==5.0?la-lb:op==6.0?la:la-Q;c+=vec3(delta);
 float l=sourceHsxLight(model,c),n=min(c.r,min(c.g,c.b)),x=max(c.r,max(c.g,c.b));
 if(n<0.0){if(l<=0.0||l-n<=0.0)c=vec3(0.0);else c=vec3(l)+vec3(sourceHsxMulRatio(c.r-l,l,l-n),sourceHsxMulRatio(c.g-l,l,l-n),sourceHsxMulRatio(c.b-l,l,l-n));}
 if(x>Q){if(l>Q||x-l<=0.0)c=model==2.0?min(c,vec3(Q)):vec3(Q);else c=vec3(l)+vec3(sourceHsxMulRatio(c.r-l,Q-l,x-l),sourceHsxMulRatio(c.g-l,Q-l,x-l),sourceHsxMulRatio(c.b-l,Q-l,x-l));}
 return sourceHsxBytes(c);
}
// Functional normal4 Q65535, IDs115..118. sqrt is trial only; exact limb squares decide floor.
bool sourceNormalPairLess(vec2 a,vec2 b){return a.x<b.x||(a.x==b.x&&a.y<b.y);}
float sourceNormalIsqrt(vec2 n){
 float q=floor(sqrt(n.x*65536.0+n.y));
 if(sourceNormalPairLess(n,sourceHsxProduct(q,q)))q-=1.0;
 else if(!sourceNormalPairLess(n,sourceHsxProduct(q+1.0,q+1.0)))q+=1.0;
 return q;
}
vec3 sourceNormalBytes2(vec3 c){c=clamp(c,0.0,131070.0);return vec3(sourceHsxMulRatio(c.r,255.0,131070.0),sourceHsxMulRatio(c.g,255.0,131070.0),sourceHsxMulRatio(c.b,255.0,131070.0));}
float sourceNormalLambert(float id,float a,float b){
 float Q=65535.0,p=sourceHsxMulRatio(a,b,Q),v=id==115.0?sourceHsxMulRatio(p,500000.0,107843.0):2.0*p;
 if(v<=Q)return v;float square=sourceHsxMulRatio(v-Q,v-Q,Q);
 return Q+(id==115.0?sourceHsxMulRatio(square,1925.0,100000.0):sourceHsxMulRatio(square,2.0,5.0));
}
vec3 sourceNormalQuantized(float id,vec3 source,vec3 destination){
 float Q=65535.0;vec3 a=source*257.0,b=destination*257.0;
 if(id==118.0)return sourceNormalBytes2(vec3(2.0*(a.r+b.r)-Q,2.0*(a.g+b.g)-Q,2.0*(a.b+b.b-Q)));
 if(id==117.0){
  if(a.b==0.0)return destination;
  vec3 t=vec3(2.0*a.r-Q,2.0*a.g-Q,2.0*a.b),u=vec3(Q-2.0*b.r,Q-2.0*b.g,2.0*b.b-Q);
  float dotValue=sourceHsxMulRatio(t.r,u.r,Q)+sourceHsxMulRatio(t.g,u.g,Q)+sourceHsxMulRatio(t.b,u.b,Q);
  vec3 h=vec3(sourceHsxMulRatio(t.r,dotValue,Q)-sourceHsxMulRatio(u.r,t.b,Q),sourceHsxMulRatio(t.g,dotValue,Q)-sourceHsxMulRatio(u.g,t.b,Q),sourceHsxMulRatio(t.b,dotValue,Q)-sourceHsxMulRatio(u.b,t.b,Q));
  float largest=max(abs(h.r),max(abs(h.g),abs(h.b)));if(largest==0.0)return destination;
  h=vec3(sourceHsxMulRatio(h.r,Q,largest),sourceHsxMulRatio(h.g,Q,largest),sourceHsxMulRatio(h.b,Q,largest));
  vec2 lengthSquared=sourceHsxPairAdd(sourceHsxPairAdd(sourceHsxProduct(abs(h.r),abs(h.r)),sourceHsxProduct(abs(h.g),abs(h.g))),sourceHsxProduct(abs(h.b),abs(h.b)));
  float len=sourceNormalIsqrt(lengthSquared);
  return sourceNormalBytes2(vec3(sourceHsxMulRatio(h.r,Q,len),sourceHsxMulRatio(h.g,Q,len),sourceHsxMulRatio(h.b,Q,len))+vec3(Q));
 }
 vec3 c=vec3(sourceNormalLambert(id,a.r,b.r),sourceNormalLambert(id,a.g,b.g),sourceNormalLambert(id,a.b,b.b));
 float l=sourceHsxLight(3.0,c),n=min(c.r,min(c.g,c.b)),x=max(c.r,max(c.g,c.b));
 if(n<0.0){if(l<=0.0||l-n<=0.0)c=vec3(0.0);else c=vec3(l)+vec3(sourceHsxMulRatio(c.r-l,l,l-n),sourceHsxMulRatio(c.g-l,l,l-n),sourceHsxMulRatio(c.b-l,l,l-n));}
 if(x>Q){if(l>Q||x-l<=0.0)c=vec3(Q);else c=vec3(l)+vec3(sourceHsxMulRatio(c.r-l,Q-l,x-l),sourceHsxMulRatio(c.g-l,Q-l,x-l),sourceHsxMulRatio(c.b-l,Q-l,x-l));}
 return sourceHsxBytes(c);
}
float sourceGreaterWeight(float delta){if(delta<0.0){if(delta<-128.0){if(delta<-192.0){if(delta<-224.0){if(delta<-240.0){if(delta<-248.0){if(delta<-252.0){if(delta<-254.0){return 0.0;}else{if(delta<-253.0){return 0.0;}else{return 0.0;}}}else{if(delta<-250.0){if(delta<-251.0){return 0.0;}else{return 0.0;}}else{if(delta<-249.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-244.0){if(delta<-246.0){if(delta<-247.0){return 0.0;}else{return 0.0;}}else{if(delta<-245.0){return 0.0;}else{return 0.0;}}}else{if(delta<-242.0){if(delta<-243.0){return 0.0;}else{return 0.0;}}else{if(delta<-241.0){return 0.0;}else{return 0.0;}}}}}else{if(delta<-232.0){if(delta<-236.0){if(delta<-238.0){if(delta<-239.0){return 0.0;}else{return 0.0;}}else{if(delta<-237.0){return 0.0;}else{return 0.0;}}}else{if(delta<-234.0){if(delta<-235.0){return 0.0;}else{return 0.0;}}else{if(delta<-233.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-228.0){if(delta<-230.0){if(delta<-231.0){return 0.0;}else{return 0.0;}}else{if(delta<-229.0){return 0.0;}else{return 0.0;}}}else{if(delta<-226.0){if(delta<-227.0){return 0.0;}else{return 0.0;}}else{if(delta<-225.0){return 0.0;}else{return 0.0;}}}}}}else{if(delta<-208.0){if(delta<-216.0){if(delta<-220.0){if(delta<-222.0){if(delta<-223.0){return 0.0;}else{return 0.0;}}else{if(delta<-221.0){return 0.0;}else{return 0.0;}}}else{if(delta<-218.0){if(delta<-219.0){return 0.0;}else{return 0.0;}}else{if(delta<-217.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-212.0){if(delta<-214.0){if(delta<-215.0){return 0.0;}else{return 0.0;}}else{if(delta<-213.0){return 0.0;}else{return 0.0;}}}else{if(delta<-210.0){if(delta<-211.0){return 0.0;}else{return 0.0;}}else{if(delta<-209.0){return 0.0;}else{return 0.0;}}}}}else{if(delta<-200.0){if(delta<-204.0){if(delta<-206.0){if(delta<-207.0){return 0.0;}else{return 0.0;}}else{if(delta<-205.0){return 0.0;}else{return 0.0;}}}else{if(delta<-202.0){if(delta<-203.0){return 0.0;}else{return 0.0;}}else{if(delta<-201.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-196.0){if(delta<-198.0){if(delta<-199.0){return 0.0;}else{return 0.0;}}else{if(delta<-197.0){return 0.0;}else{return 0.0;}}}else{if(delta<-194.0){if(delta<-195.0){return 0.0;}else{return 0.0;}}else{if(delta<-193.0){return 0.0;}else{return 0.0;}}}}}}}else{if(delta<-160.0){if(delta<-176.0){if(delta<-184.0){if(delta<-188.0){if(delta<-190.0){if(delta<-191.0){return 0.0;}else{return 0.0;}}else{if(delta<-189.0){return 0.0;}else{return 0.0;}}}else{if(delta<-186.0){if(delta<-187.0){return 0.0;}else{return 0.0;}}else{if(delta<-185.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-180.0){if(delta<-182.0){if(delta<-183.0){return 0.0;}else{return 0.0;}}else{if(delta<-181.0){return 0.0;}else{return 0.0;}}}else{if(delta<-178.0){if(delta<-179.0){return 0.0;}else{return 0.0;}}else{if(delta<-177.0){return 0.0;}else{return 0.0;}}}}}else{if(delta<-168.0){if(delta<-172.0){if(delta<-174.0){if(delta<-175.0){return 0.0;}else{return 0.0;}}else{if(delta<-173.0){return 0.0;}else{return 0.0;}}}else{if(delta<-170.0){if(delta<-171.0){return 0.0;}else{return 0.0;}}else{if(delta<-169.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-164.0){if(delta<-166.0){if(delta<-167.0){return 0.0;}else{return 0.0;}}else{if(delta<-165.0){return 0.0;}else{return 0.0;}}}else{if(delta<-162.0){if(delta<-163.0){return 0.0;}else{return 0.0;}}else{if(delta<-161.0){return 0.0;}else{return 0.0;}}}}}}else{if(delta<-144.0){if(delta<-152.0){if(delta<-156.0){if(delta<-158.0){if(delta<-159.0){return 0.0;}else{return 0.0;}}else{if(delta<-157.0){return 0.0;}else{return 0.0;}}}else{if(delta<-154.0){if(delta<-155.0){return 0.0;}else{return 0.0;}}else{if(delta<-153.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-148.0){if(delta<-150.0){if(delta<-151.0){return 0.0;}else{return 0.0;}}else{if(delta<-149.0){return 0.0;}else{return 0.0;}}}else{if(delta<-146.0){if(delta<-147.0){return 0.0;}else{return 0.0;}}else{if(delta<-145.0){return 0.0;}else{return 0.0;}}}}}else{if(delta<-136.0){if(delta<-140.0){if(delta<-142.0){if(delta<-143.0){return 0.0;}else{return 0.0;}}else{if(delta<-141.0){return 0.0;}else{return 0.0;}}}else{if(delta<-138.0){if(delta<-139.0){return 0.0;}else{return 0.0;}}else{if(delta<-137.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-132.0){if(delta<-134.0){if(delta<-135.0){return 0.0;}else{return 0.0;}}else{if(delta<-133.0){return 0.0;}else{return 0.0;}}}else{if(delta<-130.0){if(delta<-131.0){return 0.0;}else{return 0.0;}}else{if(delta<-129.0){return 0.0;}else{return 0.0;}}}}}}}}else{if(delta<-64.0){if(delta<-96.0){if(delta<-112.0){if(delta<-120.0){if(delta<-124.0){if(delta<-126.0){if(delta<-127.0){return 0.0;}else{return 0.0;}}else{if(delta<-125.0){return 0.0;}else{return 0.0;}}}else{if(delta<-122.0){if(delta<-123.0){return 0.0;}else{return 0.0;}}else{if(delta<-121.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-116.0){if(delta<-118.0){if(delta<-119.0){return 0.0;}else{return 0.0;}}else{if(delta<-117.0){return 0.0;}else{return 0.0;}}}else{if(delta<-114.0){if(delta<-115.0){return 0.0;}else{return 0.0;}}else{if(delta<-113.0){return 0.0;}else{return 0.0;}}}}}else{if(delta<-104.0){if(delta<-108.0){if(delta<-110.0){if(delta<-111.0){return 0.0;}else{return 0.0;}}else{if(delta<-109.0){return 0.0;}else{return 0.0;}}}else{if(delta<-106.0){if(delta<-107.0){return 0.0;}else{return 0.0;}}else{if(delta<-105.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-100.0){if(delta<-102.0){if(delta<-103.0){return 0.0;}else{return 0.0;}}else{if(delta<-101.0){return 0.0;}else{return 0.0;}}}else{if(delta<-98.0){if(delta<-99.0){return 0.0;}else{return 0.0;}}else{if(delta<-97.0){return 0.0;}else{return 0.0;}}}}}}else{if(delta<-80.0){if(delta<-88.0){if(delta<-92.0){if(delta<-94.0){if(delta<-95.0){return 0.0;}else{return 0.0;}}else{if(delta<-93.0){return 0.0;}else{return 0.0;}}}else{if(delta<-90.0){if(delta<-91.0){return 0.0;}else{return 0.0;}}else{if(delta<-89.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-84.0){if(delta<-86.0){if(delta<-87.0){return 0.0;}else{return 0.0;}}else{if(delta<-85.0){return 0.0;}else{return 0.0;}}}else{if(delta<-82.0){if(delta<-83.0){return 0.0;}else{return 0.0;}}else{if(delta<-81.0){return 0.0;}else{return 0.0;}}}}}else{if(delta<-72.0){if(delta<-76.0){if(delta<-78.0){if(delta<-79.0){return 0.0;}else{return 0.0;}}else{if(delta<-77.0){return 0.0;}else{return 0.0;}}}else{if(delta<-74.0){if(delta<-75.0){return 0.0;}else{return 1.0;}}else{if(delta<-73.0){return 1.0;}else{return 1.0;}}}}else{if(delta<-68.0){if(delta<-70.0){if(delta<-71.0){return 1.0;}else{return 1.0;}}else{if(delta<-69.0){return 1.0;}else{return 1.0;}}}else{if(delta<-66.0){if(delta<-67.0){return 2.0;}else{return 2.0;}}else{if(delta<-65.0){return 2.0;}else{return 2.0;}}}}}}}else{if(delta<-32.0){if(delta<-48.0){if(delta<-56.0){if(delta<-60.0){if(delta<-62.0){if(delta<-63.0){return 3.0;}else{return 3.0;}}else{if(delta<-61.0){return 4.0;}else{return 5.0;}}}else{if(delta<-58.0){if(delta<-59.0){return 5.0;}else{return 6.0;}}else{if(delta<-57.0){return 7.0;}else{return 9.0;}}}}else{if(delta<-52.0){if(delta<-54.0){if(delta<-55.0){return 10.0;}else{return 12.0;}}else{if(delta<-53.0){return 14.0;}else{return 16.0;}}}else{if(delta<-50.0){if(delta<-51.0){return 19.0;}else{return 22.0;}}else{if(delta<-49.0){return 26.0;}else{return 30.0;}}}}}else{if(delta<-40.0){if(delta<-44.0){if(delta<-46.0){if(delta<-47.0){return 35.0;}else{return 41.0;}}else{if(delta<-45.0){return 48.0;}else{return 56.0;}}}else{if(delta<-42.0){if(delta<-43.0){return 66.0;}else{return 77.0;}}else{if(delta<-41.0){return 90.0;}else{return 105.0;}}}}else{if(delta<-36.0){if(delta<-38.0){if(delta<-39.0){return 123.0;}else{return 144.0;}}else{if(delta<-37.0){return 169.0;}else{return 197.0;}}}else{if(delta<-34.0){if(delta<-35.0){return 230.0;}else{return 269.0;}}else{if(delta<-33.0){return 315.0;}else{return 368.0;}}}}}}else{if(delta<-16.0){if(delta<-24.0){if(delta<-28.0){if(delta<-30.0){if(delta<-31.0){return 430.0;}else{return 503.0;}}else{if(delta<-29.0){return 587.0;}else{return 686.0;}}}else{if(delta<-26.0){if(delta<-27.0){return 801.0;}else{return 935.0;}}else{if(delta<-25.0){return 1091.0;}else{return 1273.0;}}}}else{if(delta<-20.0){if(delta<-22.0){if(delta<-23.0){return 1484.0;}else{return 1730.0;}}else{if(delta<-21.0){return 2015.0;}else{return 2344.0;}}}else{if(delta<-18.0){if(delta<-19.0){return 2726.0;}else{return 3167.0;}}else{if(delta<-17.0){return 3674.0;}else{return 4258.0;}}}}}else{if(delta<-8.0){if(delta<-12.0){if(delta<-14.0){if(delta<-15.0){return 4927.0;}else{return 5691.0;}}else{if(delta<-13.0){return 6560.0;}else{return 7546.0;}}}else{if(delta<-10.0){if(delta<-11.0){return 8658.0;}else{return 9907.0;}}else{if(delta<-9.0){return 11299.0;}else{return 12842.0;}}}}else{if(delta<-4.0){if(delta<-6.0){if(delta<-7.0){return 14539.0;}else{return 16391.0;}}else{if(delta<-5.0){return 18393.0;}else{return 20538.0;}}}else{if(delta<-2.0){if(delta<-3.0){return 22812.0;}else{return 25197.0;}}else{if(delta<-1.0){return 27669.0;}else{return 30203.0;}}}}}}}}}else{if(delta<128.0){if(delta<64.0){if(delta<32.0){if(delta<16.0){if(delta<8.0){if(delta<4.0){if(delta<2.0){if(delta<1.0){return 32768.0;}else{return 35332.0;}}else{if(delta<3.0){return 37866.0;}else{return 40338.0;}}}else{if(delta<6.0){if(delta<5.0){return 42723.0;}else{return 44997.0;}}else{if(delta<7.0){return 47142.0;}else{return 49144.0;}}}}else{if(delta<12.0){if(delta<10.0){if(delta<9.0){return 50996.0;}else{return 52693.0;}}else{if(delta<11.0){return 54236.0;}else{return 55628.0;}}}else{if(delta<14.0){if(delta<13.0){return 56877.0;}else{return 57989.0;}}else{if(delta<15.0){return 58975.0;}else{return 59844.0;}}}}}else{if(delta<24.0){if(delta<20.0){if(delta<18.0){if(delta<17.0){return 60608.0;}else{return 61277.0;}}else{if(delta<19.0){return 61861.0;}else{return 62368.0;}}}else{if(delta<22.0){if(delta<21.0){return 62809.0;}else{return 63191.0;}}else{if(delta<23.0){return 63520.0;}else{return 63805.0;}}}}else{if(delta<28.0){if(delta<26.0){if(delta<25.0){return 64051.0;}else{return 64262.0;}}else{if(delta<27.0){return 64444.0;}else{return 64600.0;}}}else{if(delta<30.0){if(delta<29.0){return 64734.0;}else{return 64849.0;}}else{if(delta<31.0){return 64948.0;}else{return 65032.0;}}}}}}else{if(delta<48.0){if(delta<40.0){if(delta<36.0){if(delta<34.0){if(delta<33.0){return 65105.0;}else{return 65167.0;}}else{if(delta<35.0){return 65220.0;}else{return 65266.0;}}}else{if(delta<38.0){if(delta<37.0){return 65305.0;}else{return 65338.0;}}else{if(delta<39.0){return 65366.0;}else{return 65391.0;}}}}else{if(delta<44.0){if(delta<42.0){if(delta<41.0){return 65412.0;}else{return 65430.0;}}else{if(delta<43.0){return 65445.0;}else{return 65458.0;}}}else{if(delta<46.0){if(delta<45.0){return 65469.0;}else{return 65479.0;}}else{if(delta<47.0){return 65487.0;}else{return 65494.0;}}}}}else{if(delta<56.0){if(delta<52.0){if(delta<50.0){if(delta<49.0){return 65500.0;}else{return 65505.0;}}else{if(delta<51.0){return 65509.0;}else{return 65513.0;}}}else{if(delta<54.0){if(delta<53.0){return 65516.0;}else{return 65519.0;}}else{if(delta<55.0){return 65521.0;}else{return 65523.0;}}}}else{if(delta<60.0){if(delta<58.0){if(delta<57.0){return 65525.0;}else{return 65526.0;}}else{if(delta<59.0){return 65528.0;}else{return 65529.0;}}}else{if(delta<62.0){if(delta<61.0){return 65530.0;}else{return 65530.0;}}else{if(delta<63.0){return 65531.0;}else{return 65532.0;}}}}}}}else{if(delta<96.0){if(delta<80.0){if(delta<72.0){if(delta<68.0){if(delta<66.0){if(delta<65.0){return 65532.0;}else{return 65533.0;}}else{if(delta<67.0){return 65533.0;}else{return 65533.0;}}}else{if(delta<70.0){if(delta<69.0){return 65533.0;}else{return 65534.0;}}else{if(delta<71.0){return 65534.0;}else{return 65534.0;}}}}else{if(delta<76.0){if(delta<74.0){if(delta<73.0){return 65534.0;}else{return 65534.0;}}else{if(delta<75.0){return 65534.0;}else{return 65534.0;}}}else{if(delta<78.0){if(delta<77.0){return 65535.0;}else{return 65535.0;}}else{if(delta<79.0){return 65535.0;}else{return 65535.0;}}}}}else{if(delta<88.0){if(delta<84.0){if(delta<82.0){if(delta<81.0){return 65535.0;}else{return 65535.0;}}else{if(delta<83.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<86.0){if(delta<85.0){return 65535.0;}else{return 65535.0;}}else{if(delta<87.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<92.0){if(delta<90.0){if(delta<89.0){return 65535.0;}else{return 65535.0;}}else{if(delta<91.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<94.0){if(delta<93.0){return 65535.0;}else{return 65535.0;}}else{if(delta<95.0){return 65535.0;}else{return 65535.0;}}}}}}else{if(delta<112.0){if(delta<104.0){if(delta<100.0){if(delta<98.0){if(delta<97.0){return 65535.0;}else{return 65535.0;}}else{if(delta<99.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<102.0){if(delta<101.0){return 65535.0;}else{return 65535.0;}}else{if(delta<103.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<108.0){if(delta<106.0){if(delta<105.0){return 65535.0;}else{return 65535.0;}}else{if(delta<107.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<110.0){if(delta<109.0){return 65535.0;}else{return 65535.0;}}else{if(delta<111.0){return 65535.0;}else{return 65535.0;}}}}}else{if(delta<120.0){if(delta<116.0){if(delta<114.0){if(delta<113.0){return 65535.0;}else{return 65535.0;}}else{if(delta<115.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<118.0){if(delta<117.0){return 65535.0;}else{return 65535.0;}}else{if(delta<119.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<124.0){if(delta<122.0){if(delta<121.0){return 65535.0;}else{return 65535.0;}}else{if(delta<123.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<126.0){if(delta<125.0){return 65535.0;}else{return 65535.0;}}else{if(delta<127.0){return 65535.0;}else{return 65535.0;}}}}}}}}else{if(delta<192.0){if(delta<160.0){if(delta<144.0){if(delta<136.0){if(delta<132.0){if(delta<130.0){if(delta<129.0){return 65535.0;}else{return 65535.0;}}else{if(delta<131.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<134.0){if(delta<133.0){return 65535.0;}else{return 65535.0;}}else{if(delta<135.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<140.0){if(delta<138.0){if(delta<137.0){return 65535.0;}else{return 65535.0;}}else{if(delta<139.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<142.0){if(delta<141.0){return 65535.0;}else{return 65535.0;}}else{if(delta<143.0){return 65535.0;}else{return 65535.0;}}}}}else{if(delta<152.0){if(delta<148.0){if(delta<146.0){if(delta<145.0){return 65535.0;}else{return 65535.0;}}else{if(delta<147.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<150.0){if(delta<149.0){return 65535.0;}else{return 65535.0;}}else{if(delta<151.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<156.0){if(delta<154.0){if(delta<153.0){return 65535.0;}else{return 65535.0;}}else{if(delta<155.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<158.0){if(delta<157.0){return 65535.0;}else{return 65535.0;}}else{if(delta<159.0){return 65535.0;}else{return 65535.0;}}}}}}else{if(delta<176.0){if(delta<168.0){if(delta<164.0){if(delta<162.0){if(delta<161.0){return 65535.0;}else{return 65535.0;}}else{if(delta<163.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<166.0){if(delta<165.0){return 65535.0;}else{return 65535.0;}}else{if(delta<167.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<172.0){if(delta<170.0){if(delta<169.0){return 65535.0;}else{return 65535.0;}}else{if(delta<171.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<174.0){if(delta<173.0){return 65535.0;}else{return 65535.0;}}else{if(delta<175.0){return 65535.0;}else{return 65535.0;}}}}}else{if(delta<184.0){if(delta<180.0){if(delta<178.0){if(delta<177.0){return 65535.0;}else{return 65535.0;}}else{if(delta<179.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<182.0){if(delta<181.0){return 65535.0;}else{return 65535.0;}}else{if(delta<183.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<188.0){if(delta<186.0){if(delta<185.0){return 65535.0;}else{return 65535.0;}}else{if(delta<187.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<190.0){if(delta<189.0){return 65535.0;}else{return 65535.0;}}else{if(delta<191.0){return 65535.0;}else{return 65535.0;}}}}}}}else{if(delta<224.0){if(delta<208.0){if(delta<200.0){if(delta<196.0){if(delta<194.0){if(delta<193.0){return 65535.0;}else{return 65535.0;}}else{if(delta<195.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<198.0){if(delta<197.0){return 65535.0;}else{return 65535.0;}}else{if(delta<199.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<204.0){if(delta<202.0){if(delta<201.0){return 65535.0;}else{return 65535.0;}}else{if(delta<203.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<206.0){if(delta<205.0){return 65535.0;}else{return 65535.0;}}else{if(delta<207.0){return 65535.0;}else{return 65535.0;}}}}}else{if(delta<216.0){if(delta<212.0){if(delta<210.0){if(delta<209.0){return 65535.0;}else{return 65535.0;}}else{if(delta<211.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<214.0){if(delta<213.0){return 65535.0;}else{return 65535.0;}}else{if(delta<215.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<220.0){if(delta<218.0){if(delta<217.0){return 65535.0;}else{return 65535.0;}}else{if(delta<219.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<222.0){if(delta<221.0){return 65535.0;}else{return 65535.0;}}else{if(delta<223.0){return 65535.0;}else{return 65535.0;}}}}}}else{if(delta<240.0){if(delta<232.0){if(delta<228.0){if(delta<226.0){if(delta<225.0){return 65535.0;}else{return 65535.0;}}else{if(delta<227.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<230.0){if(delta<229.0){return 65535.0;}else{return 65535.0;}}else{if(delta<231.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<236.0){if(delta<234.0){if(delta<233.0){return 65535.0;}else{return 65535.0;}}else{if(delta<235.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<238.0){if(delta<237.0){return 65535.0;}else{return 65535.0;}}else{if(delta<239.0){return 65535.0;}else{return 65535.0;}}}}}else{if(delta<248.0){if(delta<244.0){if(delta<242.0){if(delta<241.0){return 65535.0;}else{return 65535.0;}}else{if(delta<243.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<246.0){if(delta<245.0){return 65535.0;}else{return 65535.0;}}else{if(delta<247.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<252.0){if(delta<250.0){if(delta<249.0){return 65535.0;}else{return 65535.0;}}else{if(delta<251.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<254.0){if(delta<253.0){return 65535.0;}else{return 65535.0;}}else{if(delta<255.0){return 65535.0;}else{return 65535.0;}}}}}}}}}}
vec4 sourceCustom6(float mode,vec4 source,vec4 destination,float opacity,float mask){
 float da=destination.a,sa=sourceRgba8Multiply3(source.a,mask,opacity);
 if(mode>=119.0&&mode<=121.0){float t=sourceRgba8Multiply(source.a,sourceRgba8Multiply(opacity,mask));vec3 c=destination.rgb;if(mode==119.0)c.r=sourceRgba8Blend(source.r,c.r,t);else if(mode==120.0)c.g=sourceRgba8Blend(source.g,c.g,t);else c.b=sourceRgba8Blend(source.b,c.b,t);return vec4(c,da);}
 if(sa==0.0)return destination;
 if(mode==123.0)return vec4(min(vec3(255.0),destination.rgb+vec3(sourceRgba8Multiply(source.r,sa),sourceRgba8Multiply(source.g,sa),sourceRgba8Multiply(source.b,sa))),sa+da-sourceRgba8Multiply(sa,da));
 if(da==255.0)return destination;
 if(mode==122.0){float a=sa+da-sourceRgba8Multiply(sa,da);if(da==0.0)return vec4(source.rgb,a);vec3 premul=vec3(sourceRgba8Multiply(source.r,sa),sourceRgba8Multiply(source.g,sa),sourceRgba8Multiply(source.b,sa));vec3 c=vec3(sourceRgba8Blend(destination.r,premul.r,da),sourceRgba8Blend(destination.g,premul.g,da),sourceRgba8Blend(destination.b,premul.b,da));return vec4(min(vec3(255.0),vec3(sourceRgba8Divide(c.r,a),sourceRgba8Divide(c.g,a),sourceRgba8Divide(c.b,a))),a);}
 float Q=65535.0,dq=da*257.0,sq=sa*257.0,w=sourceGreaterWeight(da-sa),aq=max(dq,sourceHsxRatio(sourceHsxPairAdd(sourceHsxProduct(dq,w),sourceHsxProduct(sq,Q-w)),Q)),a=sourceHsxMulRatio(aq,255.0,Q);
 if(a==0.0)return vec4(destination.rgb,0.0);if(da==0.0)return vec4(source.rgb,a);
 float fake=sourceHsxMulRatio(aq-dq,255.0,Q-dq);vec3 pm=vec3(sourceRgba8Multiply(destination.r,da),sourceRgba8Multiply(destination.g,da),sourceRgba8Multiply(destination.b,da));vec3 c=vec3(sourceRgba8Blend(source.r,pm.r,fake),sourceRgba8Blend(source.g,pm.g,fake),sourceRgba8Blend(source.b,pm.b,fake));return vec4(min(vec3(255.0),vec3(sourceRgba8Divide(c.r,a),sourceRgba8Divide(c.g,a),sourceRgba8Divide(c.b,a))),a);
}
// Defined scalar4 Q65535 browser law; old0..91 untouched; no native libm identity.
float sourceScalar4Cos(float v){if(v<128.0){if(v<64.0){if(v<32.0){if(v<16.0){if(v<8.0){if(v<4.0){if(v<2.0){if(v<1.0){return 65535.0;}else{return 65530.0;}}else{if(v<3.0){return 65515.0;}else{return 65490.0;}}}else{if(v<6.0){if(v<5.0){return 65455.0;}else{return 65411.0;}}else{if(v<7.0){return 65356.0;}else{return 65291.0;}}}}else{if(v<12.0){if(v<10.0){if(v<9.0){return 65217.0;}else{return 65133.0;}}else{if(v<11.0){return 65038.0;}else{return 64934.0;}}}else{if(v<14.0){if(v<13.0){return 64820.0;}else{return 64696.0;}}else{if(v<15.0){return 64563.0;}else{return 64419.0;}}}}}else{if(v<24.0){if(v<20.0){if(v<18.0){if(v<17.0){return 64266.0;}else{return 64103.0;}}else{if(v<19.0){return 63930.0;}else{return 63748.0;}}}else{if(v<22.0){if(v<21.0){return 63556.0;}else{return 63354.0;}}else{if(v<23.0){return 63143.0;}else{return 62922.0;}}}}else{if(v<28.0){if(v<26.0){if(v<25.0){return 62691.0;}else{return 62451.0;}}else{if(v<27.0){return 62202.0;}else{return 61943.0;}}}else{if(v<30.0){if(v<29.0){return 61674.0;}else{return 61397.0;}}else{if(v<31.0){return 61110.0;}else{return 60813.0;}}}}}}else{if(v<48.0){if(v<40.0){if(v<36.0){if(v<34.0){if(v<33.0){return 60508.0;}else{return 60193.0;}}else{if(v<35.0){return 59869.0;}else{return 59536.0;}}}else{if(v<38.0){if(v<37.0){return 59194.0;}else{return 58843.0;}}else{if(v<39.0){return 58483.0;}else{return 58115.0;}}}}else{if(v<44.0){if(v<42.0){if(v<41.0){return 57737.0;}else{return 57351.0;}}else{if(v<43.0){return 56956.0;}else{return 56552.0;}}}else{if(v<46.0){if(v<45.0){return 56140.0;}else{return 55719.0;}}else{if(v<47.0){return 55290.0;}else{return 54852.0;}}}}}else{if(v<56.0){if(v<52.0){if(v<50.0){if(v<49.0){return 54406.0;}else{return 53952.0;}}else{if(v<51.0){return 53489.0;}else{return 53019.0;}}}else{if(v<54.0){if(v<53.0){return 52540.0;}else{return 52054.0;}}else{if(v<55.0){return 51559.0;}else{return 51057.0;}}}}else{if(v<60.0){if(v<58.0){if(v<57.0){return 50547.0;}else{return 50029.0;}}else{if(v<59.0){return 49504.0;}else{return 48971.0;}}}else{if(v<62.0){if(v<61.0){return 48431.0;}else{return 47883.0;}}else{if(v<63.0){return 47328.0;}else{return 46766.0;}}}}}}}else{if(v<96.0){if(v<80.0){if(v<72.0){if(v<68.0){if(v<66.0){if(v<65.0){return 46197.0;}else{return 45621.0;}}else{if(v<67.0){return 45038.0;}else{return 44448.0;}}}else{if(v<70.0){if(v<69.0){return 43851.0;}else{return 43248.0;}}else{if(v<71.0){return 42638.0;}else{return 42022.0;}}}}else{if(v<76.0){if(v<74.0){if(v<73.0){return 41399.0;}else{return 40770.0;}}else{if(v<75.0){return 40135.0;}else{return 39494.0;}}}else{if(v<78.0){if(v<77.0){return 38846.0;}else{return 38193.0;}}else{if(v<79.0){return 37534.0;}else{return 36870.0;}}}}}else{if(v<88.0){if(v<84.0){if(v<82.0){if(v<81.0){return 36199.0;}else{return 35523.0;}}else{if(v<83.0){return 34842.0;}else{return 34156.0;}}}else{if(v<86.0){if(v<85.0){return 33464.0;}else{return 32768.0;}}else{if(v<87.0){return 32066.0;}else{return 31359.0;}}}}else{if(v<92.0){if(v<90.0){if(v<89.0){return 30648.0;}else{return 29932.0;}}else{if(v<91.0){return 29211.0;}else{return 28487.0;}}}else{if(v<94.0){if(v<93.0){return 27757.0;}else{return 27024.0;}}else{if(v<95.0){return 26286.0;}else{return 25545.0;}}}}}}else{if(v<112.0){if(v<104.0){if(v<100.0){if(v<98.0){if(v<97.0){return 24799.0;}else{return 24050.0;}}else{if(v<99.0){return 23297.0;}else{return 22541.0;}}}else{if(v<102.0){if(v<101.0){return 21781.0;}else{return 21018.0;}}else{if(v<103.0){return 20251.0;}else{return 19482.0;}}}}else{if(v<108.0){if(v<106.0){if(v<105.0){return 18710.0;}else{return 17935.0;}}else{if(v<107.0){return 17157.0;}else{return 16376.0;}}}else{if(v<110.0){if(v<109.0){return 15593.0;}else{return 14808.0;}}else{if(v<111.0){return 14020.0;}else{return 13230.0;}}}}}else{if(v<120.0){if(v<116.0){if(v<114.0){if(v<113.0){return 12439.0;}else{return 11645.0;}}else{if(v<115.0){return 10850.0;}else{return 10053.0;}}}else{if(v<118.0){if(v<117.0){return 9254.0;}else{return 8454.0;}}else{if(v<119.0){return 7653.0;}else{return 6850.0;}}}}else{if(v<124.0){if(v<122.0){if(v<121.0){return 6047.0;}else{return 5242.0;}}else{if(v<123.0){return 4437.0;}else{return 3631.0;}}}else{if(v<126.0){if(v<125.0){return 2825.0;}else{return 2018.0;}}else{if(v<127.0){return 1211.0;}else{return 404.0;}}}}}}}}else{if(v<192.0){if(v<160.0){if(v<144.0){if(v<136.0){if(v<132.0){if(v<130.0){if(v<129.0){return -404.0;}else{return -1211.0;}}else{if(v<131.0){return -2018.0;}else{return -2825.0;}}}else{if(v<134.0){if(v<133.0){return -3631.0;}else{return -4437.0;}}else{if(v<135.0){return -5242.0;}else{return -6047.0;}}}}else{if(v<140.0){if(v<138.0){if(v<137.0){return -6850.0;}else{return -7653.0;}}else{if(v<139.0){return -8454.0;}else{return -9254.0;}}}else{if(v<142.0){if(v<141.0){return -10053.0;}else{return -10850.0;}}else{if(v<143.0){return -11645.0;}else{return -12439.0;}}}}}else{if(v<152.0){if(v<148.0){if(v<146.0){if(v<145.0){return -13230.0;}else{return -14020.0;}}else{if(v<147.0){return -14808.0;}else{return -15593.0;}}}else{if(v<150.0){if(v<149.0){return -16376.0;}else{return -17157.0;}}else{if(v<151.0){return -17935.0;}else{return -18710.0;}}}}else{if(v<156.0){if(v<154.0){if(v<153.0){return -19482.0;}else{return -20251.0;}}else{if(v<155.0){return -21018.0;}else{return -21781.0;}}}else{if(v<158.0){if(v<157.0){return -22541.0;}else{return -23297.0;}}else{if(v<159.0){return -24050.0;}else{return -24799.0;}}}}}}else{if(v<176.0){if(v<168.0){if(v<164.0){if(v<162.0){if(v<161.0){return -25545.0;}else{return -26286.0;}}else{if(v<163.0){return -27024.0;}else{return -27757.0;}}}else{if(v<166.0){if(v<165.0){return -28487.0;}else{return -29211.0;}}else{if(v<167.0){return -29932.0;}else{return -30648.0;}}}}else{if(v<172.0){if(v<170.0){if(v<169.0){return -31359.0;}else{return -32066.0;}}else{if(v<171.0){return -32768.0;}else{return -33464.0;}}}else{if(v<174.0){if(v<173.0){return -34156.0;}else{return -34842.0;}}else{if(v<175.0){return -35523.0;}else{return -36199.0;}}}}}else{if(v<184.0){if(v<180.0){if(v<178.0){if(v<177.0){return -36870.0;}else{return -37534.0;}}else{if(v<179.0){return -38193.0;}else{return -38846.0;}}}else{if(v<182.0){if(v<181.0){return -39494.0;}else{return -40135.0;}}else{if(v<183.0){return -40770.0;}else{return -41399.0;}}}}else{if(v<188.0){if(v<186.0){if(v<185.0){return -42022.0;}else{return -42638.0;}}else{if(v<187.0){return -43248.0;}else{return -43851.0;}}}else{if(v<190.0){if(v<189.0){return -44448.0;}else{return -45038.0;}}else{if(v<191.0){return -45621.0;}else{return -46197.0;}}}}}}}else{if(v<224.0){if(v<208.0){if(v<200.0){if(v<196.0){if(v<194.0){if(v<193.0){return -46766.0;}else{return -47328.0;}}else{if(v<195.0){return -47883.0;}else{return -48431.0;}}}else{if(v<198.0){if(v<197.0){return -48971.0;}else{return -49504.0;}}else{if(v<199.0){return -50029.0;}else{return -50547.0;}}}}else{if(v<204.0){if(v<202.0){if(v<201.0){return -51057.0;}else{return -51559.0;}}else{if(v<203.0){return -52054.0;}else{return -52540.0;}}}else{if(v<206.0){if(v<205.0){return -53019.0;}else{return -53489.0;}}else{if(v<207.0){return -53952.0;}else{return -54406.0;}}}}}else{if(v<216.0){if(v<212.0){if(v<210.0){if(v<209.0){return -54852.0;}else{return -55290.0;}}else{if(v<211.0){return -55719.0;}else{return -56140.0;}}}else{if(v<214.0){if(v<213.0){return -56552.0;}else{return -56956.0;}}else{if(v<215.0){return -57351.0;}else{return -57737.0;}}}}else{if(v<220.0){if(v<218.0){if(v<217.0){return -58115.0;}else{return -58483.0;}}else{if(v<219.0){return -58843.0;}else{return -59194.0;}}}else{if(v<222.0){if(v<221.0){return -59536.0;}else{return -59869.0;}}else{if(v<223.0){return -60193.0;}else{return -60508.0;}}}}}}else{if(v<240.0){if(v<232.0){if(v<228.0){if(v<226.0){if(v<225.0){return -60813.0;}else{return -61110.0;}}else{if(v<227.0){return -61397.0;}else{return -61674.0;}}}else{if(v<230.0){if(v<229.0){return -61943.0;}else{return -62202.0;}}else{if(v<231.0){return -62451.0;}else{return -62691.0;}}}}else{if(v<236.0){if(v<234.0){if(v<233.0){return -62922.0;}else{return -63143.0;}}else{if(v<235.0){return -63354.0;}else{return -63556.0;}}}else{if(v<238.0){if(v<237.0){return -63748.0;}else{return -63930.0;}}else{if(v<239.0){return -64103.0;}else{return -64266.0;}}}}}else{if(v<248.0){if(v<244.0){if(v<242.0){if(v<241.0){return -64419.0;}else{return -64563.0;}}else{if(v<243.0){return -64696.0;}else{return -64820.0;}}}else{if(v<246.0){if(v<245.0){return -64934.0;}else{return -65038.0;}}else{if(v<247.0){return -65133.0;}else{return -65217.0;}}}}else{if(v<252.0){if(v<250.0){if(v<249.0){return -65291.0;}else{return -65356.0;}}else{if(v<251.0){return -65411.0;}else{return -65455.0;}}}else{if(v<254.0){if(v<253.0){return -65490.0;}else{return -65515.0;}}else{if(v<255.0){return -65530.0;}else{return -65535.0;}}}}}}}}}
float sourceScalar4FourthRoot(float s,float d){
 float ss=s*s,dd=d*d;vec2 n=sourceHsxPairAdd(sourceHsxProduct(ss,ss),sourceHsxProduct(dd,dd));
 float root=sourceNormalIsqrt(n);return min(255.0,sourceNormalIsqrt(sourceHsxProduct(root,1.0)));
}
float sourceScalar4Interpolation(float s,float d){
 return sourceHsxMulRatio(131070.0-sourceScalar4Cos(s)-sourceScalar4Cos(d),255.0,262140.0);
}
float sourceScalar4Tint(float s,float d){
 float x=s*257.0,y=d*257.0,root=sourceNormalIsqrt(sourceHsxProduct(y,65535.0));
 float sum=min(65535.0,sourceHsxMulRatio(x,65535.0-y,65535.0)+root);
 return sourceHsxMulRatio(sum,255.0,65535.0);
}
vec3 sourceRgba8VectorBlend(float mode,vec3 source,vec3 destination){
 if(mode>=115.0&&mode<=118.0)return sourceNormalQuantized(mode,source,destination);
 if(mode>=63.0&&mode<=91.0)return sourceHsxQuantized(mode,source,destination);
 vec3 a=source/255.0,b=destination/255.0;vec3 weights=vec3(.299,.587,.114);
 float la=dot(a,weights),lb=dot(b,weights);
 if(mode==21.0||mode==22.0)return(mode==21.0?la<lb:la>lb)?source:destination;
 vec3 c=mode==23.0?a:b;
 if(mode!=25.0){vec3 q=mode==23.0?b:a;float sat=max(q.r,max(q.g,q.b))-min(q.r,min(q.g,q.b));float lo=min(c.r,min(c.g,c.b)),hi=max(c.r,max(c.g,c.b));c=hi-lo>0.00000011920928955078125?(c-vec3(lo))*sat/(hi-lo):vec3(0.0);}
 float target=mode==25.0?la:lb;c+=vec3(target-dot(c,weights));
 float l=dot(c,weights),n=min(c.r,min(c.g,c.b)),x=max(c.r,max(c.g,c.b));
 if(n<0.0)c=l<=.00001||l-n<0.00000011920928955078125?vec3(0.0):vec3(l)+(c-vec3(l))*l/(l-n);
 if(x>1.0)c=l>1.0||x-l<0.00000011920928955078125?vec3(1.0):vec3(l)+(c-vec3(l))*(1.0-l)/(x-l);
 return floor(clamp(c,0.0,1.0)*255.0+vec3(.5));
}
vec4 sourceCompositeRgba8(vec4 source, vec4 destination, SourceRgba8CompositeControl control) {
  float da = destination.a;
  if (control.mode == 0.0) {
    float sa = control.hasMask ? sourceRgba8Multiply3(control.mask, source.a, control.opacity)
                              : sourceRgba8Multiply(source.a, control.opacity);
    if (sa == 0.0) return destination;
    float alpha = da + sourceRgba8Multiply(255.0-da, sa);
    float factor = da == 255.0 ? sa : da == 0.0 ? 255.0 : sourceRgba8Divide(sa, alpha);
    return vec4(sourceRgba8Blend(source.r,destination.r,factor),
      sourceRgba8Blend(source.g,destination.g,factor), sourceRgba8Blend(source.b,destination.b,factor), alpha);
  }
  if (control.mode == 2.0) {
    float masked = control.hasMask ? sourceRgba8Multiply(control.mask, source.a) : source.a;
    float sa = sourceRgba8Multiply(masked, control.opacity);
    float full;
    if (control.average > control.opacity) {
      full = control.average > da ? sourceRgba8Blend(control.average, sa, sourceRgba8Divide(da, control.average)) : da;
    } else {
      full = control.opacity > da ? sourceRgba8Blend(control.opacity, da, masked) : da;
    }
    float alpha = control.flowIsOne ? full : sourceRgba8Blend(full, da, control.flow);
    return vec4(da == 0.0 ? source.r : sourceRgba8Blend(source.r,destination.r,sa),
      da == 0.0 ? source.g : sourceRgba8Blend(source.g,destination.g,sa),
      da == 0.0 ? source.b : sourceRgba8Blend(source.b,destination.b,sa), alpha);
  }
  if(control.mode>=119.0&&control.mode<=124.0)return sourceCustom6(control.mode,source,destination,control.opacity,control.mask);
  float sa = sourceRgba8Multiply3(source.a, control.mask, control.opacity);
  if (sa == 0.0) return destination;
  float alpha = sa + da - sourceRgba8Multiply(sa, da);
  if((control.mode>=21.0&&control.mode<=25.0)||(control.mode>=63.0&&control.mode<=91.0)||(control.mode>=115.0&&control.mode<=118.0)){vec3 cf=sourceRgba8VectorBlend(control.mode,source.rgb,destination.rgb);
    vec3 v=vec3(sourceRgba8Wrap(sourceRgba8Multiply3(255.0-sa,da,destination.r)+sourceRgba8Multiply3(255.0-da,sa,source.r)+sourceRgba8Multiply3(da,sa,cf.r)),sourceRgba8Wrap(sourceRgba8Multiply3(255.0-sa,da,destination.g)+sourceRgba8Multiply3(255.0-da,sa,source.g)+sourceRgba8Multiply3(da,sa,cf.g)),sourceRgba8Wrap(sourceRgba8Multiply3(255.0-sa,da,destination.b)+sourceRgba8Multiply3(255.0-da,sa,source.b)+sourceRgba8Multiply3(da,sa,cf.b)));
    return vec4(sourceRgba8Wrap(sourceRgba8Divide(v.r,alpha)),sourceRgba8Wrap(sourceRgba8Divide(v.g,alpha)),sourceRgba8Wrap(sourceRgba8Divide(v.b,alpha)),alpha);}
  return vec4(sourceRgba8GenericScModeChannel(control.mode,source.r,destination.r,sa,da,alpha),
    sourceRgba8GenericScModeChannel(control.mode,source.g,destination.g,sa,da,alpha),
    sourceRgba8GenericScModeChannel(control.mode,source.b,destination.b,sa,da,alpha), alpha);
}
`;

/** Opt-in installed profile only; generic0..6 stays lightweight. */
export const SOURCE_RGBA8_INSTALLED_HSY_WEBGL1_GLSL = SOURCE_RGBA8_INSTALLED_HSY_GLSL + SOURCE_RGBA8_BYTE_CONTROLS_GLSL + SOURCE_RGBA8_BYTE_WRAP_GLSL + /* glsl */ `
vec4 sourceCompositeInstalledHsyRgba8(vec4 source,vec4 destination,SourceRgba8CompositeControl control){
  float da=destination.a;
    float sa = sourceRgba8Multiply3(source.a, control.mask, control.opacity);
    float alpha = sa + da - sourceRgba8Multiply(sa, da);
    if (alpha == 0.0) return vec4(destination.rgb, 0.0);
    vec3 cf = sourceInstalledHsyColor(source.rgb,destination.rgb);
    vec3 p = vec3(sourceRgba8Multiply3(255.0-sa,da,destination.r)+sourceRgba8Multiply3(255.0-da,sa,source.r)+sourceRgba8Multiply3(da,sa,cf.r),
      sourceRgba8Multiply3(255.0-sa,da,destination.g)+sourceRgba8Multiply3(255.0-da,sa,source.g)+sourceRgba8Multiply3(da,sa,cf.g),
      sourceRgba8Multiply3(255.0-sa,da,destination.b)+sourceRgba8Multiply3(255.0-da,sa,source.b)+sourceRgba8Multiply3(da,sa,cf.b));
    return vec4(sourceRgba8Wrap(sourceRgba8Divide(sourceRgba8Wrap(p.r),alpha)),sourceRgba8Wrap(sourceRgba8Divide(sourceRgba8Wrap(p.g),alpha)),sourceRgba8Wrap(sourceRgba8Divide(sourceRgba8Wrap(p.b),alpha)),alpha);
}
`;

/** Functional browser HSY graph. Ordinary highp arithmetic deliberately does
 * not claim installed ARM64 contraction or source CPU byte equality. */
export const SOURCE_RGBA8_BROWSER_HSY_WEBGL1_GLSL = SOURCE_RGBA8_BYTE_CONTROLS_GLSL + SOURCE_RGBA8_BYTE_WRAP_GLSL + /* glsl */ `
float sourceBrowserHsyLum(vec3 c){return dot(c,vec3(0.299,0.587,0.114));}
vec3 sourceBrowserHsyColor(vec3 source,vec3 destination){
 vec3 s=source/255.0;float dl=sourceBrowserHsyLum(destination/255.0);
 vec3 c=s+vec3(dl-sourceBrowserHsyLum(s));
 float l=sourceBrowserHsyLum(c),n=min(c.r,min(c.g,c.b)),x=max(c.r,max(c.g,c.b));
 if(n<0.0){float stretch=l-n;if(l<=0.00001||stretch<0.00000011920928955078125)c=vec3(0.0);else c=vec3(l)+(c-vec3(l))*l/stretch;}
 if(x>1.0){float stretch=x-l;if(l>1.0||stretch<0.00000011920928955078125)c=vec3(1.0);else c=vec3(l)+(c-vec3(l))*(1.0-l)/stretch;}
 return floor(clamp(c,0.0,1.0)*255.0+0.5);
}
vec4 sourceCompositeBrowserHsyRgba8(vec4 source,vec4 destination,SourceRgba8CompositeControl control){
 float da=destination.a,sa=sourceRgba8Multiply3(source.a,control.mask,control.opacity);
 float alpha=sa+da-sourceRgba8Multiply(sa,da);
 if(alpha==0.0)return vec4(destination.rgb,0.0);
 vec3 cf=sourceBrowserHsyColor(source.rgb,destination.rgb);
 vec3 p=vec3(sourceRgba8Multiply3(255.0-sa,da,destination.r)+sourceRgba8Multiply3(255.0-da,sa,source.r)+sourceRgba8Multiply3(da,sa,cf.r),
 sourceRgba8Multiply3(255.0-sa,da,destination.g)+sourceRgba8Multiply3(255.0-da,sa,source.g)+sourceRgba8Multiply3(da,sa,cf.g),
 sourceRgba8Multiply3(255.0-sa,da,destination.b)+sourceRgba8Multiply3(255.0-da,sa,source.b)+sourceRgba8Multiply3(da,sa,cf.b));
 return vec4(sourceRgba8Wrap(sourceRgba8Divide(sourceRgba8Wrap(p.r),alpha)),sourceRgba8Wrap(sourceRgba8Divide(sourceRgba8Wrap(p.g),alpha)),sourceRgba8Wrap(sourceRgba8Divide(sourceRgba8Wrap(p.b),alpha)),alpha);
}
`;
