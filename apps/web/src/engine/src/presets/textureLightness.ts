import{assertTextureGradientWash180Scope}from'@grafetto/shared'
import{assertTextureLightnessWash171Scope}from'@grafetto/shared'
import type{BrushDescriptor}from'@grafetto/shared'
/** Source RGB is opaque in this scope (recorded colour has three channels).
 * RGBA/image/gradient tip sources are excluded rather than alpha-scaled later. */
export type TextureMaterialVariant=false|true|'gradient'
export function textureMaterialVariant(brush:BrushDescriptor):TextureMaterialVariant{
 const kind=textureMaterialKind(brush);return kind==='gradient'?'gradient':kind==='lightness'
}
export function usesTextureLightness(brush:BrushDescriptor):boolean{return textureMaterialKind(brush)==='lightness'}
export function usesTextureGradient(brush:BrushDescriptor):boolean{return textureMaterialKind(brush)==='gradient'}
export function textureMaterialKind(brush:BrushDescriptor):'lightness'|'gradient'|undefined{
 const m=brush.texture?.material
 if(!m)return undefined
 const t=brush.tip,b=brush.behavior
 if((m.kind!=='lightness'&&m.kind!=='gradient')||brush.version<(m.kind==='gradient'?111:108)||brush.texture?.application||brush.texture?.eraseId||!brush.texture?.patternSize||brush.model!=='stamp'||t.kind!=='bitmap'||t.color||t.material||t.animation||t.imageSampling||t.profile||t.autoNoise||t.autoShape||brush.wet||brush.paperInteraction!==0||['mixer','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].some(k=>brush[k as keyof BrushDescriptor]!==undefined)||b?.dual||b?.erase||b?.edgeBleed!==undefined||b?.grain||b?.wetMix||b?.rendering?.blendMode!=='normal'||(b.rendering.accumulation!=='directOver'&&!assertTextureLightnessWash171Scope(brush)&&!assertTextureGradientWash180Scope(brush)))throw Error('Texture Lightness108 requires root static MASK Pixel with opaque RGB source')
 return m.kind
}
/** Bounded upload staging only, never retained/cached as an additional CPU bank. */
export function textureLightnessPixels(gray:Uint8Array,alpha:Uint8Array,width:number,height:number):Uint8Array<ArrayBuffer>{
 const side=Math.sqrt(gray.length)
 if(gray.length!==alpha.length||!Number.isInteger(side)||side<2||side>2048||(side&(side-1))!==0||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>side||height>side)throw Error('Invalid Lightness108 pattern planes')
 for(let y=0;y<side;y++)for(let x=0;x<side;x++)if((x>=width||y>=height)&&(gray[y*side+x]!==0||alpha[y*side+x]!==0))throw Error('Nonzero Lightness108 pattern padding')
 const pixels=new Uint8Array(gray.length*4)
 for(let i=0;i<gray.length;i++){pixels[i*4]=gray[i];pixels[i*4+1]=gray[i];pixels[i*4+2]=gray[i];pixels[i*4+3]=alpha[i]}
 return pixels
}
