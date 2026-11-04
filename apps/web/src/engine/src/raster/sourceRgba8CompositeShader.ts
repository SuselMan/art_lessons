import {SOURCE_RGBA8_QUANTIZED_ATAN_GLSL} from './sourceRgba8QuantizedAtan'
import { SOURCE_RGBA8_INSTALLED_HSY_WEBGL1_GLSL } from './sourceRgba8CompositeWebGL1';
import { SOURCE_RGBA8_COLOR_HSY_ARM64_PROFILE, SOURCE_RGBA8_COLOR_HSY_BROWSER_PROFILE, sourceRgba8CompositeModeId, validateRgba8CompositeControl, type Rgba8CompositeControl } from '../presets/sourceColorRgba8';

/** Host-resolved bytes; no shader float quantization or implicit mask collapse. */
export interface SourceRgba8CompositeBytes {
  readonly mode: number; // Existing0/1/2; generic SC Multiply/Lighten/Dodge/Overlay3..6
  readonly opacity: number;
  readonly mask: number;
  readonly hasMask: boolean;
  readonly flow: number;
  readonly average: number;
  readonly flowIsOne: boolean;
}

/** Same author CPU float32 byte law as sourceColorRgba8; not KoColor's double
 * alpha setter. The caller retains ink alpha and local/outer controls separately.
 */
export function canonicalizeSourceRgba8Control(control: Rgba8CompositeControl): SourceRgba8CompositeBytes {
  const flow = control.flow ?? 1, average = control.averageOpacity ?? control.opacity;
  if (![control.opacity, flow, average].every(v => Number.isFinite(v) && v >= 0 && v <= 1)
    || control.mask !== undefined && (!Number.isInteger(control.mask) || control.mask < 0 || control.mask > 255)) {
    throw new RangeError('Invalid RGBA8 composite controls');
  }
  validateRgba8CompositeControl(control);
  if (control.mode === 'colorHsy') throw new RangeError('Color HSY source-only profile has no GPU mode');
  const mode = sourceRgba8CompositeModeId(control.mode);
  const byte = (v: number) => Math.trunc(Math.fround(Math.fround(Math.fround(v) * 255) + .5));
  return { mode, opacity: byte(control.opacity), mask: control.mask ?? 255,
    hasMask: control.mask !== undefined, flow: byte(flow), average: byte(average),
    flowIsOne: Math.fround(flow) === 1 };
}

/** GLSL ES3 library snippet, no #version/main/precision declarations.
 * Consumer declares highp int; straight byte source/destination and valid
 * canonical controls only. Integer target output first; storage is separate.
 * No production import. GPU execution remains an independent acceptance gate.
 */
