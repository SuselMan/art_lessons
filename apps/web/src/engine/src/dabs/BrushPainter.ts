import {BristleSaturationResource} from './BristleSaturationResource'
import {usesPixelOriginalRgba} from '../presets/pixelOriginalRgba'
import type{SprayScratchLease}from'./SprayRequestPainter'
import{colorSmudgeTipPixels}from'../presets/colorSmudgeTip'
import type {BristleInkSettings} from '../presets/brushBristleInk'
import type { BrushExecutionContext } from '../presets/brushExecutionContext'
import { nativeImagePixels, type NativeImageResource } from './NativeImageBank'
import { materialGroupMips, type MaterialTextureGroup } from '../presets/brushMaterialPacking'
import { BrushMipCache } from './BrushMipCache'
import { lightnessMaterialMips } from '../presets/lightnessMaterial'
import { importedAssetPixels } from '../presets/importedBrushes'
import { assertNativeImageAdmission, brushPreparationResources, brushTextureLeasePlan, brushTextureResourceKey, type BrushPreparationResource } from './BrushPreparation'
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
  acquireSprayScratch?(width:number,height:number):SprayScratchLease
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
  private colorEpoch={}
  private readonly saturationResources:BristleSaturationResource
  private readonly textures: BrushTextureCache
  constructor(ctx: BrushContext) {
    this.gl=ctx.gl
    this.materialMips = ctx.brushMipCache ?? new BrushMipCache()
    this.ownsMipCache = !ctx.brushMipCache
    this.textures=new BrushTextureCache(ctx.gl)
    this.saturationResources=new BristleSaturationResource(ctx.gl,this.textures)
    this.behavior=new BrushBehaviorPainter(ctx,(id,gray,group,native,lookup32)=>this.tipTexture(id,gray,group,native,lookup32),(id,discrete)=>this.brushTexture(id,discrete),keys=>this.textures.protect(keys),(brush,effectiveErase) => {
      const resources = brushPreparationResources(brush.model === 'mixer' ? { ...brush, model: 'stamp' } : brush,effectiveErase)
      if (resources.some(resource => resource.nativeImage || resource.lookup32 || resource.bristleSaturation)) assertNativeImageAdmission(resources, this.imageDimensionLimit())
      const release=this.textures.lease(brushTextureLeasePlan(resources, 'stamp'))
      if(!usesPixelOriginalRgba(brush)&&!(brush.spray&&(brush.spray.particle.image||brush.spray.color.sampleInput||brush.spray.color.mixBackground||brush.spray.color.fillBackground)))return release
      // Peer/cold use the same admitted cache/lease; selection is not readiness.
      try{for(const resource of resources)if(resource.painter==='stamp')this.prepareTexture(resources,resource);return release}
      catch(error){try{release()}catch{/* Preserve the original preparation failure. */}throw error}
    },(id,planes,bounds)=>this.preparedImage(id,planes,bounds),(id,bounds)=>this.preparedSprayMask(id,bounds),bristle=>this.saturationResources.acquire(bristle))
  }
  initGL():void {this.colorEpoch={};this.maximumImageSide=undefined;this.behavior.releaseBristleSaturation();this.textures.clear(true);this.saturationResources.reset();this.behavior.initGL()}
  destroy():void {
    this.colorEpoch={}
    let failed=false,primary:unknown
    const cleanup=(fn:()=>void)=>{try{fn()}catch(error){if(!failed){failed=true;primary=error}}}
    cleanup(()=>this.behavior.destroy())
    cleanup(()=>this.textures.clear());this.saturationResources.reset()
    if(this.ownsMipCache)cleanup(()=>this.materialMips.clear())
    if(failed)throw primary
  }
  finish(scratch:BehaviorScratch,endpoint?:Dab & {baseSize:number}):void {this.behavior.finish(scratch,endpoint)}
  paint(target:ILayerBuffer,dabs:Dab[],preset:PencilPreset,stamp:{brush:BrushDescriptor;pressure:BrushPressureSettings},color:[number,number,number],scratch:BehaviorScratch,_previous:Dab|undefined,execution?:BrushExecutionContext):void {
    this.behavior.paint(target,dabs,preset,normalizeBrush(stamp.brush),stamp.pressure,color,scratch,false,undefined,execution)
  }
  paintMask(target:Pick<ILayerBuffer,'resolveForPaint'|'markContentPainted'>,dabs:Dab[],brush:BrushDescriptor,pressure:boolean,scratch:BehaviorScratch,sizeMultiplier:number,execution?:BrushExecutionContext):void {
    this.behavior.paint(target,dabs,{opacity:1,hardness:1,sizeMultiplier},normalizeBrush(brush),{size:true,opacity:pressure},[1,1,1],scratch,false,undefined,execution)
  }

  hasPreparedTexture(resource: BrushPreparationResource): boolean {
    return resource.bristleSaturation?this.saturationResources.ready(resource.bristleSaturation):this.textures.get(brushTextureResourceKey(resource)) !== undefined
  }

  prepareFilter():void{this.behavior.prepareFilter()}
  preparePolygon():void{this.behavior.preparePolygon()}
  prepareHatching():void{this.behavior.prepareHatching()}
  prepareClone():void{this.behavior.prepareClone()}
  prepareBristleInk(settings:BristleInkSettings,antialias:boolean,compositing:boolean,brush?:BrushDescriptor):void{
    if(settings.useSaturation){
      if(brush?.bristle?.version!==2||brush.bristle.ink!==settings)throw Error('Compiled Bristle saturation descriptor is required')
      const resources=brushPreparationResources(brush)
      assertNativeImageAdmission(resources,this.imageDimensionLimit())
      this.saturationResources.prepare(brush.bristle,resources.map(brushTextureResourceKey))
    }
    this.behavior.prepareBristleInk(settings,antialias,compositing,brush?.bristle)
  }
  prepareBristleRequests():void{this.behavior.prepareBristleRequests()}
  prepareSketchLines():void{this.behavior.prepareSketchLines()}
  prepareSprayShapes():void { this.behavior.prepareSprayShapes() }
  prepareSpraySources():void{this.behavior.prepareSpraySources()}
  prepareSprayImages():void {this.behavior.prepareSprayImages()}
  prepareCircleBand(): void { this.behavior.prepareCircleBand() }
  prepareProcedural(): void { this.behavior.prepareProcedural() }
  private imageDimensionLimit(): number { return this.maximumImageSide ??= this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number }
  prepareStampEffects():void{this.imageDimensionLimit();this.behavior.prepareStampEffects()}
  prepareAutoNoise():void{this.prepareStampEffects()}
  prepareRadialCurves(): void { this.imageDimensionLimit(); this.behavior.prepareRadialCurves() }
  prepareIntegerImages(): void { this.imageDimensionLimit(); this.behavior.prepareIntegerImages() }
  prepareTexture(group: readonly BrushPreparationResource[], resource: BrushPreparationResource): void {
    this.textures.protect(group.map(brushTextureResourceKey))
    if(resource.bristleSaturation){this.saturationResources.prepare(resource.bristleSaturation,group.map(brushTextureResourceKey));return}
    if(resource.colorPlanes){
      if(resource.gradientMap)throw Error('Spray image requires original RGB planes')
      const key=brushTextureResourceKey(resource);if(this.textures.get(key))return
      const alpha=importedAssetPixels(resource.id),side=Math.sqrt(alpha.length),pixels=colorSmudgeTipPixels(alpha,resource.colorPlanes.map(importedAssetPixels))
      const entry=uploadBrushTexture(this.gl,[pixels],this.gl.RGBA,this.gl.CLAMP_TO_EDGE,false,{width:side,height:side});this.textures.put(key,entry.texture,entry.bytes)
    }else if(resource.grain) this.brushTexture(resource.id as BrushTextureId,resource.discrete)
    else this.tipTexture(resource.id as TipMaskId,resource.gray,resource.materialGroup,resource.nativeImage,resource.lookup32)
  }

  private preparedSprayMask(id:TipMaskId,bounds?:BrushDescriptor["tip"]["maskBounds"]){
    const key=brushTextureResourceKey({id,grain:false}),texture=this.textures.get(key),epoch=this.colorEpoch
    if(!texture)throw Error('Spray mask was not prepared')
    const side=Math.sqrt(importedAssetPixels(id).length)
    return{texture,width:side,height:side,crop:{x:(bounds?.x??0)*side,y:(bounds?.y??0)*side,width:(bounds?.width??1)*side,height:(bounds?.height??1)*side},assertCurrent:()=>{if(epoch!==this.colorEpoch||this.textures.get(key)!==texture)throw Error('Spray mask owner was retired')}}
  }
  private preparedImage(id:TipMaskId,planes:readonly[string,string,string],bounds?:BrushDescriptor["tip"]["maskBounds"]){
    const key=brushTextureResourceKey({id,grain:false,colorPlanes:planes}),texture=this.textures.get(key),epoch=this.colorEpoch
    if(!texture)throw Error('Spray RGBA image was not prepared')
    const side=Math.sqrt(importedAssetPixels(id).length)
    return{texture,width:side,height:side,crop:{x:(bounds?.x??0)*side,y:(bounds?.y??0)*side,width:(bounds?.width??1)*side,height:(bounds?.height??1)*side},assertCurrent:()=>{if(epoch!==this.colorEpoch||this.textures.get(key)!==texture)throw Error('Spray RGBA image owner was retired')}}
  }

  private brushTexture(id: BrushTextureId, discrete = false): WebGLTexture {
    const key=brushTextureResourceKey({id,grain:true,discrete:discrete?true:undefined}), cached=this.textures.get(key)
    if(cached)return cached
    const entry=uploadBrushTexture(this.gl,discrete ? [brushTexturePixels(id)] : brushTextureMips(id),this.gl.LUMINANCE,this.gl.REPEAT,discrete)
    this.textures.put(key,entry.texture,entry.bytes)
    return entry.texture
  }

  private tipTexture(id: TipMaskId, gray?: string, materialGroup?: MaterialTextureGroup, nativeImage?: NativeImageResource, lookup32?: true): WebGLTexture {
    const key=brushTextureResourceKey({id,grain:false,gray,materialGroup,nativeImage,lookup32}), cached=this.textures.get(key)
    if(cached)return cached
    if (lookup32) {
      const entry=uploadBrushTexture(this.gl,[importedAssetPixels(id)],this.gl.RGBA,this.gl.CLAMP_TO_EDGE,true)
      this.textures.put(key,entry.texture,entry.bytes)
      return entry.texture
    }
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
