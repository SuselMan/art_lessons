import { materialGroupMips, type MaterialTextureGroup } from '../presets/brushMaterialPacking'
import { BrushMipCache } from './BrushMipCache'
import { lightnessMaterialMips } from '../presets/lightnessMaterial'
import { importedAssetPixels } from '../presets/importedBrushes'
import { brushTextureLeaseResources, brushTextureResourceKey, type BrushPreparationResource } from './BrushPreparation'
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
  private readonly materialMips=new BrushMipCache()
  private readonly textures: BrushTextureCache
  constructor(ctx: BrushContext) {
    this.gl=ctx.gl
    this.textures=new BrushTextureCache(ctx.gl)
    this.behavior=new BrushBehaviorPainter(ctx,(id,gray,group)=>this.tipTexture(id,gray,group),(id,discrete)=>this.brushTexture(id,discrete),keys=>this.textures.protect(keys),brush=>this.textures.lease(brushTextureLeaseResources(brush,'stamp')))
  }
  initGL():void {this.textures.clear(true);this.behavior.initGL()}
  destroy():void {
    this.behavior.destroy()
    this.textures.clear()
    this.materialMips.clear()
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
  prepareTexture(group: readonly BrushPreparationResource[], resource: BrushPreparationResource): void {
    this.textures.protect(group.map(brushTextureResourceKey))
    if (resource.grain) this.brushTexture(resource.id as BrushTextureId,resource.discrete)
    else this.tipTexture(resource.id as TipMaskId,resource.gray,resource.materialGroup)
  }

  private brushTexture(id: BrushTextureId, discrete = false): WebGLTexture {
    const key=brushTextureResourceKey({id,grain:true,discrete:discrete?true:undefined}), cached=this.textures.get(key)
    if(cached)return cached
    const entry=uploadBrushTexture(this.gl,discrete ? [brushTexturePixels(id)] : brushTextureMips(id),this.gl.LUMINANCE,this.gl.REPEAT,discrete)
    this.textures.put(key,entry.texture,entry.bytes)
    return entry.texture
  }

  private tipTexture(id: TipMaskId, gray?: string, materialGroup?: MaterialTextureGroup): WebGLTexture {
    const key=brushTextureResourceKey({id,grain:false,gray,materialGroup}), cached=this.textures.get(key)
    if(cached)return cached
    const levels=materialGroup ? this.materialMips.get(key,()=>materialGroupMips(materialGroup,importedAssetPixels) )
      : gray ? this.materialMips.get(key,()=>lightnessMaterialMips(importedAssetPixels(id),importedAssetPixels(gray))) : tipMaskMips(id)
    const format=materialGroup?.format==='rgba' ? this.gl.RGBA : gray ? this.gl.LUMINANCE_ALPHA : this.gl.LUMINANCE
    const entry=uploadBrushTexture(this.gl,levels,format,this.gl.CLAMP_TO_EDGE)
    this.textures.put(key,entry.texture,entry.bytes)
    return entry.texture
  }
}
