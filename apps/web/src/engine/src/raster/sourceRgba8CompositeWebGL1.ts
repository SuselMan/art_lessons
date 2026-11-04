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
float sourceRgba8Scalar23Round(float value){return floor(clamp(value,0.0,1.0)*255.0+.5);}
float sourceRgba8Scalar23GammaDark(float s,float d){if(d==0.0)return 0.0;if(d==255.0)return 255.0;if(s==0.0)return 0.0;return sourceRgba8Scalar23Round(pow(d/255.0,1.0/(s/255.0)));}
float sourceRgba8Scalar23Interpolation(float s,float d){if(s==0.0&&d==0.0)return 0.0;return sourceRgba8Scalar23Round(.5-.25*cos(3.14159265358979323846*(s/255.0))-.25*cos(3.14159265358979323846*(d/255.0)));}
float sourceRgba8Scalar23Real(float mode,float s,float d){
 float x=s/255.0,y=d/255.0;
 if(mode==92.0)return sourceRgba8Scalar23GammaDark(s,d);
 if(mode==93.0)return d==0.0?0.0:d==255.0?255.0:sourceRgba8Scalar23Round(pow(y,x));
 if(mode==94.0)return 255.0-sourceRgba8Scalar23GammaDark(255.0-s,255.0-d);
 if(mode==95.0)return s==255.0?255.0:sourceRgba8Scalar23Round(pow(y,(1.0-x)*1.039999999));
 // Literal native surrogate1-.999999999999 must not collapse to zero in highp.
 if(mode==96.0)return d==0.0?0.0:sourceRgba8Scalar23Round(1.0-pow(s==255.0?0.0000000000009999778782798785:1.0-x,y*1.039999999));
 if(mode==97.0)return clamp(floor(pow(pow(d,2.3333333333333333)+pow(s,2.3333333333333333),.428571428571434)),0.0,255.0);
 if(mode==98.0)return clamp(floor(pow(pow(d,4.0)+pow(s,4.0),.25)),0.0,255.0);
 if(mode==99.0)return sourceRgba8Scalar23Round(x<.5?1.0-pow(pow(1.0-y,2.875)+pow(1.0-2.0*x,2.875),1.0/2.875):pow(pow(y,2.875)+pow(2.0*x-1.0,2.875),1.0/2.875));
 if(mode==100.0)return sourceRgba8Scalar23Round(pow(y,pow(2.0,2.0*(.5-x))));
 if(mode==102.0)return sourceRgba8Scalar23Round(x*(1.0-y)+sqrt(y));
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
vec3 sourceRgba8VectorBlend(float mode,vec3 source,vec3 destination){
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
  float sa = sourceRgba8Multiply3(source.a, control.mask, control.opacity);
  if (sa == 0.0) return destination;
  float alpha = sa + da - sourceRgba8Multiply(sa, da);
  if((control.mode>=21.0&&control.mode<=25.0)||(control.mode>=63.0&&control.mode<=91.0)){vec3 cf=sourceRgba8VectorBlend(control.mode,source.rgb,destination.rgb);
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
