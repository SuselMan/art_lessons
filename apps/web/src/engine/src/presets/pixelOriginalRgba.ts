import {brushTipColorPlanes,type BrushDescriptor,type TipMaskId} from '@grafetto/shared'
import type {PreparedBrushImageView} from '../dabs/PreparedBrushImageView'
/** Pixel IMAGESTAMP shares Spray's prepared RGBA plane/cache/epoch lease.
 * This module captures geometry only; it never packs, uploads or caches pixels. */
export function usesPixelOriginalRgba(brush:BrushDescriptor):boolean {
 return brush.model==='stamp'&&!brush.spray&&!!brush.tip.color&&('planes' in brush.tip.color||'gradient' in brush.tip.color)
}
export function usesFilteredPixelGradient(brush:BrushDescriptor):boolean{
 return usesPixelOriginalRgba(brush)&&!!brush.tip.color&&'gradient'in brush.tip.color&&brush.tip.color.gradient.sampling==='filteredGray-v1'
}
export function assertPixelOriginalRgba(brush:BrushDescriptor):void {
 if(!usesPixelOriginalRgba(brush))throw Error('Expected Pixel original RGBA stamp')
 const color=brush.tip.color
 if(!color)throw Error('Expected original RGB planes')
 if('gradient' in color){
  if(color.gradient.sampling!==undefined&&(brush.version<100||color.gradient.sampling!=='filteredGray-v1'))throw Error('Unsupported Pixel gradient sampling policy')
  if(brush.version<97||brush.tip.animation||brush.spray||brush.behavior?.rendering?.accumulation!=='directOver'||brush.behavior.rendering.blendMode!=='normal')throw Error('Unsupported Pixel gradient map combination')
 }else if(brush.tip.animation?color.frames?.length!==brush.tip.animation.frames.length:color.frames!==undefined)throw Error('Pixel original RGBA frame planes differ')
 const b=brush.behavior
 if(brush.version<84||brush.tip.kind!=='bitmap'||brush.tip.profile||brush.tip.autoNoise||brush.tip.autoShape||brush.tip.imageSampling||brush.tip.material||b?.dual||brush.mixer)throw Error('Unsupported Pixel original RGBA combination')
 if(b?.colorAdjustment||b?.edgeBleed||(['hue','saturation','brightness']as const).some(k=>b?.dynamics?.[k]||b?.modulations?.[k]?.length))throw Error('Pixel original RGBA adjustments are not implemented')
}
export interface PixelOriginalRgbaFrame {
 readonly id:TipMaskId
 readonly planes:readonly[string,string,string]
}
/** Bounded metadata inventory, not a texture/pixel cache. The same alpha may
 * appear with different RGB frames; never deduplicate by alpha ID alone. */
export function pixelOriginalRgbaFrames(brush:BrushDescriptor):readonly PixelOriginalRgbaFrame[] {
 assertPixelOriginalRgba(brush)
 const frames=brush.tip.animation?.frames??(brush.tip.mask?[brush.tip.mask]:[])
 if(!frames.length||frames.length>256)throw new RangeError('Invalid Pixel original RGBA frame inventory')
 return Object.freeze(frames.map((id,index)=>{
  const planes=brushTipColorPlanes(brush.tip,index)
  if(!planes||planes.length!==3||planes.some(p=>typeof p!=='string'||!p))throw new RangeError('Missing Pixel original RGB planes')
  return Object.freeze({id,planes:Object.freeze([...planes]as [string,string,string])})
 }))
}
export interface PixelOriginalRgbaView {
 readonly texture:WebGLTexture
 readonly bounds:readonly[number,number,number,number]
 readonly palette?:Readonly<{texture:WebGLTexture;assertCurrent():void}>
 assertCurrent():void
}
/** Caller already holds the common real texture lease. No authority is inferred
 * from a frozen object: the original epoch callback is called before capture,
 * before every use, and after reading potentially owner-controlled metadata. */
export function capturePixelOriginalRgbaView(view:PreparedBrushImageView):PixelOriginalRgbaView {
 const check=view.assertCurrent
 if(typeof check!=='function')throw new TypeError('Expected prepared image owner')
 const assertCurrent=()=>check.call(view)
 assertCurrent()
 const {texture,width,height}=view,c=view.crop
 const palette=view.palette
 if(palette){if(!palette.texture||typeof palette.assertCurrent!=='function')throw Error('Invalid prepared gradient palette');palette.assertCurrent()}
 const x=c.x,y=c.y,w=c.width,h=c.height
 if(!texture||![width,height].every(n=>Number.isSafeInteger(n)&&n>0)||!Number.isSafeInteger(width*height)||![x,y,w,h].every(Number.isFinite)||x<0||y<0||w<1||h<1||x+w>width||y+h>height)throw new RangeError('Invalid Pixel original RGBA crop')
 assertCurrent()
 const bounds=Object.freeze([x/width,y/height,w/width,h/height]as const)
 return Object.freeze({texture,bounds,...(palette?{palette}:{}),assertCurrent:()=>{assertCurrent();palette?.assertCurrent()}})
}
/** Reference for one filtered PREMULTIPLIED sampler value. Foreground colour is
 * intentionally absent. Flow/opacity/texture modify alpha later in the common
 * stamp pipeline, exactly once; transparent hidden RGB never becomes pigment. */
export function pixelOriginalRgbaPigment(sample:readonly[number,number,number,number]):readonly[number,number,number] {
 if(sample.length!==4||sample.some(n=>!Number.isFinite(n)||n<0||n>1)||sample.slice(0,3).some(n=>n>sample[3]))throw new RangeError('Invalid premultiplied Pixel RGBA sample')
 return sample[3]>0?[sample[0]/sample[3],sample[1]/sample[3],sample[2]/sample[3]]:[0,0,0]
}
/** Included only in the existing private stampEffects shader. */
export const PIXEL_ORIGINAL_RGBA_GLSL=`
vec3 brushOriginalRgbaPigment(vec4 sampleValue) {
 return sampleValue.a>0.0?clamp(sampleValue.rgb/sampleValue.a,0.0,1.0):vec3(0.0);
}
`
