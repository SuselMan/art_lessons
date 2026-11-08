import{assertEqualLightnessGih123}from'../presets/gihEqualLightness123'
import{isIndependentDrawingAnglePair}from'@grafetto/shared'
import {usesTextureLightness,usesTextureGradient,textureMaterialKind,textureLightnessPixels,type TextureMaterialVariant} from '../presets/textureLightness'
import {pixelGradientSourcePixels,pixelGradientPalettePixels} from '../presets/pixelFilteredGradient'
import {BristleSaturationResource} from './BristleSaturationResource'
import {usesPixelOriginalRgba,usesFilteredPixelGradient} from '../presets/pixelOriginalRgba'
import type{SprayScratchLease}from'./SprayRequestPainter'
import{colorSmudgeTipPixels,colorSmudgeGradientTipPixels}from'../presets/colorSmudgeTip'
import type {BristleInkSettings} from '../presets/brushBristleInk'
import {assertBrushExecutionContext,type  BrushExecutionContext } from '../presets/brushExecutionContext'
import { nativeImagePixels, type NativeImageResource } from './NativeImageBank'
import { materialGroupMips, type MaterialTextureGroup } from '../presets/brushMaterialPacking'
import { BrushMipCache } from './BrushMipCache'
import { lightnessMaterialMips } from '../presets/lightnessMaterial'
import { importedAssetPixels } from '../presets/importedBrushes'
import { bindBrushGradient,assertNativeImageAdmission,brushPreparationBytes,brushPreparationTransientBytes,BRUSH_PREPARATION_BYTES, brushPreparationResources, brushTextureLeasePlan, brushTextureResourceKey, type BrushPreparationResource } from './BrushPreparation'
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
    this.behavior=new BrushBehaviorPainter(ctx,(id,gray,group,native,lookup32)=>this.tipTexture(id,gray,group,native,lookup32),(id,discrete)=>this.brushTexture(id,discrete),keys=>this.textures.protect(keys),(brush,effectiveErase,gradientLut) => {
      const unbound = brushPreparationResources(brush.model === 'mixer' ? { ...brush, model: 'stamp' } : brush,effectiveErase)
      const resources = gradientLut===undefined ? unbound : bindBrushGradient(unbound,gradientLut)
      const required=this.recordedStampResources(brush,resources)
      if(required)return this.acquireRecordedStampResources(required,false)
      if (resources.some(resource => resource.nativeImage || resource.lookup32 || resource.bristleSaturation || resource.gradientSource || resource.gradientPalette || resource.patternAlpha)) assertNativeImageAdmission(resources, this.imageDimensionLimit())
      const plan=brushTextureLeasePlan(resources,'stamp'),release=usesFilteredPixelGradient(brush)||!!textureMaterialKind(brush)?this.textures.leaseRequired(plan):this.textures.lease(plan)
      if(textureMaterialKind(brush)){try{if(resources.some(resource=>resource.painter==='stamp'&&!this.hasPreparedTexture(resource)))throw Error('Texture Lightness108 resource was not prepared');return release}catch(error){release();throw error}}
      if(!usesPixelOriginalRgba(brush)&&!(brush.spray&&(brush.spray.particle.image||brush.spray.color.sampleInput||brush.spray.color.mixBackground||brush.spray.color.fillBackground)))return release
      if(gradientLut){try{if(resources.some(resource=>resource.painter==='stamp'&&!this.hasPreparedTexture(resource)))throw Error('Pixel gradient resource was not prepared');return release}catch(error){release();throw error}}
      // Peer/cold use the same admitted cache/lease; selection is not readiness.
      try{for(const resource of resources)if(resource.painter==='stamp')this.prepareTexture(resources,resource);return release}
      catch(error){try{release()}catch{/* Preserve the original preparation failure. */}throw error}
    },(id,planes,bounds,gradientLut,sampling)=>this.preparedImage(id,planes,bounds,gradientLut,sampling),(id,bounds)=>this.preparedSprayMask(id,bounds),bristle=>this.saturationResources.acquire(bristle),(brush,lut)=>this.preparedTextureLightness(brush,lut))
  }
  /** One capability owner for selected readiness, recorded dispatch and paint. */
  private recordedStampResources(brush:BrushDescriptor,existing?:readonly BrushPreparationResource[]):readonly BrushPreparationResource[]|undefined {
    const lightness=assertEqualLightnessGih123(brush)
    if(!lightness&&(brush.version<122||!isIndependentDrawingAnglePair(brush)))return undefined
    const resources=existing??brushPreparationResources(brush)
    if(!lightness&&!resources.some(resource=>resource.nativeImage))return undefined
    // Borrowed source metadata only: no derivative or upload before admission.
    for(const resource of resources){
      const image=resource.nativeImage
      if(!image)continue
      const side=Math.sqrt(importedAssetPixels(resource.id).length),rect=image.rect
      if(!Number.isInteger(side)||side<2||side>2048||(side&(side-1))!==0)throw Error('DrawingAngle image source plane is not canonical')
      if(!Number.isInteger(rect.x)||!Number.isInteger(rect.y)||!Number.isInteger(rect.width)||!Number.isInteger(rect.height)||rect.x<0||rect.y<0||rect.width<1||rect.height<1||rect.x+rect.width>side||rect.y+rect.height>side)throw Error('DrawingAngle image source rectangle exceeds its asset')
    }
    const limit=this.imageDimensionLimit()
    assertNativeImageAdmission(resources,limit)
    if(lightness){
      if(!Number.isFinite(limit)||resources.some(r=>r.materialGroup&&r.materialGroup.size>limit))throw Error('Lightness123 bank exceeds GPU dimensions')
      if(brushPreparationBytes(resources,id=>id.startsWith('asset:')?Math.sqrt(importedAssetPixels(id).length):256)+brushPreparationTransientBytes(resources)>BRUSH_PREPARATION_BYTES)throw Error('Lightness123 bank exceeds the brush texture budget')
    }
    return resources
  }
  private acquireRecordedStampResources(resources:readonly BrushPreparationResource[],prepare:boolean,brush?:BrushDescriptor):()=>void {
    const release=this.textures.leaseRequired(brushTextureLeasePlan(resources,'stamp'))
    try{
      if(prepare){
        if(resources.some(resource=>resource.nativeImage))this.prepareIntegerImages()
        if(brush?.tip.kind==='procedural'||brush?.behavior?.dual?.brush.tip.kind==='procedural')this.prepareProcedural()
        for(const resource of resources)if(resource.painter==='stamp'&&!this.hasPreparedTexture(resource))this.prepareTexture(resources,resource)
      }
      if(resources.some(resource=>resource.painter==='stamp'&&!this.hasPreparedTexture(resource)))throw Error('Recorded stamp bank is not prepared')
      return release
    }catch(error){try{release()}catch{/* Preserve primary, including undefined. */}throw error}
  }
  /** Existing recorded dispatch calls this BEFORE any gesture/target mutation.
   * Ordinary brushes remain no-op; selected RAF preparation is unchanged. */
  prepareRecordedStampResources(brush:BrushDescriptor):void {
    const resources=this.recordedStampResources(brush)
    if(!resources)return
    this.acquireRecordedStampResources(resources,true,brush)()
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
  prepareStampEffects(filteredGradient=false,textureLightness:TextureMaterialVariant=false):void{this.imageDimensionLimit();this.behavior.prepareStampEffects(filteredGradient,textureLightness)}
  prepareCompositeEffects():void{this.behavior.prepareCompositeEffects()}
  prepareAutoNoise():void{this.prepareStampEffects()}
  prepareRadialCurves(): void { this.imageDimensionLimit(); this.behavior.prepareRadialCurves() }
  prepareIntegerImages(): void { this.imageDimensionLimit(); this.behavior.prepareIntegerImages() }
  prepareTexture(group: readonly BrushPreparationResource[], resource: BrushPreparationResource): void {
    if(group.some(r=>r.gradientSource||r.gradientPalette||r.patternAlpha)){
      const release=this.textures.leaseRequired(brushTextureLeasePlan(group,'stamp'))
      let failed=false
      try{this.prepareTextureOwned(group,resource)}catch(error){failed=true;throw error}finally{if(failed){try{release()}catch{/* Preserve primary, including undefined. */}}else release()}
    }else this.prepareTextureOwned(group,resource)
  }
  private prepareTextureOwned(group:readonly BrushPreparationResource[],resource:BrushPreparationResource):void{
    this.textures.protect(group.map(brushTextureResourceKey))
    if(resource.patternAlpha){
      const key=brushTextureResourceKey(resource);if(this.textures.get(key))return
      const size=resource.patternSize;if(!size)throw Error('Lightness pattern dimensions missing')
      const pixels=textureLightnessPixels(importedAssetPixels(resource.id),importedAssetPixels(resource.patternAlpha),size.width,size.height),side=Math.sqrt(pixels.length/4)
      const entry=uploadBrushTexture(this.gl,[pixels],this.gl.RGBA,this.gl.CLAMP_TO_EDGE,true,{width:side,height:side,nearest:true,straight:true})
      try{this.textures.put(key,entry.texture,entry.bytes)}catch(error){this.gl.deleteTexture(entry.texture);throw error}return
    }
    if(resource.gradientPalette){
      if(!resource.gradientLut)throw Error('Filtered gradient palette is not captured')
      const key=brushTextureResourceKey(resource);if(this.textures.get(key))return
      const pixels=pixelGradientPalettePixels(resource.gradientLut),entry=uploadBrushTexture(this.gl,[pixels],this.gl.RGBA,this.gl.CLAMP_TO_EDGE,false,{width:256,height:1,nearest:true,straight:true})
      try{this.textures.put(key,entry.texture,entry.bytes)}catch(error){this.gl.deleteTexture(entry.texture);throw error}return
    }
    if(resource.bristleSaturation){this.saturationResources.prepare(resource.bristleSaturation,group.map(brushTextureResourceKey));return}
    if(resource.colorPlanes){
      if(resource.gradientMap&&!resource.gradientLut)throw Error('Gradient image requires a captured palette')
      const key=brushTextureResourceKey(resource);if(this.textures.get(key))return
      const alpha=importedAssetPixels(resource.id),side=Math.sqrt(alpha.length)
      if(resource.gradientMap&&side>512)throw Error('Pixel gradient side exceeds512')
      const pixels=resource.gradientSource ? pixelGradientSourcePixels(alpha,importedAssetPixels(resource.colorPlanes[0])) : resource.gradientMap ? colorSmudgeGradientTipPixels(alpha,importedAssetPixels(resource.colorPlanes[0]),resource.gradientLut!) : colorSmudgeTipPixels(alpha,resource.colorPlanes.map(importedAssetPixels))
      const entry=uploadBrushTexture(this.gl,[pixels],this.gl.RGBA,this.gl.CLAMP_TO_EDGE,false,{width:side,height:side,...(resource.gradientSource?{straight:true as const}:{})})
      if(resource.gradientSource){try{this.textures.put(key,entry.texture,entry.bytes)}catch(error){this.gl.deleteTexture(entry.texture);throw error}}else this.textures.put(key,entry.texture,entry.bytes)
    }else if(resource.grain) this.brushTexture(resource.id as BrushTextureId,resource.discrete)
    else this.tipTexture(resource.id as TipMaskId,resource.gray,resource.materialGroup,resource.nativeImage,resource.lookup32)
  }

  /** Texture material preflight owns no persistent lease; paint acquires its exact required union. */
  prepareTextureLightness(brush:BrushDescriptor):void{
    if(!usesTextureLightness(brush))return
    const resources=brushPreparationResources(brush);assertNativeImageAdmission(resources,this.imageDimensionLimit())
    const release=this.textures.leaseRequired(brushTextureLeasePlan(resources,'stamp'));let failed=false
    try{this.prepareStampEffects(false,true);for(const resource of resources)if(resource.painter==='stamp'&&!this.hasPreparedTexture(resource))this.prepareTexture(resources,resource)}catch(error){failed=true;throw error}finally{if(failed){try{release()}catch{/* Preserve first error. */}}else release()}
  }

  /** Recorded texture palette is bound before any request/state mutation. */
  prepareTextureGradient(brush:BrushDescriptor,execution?:BrushExecutionContext):void{
    if(!usesTextureGradient(brush))return
    assertBrushExecutionContext(brush,execution)
    const resources=bindBrushGradient(brushPreparationResources(brush),execution?.brushSource?.gradient)
    assertNativeImageAdmission(resources,this.imageDimensionLimit())
    const release=this.textures.leaseRequired(brushTextureLeasePlan(resources,'stamp'));let failed=false
    try{this.prepareStampEffects(false,'gradient');for(const resource of resources)if(resource.painter==='stamp'&&!this.hasPreparedTexture(resource))this.prepareTexture(resources,resource)}catch(error){failed=true;throw error}finally{if(failed){try{release()}catch{/* Preserve first error. */}}else release()}
  }

  /** Recorded palette bound before any paint/state mutation; no lazy view upload. */
  preparePixelGradient(brush:BrushDescriptor,execution?:BrushExecutionContext):void{
    if(!usesPixelOriginalRgba(brush)||!brush.tip.color||!('gradient'in brush.tip.color))return
    const resources=bindBrushGradient(brushPreparationResources(brush),execution?.brushSource?.gradient)
    if(usesFilteredPixelGradient(brush))assertNativeImageAdmission(resources,this.imageDimensionLimit())
    const plan=brushTextureLeasePlan(resources,'stamp'),release=usesFilteredPixelGradient(brush)?this.textures.leaseRequired(plan):this.textures.lease(plan)
    let failed=false
    try{if(usesFilteredPixelGradient(brush))this.prepareStampEffects(true);for(const resource of resources)if(resource.painter==='stamp'&&!this.hasPreparedTexture(resource))this.prepareTexture(resources,resource)}catch(error){failed=true;throw error}finally{if(failed&&usesFilteredPixelGradient(brush)){try{release()}catch{/* Preserve primary. */}}else release()}
  }
  private preparedTextureLightness(brush:BrushDescriptor,lut?:string){
    if(!textureMaterialKind(brush))throw Error('Texture material is missing')
    const resource=brushPreparationResources(brush).find(r=>r.patternAlpha),epoch=this.colorEpoch
    if(!resource)throw Error('Texture Lightness108 resource is missing')
    const key=brushTextureResourceKey(resource),texture=this.textures.get(key),side=Math.sqrt(importedAssetPixels(resource.id).length)
    if(!texture)throw Error('Texture Lightness108 resource was not prepared')
    const paletteKey=usesTextureGradient(brush)?brushTextureResourceKey(bindBrushGradient([{painter:'stamp',id:resource.id,grain:false,gradientPalette:true}],lut)[0]):undefined,paletteTexture=paletteKey?this.textures.get(paletteKey):undefined
    if(paletteKey&&!paletteTexture)throw Error('Texture gradient palette was not prepared')
    const assertPalette=()=>{if(epoch!==this.colorEpoch||!paletteKey||this.textures.get(paletteKey)!==paletteTexture)throw Error('Texture gradient palette owner was retired')}
    const palette=paletteTexture?{texture:paletteTexture,assertCurrent:assertPalette}:undefined
    return{texture,...(palette?{palette}:{}),width:side,height:side,crop:{x:0,y:0,width:side,height:side},assertCurrent:()=>{if(epoch!==this.colorEpoch||this.textures.get(key)!==texture)throw Error('Texture Lightness108 owner was retired');palette?.assertCurrent()}}
  }
  private preparedSprayMask(id:TipMaskId,bounds?:BrushDescriptor["tip"]["maskBounds"]){
    const key=brushTextureResourceKey({id,grain:false}),texture=this.textures.get(key),epoch=this.colorEpoch
    if(!texture)throw Error('Spray mask was not prepared')
    const side=Math.sqrt(importedAssetPixels(id).length)
    return{texture,width:side,height:side,crop:{x:(bounds?.x??0)*side,y:(bounds?.y??0)*side,width:(bounds?.width??1)*side,height:(bounds?.height??1)*side},assertCurrent:()=>{if(epoch!==this.colorEpoch||this.textures.get(key)!==texture)throw Error('Spray mask owner was retired')}}
  }
  private preparedImage(id:TipMaskId,planes:readonly[string,string,string],bounds?:BrushDescriptor["tip"]["maskBounds"],gradientLut?:string,sampling?:'filteredGray-v1'){
    const key=brushTextureResourceKey({id,grain:false,colorPlanes:planes,...(sampling?{gradientSource:true as const}:gradientLut?{gradientMap:true as const,gradientLut}:{})}),texture=this.textures.get(key),epoch=this.colorEpoch
    if(!texture)throw Error('Spray RGBA image was not prepared')
    const paletteKey=sampling?brushTextureResourceKey({id,grain:false,gradientPalette:true,gradientLut}):undefined,paletteTexture=paletteKey?this.textures.get(paletteKey):undefined
    if(sampling&&!paletteTexture)throw Error('Filtered gradient palette was not prepared')
    const assertPalette=()=>{if(epoch!==this.colorEpoch||!paletteKey||this.textures.get(paletteKey)!==paletteTexture)throw Error('Filtered gradient palette owner was retired')}
    const palette=paletteTexture?Object.freeze({texture:paletteTexture,assertCurrent:assertPalette}):undefined
    const side=Math.sqrt(importedAssetPixels(id).length)
    return{texture,...(palette?{palette}:{}),width:side,height:side,crop:{x:(bounds?.x??0)*side,y:(bounds?.y??0)*side,width:(bounds?.width??1)*side,height:(bounds?.height??1)*side},assertCurrent:()=>{if(epoch!==this.colorEpoch||this.textures.get(key)!==texture)throw Error('Spray RGBA image owner was retired');if(sampling)assertPalette()}}
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
