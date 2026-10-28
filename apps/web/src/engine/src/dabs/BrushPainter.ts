import { nativeImagePixels, type NativeImageResource } from './NativeImageBank'
import { materialGroupMips, type MaterialTextureGroup } from '../presets/brushMaterialPacking'
import { BrushMipCache } from './BrushMipCache'
import { lightnessMaterialMips } from '../presets/lightnessMaterial'
import { importedAssetPixels } from '../presets/importedBrushes'
import { assertNativeImageAdmission, brushPreparationResources, brushTextureLeaseResources, brushTextureResourceKey, type BrushPreparationResource } from './BrushPreparation'
/** One digital-stamp renderer for built-in, imported and historical presets.
 * BrushBehaviorPainter owns deposition/composition; this facade owns texture LRU. */
import type { Dab } from '@grafetto/shared'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { ILayerBuffer } from '../buffers/ILayerBuffer'
import type { PaperSampling } from '../paper/PaperState'
import type { BrushDescriptor, BrushPressureSettings } from '../presets/digitalBrushPresets'
import { normalizeBrush } from '../presets/brushNormalization'
import type { PencilPreset } from '../presets/pencilPresets'
import { brushTextureMips, brushTexturePixels, tipMaskMips, type BrushTextureId, type TipMaskId } from '../presets/tipMasks'
import { BrushTextureCache, uploadBrushTexture } from './BrushTextureCache'
import { BrushBehaviorPainter, type BehaviorScratch } from './BrushBehaviorPainter'

export interface BrushContext {
  readonly gl: WebGLRenderingContext
  readonly brushMipCache?: BrushMipCache
  quadBuf(): WebGLBuffer
  readonly paper: PaperSampling
  segmentLength(dab: Dab, prev: Dab | undefined, radius: number): number
}
export interface BrushScratch {
  getOrCreate(tile: AccumulationBuffer): {original:AccumulationBuffer;coverage:AccumulationBuffer}
  noteBrushEdgePx(px:number):number
}

export class BrushPainter {
  private readonly behavior: BrushBehaviorPainter
  private readonly gl: WebGLRenderingContext
  private readonly materialMips: BrushMipCache
  private readonly ownsMipCache: boolean
  private maximumImageSide: number | undefined
  private readonly textures: BrushTextureCache
  constructor(ctx: BrushContext) {
    this.gl=ctx.gl
    this.materialMips = ctx.brushMipCache ?? new BrushMipCache()
    this.ownsMipCache = !ctx.brushMipCache
    this.textures=new BrushTextureCache(ctx.gl)
    this.behavior=new BrushBehaviorPainter(ctx,(id,gray,group,native)=>this.tipTexture(id,gray,group,native),(id,discrete)=>this.brushTexture(id,discrete),keys=>this.textures.protect(keys),brush=>{ const resources=brushPreparationResources(brush); if(resources.some(resource=>resource.nativeImage))assertNativeImageAdmission(resources,this.imageDimensionLimit()); return this.textures.lease(brushTextureLeaseResources(brush,'stamp')) })
  }
  initGL():void {this.maximumImageSide=undefined;this.textures.clear(true);this.behavior.initGL()}
  destroy():void {
    this.behavior.destroy()
    this.textures.clear()
    if (this.ownsMipCache) this.materialMips.clear()
  }
  finish(scratch:BehaviorScratch,endpoint?:Dab & {baseSize:number}):void {this.behavior.finish(scratch,endpoint)}
  paint(target:ILayerBuffer,dabs:Dab[],preset:PencilPreset,stamp:{brush:BrushDescriptor;pressure:BrushPressureSettings},color:[number,number,number],scratch:BehaviorScratch,_previous:Dab|undefined):void {
    this.behavior.paint(target,dabs,preset,normalizeBrush(stamp.brush),stamp.pressure,color,scratch)
  }
  paintMask(target:Pick<ILayerBuffer,'resolveForPaint'|'markContentPainted'>,dabs:Dab[],brush:BrushDescriptor,pressure:boolean,scratch:BehaviorScratch,sizeMultiplier:number):void {
    this.behavior.paint(target,dabs,{opacity:1,hardness:1,sizeMultiplier},normalizeBrush(brush),{size:true,opacity:pressure},[1,1,1],scratch)
  }

  hasPreparedTexture(resource: BrushPreparationResource): boolean {
    return this.textures.get(brushTextureResourceKey(resource)) !== undefined
  }

  prepareProcedural(): void { this.behavior.prepareProcedural() }
  private imageDimensionLimit(): number { return this.maximumImageSide ??= this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number }
  prepareIntegerImages(): void { this.imageDimensionLimit(); this.behavior.prepareIntegerImages() }
  prepareTexture(group: readonly BrushPreparationResource[], resource: BrushPreparationResource): void {
    this.textures.protect(group.map(brushTextureResourceKey))
    if (resource.grain) this.brushTexture(resource.id as BrushTextureId,resource.discrete)
    else this.tipTexture(resource.id as TipMaskId,resource.gray,resource.materialGroup,resource.nativeImage)
  }

  private brushTexture(id: BrushTextureId, discrete = false): WebGLTexture {
    const key=brushTextureResourceKey({id,grain:true,discrete:discrete?true:undefined}), cached=this.textures.get(key)
    if(cached)return cached
    const entry=uploadBrushTexture(this.gl,discrete ? [brushTexturePixels(id)] : brushTextureMips(id),this.gl.LUMINANCE,this.gl.REPEAT,discrete)
    this.textures.put(key,entry.texture,entry.bytes)
    return entry.texture
  }

  private tipTexture(id: TipMaskId, gray?: string, materialGroup?: MaterialTextureGroup, nativeImage?: NativeImageResource): WebGLTexture {
    const key=brushTextureResourceKey({id,grain:false,gray,materialGroup,nativeImage}), cached=this.textures.get(key)
    if(cached)return cached
    if (nativeImage) {
      const pixels = this.materialMips.get(key, () => [nativeImagePixels(nativeImage, importedAssetPixels(id))])[0]
      const entry = uploadBrushTexture(this.gl, [pixels], this.gl.LUMINANCE, this.gl.CLAMP_TO_EDGE, false, nativeImage)
      this.textures.put(key, entry.texture, entry.bytes)
      return entry.texture
    }
    const levels=materialGroup ? this.materialMips.get(key,()=>materialGroupMips(materialGroup,importedAssetPixels) )
      : gray ? this.materialMips.get(key,()=>lightnessMaterialMips(importedAssetPixels(id),importedAssetPixels(gray))) : tipMaskMips(id)
    const format=materialGroup?.format==='rgba' ? this.gl.RGBA : gray ? this.gl.LUMINANCE_ALPHA : this.gl.LUMINANCE
    const entry=uploadBrushTexture(this.gl,levels,format,this.gl.CLAMP_TO_EDGE)
    this.textures.put(key,entry.texture,entry.bytes)
    return entry.texture
  }
}
