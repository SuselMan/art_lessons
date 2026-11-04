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
float sourceRgba8SeparableChannel(float mode, float source, float destination) {
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

vec3 sourceRgba8VectorBlend(float mode,vec3 source,vec3 destination){
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
  if(control.mode>=21.0&&control.mode<=25.0){vec3 cf=sourceRgba8VectorBlend(control.mode,source.rgb,destination.rgb);
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
