import {scaleIntegerImageSampledU8,INTEGER_IMAGE_STREAM_QUANTUM} from '../raster/integerImageScale'
import type { BrushTip, TipMaskId } from '@grafetto/shared'
import { assertNativeImageSourceSize, selectNativeImageLevel, type NativeImageLevelSelection } from '../raster/nativeImageLevel'
import { sourcePngPyramid, sourcePngSelectLevel } from '../presets/sourcePngPyramid'
import type { WorldRect } from '../buffers/tileMath'

type SourceRect = NonNullable<BrushTip['imageSampling']>['sourceRect']
export interface NativeImageResource extends NativeImageLevelSelection {
  key: string
  id: TipMaskId
  rect: SourceRect
  width: number
  height: number
  bounds: { x: number; y: number; width: number; height: number }
}
const banks = new WeakMap<BrushTip, Map<TipMaskId, readonly NativeImageResource[]>>()

/** Finite metadata only. The complete reachable bank is budgeted before any
 * derivative allocation/upload; no requested size is needed for readiness. */
export function nativeImageBank(id: TipMaskId, tip: BrushTip): readonly NativeImageResource[] {
  const policy = tip.imageSampling
  if (!policy) return []
  let byFrame = banks.get(tip)
  if (!byFrame) { byFrame = new Map(); banks.set(tip, byFrame) }
  const cached = byFrame.get(id)
  if (cached) return cached
  const result = nativeImageBankFromRect(id, policy.sourceRect)
  byFrame.set(id, result)
  return result
}

/** Finite data-only rectangle planner. No descriptor/source authority or cache. */
export function nativeImageBankFromRect(id: TipMaskId, sourceRect: SourceRect): readonly NativeImageResource[] {
  const rect = Object.freeze({x: sourceRect.x, y: sourceRect.y, width: sourceRect.width, height: sourceRect.height})
  if (!Number.isSafeInteger(rect.x) || !Number.isSafeInteger(rect.y) || rect.x < 0 || rect.y < 0) throw new RangeError('Invalid native source rectangle')
  const longest = Math.max(rect.width, rect.height)
  assertNativeImageSourceSize(rect)
  const result = sourcePngPyramid(rect.width, rect.height).levels.map((level): NativeImageResource => {
    const selected = { scale: level.scale, nativeWidth: level.width, nativeHeight: level.height }
    const width = level.storedWidth, height = level.storedHeight
    const spanX = longest / rect.width * selected.nativeWidth
    const spanY = longest / rect.height * selected.nativeHeight
    return {
      ...selected, id, rect, width, height,
      key: `t:integer-pyramid:inverse-gray:${id}:${rect.x},${rect.y},${rect.width},${rect.height}:${selected.scale}`,
      bounds: { x: (1 + (selected.nativeWidth - spanX) / 2) / width,
        y: (1 + (selected.nativeHeight - spanY) / 2) / height, width: spanX / width, height: spanY / height },
    }
  })
  return result
}

export function nativeImageResource(id: TipMaskId, tip: BrushTip, physicalExtentX: number): NativeImageResource | undefined {
  if (!tip.imageSampling) return undefined
  if (!Number.isFinite(physicalExtentX) || physicalExtentX <= 0) throw new RangeError('Invalid physical image extent')
  const rect = tip.imageSampling.sourceRect
  const requested = physicalExtentX / Math.max(rect.width, rect.height)
  const bank = nativeImageBank(id, tip)
  return bank[sourcePngSelectLevel({ levels: bank }, requested)]
}

export function nativeImagePixels(resource:NativeImageResource,original:Uint8Array):Uint8Array{
 const side=Math.sqrt(original.length),rect=resource.rect
 if(!Number.isInteger(side)||!Number.isInteger(rect.x)||!Number.isInteger(rect.y)||rect.x<0||rect.y<0||rect.x+rect.width>side||rect.y+rect.height>side)throw Error('Native image source rectangle exceeds its asset')
 const selected=selectNativeImageLevel(rect,Math.max(rect.width,rect.height)*resource.scale)
 if(resource.width!==selected.nativeWidth+2||resource.height!==selected.nativeHeight+2)throw Error('Native image resource dimensions changed')
 const pixels=new Uint8Array(resource.width*resource.height)
 drainNativeImageSteps(scaleIntegerImageSampledU8(rect,{width:selected.nativeWidth,height:selected.nativeHeight},(x,y)=>255-original[(rect.y+y)*side+rect.x+x],'simd',(x,y,value)=>{pixels[(y+1)*resource.width+x+1]=255-value}))
 return pixels
}
export function nativeImageMaterialPixels(resource:NativeImageResource,alpha:Uint8Array,channels:readonly Uint8Array[]):Uint8Array{
 return drainNativeImageSteps(nativeImageRgbaSteps(resource,alpha,channels))
}
function drainNativeImageSteps(steps:Generator<void,Uint8Array,void>):Uint8Array{
 let finished=false
 try{while(true){const next=steps.next();if(next.done){finished=true;return next.value}}}
 finally{if(!finished)steps.return(new Uint8Array(0))}
}

/** Native mask allocation clips to its outward-aligned transformed original
 * extent, not the nominal square profile quad. Coordinates are world top-down. */