export const SOURCE_RGBA8_COMPOSITE_GLSL = SOURCE_RGBA8_QUANTIZED_ATAN_GLSL + /* glsl */ `
struct SourceRgba8CompositeControl {
  uint mode;
  uint opacity;
  uint mask;
  bool hasMask;
  uint flow;
  uint average;
  bool flowIsOne;
};
uint sourceRgba8Multiply(uint a, uint b) {
  uint t = a * b + 128u;
  return ((t >> 8u) + t) >> 8u;
}
uint sourceRgba8Multiply3(uint a, uint b, uint c) {
  uint t = a * b * c + 32603u;
  return ((t >> 7u) + t) >> 16u;
}
uint sourceRgba8Divide(uint a, uint b) {
  return (a * 255u + b / 2u) / b;
}
uint sourceRgba8Blend(uint source, uint destination, uint alpha) {
  int t = (int(source) - int(destination)) * int(alpha) + 128;
  return uint((((t >> 8) + t) >> 8) + int(destination));
}
float sourceRgba8BrowserMultiply(float a,float b){float c=a*b+128.0;return floor((floor(c/256.0)+c)/256.0);}
float sourceRgba8BrowserDivide(float a,float b){return floor((a*255.0+floor(b/2.0))/b);}
uint sourceRgba8QuadraticGlow(uint s,uint d){return d==255u?255u:min(255u,sourceRgba8Divide(sourceRgba8Multiply(s,s),255u-d));}
uint sourceRgba8QuadraticHeat(uint s,uint d){return s==255u?255u:d==0u?0u:255u-min(255u,sourceRgba8Divide(sourceRgba8Multiply(255u-s,255u-s),d));}
uint sourceRgba8QuadraticHeatGlow(uint s,uint d){return s+d>255u?sourceRgba8QuadraticHeat(s,d):s==0u?0u:sourceRgba8QuadraticGlow(s,d);}
uint sourceRgba8QuadraticFreezeReflect(uint s,uint d){return s+d>255u?sourceRgba8QuadraticHeat(d,s):d==0u?0u:sourceRgba8QuadraticGlow(d,s);}
uint sourceRgba8QuadraticGlowHeat(uint s,uint d){return d==255u?255u:s+d>255u?sourceRgba8QuadraticGlow(s,d):sourceRgba8QuadraticHeat(s,d);}
uint sourceRgba8PenumbraB(uint s,uint d){
 if(d==255u)return 255u;
 if(s+d<255u)return min(255u,sourceRgba8Divide(s,255u-d))/2u;
 if(s==0u)return 0u;
 return 255u-min(255u,sourceRgba8Divide(255u-d,s)/2u);
}
uint sourceRgba8PenumbraD(uint s,uint d){return d==255u?255u:uint(sourceRgba8QuantizedAtan(float(s),float(255u-d)));}
float sourceRgba8Scalar23Round(float value){return floor(clamp(value,0.0,1.0)*255.0+.5);}
float sourceRgba8Scalar23GammaDark(float s,float d){if(d==0.0)return 0.0;if(d==255.0)return 255.0;if(s==0.0)return 0.0;return sourceRgba8Scalar23Round(pow(d/255.0,1.0/(s/255.0)));}
float sourceRgba8Scalar23Interpolation(float s,float d){if(s==0.0&&d==0.0)return 0.0;return sourceRgba8Scalar23Round(.5-.25*cos(3.14159265358979323846*(s/255.0))-.25*cos(3.14159265358979323846*(d/255.0)));}
float sourceRgba8Scalar23Real(float mode,float s,float d){
 float x=s/255.0,y=d/255.0;
 if(mode==92.0)return sourceRgba8Scalar23GammaDark(s,d);
 if(mode==93.0)return d==0.0?0.0:d==255.0?255.0:sourceRgba8Scalar23Round(pow(y,x));
 if(mode==94.0)return 255.0-sourceRgba8Scalar23GammaDark(255.0-s,255.0-d);
 if(mode==95.0)return s==255.0?255.0:d==0.0?0.0:sourceRgba8Scalar23Round(pow(y,(1.0-x)*1.039999999));
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
uint sourceRgba8Scalar23DivContinuous(uint s,uint d){if(d==0u||s==0u)return 0u;uint rem=(d-1u)%s+1u,q=(d+s-1u)/s;return sourceRgba8Divide(q%2u==1u?rem:s-rem,s);}
uint sourceRgba8Scalar23Integer(uint mode,uint s,uint d){
 if(mode==101u)return min(255u,sourceRgba8Multiply(d,s+d-sourceRgba8Multiply(s,d))+sourceRgba8Multiply(sourceRgba8Multiply(s,d),255u-d));
 if(mode==106u)return d%(s+1u);
 if(mode==107u)return sourceRgba8Multiply(sourceRgba8Scalar23DivContinuous(s,d),s);
 if(mode==108u){if(d==0u)return 0u;if(s==0u)return d;return sourceRgba8Divide((d-1u)%s+1u,s);}
 if(mode==109u)return sourceRgba8Scalar23DivContinuous(s,d);
 if(mode==110u){if(s==255u&&d==0u)return 0u;uint sum=s+d;return sum==0u?0u:(sum-1u)%255u+1u;}
 if(mode==111u){uint sum=s+d;return sum<=255u?sum:510u-sum;}
 if(mode==112u){if(d==0u)return 0u;if(s==255u)return 255u;return min(255u,s>=127u?d*255u/(2u*(255u-s)):d*2u*s/255u);}
 return 0u;
}
uint sourceRgba8SeparableChannel(uint mode, uint sourceByte, uint destinationByte) {
  uint source=sourceByte,destination=destinationByte;
  if(mode>=92u&&mode<=114u)return mode==101u||(mode>=106u&&mode<=112u)?sourceRgba8Scalar23Integer(mode,source,destination):uint(sourceRgba8Scalar23Real(float(mode),float(source),float(destination)));
  if(mode==53u)return source^destination;
  if(mode==54u)return source|destination;
  if(mode==55u)return source&destination;
  if(mode==56u)return 255u^(source&destination);
  if(mode==57u)return 255u^(source|destination);
  if(mode==58u)return 255u^(source^destination);
  if(mode==59u)return source|(255u^destination);
  if(mode==60u)return (255u^source)&destination;
  if(mode==61u)return (255u^source)|destination;
  if(mode==62u)return source&(255u^destination);

  if(mode==47u)return uint(clamp(3*int(destination)-2*int(255u-source),0,255));
  if(mode==48u)return sourceRgba8PenumbraB(destination,source);
  if(mode==49u)return sourceRgba8PenumbraB(source,destination);
  if(mode==50u)return sourceRgba8PenumbraD(destination,source);
  if(mode==51u)return sourceRgba8PenumbraD(source,destination);
  if(mode==52u)return source==0u?0u:destination>source?sourceRgba8PenumbraB(source,destination):sourceRgba8PenumbraB(destination,source);

  if(mode==38u)return sourceRgba8QuadraticGlow(destination,source);
  if(mode==39u)return sourceRgba8QuadraticGlow(source,destination);
  if(mode==40u)return sourceRgba8QuadraticHeat(destination,source);
  if(mode==41u)return sourceRgba8QuadraticHeat(source,destination);
  if(mode==42u)return sourceRgba8QuadraticGlowHeat(source,destination);
  if(mode==43u)return sourceRgba8QuadraticHeatGlow(source,destination);
  if(mode==44u)return sourceRgba8QuadraticGlowHeat(destination,source);
  if(mode==45u)return sourceRgba8QuadraticFreezeReflect(source,destination);
  if(mode==46u)return (sourceRgba8QuadraticFreezeReflect(source,destination)+sourceRgba8QuadraticHeatGlow(source,destination))*127u/255u;

  if (mode == 3u) return sourceRgba8Multiply(source, destination);
  if (mode == 4u) return max(source, destination);
  if (mode == 5u) return source == 255u ? (destination == 0u ? 0u : 255u)
    : min(255u, sourceRgba8Divide(destination, 255u-source));
  if(mode>=7u){float sx=float(sourceByte),dx=float(destinationByte);
  if(mode==7u)return uint(min(sx,dx));
  if(mode==8u)return uint(sx+dx-sourceRgba8BrowserMultiply(sx,dx));
  if(mode==9u)return uint(dx==255.0?255.0:sx==0.0?0.0:255.0-min(255.0,sourceRgba8BrowserDivide(255.0-dx,sx)));
  if(mode==10u||mode==32u)return uint(max(0.0,sx+dx-255.0));
  if(mode==11u)return uint(max(0.0,dx-sx));
  if(mode==12u||mode==28u)return uint(abs(dx-sx));
  if(mode==13u)return uint(clamp(sx+dx-2.0*sourceRgba8BrowserMultiply(sx,dx),0.0,255.0));
  if(mode==14u)return uint(floor(255.0*(sx>127.5?dx/255.0+(2.0*sx/255.0-1.0)*(sqrt(dx/255.0)-dx/255.0):dx/255.0-(1.0-2.0*sx/255.0)*(dx/255.0)*(1.0-dx/255.0))+.5));
  if(mode==15u)return uint(sx==127.0?dx:sx<127.0?sourceRgba8BrowserMultiply(2.0*sx,dx):(2.0*sx-255.0)+dx-sourceRgba8BrowserMultiply(2.0*sx-255.0,dx));
  if(mode==16u)return uint(dx==0.0?0.0:sx==0.0?255.0:min(255.0,sourceRgba8BrowserDivide(dx,sx)));
  if(mode==17u)return uint(clamp(2.0*sx+dx-255.0,0.0,255.0));
  if(mode==18u)return uint(sx<127.0?(sx==0.0?(dx==255.0?255.0:0.0):max(0.0,255.0-sourceRgba8BrowserDivide(255.0-dx,2.0*sx))):(sx==255.0?(dx==0.0?0.0:255.0):min(255.0,sourceRgba8BrowserDivide(dx,2.0*(255.0-sx)))));
  if(mode==19u)return uint(max(2.0*sx-255.0,min(dx,2.0*sx)));
  if(mode==20u)return dx>127.0?(sx==255.0?(dx==0.0?0u:255u):uint(min(255.0,sourceRgba8BrowserDivide(dx,255.0-sx)))):(dx==255.0?255u:sx==0.0?0u:uint(255.0-min(255.0,sourceRgba8BrowserDivide(255.0-dx,sx))));
  // Append-only IDs28..37; existing controls and GenericSC alpha shell unchanged.
  if(mode==29u)return uint(floor(255.0*abs(sqrt(dx/255.0)-sqrt(sx/255.0))+.5));
  if(mode==30u)return uint(sourceRgba8QuantizedAtan(sx,dx));
  if(mode==31u)return uint(255.0-abs(255.0-sx-dx));
  if(mode==33u)return uint(clamp(sx+dx-127.0,0.0,255.0));
  if(mode==34u)return uint(clamp(dx-sx+127.0,0.0,255.0));
  if(mode==35u)return ((source+destination)*127u)/255u;
  if(mode==36u)return sx==255.0&&dx==255.0?255u:uint(floor(255.0*sqrt((sx/255.0)*(dx/255.0))+.5));
  if(mode==37u){if(source==0u||destination==0u)return 0u;uint s=(65025u+source/2u)/source,d=(65025u+destination/2u)/destination;return min(255u,130050u/(s+d));}
  if(mode==26u)return sx+dx>255.0?255u:0u;
  if(mode==27u){float y=dx/255.0,x=sx/255.0;float d=y>.25?sqrt(y):((16.0*y-12.0)*y+4.0)*y;return uint(floor(255.0*(x>.5?y+(2.0*x-1.0)*(d-y):y-(1.0-2.0*x)*y*(1.0-y))+.5));}
  }
  if (destination == 127u) return source;
  if (destination < 127u) return sourceRgba8Multiply(2u*destination, source);
  uint doubled = 2u*destination-255u;
  return doubled+source-sourceRgba8Multiply(doubled, source);
}
uint sourceRgba8GenericScChannel(uint source, uint destination, uint sa, uint da, uint alpha, uint cf) {
  if (da == 0u) return source;
  if (da == 255u) return sourceRgba8Blend(cf, destination, sa);
  if (sa == 255u) return sourceRgba8Blend(cf, source, da);
  uint premultiplied = (sourceRgba8Multiply3(255u-sa, da, destination)
    + sourceRgba8Multiply3(255u-da, sa, source)
    + sourceRgba8Multiply3(da, sa, cf)) & 255u;
  return sourceRgba8Divide(premultiplied, alpha) & 255u;
}
uint sourceRgba8AddChannel(uint source, uint destination, uint sa, uint da, uint alpha) {
  return sourceRgba8GenericScChannel(source, destination, sa, da, alpha, min(255u, source+destination));
}
uint sourceRgba8GenericScModeChannel(uint mode, uint source, uint destination, uint sa, uint da, uint alpha) {
  uint cf = mode == 1u ? min(255u, source+destination) : sourceRgba8SeparableChannel(mode, source, destination);
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
float sourceRgba8Multiply3Custom(float a,float b,float c){return float(sourceRgba8Multiply3(uint(a),uint(b),uint(c)));}
float sourceRgba8MultiplyCustom(float a,float b){return float(sourceRgba8Multiply(uint(a),uint(b)));}
float sourceRgba8BlendCustom(float a,float b,float c){return float(sourceRgba8Blend(uint(a),uint(b),uint(c)));}
float sourceRgba8DivideCustom(float a,float b){return float(sourceRgba8Divide(uint(a),uint(b)));}
float sourceGreaterWeight(float delta){if(delta<0.0){if(delta<-128.0){if(delta<-192.0){if(delta<-224.0){if(delta<-240.0){if(delta<-248.0){if(delta<-252.0){if(delta<-254.0){return 0.0;}else{if(delta<-253.0){return 0.0;}else{return 0.0;}}}else{if(delta<-250.0){if(delta<-251.0){return 0.0;}else{return 0.0;}}else{if(delta<-249.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-244.0){if(delta<-246.0){if(delta<-247.0){return 0.0;}else{return 0.0;}}else{if(delta<-245.0){return 0.0;}else{return 0.0;}}}else{if(delta<-242.0){if(delta<-243.0){return 0.0;}else{return 0.0;}}else{if(delta<-241.0){return 0.0;}else{return 0.0;}}}}}else{if(delta<-232.0){if(delta<-236.0){if(delta<-238.0){if(delta<-239.0){return 0.0;}else{return 0.0;}}else{if(delta<-237.0){return 0.0;}else{return 0.0;}}}else{if(delta<-234.0){if(delta<-235.0){return 0.0;}else{return 0.0;}}else{if(delta<-233.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-228.0){if(delta<-230.0){if(delta<-231.0){return 0.0;}else{return 0.0;}}else{if(delta<-229.0){return 0.0;}else{return 0.0;}}}else{if(delta<-226.0){if(delta<-227.0){return 0.0;}else{return 0.0;}}else{if(delta<-225.0){return 0.0;}else{return 0.0;}}}}}}else{if(delta<-208.0){if(delta<-216.0){if(delta<-220.0){if(delta<-222.0){if(delta<-223.0){return 0.0;}else{return 0.0;}}else{if(delta<-221.0){return 0.0;}else{return 0.0;}}}else{if(delta<-218.0){if(delta<-219.0){return 0.0;}else{return 0.0;}}else{if(delta<-217.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-212.0){if(delta<-214.0){if(delta<-215.0){return 0.0;}else{return 0.0;}}else{if(delta<-213.0){return 0.0;}else{return 0.0;}}}else{if(delta<-210.0){if(delta<-211.0){return 0.0;}else{return 0.0;}}else{if(delta<-209.0){return 0.0;}else{return 0.0;}}}}}else{if(delta<-200.0){if(delta<-204.0){if(delta<-206.0){if(delta<-207.0){return 0.0;}else{return 0.0;}}else{if(delta<-205.0){return 0.0;}else{return 0.0;}}}else{if(delta<-202.0){if(delta<-203.0){return 0.0;}else{return 0.0;}}else{if(delta<-201.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-196.0){if(delta<-198.0){if(delta<-199.0){return 0.0;}else{return 0.0;}}else{if(delta<-197.0){return 0.0;}else{return 0.0;}}}else{if(delta<-194.0){if(delta<-195.0){return 0.0;}else{return 0.0;}}else{if(delta<-193.0){return 0.0;}else{return 0.0;}}}}}}}else{if(delta<-160.0){if(delta<-176.0){if(delta<-184.0){if(delta<-188.0){if(delta<-190.0){if(delta<-191.0){return 0.0;}else{return 0.0;}}else{if(delta<-189.0){return 0.0;}else{return 0.0;}}}else{if(delta<-186.0){if(delta<-187.0){return 0.0;}else{return 0.0;}}else{if(delta<-185.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-180.0){if(delta<-182.0){if(delta<-183.0){return 0.0;}else{return 0.0;}}else{if(delta<-181.0){return 0.0;}else{return 0.0;}}}else{if(delta<-178.0){if(delta<-179.0){return 0.0;}else{return 0.0;}}else{if(delta<-177.0){return 0.0;}else{return 0.0;}}}}}else{if(delta<-168.0){if(delta<-172.0){if(delta<-174.0){if(delta<-175.0){return 0.0;}else{return 0.0;}}else{if(delta<-173.0){return 0.0;}else{return 0.0;}}}else{if(delta<-170.0){if(delta<-171.0){return 0.0;}else{return 0.0;}}else{if(delta<-169.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-164.0){if(delta<-166.0){if(delta<-167.0){return 0.0;}else{return 0.0;}}else{if(delta<-165.0){return 0.0;}else{return 0.0;}}}else{if(delta<-162.0){if(delta<-163.0){return 0.0;}else{return 0.0;}}else{if(delta<-161.0){return 0.0;}else{return 0.0;}}}}}}else{if(delta<-144.0){if(delta<-152.0){if(delta<-156.0){if(delta<-158.0){if(delta<-159.0){return 0.0;}else{return 0.0;}}else{if(delta<-157.0){return 0.0;}else{return 0.0;}}}else{if(delta<-154.0){if(delta<-155.0){return 0.0;}else{return 0.0;}}else{if(delta<-153.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-148.0){if(delta<-150.0){if(delta<-151.0){return 0.0;}else{return 0.0;}}else{if(delta<-149.0){return 0.0;}else{return 0.0;}}}else{if(delta<-146.0){if(delta<-147.0){return 0.0;}else{return 0.0;}}else{if(delta<-145.0){return 0.0;}else{return 0.0;}}}}}else{if(delta<-136.0){if(delta<-140.0){if(delta<-142.0){if(delta<-143.0){return 0.0;}else{return 0.0;}}else{if(delta<-141.0){return 0.0;}else{return 0.0;}}}else{if(delta<-138.0){if(delta<-139.0){return 0.0;}else{return 0.0;}}else{if(delta<-137.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-132.0){if(delta<-134.0){if(delta<-135.0){return 0.0;}else{return 0.0;}}else{if(delta<-133.0){return 0.0;}else{return 0.0;}}}else{if(delta<-130.0){if(delta<-131.0){return 0.0;}else{return 0.0;}}else{if(delta<-129.0){return 0.0;}else{return 0.0;}}}}}}}}else{if(delta<-64.0){if(delta<-96.0){if(delta<-112.0){if(delta<-120.0){if(delta<-124.0){if(delta<-126.0){if(delta<-127.0){return 0.0;}else{return 0.0;}}else{if(delta<-125.0){return 0.0;}else{return 0.0;}}}else{if(delta<-122.0){if(delta<-123.0){return 0.0;}else{return 0.0;}}else{if(delta<-121.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-116.0){if(delta<-118.0){if(delta<-119.0){return 0.0;}else{return 0.0;}}else{if(delta<-117.0){return 0.0;}else{return 0.0;}}}else{if(delta<-114.0){if(delta<-115.0){return 0.0;}else{return 0.0;}}else{if(delta<-113.0){return 0.0;}else{return 0.0;}}}}}else{if(delta<-104.0){if(delta<-108.0){if(delta<-110.0){if(delta<-111.0){return 0.0;}else{return 0.0;}}else{if(delta<-109.0){return 0.0;}else{return 0.0;}}}else{if(delta<-106.0){if(delta<-107.0){return 0.0;}else{return 0.0;}}else{if(delta<-105.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-100.0){if(delta<-102.0){if(delta<-103.0){return 0.0;}else{return 0.0;}}else{if(delta<-101.0){return 0.0;}else{return 0.0;}}}else{if(delta<-98.0){if(delta<-99.0){return 0.0;}else{return 0.0;}}else{if(delta<-97.0){return 0.0;}else{return 0.0;}}}}}}else{if(delta<-80.0){if(delta<-88.0){if(delta<-92.0){if(delta<-94.0){if(delta<-95.0){return 0.0;}else{return 0.0;}}else{if(delta<-93.0){return 0.0;}else{return 0.0;}}}else{if(delta<-90.0){if(delta<-91.0){return 0.0;}else{return 0.0;}}else{if(delta<-89.0){return 0.0;}else{return 0.0;}}}}else{if(delta<-84.0){if(delta<-86.0){if(delta<-87.0){return 0.0;}else{return 0.0;}}else{if(delta<-85.0){return 0.0;}else{return 0.0;}}}else{if(delta<-82.0){if(delta<-83.0){return 0.0;}else{return 0.0;}}else{if(delta<-81.0){return 0.0;}else{return 0.0;}}}}}else{if(delta<-72.0){if(delta<-76.0){if(delta<-78.0){if(delta<-79.0){return 0.0;}else{return 0.0;}}else{if(delta<-77.0){return 0.0;}else{return 0.0;}}}else{if(delta<-74.0){if(delta<-75.0){return 0.0;}else{return 1.0;}}else{if(delta<-73.0){return 1.0;}else{return 1.0;}}}}else{if(delta<-68.0){if(delta<-70.0){if(delta<-71.0){return 1.0;}else{return 1.0;}}else{if(delta<-69.0){return 1.0;}else{return 1.0;}}}else{if(delta<-66.0){if(delta<-67.0){return 2.0;}else{return 2.0;}}else{if(delta<-65.0){return 2.0;}else{return 2.0;}}}}}}}else{if(delta<-32.0){if(delta<-48.0){if(delta<-56.0){if(delta<-60.0){if(delta<-62.0){if(delta<-63.0){return 3.0;}else{return 3.0;}}else{if(delta<-61.0){return 4.0;}else{return 5.0;}}}else{if(delta<-58.0){if(delta<-59.0){return 5.0;}else{return 6.0;}}else{if(delta<-57.0){return 7.0;}else{return 9.0;}}}}else{if(delta<-52.0){if(delta<-54.0){if(delta<-55.0){return 10.0;}else{return 12.0;}}else{if(delta<-53.0){return 14.0;}else{return 16.0;}}}else{if(delta<-50.0){if(delta<-51.0){return 19.0;}else{return 22.0;}}else{if(delta<-49.0){return 26.0;}else{return 30.0;}}}}}else{if(delta<-40.0){if(delta<-44.0){if(delta<-46.0){if(delta<-47.0){return 35.0;}else{return 41.0;}}else{if(delta<-45.0){return 48.0;}else{return 56.0;}}}else{if(delta<-42.0){if(delta<-43.0){return 66.0;}else{return 77.0;}}else{if(delta<-41.0){return 90.0;}else{return 105.0;}}}}else{if(delta<-36.0){if(delta<-38.0){if(delta<-39.0){return 123.0;}else{return 144.0;}}else{if(delta<-37.0){return 169.0;}else{return 197.0;}}}else{if(delta<-34.0){if(delta<-35.0){return 230.0;}else{return 269.0;}}else{if(delta<-33.0){return 315.0;}else{return 368.0;}}}}}}else{if(delta<-16.0){if(delta<-24.0){if(delta<-28.0){if(delta<-30.0){if(delta<-31.0){return 430.0;}else{return 503.0;}}else{if(delta<-29.0){return 587.0;}else{return 686.0;}}}else{if(delta<-26.0){if(delta<-27.0){return 801.0;}else{return 935.0;}}else{if(delta<-25.0){return 1091.0;}else{return 1273.0;}}}}else{if(delta<-20.0){if(delta<-22.0){if(delta<-23.0){return 1484.0;}else{return 1730.0;}}else{if(delta<-21.0){return 2015.0;}else{return 2344.0;}}}else{if(delta<-18.0){if(delta<-19.0){return 2726.0;}else{return 3167.0;}}else{if(delta<-17.0){return 3674.0;}else{return 4258.0;}}}}}else{if(delta<-8.0){if(delta<-12.0){if(delta<-14.0){if(delta<-15.0){return 4927.0;}else{return 5691.0;}}else{if(delta<-13.0){return 6560.0;}else{return 7546.0;}}}else{if(delta<-10.0){if(delta<-11.0){return 8658.0;}else{return 9907.0;}}else{if(delta<-9.0){return 11299.0;}else{return 12842.0;}}}}else{if(delta<-4.0){if(delta<-6.0){if(delta<-7.0){return 14539.0;}else{return 16391.0;}}else{if(delta<-5.0){return 18393.0;}else{return 20538.0;}}}else{if(delta<-2.0){if(delta<-3.0){return 22812.0;}else{return 25197.0;}}else{if(delta<-1.0){return 27669.0;}else{return 30203.0;}}}}}}}}}else{if(delta<128.0){if(delta<64.0){if(delta<32.0){if(delta<16.0){if(delta<8.0){if(delta<4.0){if(delta<2.0){if(delta<1.0){return 32768.0;}else{return 35332.0;}}else{if(delta<3.0){return 37866.0;}else{return 40338.0;}}}else{if(delta<6.0){if(delta<5.0){return 42723.0;}else{return 44997.0;}}else{if(delta<7.0){return 47142.0;}else{return 49144.0;}}}}else{if(delta<12.0){if(delta<10.0){if(delta<9.0){return 50996.0;}else{return 52693.0;}}else{if(delta<11.0){return 54236.0;}else{return 55628.0;}}}else{if(delta<14.0){if(delta<13.0){return 56877.0;}else{return 57989.0;}}else{if(delta<15.0){return 58975.0;}else{return 59844.0;}}}}}else{if(delta<24.0){if(delta<20.0){if(delta<18.0){if(delta<17.0){return 60608.0;}else{return 61277.0;}}else{if(delta<19.0){return 61861.0;}else{return 62368.0;}}}else{if(delta<22.0){if(delta<21.0){return 62809.0;}else{return 63191.0;}}else{if(delta<23.0){return 63520.0;}else{return 63805.0;}}}}else{if(delta<28.0){if(delta<26.0){if(delta<25.0){return 64051.0;}else{return 64262.0;}}else{if(delta<27.0){return 64444.0;}else{return 64600.0;}}}else{if(delta<30.0){if(delta<29.0){return 64734.0;}else{return 64849.0;}}else{if(delta<31.0){return 64948.0;}else{return 65032.0;}}}}}}else{if(delta<48.0){if(delta<40.0){if(delta<36.0){if(delta<34.0){if(delta<33.0){return 65105.0;}else{return 65167.0;}}else{if(delta<35.0){return 65220.0;}else{return 65266.0;}}}else{if(delta<38.0){if(delta<37.0){return 65305.0;}else{return 65338.0;}}else{if(delta<39.0){return 65366.0;}else{return 65391.0;}}}}else{if(delta<44.0){if(delta<42.0){if(delta<41.0){return 65412.0;}else{return 65430.0;}}else{if(delta<43.0){return 65445.0;}else{return 65458.0;}}}else{if(delta<46.0){if(delta<45.0){return 65469.0;}else{return 65479.0;}}else{if(delta<47.0){return 65487.0;}else{return 65494.0;}}}}}else{if(delta<56.0){if(delta<52.0){if(delta<50.0){if(delta<49.0){return 65500.0;}else{return 65505.0;}}else{if(delta<51.0){return 65509.0;}else{return 65513.0;}}}else{if(delta<54.0){if(delta<53.0){return 65516.0;}else{return 65519.0;}}else{if(delta<55.0){return 65521.0;}else{return 65523.0;}}}}else{if(delta<60.0){if(delta<58.0){if(delta<57.0){return 65525.0;}else{return 65526.0;}}else{if(delta<59.0){return 65528.0;}else{return 65529.0;}}}else{if(delta<62.0){if(delta<61.0){return 65530.0;}else{return 65530.0;}}else{if(delta<63.0){return 65531.0;}else{return 65532.0;}}}}}}}else{if(delta<96.0){if(delta<80.0){if(delta<72.0){if(delta<68.0){if(delta<66.0){if(delta<65.0){return 65532.0;}else{return 65533.0;}}else{if(delta<67.0){return 65533.0;}else{return 65533.0;}}}else{if(delta<70.0){if(delta<69.0){return 65533.0;}else{return 65534.0;}}else{if(delta<71.0){return 65534.0;}else{return 65534.0;}}}}else{if(delta<76.0){if(delta<74.0){if(delta<73.0){return 65534.0;}else{return 65534.0;}}else{if(delta<75.0){return 65534.0;}else{return 65534.0;}}}else{if(delta<78.0){if(delta<77.0){return 65535.0;}else{return 65535.0;}}else{if(delta<79.0){return 65535.0;}else{return 65535.0;}}}}}else{if(delta<88.0){if(delta<84.0){if(delta<82.0){if(delta<81.0){return 65535.0;}else{return 65535.0;}}else{if(delta<83.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<86.0){if(delta<85.0){return 65535.0;}else{return 65535.0;}}else{if(delta<87.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<92.0){if(delta<90.0){if(delta<89.0){return 65535.0;}else{return 65535.0;}}else{if(delta<91.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<94.0){if(delta<93.0){return 65535.0;}else{return 65535.0;}}else{if(delta<95.0){return 65535.0;}else{return 65535.0;}}}}}}else{if(delta<112.0){if(delta<104.0){if(delta<100.0){if(delta<98.0){if(delta<97.0){return 65535.0;}else{return 65535.0;}}else{if(delta<99.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<102.0){if(delta<101.0){return 65535.0;}else{return 65535.0;}}else{if(delta<103.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<108.0){if(delta<106.0){if(delta<105.0){return 65535.0;}else{return 65535.0;}}else{if(delta<107.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<110.0){if(delta<109.0){return 65535.0;}else{return 65535.0;}}else{if(delta<111.0){return 65535.0;}else{return 65535.0;}}}}}else{if(delta<120.0){if(delta<116.0){if(delta<114.0){if(delta<113.0){return 65535.0;}else{return 65535.0;}}else{if(delta<115.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<118.0){if(delta<117.0){return 65535.0;}else{return 65535.0;}}else{if(delta<119.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<124.0){if(delta<122.0){if(delta<121.0){return 65535.0;}else{return 65535.0;}}else{if(delta<123.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<126.0){if(delta<125.0){return 65535.0;}else{return 65535.0;}}else{if(delta<127.0){return 65535.0;}else{return 65535.0;}}}}}}}}else{if(delta<192.0){if(delta<160.0){if(delta<144.0){if(delta<136.0){if(delta<132.0){if(delta<130.0){if(delta<129.0){return 65535.0;}else{return 65535.0;}}else{if(delta<131.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<134.0){if(delta<133.0){return 65535.0;}else{return 65535.0;}}else{if(delta<135.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<140.0){if(delta<138.0){if(delta<137.0){return 65535.0;}else{return 65535.0;}}else{if(delta<139.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<142.0){if(delta<141.0){return 65535.0;}else{return 65535.0;}}else{if(delta<143.0){return 65535.0;}else{return 65535.0;}}}}}else{if(delta<152.0){if(delta<148.0){if(delta<146.0){if(delta<145.0){return 65535.0;}else{return 65535.0;}}else{if(delta<147.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<150.0){if(delta<149.0){return 65535.0;}else{return 65535.0;}}else{if(delta<151.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<156.0){if(delta<154.0){if(delta<153.0){return 65535.0;}else{return 65535.0;}}else{if(delta<155.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<158.0){if(delta<157.0){return 65535.0;}else{return 65535.0;}}else{if(delta<159.0){return 65535.0;}else{return 65535.0;}}}}}}else{if(delta<176.0){if(delta<168.0){if(delta<164.0){if(delta<162.0){if(delta<161.0){return 65535.0;}else{return 65535.0;}}else{if(delta<163.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<166.0){if(delta<165.0){return 65535.0;}else{return 65535.0;}}else{if(delta<167.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<172.0){if(delta<170.0){if(delta<169.0){return 65535.0;}else{return 65535.0;}}else{if(delta<171.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<174.0){if(delta<173.0){return 65535.0;}else{return 65535.0;}}else{if(delta<175.0){return 65535.0;}else{return 65535.0;}}}}}else{if(delta<184.0){if(delta<180.0){if(delta<178.0){if(delta<177.0){return 65535.0;}else{return 65535.0;}}else{if(delta<179.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<182.0){if(delta<181.0){return 65535.0;}else{return 65535.0;}}else{if(delta<183.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<188.0){if(delta<186.0){if(delta<185.0){return 65535.0;}else{return 65535.0;}}else{if(delta<187.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<190.0){if(delta<189.0){return 65535.0;}else{return 65535.0;}}else{if(delta<191.0){return 65535.0;}else{return 65535.0;}}}}}}}else{if(delta<224.0){if(delta<208.0){if(delta<200.0){if(delta<196.0){if(delta<194.0){if(delta<193.0){return 65535.0;}else{return 65535.0;}}else{if(delta<195.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<198.0){if(delta<197.0){return 65535.0;}else{return 65535.0;}}else{if(delta<199.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<204.0){if(delta<202.0){if(delta<201.0){return 65535.0;}else{return 65535.0;}}else{if(delta<203.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<206.0){if(delta<205.0){return 65535.0;}else{return 65535.0;}}else{if(delta<207.0){return 65535.0;}else{return 65535.0;}}}}}else{if(delta<216.0){if(delta<212.0){if(delta<210.0){if(delta<209.0){return 65535.0;}else{return 65535.0;}}else{if(delta<211.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<214.0){if(delta<213.0){return 65535.0;}else{return 65535.0;}}else{if(delta<215.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<220.0){if(delta<218.0){if(delta<217.0){return 65535.0;}else{return 65535.0;}}else{if(delta<219.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<222.0){if(delta<221.0){return 65535.0;}else{return 65535.0;}}else{if(delta<223.0){return 65535.0;}else{return 65535.0;}}}}}}else{if(delta<240.0){if(delta<232.0){if(delta<228.0){if(delta<226.0){if(delta<225.0){return 65535.0;}else{return 65535.0;}}else{if(delta<227.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<230.0){if(delta<229.0){return 65535.0;}else{return 65535.0;}}else{if(delta<231.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<236.0){if(delta<234.0){if(delta<233.0){return 65535.0;}else{return 65535.0;}}else{if(delta<235.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<238.0){if(delta<237.0){return 65535.0;}else{return 65535.0;}}else{if(delta<239.0){return 65535.0;}else{return 65535.0;}}}}}else{if(delta<248.0){if(delta<244.0){if(delta<242.0){if(delta<241.0){return 65535.0;}else{return 65535.0;}}else{if(delta<243.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<246.0){if(delta<245.0){return 65535.0;}else{return 65535.0;}}else{if(delta<247.0){return 65535.0;}else{return 65535.0;}}}}else{if(delta<252.0){if(delta<250.0){if(delta<249.0){return 65535.0;}else{return 65535.0;}}else{if(delta<251.0){return 65535.0;}else{return 65535.0;}}}else{if(delta<254.0){if(delta<253.0){return 65535.0;}else{return 65535.0;}}else{if(delta<255.0){return 65535.0;}else{return 65535.0;}}}}}}}}}}
vec4 sourceCustom6(float mode,vec4 source,vec4 destination,float opacity,float mask){
 float da=destination.a,sa=sourceRgba8Multiply3Custom(source.a,mask,opacity);
 if(mode>=119.0&&mode<=121.0){float t=sourceRgba8MultiplyCustom(source.a,sourceRgba8MultiplyCustom(opacity,mask));vec3 c=destination.rgb;if(mode==119.0)c.r=sourceRgba8BlendCustom(source.r,c.r,t);else if(mode==120.0)c.g=sourceRgba8BlendCustom(source.g,c.g,t);else c.b=sourceRgba8BlendCustom(source.b,c.b,t);return vec4(c,da);}
 if(sa==0.0)return destination;
 if(mode==123.0)return vec4(min(vec3(255.0),destination.rgb+vec3(sourceRgba8MultiplyCustom(source.r,sa),sourceRgba8MultiplyCustom(source.g,sa),sourceRgba8MultiplyCustom(source.b,sa))),sa+da-sourceRgba8MultiplyCustom(sa,da));
 if(da==255.0)return destination;
 if(mode==122.0){float a=sa+da-sourceRgba8MultiplyCustom(sa,da);if(da==0.0)return vec4(source.rgb,a);vec3 premul=vec3(sourceRgba8MultiplyCustom(source.r,sa),sourceRgba8MultiplyCustom(source.g,sa),sourceRgba8MultiplyCustom(source.b,sa));vec3 c=vec3(sourceRgba8BlendCustom(destination.r,premul.r,da),sourceRgba8BlendCustom(destination.g,premul.g,da),sourceRgba8BlendCustom(destination.b,premul.b,da));return vec4(min(vec3(255.0),vec3(sourceRgba8DivideCustom(c.r,a),sourceRgba8DivideCustom(c.g,a),sourceRgba8DivideCustom(c.b,a))),a);}
 float Q=65535.0,dq=da*257.0,sq=sa*257.0,w=sourceGreaterWeight(da-sa),aq=max(dq,sourceHsxRatio(sourceHsxPairAdd(sourceHsxProduct(dq,w),sourceHsxProduct(sq,Q-w)),Q)),a=sourceHsxMulRatio(aq,255.0,Q);
 if(a==0.0)return vec4(destination.rgb,0.0);if(da==0.0)return vec4(source.rgb,a);
 float fake=sourceHsxMulRatio(aq-dq,255.0,Q-dq);vec3 pm=vec3(sourceRgba8MultiplyCustom(destination.r,da),sourceRgba8MultiplyCustom(destination.g,da),sourceRgba8MultiplyCustom(destination.b,da));vec3 c=vec3(sourceRgba8BlendCustom(source.r,pm.r,fake),sourceRgba8BlendCustom(source.g,pm.g,fake),sourceRgba8BlendCustom(source.b,pm.b,fake));return vec4(min(vec3(255.0),vec3(sourceRgba8DivideCustom(c.r,a),sourceRgba8DivideCustom(c.g,a),sourceRgba8DivideCustom(c.b,a))),a);
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
uvec4 sourceCompositeRgba8(uvec4 source, uvec4 destination, SourceRgba8CompositeControl control) {
  uint da = destination.a;
  if (control.mode == 0u) {
    uint sa = control.hasMask ? sourceRgba8Multiply3(control.mask, source.a, control.opacity)
      : sourceRgba8Multiply(source.a, control.opacity);
    if (sa == 0u) return destination;
    uint alpha = da + sourceRgba8Multiply(255u-da, sa);
    uint factor = da == 255u ? sa : da == 0u ? 255u : sourceRgba8Divide(sa, alpha);
    return uvec4(sourceRgba8Blend(source.r,destination.r,factor),
      sourceRgba8Blend(source.g,destination.g,factor), sourceRgba8Blend(source.b,destination.b,factor), alpha);
  }
  if (control.mode == 2u) {
    uint masked = control.hasMask ? sourceRgba8Multiply(control.mask, source.a) : source.a;
    uint sa = sourceRgba8Multiply(masked, control.opacity);
    uint full;
    if (control.average > control.opacity) {
      full = control.average > da ? sourceRgba8Blend(control.average, sa, sourceRgba8Divide(da, control.average)) : da;
    } else {
      full = control.opacity > da ? sourceRgba8Blend(control.opacity, da, masked) : da;
    }
    uint alpha = control.flowIsOne ? full : sourceRgba8Blend(full, da, control.flow);
    return uvec4(da == 0u ? source.r : sourceRgba8Blend(source.r,destination.r,sa),
      da == 0u ? source.g : sourceRgba8Blend(source.g,destination.g,sa),
      da == 0u ? source.b : sourceRgba8Blend(source.b,destination.b,sa), alpha);
  }
  if(control.mode>=119u&&control.mode<=124u)return uvec4(sourceCustom6(float(control.mode),vec4(source),vec4(destination),float(control.opacity),float(control.mask)));
  // Closed host-preflight generic SC table; IDs0..6 retain the historical byte graph.
  uint sa = sourceRgba8Multiply3(source.a, control.mask, control.opacity);
  if (sa == 0u) return destination;
  uint alpha = sa + da - sourceRgba8Multiply(sa, da);
  if((control.mode>=21u&&control.mode<=25u)||(control.mode>=63u&&control.mode<=91u)||(control.mode>=115u&&control.mode<=118u)){uvec3 cf=uvec3(sourceRgba8VectorBlend(float(control.mode),vec3(source.rgb),vec3(destination.rgb)));
    uvec3 v=(uvec3(sourceRgba8Multiply3(255u-sa,da,destination.r),sourceRgba8Multiply3(255u-sa,da,destination.g),sourceRgba8Multiply3(255u-sa,da,destination.b))+uvec3(sourceRgba8Multiply3(255u-da,sa,source.r),sourceRgba8Multiply3(255u-da,sa,source.g),sourceRgba8Multiply3(255u-da,sa,source.b))+uvec3(sourceRgba8Multiply3(da,sa,cf.r),sourceRgba8Multiply3(da,sa,cf.g),sourceRgba8Multiply3(da,sa,cf.b)))&uvec3(255u);
    return uvec4(sourceRgba8Divide(v.r,alpha)&255u,sourceRgba8Divide(v.g,alpha)&255u,sourceRgba8Divide(v.b,alpha)&255u,alpha);}
  return uvec4(sourceRgba8GenericScModeChannel(control.mode,source.r,destination.r,sa,da,alpha),
    sourceRgba8GenericScModeChannel(control.mode,source.g,destination.g,sa,da,alpha),
    sourceRgba8GenericScModeChannel(control.mode,source.b,destination.b,sa,da,alpha), alpha);
}
`;

