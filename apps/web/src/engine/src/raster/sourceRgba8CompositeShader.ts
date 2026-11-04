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
uint sourceRgba8SeparableChannel(uint mode, uint sourceByte, uint destinationByte) {
  uint source=sourceByte,destination=destinationByte;
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
  // Closed host-preflight generic SC table; IDs0..6 retain the historical byte graph.
  uint sa = sourceRgba8Multiply3(source.a, control.mask, control.opacity);
  if (sa == 0u) return destination;
  uint alpha = sa + da - sourceRgba8Multiply(sa, da);
  if(control.mode>=21u&&control.mode<=25u){uvec3 cf=uvec3(sourceRgba8VectorBlend(float(control.mode),vec3(source.rgb),vec3(destination.rgb)));
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