export function nativeImageDomain(tip: BrushTip, x: number, y: number, radiusX: number, radiusY: number, angle: number): WorldRect {
  const rect = tip.imageSampling?.sourceRect
  if (!rect) throw Error('Native image domain requires its source rectangle')
  const longest = Math.max(rect.width, rect.height)
  const width = 2 * radiusX * rect.width / longest, height = 2 * radiusY * rect.height / longest
  const c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle))
  const axis = (center: number, extent: number) => {
    const left = center - Math.max(1, extent) / 2
    const whole = Math.floor(left)
    let start = left - whole, span = extent
    if (start < 1e-6) { span += start; start = 0 }
    const rounded = Math.floor(span + .5)
    if (Math.abs(span - rounded) < 1e-6) span = rounded
    return [whole, whole + Math.max(1, Math.ceil(start + span))] as const
  }
  const [minX, maxX] = axis(x, c * width + s * height)
  const [minY, maxY] = axis(y, s * width + c * height)
  return { minX, minY, maxX, maxY }
}

export function nativeImageDomainUniform(domain: WorldRect, originX: number, originY: number, tileHeight: number): [number, number, number, number] {
  return [domain.minX - originX, tileHeight - (domain.maxY - originY), domain.maxX - originX, tileHeight - (domain.minY - originY)]
}

/** Hotspot is clamped in WORLD axes; the transformed source itself is not.
 * Return a texture-coordinate translation after the tip's inverse rotation. */
export function nativeImageUVShift(resource: NativeImageResource, radiusX: number, radiusY: number, angle: number, flipX = 1, flipY = 1): [number, number] {
  const { width, height } = resource.rect
  const longest = Math.max(width, height)
  const c = Math.cos(angle), s = Math.sin(angle)
  const w = 2 * radiusX * width / longest, h = 2 * radiusY * height / longest
  const bx = Math.abs(c) * w + Math.abs(s) * h
  const by = Math.abs(s) * w + Math.abs(c) * h
  const dx = (bx - Math.max(1, bx)) / 2, dy = (by - Math.max(1, by)) / 2
  return [-(c * dx + s * dy) / radiusX * .5 * resource.bounds.width * flipX || 0,
    -(-s * dx + c * dy) / radiusY * .5 * resource.bounds.height * flipY || 0]
}


/** Honest peak for sampled integer generation: two scalar destination planes,
 * final RGBA destination, and existing conservative axis metadata. Immutable
 * original CAS storage is retained/charged separately by the root caller. */
export function nativeImageStreamingTransientBytes(resource:NativeImageResource,paired=false):number{
 const b=resource.width*resource.height
 return (paired?6:4)*b+8192
}
/** Serial alpha and premultiplied channels; identical old integer arithmetic,
 * with raw original crop views and no full-size cropped/brightness/PM copies. */
export function* nativeImageRgbaSteps(resource:NativeImageResource,original:Uint8Array,
 channels?:readonly Uint8Array[]):Generator<void,Uint8Array,void>{
 const side=Math.sqrt(original.length),r=resource.rect
 assertNativeImageSourceSize(r)
 if(!Number.isSafeInteger(side)||!Number.isSafeInteger(r.x)||!Number.isSafeInteger(r.y)||r.x<0||r.y<0
  ||r.x+r.width>side||r.y+r.height>side||channels&&(channels.length!==1&&channels.length!==3||channels.some(p=>!(p instanceof Uint8Array)||p.length!==original.length)))throw new RangeError('Streaming image original layout changed')
 const selected=selectNativeImageLevel(r,Math.max(r.width,r.height)*resource.scale)
 if(selected.nativeWidth!==resource.nativeWidth||selected.nativeHeight!==resource.nativeHeight||resource.width!==selected.nativeWidth+2||resource.height!==selected.nativeHeight+2)throw new RangeError('Streaming image level metadata changed')
 const size={width:resource.nativeWidth,height:resource.nativeHeight},read=(x:number,y:number)=>original[(r.y+y)*side+r.x+x]
 const rgba=new Uint8Array(resource.width*resource.height*4)
 if(!channels){
  yield* scaleIntegerImageSampledU8(r,size,(x,y)=>255-read(x,y),'simd',(x,y,value)=>{const at=((y+1)*resource.width+x+1)*4;rgba[at]=rgba[at+1]=rgba[at+2]=value;rgba[at+3]=255})
  return rgba
 }
 const alpha=yield* scaleIntegerImageSampledU8(r,size,read)
 let ticks=0
 for(let y=0;y<size.height;y++)for(let x=0;x<size.width;x++){
  const value=alpha[y*size.width+x],at=((y+1)*resource.width+x+1)*4
  if(channels)rgba[at+3]=value
  else{rgba[at]=rgba[at+1]=rgba[at+2]=value;rgba[at+3]=255}
  if(++ticks===INTEGER_IMAGE_STREAM_QUANTUM){ticks=0;yield}
 }
 if(channels)for(let c=0;c<channels.length;c++){
  const plane=channels[c]
  const level=yield* scaleIntegerImageSampledU8(r,size,(x,y)=>Math.floor(plane[(r.y+y)*side+r.x+x]*read(x,y)/255+.5))
  for(let y=0;y<size.height;y++)for(let x=0;x<size.width;x++){
   const i=y*size.width+x,value=alpha[i]?Math.min(255,Math.floor(level[i]*255/alpha[i]+.5)):0,at=((y+1)*resource.width+x+1)*4
   if(channels.length===1)rgba[at]=rgba[at+1]=rgba[at+2]=value;else rgba[at+c]=value
   if(++ticks===INTEGER_IMAGE_STREAM_QUANTUM){ticks=0;yield}
  }
 }
 return rgba
}