/** Isolated portable float32 point operator. It does not implement hardware
 * reciprocal estimates or packet-wide SIMD shortcuts of Krita's factory.
 * Source/destination are straight bytes; opacity stays float32 at this stage.
 * Caller declares highp float/int; output belongs in an integer byte target.
 */
export const SOURCE_RGBA8_PORTABLE_OVER_GLSL = /* glsl */ `
uvec4 sourcePortableF32Over(uvec4 source, uvec4 destination, float opacity, uint mask, bool hasMask) {
  float reciprocalByte = uintBitsToFloat(0x3b808081u);
  float sourceAlpha = float(source.a) * opacity;
  if (hasMask) {
    float maskFactor = float(mask) * reciprocalByte;
    sourceAlpha = sourceAlpha * maskFactor;
  }
  if (sourceAlpha == 0.0) return destination;
  float alpha = float(destination.a);
  float factor;
  if (destination.a == 255u) factor = sourceAlpha * reciprocalByte;
  else if (destination.a == 0u) { alpha = sourceAlpha; factor = 1.0; }
  else {
    float remaining = 255.0 - alpha;
    float dose = remaining * sourceAlpha;
    float normalized = dose * reciprocalByte;
    alpha = alpha + normalized;
    factor = sourceAlpha / alpha;
  }
  uvec3 rgb;
  if (factor == 1.0) rgb = source.rgb;
  else if (factor == 0.0) rgb = destination.rgb;
  else {
    vec3 difference = vec3(source.rgb) - vec3(destination.rgb);
    vec3 product = difference * factor;
    vec3 value = product + vec3(destination.rgb);
    rgb = uvec3(roundEven(value));
  }
  return uvec4(rgb, uint(roundEven(alpha)));
}
`;

