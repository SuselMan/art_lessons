import type {BrushHatching,BrushSourceContext} from '@grafetto/shared'
/** Request-local hatching composition, ready for a future captured background.
 * This module grants no descriptor admission and supplies no default colour.
 * Inputs are straight encoded RGBA in [0,1]; output is premultiplied RGBA.
 */
export type HatchingRgba = readonly [number,number,number,number]
const unit=(value:number):void=>{if(!Number.isFinite(value)||value<0||value>1)throw new RangeError('Hatching channel/coverage outside unit range')}
const rgba=(value:HatchingRgba):void=>{if(!Array.isArray(value)||value.length!==4)throw new TypeError('Explicit hatching RGBA required');for(const channel of value)unit(channel)}
/** Overlapping opaque line passes cover the same request, never its opacity twice. */
export function hatchingLineUnion(first:number,second=0,third=0):number{
 unit(first);unit(second);unit(third)
 return 1-(1-first)*(1-second)*(1-third)
}
export function hatchingBackgroundRequest(line:HatchingRgba,background:HatchingRgba,lineCoverage:number,shape:number,requestOpacity:number):HatchingRgba{
 rgba(line);rgba(background);unit(lineCoverage);unit(shape);unit(requestOpacity)
 const sourceAlpha=line[3]*lineCoverage,backgroundAlpha=background[3]*(1-sourceAlpha),amount=shape*requestOpacity
 return[(line[0]*sourceAlpha+background[0]*backgroundAlpha)*amount,
  (line[1]*sourceAlpha+background[1]*backgroundAlpha)*amount,
  (line[2]*sourceAlpha+background[2]*backgroundAlpha)*amount,
  (sourceAlpha+backgroundAlpha)*amount]
}
/** Same equation for an existing tip shader; no sampler, uniforms or colour default.
 * Request opacity is deliberately outside background/line composition.
 */
export const HATCHING_BACKGROUND_GLSL=`
float hatchingLineUnion(float first,float second,float third){
 return 1.0-(1.0-first)*(1.0-second)*(1.0-third);
}
vec4 hatchingBackgroundRequest(vec4 line,vec4 background,float lineCoverage,float shape,float requestOpacity){
 float sourceAlpha=line.a*lineCoverage;
 float backgroundAlpha=background.a*(1.0-sourceAlpha);
 vec4 request=vec4(line.rgb*sourceAlpha+background.rgb*backgroundAlpha,sourceAlpha+backgroundAlpha);
 return request*(shape*requestOpacity);
}
`

export type HatchingRgba8=readonly[number,number,number,number]
/** Explicit Grafetto brush-background default. This is NOT document paper or
 * an inferred native KPP colour. UI picker is not provided; the engine API may
 * select a custom value for the next gesture. */
export const DEFAULT_HATCHING_BACKGROUND:HatchingRgba8=Object.freeze([255,255,255,255])
export function captureHatchingBackground(value?:HatchingRgba8):HatchingRgba8 {
  if(value===undefined)return DEFAULT_HATCHING_BACKGROUND
  if(!Array.isArray(value)||value.length!==4||!value.every(channel=>Number.isInteger(channel)&&channel>=0&&channel<=255))throw new RangeError('Explicit hatching background RGBA8 required')
  return Object.freeze([value[0],value[1],value[2],value[3]])
}
/** Negative alpha disables the new path for historical descriptors. Never read
 * receiver UI here: a new opaque descriptor requires the recorded source. */
export function hatchingBackgroundUniform(hatching:Pick<BrushHatching,'opaqueBackground'>,source?:BrushSourceContext):[number,number,number,number] {
  if(!hatching.opaqueBackground)return[0,0,0,-1]
  if(!source?.background)throw new Error('Hatching requires a captured background')
  const rgba=captureHatchingBackground(source.background)
  return[rgba[0]/255,rgba[1]/255,rgba[2]/255,rgba[3]/255]
}
