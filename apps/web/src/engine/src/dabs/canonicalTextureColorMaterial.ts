import {lightnessMaterialColor} from '../presets/lightnessMaterial'
import {BRUSH_LIGHTNESS_GLSL} from '../raster/brushBehaviorShaders'
export type CanonicalTextureColorRgba=readonly[number,number,number,number]
const byte=(v:number)=>Number.isInteger(v)&&v>=0&&v<=255&&!Object.is(v,-0)
function rgba(v:CanonicalTextureColorRgba):void {if(!Array.isArray(v)||v.length!==4||!v.every(byte))throw new TypeError('Texture color requires RGBA8')}
/** kis_texture_option.cpp applyLightness + native preserve-lightness RGB
 * principle. Pattern alpha is original DATA, never an assumed opaque fallback.
 * Functional browser arithmetic; no native color-space/FMA identity claim. */
export function canonicalTextureLightnessRgba8(paint:CanonicalTextureColorRgba,patternGray:number,patternAlpha:number,strength:number):CanonicalTextureColorRgba {
 rgba(paint)
 if(!byte(patternGray)||!byte(patternAlpha)||!Number.isFinite(strength)||strength<0||strength>1)throw new RangeError('Invalid lightness texture input')
 const color=lightnessMaterialColor([paint[0]/255,paint[1]/255,paint[2]/255],patternGray/255,strength)
 return [Math.floor(color[0]*255+.5),Math.floor(color[1]*255+.5),Math.floor(color[2]*255+.5),Math.min(patternAlpha,paint[3])]
}
/** The source owner captures/bakes the current gradient's variable colors into
 * this 256-entry straight-RGBA8 resource BEFORE admission. This helper neither
 * resolves foreground/background nor synthesizes a gradient. */
export function canonicalTextureGradientRgba8(paint:CanonicalTextureColorRgba,patternGray:number,patternAlpha:number,strengthU8:number,gradient:Uint8Array):CanonicalTextureColorRgba {
 rgba(paint)
 if(!byte(patternGray)||!byte(patternAlpha)||!byte(strengthU8)||!(gradient instanceof Uint8Array)||gradient.length!==1024)throw new RangeError('Invalid captured texture gradient')
 const i=patternGray*4,alpha=Math.min(Math.floor(gradient[i+3]*patternAlpha/255+.5),paint[3])
 const weightedGradient=alpha*strengthU8,weightedPaint=paint[3]*(255-strengthU8),total=weightedGradient+weightedPaint
 if(!total)return [0,0,0,0]
 const half=Math.floor(total/2)
 return [Math.floor((gradient[i]*weightedGradient+paint[0]*weightedPaint+half)/total),Math.floor((gradient[i+1]*weightedGradient+paint[1]*weightedPaint+half)/total),Math.floor((gradient[i+2]*weightedGradient+paint[2]*weightedPaint+half)/total),Math.floor((total+127)/255)]
}
/** Same color-material stage before the existing composition kernel. Gradient
 * sample is one exact captured table cell; no interpolation or live resources.
 * Weights sum255, so all weighted RGB sums + half-divisor remain below2^24. */
export const CANONICAL_TEXTURE_COLOR_MATERIAL_GLSL=`
${BRUSH_LIGHTNESS_GLSL}
highp vec4 canonicalTextureLightness(highp vec4 paint,highp vec2 pattern,highp float strength){
 return vec4(floor(brushMaterialColor(paint.rgb/255.0,pattern.x/255.0,strength)*255.0+0.5),min(pattern.y,paint.a));
}
highp vec4 canonicalTextureGradient(highp vec4 paint,highp vec2 pattern,highp vec4 gradient,highp float strength){
 highp float alpha=min(floor(gradient.a*pattern.y/255.0+0.5),paint.a);
 highp float first=alpha*strength,second=paint.a*(255.0-strength),total=first+second;
 if(total==0.0)return vec4(0.0);
 highp vec3 rgb=floor((gradient.rgb*first+paint.rgb*second+floor(total/2.0))/total);
 return vec4(rgb,floor((total+127.0)/255.0));
}
`;