/** Deliberate profile specialization; never accepted by the generic shader. */
export interface SourceInstalledHsyCompositeBytes extends Omit<SourceRgba8CompositeBytes, 'mode'> { readonly mode: 7; readonly stageLimit: 12 }
export function canonicalizeSourceInstalledHsyControl(control: Extract<Rgba8CompositeControl, {mode:'colorHsy'}> & {readonly profile: typeof SOURCE_RGBA8_COLOR_HSY_ARM64_PROFILE}): SourceInstalledHsyCompositeBytes {
  validateRgba8CompositeControl(control);
  if(control.mode!=='colorHsy'||control.profile!==SOURCE_RGBA8_COLOR_HSY_ARM64_PROFILE)throw new RangeError('Expected installed ARM64 HSY profile');
  const { opacity,mask,flow,averageOpacity }=control;
  return {...canonicalizeSourceRgba8Control({mode:'add',opacity,mask,flow,averageOpacity}),mode:7,stageLimit:12};
}
/** GLSL300-compatible float-byte specialization: exact integers stay <2^24.
 * Its float control is deliberately separate from generic WebGL2 uint0..6. */
export const SOURCE_RGBA8_INSTALLED_HSY_WEBGL2_GLSL = SOURCE_RGBA8_INSTALLED_HSY_WEBGL1_GLSL.replace('for(int stage=0;stage<12;stage++)', 'for(int stage=0;stage<sourceHsyStageLimit;stage++)');

/** Browser law has explicit controls and no installed stage-limit contract. */
export function canonicalizeSourceBrowserHsyControl(control:Extract<Rgba8CompositeControl,{mode:'colorHsy'}>&{readonly profile:typeof SOURCE_RGBA8_COLOR_HSY_BROWSER_PROFILE}):SourceRgba8CompositeBytes {
 validateRgba8CompositeControl(control);
 if(control.mode!=='colorHsy'||control.profile!==SOURCE_RGBA8_COLOR_HSY_BROWSER_PROFILE)throw new RangeError('Expected functional browser HSY profile');
 return canonicalizeSourceRgba8Control({mode:'add',opacity:control.opacity,mask:control.mask,flow:control.flow,averageOpacity:control.averageOpacity});
}
