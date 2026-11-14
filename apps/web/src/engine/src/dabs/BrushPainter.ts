import { hasIndependentMask190Scope } from '@grafetto/shared'
import{assertRecordedPen188Inputs}from '../presets/recordedPen188'
import{hasTextureGradientWash180Scope}from'@grafetto/shared'
import{assertTextureGradientWash180Planes}from'../presets/textureGradientWash180'
import{hasTextureLightnessWash171Scope}from'@grafetto/shared'
import{assertTextureLightnessWash171Planes}from'../presets/textureLightnessWash171'
import{hasFilterBitmapMaskScope}from'@grafetto/shared'
import{assertPixelAlphaDual168Scope,assertPixelAlphaDual170Scope}from'@grafetto/shared'
import {hasExperimentCurrentPattern158Scope,isBrushPattern,type BrushPattern} from '@grafetto/shared'
import{assertPixelOriginalDual151Resources}from'../presets/pixelOriginalRgba'
import type{CanonicalBeginLayeredView}from'./CanonicalBeginSource'
import {hasBristleSoak139Scope,hasBristleInitializationScope,hasBristleSource143Scope} from '@grafetto/shared'
import {BristleSoakGather139} from '../raster/BristleSoakGather139'
import {bristleSoakPoints139} from '../presets/bristleSoak139'
import {buildBristleInitialization140,assertBristleInitializationSize140,assertBristleSource143Ready} from '../presets/bristleInitialization140'
import {createBristleInkState} from '../presets/brushBristleInk'
import {beginBrushBehavior} from '../presets/brushBehavior'
import {canonicalBeginBindingKey,firstBristleLine139,type BristleFirstLine139,type CanonicalBeginNotReady,type CanonicalBeginBinding,type CanonicalBeginRuntime,type CanonicalBeginResult,type CanonicalBeginPrepareResult,type CanonicalBeginPaintResult,type CanonicalBeginCapability} from './CanonicalBeginRuntime'
import type{BorrowedGridWash}from'./GridWashRuntime'
import{hasTangentNormalWash136Scope}from'@grafetto/shared'
import{hasBristleWash135Scope}from'@grafetto/shared'
import{hasParticleWash134Scope}from'@grafetto/shared'
import{hasSprayWash133Scope,isBrushSpray}from'@grafetto/shared'
import{assertUnequalLightnessGih124}from'../presets/gihUnequalLightness124'
import{assertEqualLightnessGih123}from'../presets/gihEqualLightness123'
import{isIndependentDrawingAnglePair}from'@grafetto/shared'
import {usesTextureLightness,usesTextureGradient,textureMaterialKind,textureLightnessPixels,type TextureMaterialVariant} from '../presets/textureLightness'
import {pixelGradientSourcePixels,pixelGradientPalettePixels} from '../presets/pixelFilteredGradient'
import {BristleSaturationResource} from './BristleSaturationResource'
import {usesPixelOriginalRgba,usesFilteredPixelGradient,pixelOriginalRgbaFrames} from '../presets/pixelOriginalRgba'
import type{SprayScratchLease}from'./SprayRequestPainter'
import{colorSmudgeTipPixels,colorSmudgeGradientTipPixels}from'../presets/colorSmudgeTip'
import type {BristleInkSettings} from '../presets/brushBristleInk'
import {assertSameBrushExecutionContext,assertBrushSourceInputs,assertBrushExecutionContext,type  BrushExecutionContext } from '../presets/brushExecutionContext'
import { nativeImagePixels, type NativeImageResource } from './NativeImageBank'
import { materialGroupMips, type MaterialTextureGroup } from '../presets/brushMaterialPacking'
import { BrushMipCache } from './BrushMipCache'
import { lightnessMaterialMips } from '../presets/lightnessMaterial'
import { importedAssetPixels } from '../presets/importedBrushes'
import {bindBrushPattern, bindBrushGradient,assertNativeImageAdmission,brushUsesStampEffects,brushPreparationBytes,brushPreparationTransientBytes,BRUSH_PREPARATION_BYTES, brushPreparationResources, brushTextureLeasePlan, brushTextureResourceKey, type BrushPreparationResource } from './BrushPreparation'
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
  canonicalResourcesReleased?():void
  reserveCanonicalBeginSource?(binding:CanonicalBeginBinding,bytes:number):(()=>void)|CanonicalBeginNotReady
  openLayeredCanonicalBegin?(target:ILayerBuffer,binding:CanonicalBeginBinding,projection:NonNullable<NonNullable<BrushExecutionContext['brushSource']>['projection']>,capability?:'cloneProjection149'|'cloneHealing152'):{kind:'ready';view:CanonicalBeginLayeredView}|CanonicalBeginNotReady
  openCanonicalBegin?(target:ILayerBuffer,binding:CanonicalBeginBinding,capability:CanonicalBeginCapability):CanonicalBeginResult
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
  private readonly ctx:BrushContext
  private readonly behavior: BrushBehaviorPainter
  private readonly gl: WebGLRenderingContext
  private readonly materialMips: BrushMipCache
  private readonly ownsMipCache: boolean
  private maximumImageSide: number | undefined
  private colorEpoch={}
  private soakGather?:BristleSoakGather139
  private readonly saturationResources:BristleSaturationResource
  private readonly textures: BrushTextureCache
  constructor(ctx: BrushContext) {
    this.ctx=ctx
    this.gl=ctx.gl
    this.materialMips = ctx.brushMipCache ?? new BrushMipCache()
    this.ownsMipCache = !ctx.brushMipCache
    this.textures=new BrushTextureCache(ctx.gl)
    this.saturationResources=new BristleSaturationResource(ctx.gl,this.textures)
    this.behavior=new BrushBehaviorPainter(ctx,(id,gray,group,native,lookup32)=>this.tipTexture(id,gray,group,native,lookup32),(id,discrete)=>this.brushTexture(id,discrete),keys=>this.textures.protect(keys),(brush,effectiveErase,gradientLut,pattern) => {
      const unbound = brushPreparationResources(brush.model === 'mixer' ? { ...brush, model: 'stamp' } : brush,effectiveErase)
      const resources = bindBrushPattern(gradientLut===undefined ? unbound : bindBrushGradient(unbound,gradientLut),pattern)
      const required=this.recordedStampResources(brush,resources,gradientLut!==undefined)
      if(required)return this.acquireRecordedStampResources(required,false)
      if (resources.some(resource => resource.nativeImage || resource.lookup32 || resource.bristleSaturation || resource.gradientSource || resource.gradientPalette || resource.patternAlpha)) assertNativeImageAdmission(resources, this.imageDimensionLimit())
      const plan=brushTextureLeasePlan(resources,'stamp'),release=pattern!==undefined||usesFilteredPixelGradient(brush)||!!textureMaterialKind(brush)?this.textures.leaseRequired(plan):this.textures.lease(plan)
      if(pattern!==undefined){try{if(resources.some(r=>r.painter==='stamp'&&!this.hasPreparedTexture(r)))throw Error('Canvas pattern resource was not prepared');return release}catch(error){try{release()}catch{/* Preserve preparation error. */}throw error}}
      if(textureMaterialKind(brush)){try{if(resources.some(resource=>resource.painter==='stamp'&&!this.hasPreparedTexture(resource)))throw Error('Texture Lightness108 resource was not prepared');return release}catch(error){release();throw error}}
      if(!usesPixelOriginalRgba(brush)&&!(brush.spray&&(brush.spray.particle.image||brush.spray.color.sampleInput||brush.spray.color.mixBackground||brush.spray.color.fillBackground)))return release
      if(gradientLut){try{if(resources.some(resource=>resource.painter==='stamp'&&!this.hasPreparedTexture(resource)))throw Error('Pixel gradient resource was not prepared');return release}catch(error){release();throw error}}
      // Peer/cold use the same admitted cache/lease; selection is not readiness.
      try{for(const resource of resources)if(resource.painter==='stamp')this.prepareTexture(resources,resource);return release}
      catch(error){try{release()}catch{/* Preserve the original preparation failure. */}throw error}
    },(id,planes,bounds,gradientLut,sampling)=>this.preparedImage(id,planes,bounds,gradientLut,sampling),(id,bounds)=>this.preparedSprayMask(id,bounds),bristle=>this.saturationResources.acquire(bristle),(brush,lut)=>this.preparedTextureLightness(brush,lut))
  }
  /** One capability owner for selected readiness, recorded dispatch and paint. */
  private recordedStampResources(brush:BrushDescriptor,existing?:readonly BrushPreparationResource[],paletteBound=false):readonly BrushPreparationResource[]|undefined {
    const mask190=hasIndependentMask190Scope(brush)
    const textureWash180=assertTextureGradientWash180Planes(brush)
    const textureWash171=assertTextureLightnessWash171Planes(brush)
    const bitmapFilter=!!brush.filter&&'maskPolicy'in brush.filter
    if(bitmapFilter&&!hasFilterBitmapMaskScope(brush))throw Error('Invalid Filter169 bitmap scope')
    const alphaDual=mask190||assertPixelAlphaDual168Scope(brush)||assertPixelAlphaDual170Scope(brush)
    const originalDual=assertPixelOriginalDual151Resources(brush)
    const tangentWash=hasTangentNormalWash136Scope(brush)
    if(brush.tangentNormal&&brush.behavior?.rendering?.accumulation==='alphaDarken'&&!tangentWash)throw Error('Invalid Tangent Wash136 scope')
    const bristleWash=hasBristleWash135Scope(brush)
    if(brush.bristle&&brush.behavior?.rendering?.accumulation==='alphaDarken'&&!bristleWash)throw Error('Invalid Bristle Wash135 scope')
    const particleWash=hasParticleWash134Scope(brush)
    if(brush.particle&&brush.behavior?.rendering?.accumulation==='alphaDarken'&&!particleWash)throw Error('Invalid Particle Wash134 scope')
    const wash=hasSprayWash133Scope(brush)||particleWash||bristleWash||tangentWash
    if(wash&&!particleWash&&!bristleWash&&!tangentWash&&!isBrushSpray(brush.spray))throw Error('Invalid Spray Wash133 population metadata')
    if(brush.spray&&brush.behavior?.rendering?.accumulation==='alphaDarken'&&!wash)throw Error('Invalid Spray Wash133 scope')
    if(textureWash180&&!paletteBound)return undefined
    const gradient=!!brush.tip.animation&&!!brush.tip.color&&'gradient'in brush.tip.color
    if(gradient){pixelOriginalRgbaFrames(brush,mask190);if(!paletteBound)return undefined}
    const lightness=assertEqualLightnessGih123(brush,mask190)||assertUnequalLightnessGih124(brush,mask190)
    if(!textureWash180&&!textureWash171&&!bitmapFilter&&!alphaDual&&!originalDual&&!wash&&!lightness&&!gradient&&(brush.version<122||!isIndependentDrawingAnglePair(brush)))return undefined
    if(wash&&brush.tip.kind==='bitmap'){const ids=brush.tip.animation?.frames??[brush.tip.mask!];for(const id of ids){const side=Math.sqrt(importedAssetPixels(id).length);if(!Number.isInteger(side)||side<2||side>2048||(side&(side-1))!==0)throw Error('Spray Wash frame is not canonical')}}
    const resources=existing??brushPreparationResources(bitmapFilter?{...brush,model:'stamp'}:brush)
    if(!textureWash180&&!textureWash171&&!bitmapFilter&&!alphaDual&&!originalDual&&!wash&&!lightness&&!gradient&&!resources.some(resource=>resource.nativeImage))return undefined
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
    if(wash){if(!Number.isFinite(limit)||resources.some(r=>!r.grain&&r.id.startsWith('asset:')&&Math.sqrt(importedAssetPixels(r.id).length)>limit))throw Error('Spray Wash mask exceeds GPU dimensions');if(brushPreparationBytes(resources,id=>id.startsWith('asset:')?Math.sqrt(importedAssetPixels(id).length):256)+brushPreparationTransientBytes(resources)>BRUSH_PREPARATION_BYTES)throw Error('Spray Wash bank exceeds the brush texture budget')}
    if(textureWash180||textureWash171||bitmapFilter||lightness||originalDual||alphaDual){
      if(!Number.isFinite(limit)||resources.some(r=>r.materialGroup&&r.materialGroup.size>limit))throw Error('Lightness123 bank exceeds GPU dimensions')
      if(brushPreparationBytes(resources,id=>id.startsWith('asset:')?Math.sqrt(importedAssetPixels(id).length):256)+brushPreparationTransientBytes(resources)>BRUSH_PREPARATION_BYTES)throw Error('Lightness123 bank exceeds the brush texture budget')
    }
    return resources
  }
  private acquireRecordedStampResources(resources:readonly BrushPreparationResource[],prepare:boolean,brush?:BrushDescriptor,filteredGradient=false):()=>void {
    const release=this.textures.leaseRequired(brushTextureLeasePlan(resources,'stamp'))
    try{
      if(prepare){
        if(brush&&hasTextureGradientWash180Scope(brush))this.prepareStampEffects(false,'gradient')
        else if(brush&&hasTextureLightnessWash171Scope(brush))this.prepareStampEffects(false,true)
        else if(filteredGradient)this.prepareStampEffects(true)
        else if(brush&&brushUsesStampEffects(brush))this.prepareStampEffects()
        if(resources.some(resource=>resource.nativeImage))this.prepareIntegerImages()
        if(brush&&!hasSprayWash133Scope(brush)&&(brush.tip.kind==='procedural'||brush.behavior?.dual?.brush.tip.kind==='procedural'))this.prepareProcedural()
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
  initGL():void {this.soakGather?.reset();this.colorEpoch={};this.maximumImageSide=undefined;this.behavior.releaseBristleSaturation();this.textures.clear(true);this.saturationResources.reset();this.behavior.initGL()}
  destroy():void {
    this.colorEpoch={}
    let failed=false,primary:unknown
    const cleanup=(fn:()=>void)=>{try{fn()}catch(error){if(!failed){failed=true;primary=error}}}
    cleanup(()=>this.soakGather?.reset())
    cleanup(()=>this.behavior.destroy())
    cleanup(()=>this.textures.clear());this.saturationResources.reset()
    if(this.ownsMipCache)cleanup(()=>this.materialMips.clear())
    if(failed)throw primary
  }
  finish(scratch:BehaviorScratch,endpoint?:Dab & {baseSize:number}):void {this.behavior.finish(scratch,endpoint)}
  paint(target:ILayerBuffer,dabs:Dab[],preset:PencilPreset,stamp:{brush:BrushDescriptor;pressure:BrushPressureSettings},color:[number,number,number],scratch:BehaviorScratch,_previous:Dab|undefined,execution?:BrushExecutionContext,runtime?:CanonicalBeginRuntime):void|CanonicalBeginPaintResult {
    const brush=stamp.brush
    assertRecordedPen188Inputs(brush,dabs)
    if(brush.bristle?.version===1&&brush.bristle.initialization){
      if(!hasBristleInitializationScope(brush))throw Error('Invalid Bristle initialization scope')
      if(dabs.length){
        assertBrushSourceInputs(brush,dabs)
        const previous=scratch.brushBehavior?.previous
        assertBristleInitializationSize140(scratch.brushBehavior?.bristle?.initialization,previous?[previous,...dabs]:dabs)
        if(!scratch.brushBehavior?.bristle?.initialization&&hasBristleSource143Scope(brush))assertBristleSource143Ready(brush)
      }
    }
    if(brush.bristle?.version===2&&brush.bristle.soak){
      if(!hasBristleSoak139Scope(brush))throw Error('Invalid Bristle Soak139 scope')
      if(brush.bristle.soak.resizePolicy==='mask-population-v1'&&dabs.length){
        assertBrushSourceInputs(brush,dabs)
        const previous=scratch.brushBehavior?.previous
        assertBristleInitializationSize140(scratch.brushBehavior?.bristle?.initialization,previous?[previous,...dabs]:dabs)
      }
      const valid=dabs.filter(d=>Number.isFinite(d.size)&&d.size>0),state=scratch.brushBehavior,oldAnchor=state?.bristle?.previous
      const previous=oldAnchor?{...(state?.previous??valid[0]??_previous!),...oldAnchor}:_previous
      const line=firstBristleLine139(valid,previous)
      if(line){
        if(!runtime)throw Error('Bristle Soak requires canonical BEGIN runtime')
        const ready=this.prepareBristleSoakGesture(target,line,runtime.binding.userId,runtime.binding.strokeId,stamp,execution,runtime,scratch)
        if(ready.kind==='notReady')return{...ready,acceptedDabs:0}
      }
      if(state?.bristle?.soak&&(!runtime||canonicalBeginBindingKey(state.bristle.soak.binding)!==canonicalBeginBindingKey(runtime.binding)))return{kind:'notReady',reason:'prefix',retryKey:(runtime?.binding.prefixKey??'missing')+':bristle-soak',acceptedDabs:0}
      if(valid.length)this.behavior.paint(target,valid,preset,normalizeBrush(brush),stamp.pressure,color,scratch,false,undefined,execution)
      return{kind:'painted',acceptedDabs:dabs.length}
    }
    this.behavior.paint(target,dabs,preset,normalizeBrush(brush),stamp.pressure,color,scratch,false,undefined,execution,!!brush.behavior?.erase,runtime)
  }
prepareCloneBeginGesture(target:ILayerBuffer,first:Dab,userId:string,strokeId:string,paint:{brush:BrushDescriptor;pressure:BrushPressureSettings},execution:BrushExecutionContext|undefined,runtime:CanonicalBeginRuntime,scratch:BehaviorScratch):CanonicalBeginPrepareResult{
 return this.behavior.prepareCloneBeginGesture(target,first,userId,strokeId,paint,execution,runtime,scratch)
}
cloneBeginBinding(scratch:BehaviorScratch):CanonicalBeginBinding|undefined{return this.behavior.cloneBeginBinding(scratch)}
invalidateCloneBegin(scratch:BehaviorScratch):void{this.behavior.invalidateCloneBegin(scratch)}

  prepareBristleSoak(brush:BrushDescriptor):void {
    if(!hasBristleSoak139Scope(brush)||brush.bristle?.version!==2)throw Error('Invalid Bristle Soak139 scope')
    this.prepareBristleInk(brush.bristle.ink,brush.bristle.antialias,brush.bristle.compositing,brush)
    ;(this.soakGather??=new BristleSoakGather139(this.ctx.gl)).prepare()
  }
  prepareFilterSmudge147(brush?:BrushDescriptor):void{if(brush?.filter&&'maskPolicy'in brush.filter)this.prepareRecordedStampResources(brush);this.behavior.prepareFilterSmudge147(brush)}
  prepareFilterBeginGesture(target:ILayerBuffer,first:Dab,userId:string,strokeId:string,paint:{brush:BrushDescriptor;pressure:BrushPressureSettings},execution:BrushExecutionContext|undefined,runtime:CanonicalBeginRuntime,scratch:BehaviorScratch):CanonicalBeginPrepareResult{if(paint.brush.filter&&'maskPolicy'in paint.brush.filter){const resources=this.recordedStampResources(paint.brush)!;if(resources.some(r=>r.painter==='stamp'&&!this.hasPreparedTexture(r)))throw Error('Filter169 mask bank is not prepared')}return this.behavior.prepareFilterBeginGesture(target,first,userId,strokeId,paint,execution,runtime,scratch)}
  filterBeginBinding(scratch:BehaviorScratch):CanonicalBeginBinding|undefined{return this.behavior.filterBeginBinding(scratch)}
  invalidateFilterBegin(scratch:BehaviorScratch):void{this.behavior.invalidateFilterBegin(scratch)}
  prepareSprayBeginGesture(target:ILayerBuffer,first:Dab,userId:string,strokeId:string,paint:{brush:BrushDescriptor;pressure:BrushPressureSettings},execution:BrushExecutionContext|undefined,runtime:CanonicalBeginRuntime,scratch:BehaviorScratch):CanonicalBeginPrepareResult{return this.behavior.prepareSprayBeginGesture(target,first,userId,strokeId,paint,execution,runtime,scratch)}
  sprayBeginBinding(scratch:BehaviorScratch):CanonicalBeginBinding|undefined{return this.behavior.sprayBeginBinding(scratch)}
  invalidateSprayBegin(scratch:BehaviorScratch):void{this.behavior.invalidateSprayBegin(scratch)}
  bristleSoakBinding(scratch:BehaviorScratch):CanonicalBeginBinding|undefined{return scratch.brushBehavior?.bristle?.soak?.binding}
  invalidateBristleSoak(scratch:BehaviorScratch):void {if(this.bristleSoakBinding(scratch))scratch.brushBehavior=undefined}
  prepareBristleSoakGesture(target:ILayerBuffer,line:BristleFirstLine139,userId:string,strokeId:string,paint:{brush:BrushDescriptor;pressure:BrushPressureSettings},execution:BrushExecutionContext|undefined,runtime:CanonicalBeginRuntime,scratch:BehaviorScratch):CanonicalBeginPrepareResult {
    const brush=paint.brush,binding=runtime.binding
    if(!hasBristleSoak139Scope(brush)||runtime.capability!=='bristleSoak139'||userId!==binding.userId||strokeId!==binding.strokeId||!firstBristleLine139([line.previous,line.current]))throw Error('Invalid Bristle Soak BEGIN identity')
    assertBrushSourceInputs(brush,[line.previous,line.current]);assertBrushExecutionContext(brush,execution)
    this.behavior.assertBristleSoakPrepared139(brush);this.soakGather?.assertPrepared()
    if(!this.soakGather||!this.ctx.openCanonicalBegin||!this.ctx.acquireSprayScratch)throw Error('Bristle Soak source/gather owner is unavailable')
    if(scratch.brushBehavior)assertSameBrushExecutionContext(scratch.brushBehavior.execution,execution)
    const existing=scratch.brushBehavior?.bristle?.soak
    const resize=brush.bristle?.version===2&&brush.bristle.soak?.resizePolicy==='mask-population-v1'
    const anchor=scratch.brushBehavior?.previous
    const sourceSize=resize?assertBristleInitializationSize140(scratch.brushBehavior?.bristle?.initialization,anchor?[anchor,line.previous,line.current]:[line.previous,line.current]):undefined
    if(existing)return canonicalBeginBindingKey(existing.binding)===canonicalBeginBindingKey(binding)?{kind:'ready'}:{kind:'notReady',reason:'prefix',retryKey:binding.prefixKey+':bristle-soak'}
    const prior=scratch.brushBehavior
    if(prior?.bristle?.ordinal)throw Error('Bristle Soak capture after accepted line is forbidden')
    const initialization=resize?buildBristleInitialization140(brush,sourceSize!):undefined
    const points=bristleSoakPoints139(brush,line.previous,initialization),opened=this.ctx.openCanonicalBegin(target,binding,'bristleSoak139')
    if(opened.kind==='notReady')return opened
    let failed=false,primary:unknown,rgba:Uint8Array|undefined
    try{
      if(canonicalBeginBindingKey(opened.view.binding)!==canonicalBeginBindingKey(binding))throw Error('Bristle Soak source authority mismatch')
      rgba=points.length?this.soakGather.gather(opened.view,points,()=>this.ctx.acquireSprayScratch!(64,64)):new Uint8Array(0)
      if(resize&&rgba.length!==points.length*4)throw Error('Bristle resized palette population mismatch')
      opened.view.assertCurrent()
    }catch(error){failed=true;primary=error}
    finally{try{opened.view.release()}catch(error){if(!failed){failed=true;primary=error}}}
    if(failed)throw primary
    if(scratch.brushBehavior!==prior)throw Error('Bristle Soak owner changed during capture')
    // Publish only after successful gather, authority checks AND source release.
    const state=prior??beginBrushBehavior(line.previous,execution)
    const bristle=state.bristle??{ordinal:0,oldPressure:1,ends:[]}
    state.bristle={...bristle,...(initialization?{initialization,ink:initialization.hairs.length?createBristleInkState(initialization.hairs.length):undefined}:{}),soak:{binding:structuredClone(binding),rgba:rgba!}}
    scratch.brushBehavior=state
    return{kind:'ready'}
  }
  paintMask(target:Pick<ILayerBuffer,'resolveForPaint'|'markContentPainted'>,dabs:Dab[],brush:BrushDescriptor,pressure:boolean,scratch:BehaviorScratch,sizeMultiplier:number,execution?:BrushExecutionContext):void {
    this.behavior.paint(target,dabs,{opacity:1,hardness:1,sizeMultiplier},normalizeBrush(brush),{size:true,opacity:pressure},[1,1,1],scratch,false,undefined,execution)
  }

  hasPreparedTexture(resource: BrushPreparationResource): boolean {
    return resource.bristleSaturation?this.saturationResources.ready(resource.bristleSaturation):this.textures.get(brushTextureResourceKey(resource)) !== undefined
  }

  prepareFilter():void{this.behavior.prepareFilter()}
  preparePolygon():void{this.behavior.preparePolygon()}
  prepareExperimentPatternPrograms():void{this.behavior.prepareExperimentPattern()}
  prepareExperimentPattern(brush:BrushDescriptor,pattern:BrushPattern|undefined):void{
    if(!hasExperimentCurrentPattern158Scope(brush)||!isBrushPattern(pattern))throw Error('Experiment158 requires a captured pattern or none')
    const resources=bindBrushPattern(brushPreparationResources(brush),pattern)
    assertNativeImageAdmission(resources,this.imageDimensionLimit())
    const release=this.textures.leaseRequired(brushTextureLeasePlan(resources,'stamp'))
    let failed=false
    try{this.behavior.prepareExperimentPattern();for(const resource of resources)if(resource.painter==='stamp'&&!this.hasPreparedTexture(resource))this.prepareTexture(resources,resource)}catch(error){failed=true;throw error}finally{if(failed){try{release()}catch{/* Preserve first error. */}}else release()}
  }
  prepareHatching():void{this.behavior.prepareHatching()}
  prepareCloneHealing152():void{this.behavior.prepareCloneHealing152()}
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
  prepareBristleNativeAA142():void{this.behavior.prepareBristleNativeAA142()}
  prepareSketchLines():void{this.behavior.prepareSketchLines()}
  prepareGridWash():void{
    const resources:BrushPreparationResource[]=[{id:'cloud',grain:true,painter:'stamp'},{id:'grit',grain:true,painter:'stamp'}]
    const release=this.textures.leaseRequired(brushTextureLeasePlan(resources,'stamp'))
    let failed=false
    try{this.behavior.prepareGridWash();for(const resource of resources)if(!this.hasPreparedTexture(resource))this.prepareTexture(resources,resource)}catch(error){failed=true;throw error}finally{try{release()}catch(error){if(!failed)throw error}}
  }
  assertGridWashPrepared():void{this.behavior.assertGridWashPrepared()}
  borrowRequestWash():BorrowedGridWash{
    const resources:BrushPreparationResource[]=[{id:'cloud',grain:true,painter:'stamp'},{id:'grit',grain:true,painter:'stamp'}]
    const release=this.textures.leaseRequired(brushTextureLeasePlan(resources,'stamp'))
    try{if(resources.some(resource=>!this.hasPreparedTexture(resource)))throw Error('Grid Wash composite resources were not prepared');return{...this.behavior.borrowGridWash(),release}}
    catch(error){try{release()}catch{/* Preserve primary. */}throw error}
  }
  prepareParticleWash():void{this.behavior.prepareParticleWash()}
  prepareBristleWash():void{this.behavior.prepareBristleWash()}
  prepareSprayShapes():void { this.behavior.prepareSprayShapes() }
  prepareSpraySources(wash=false):void{this.behavior.prepareSpraySources(wash)}
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
    if(group.some(r=>r.canvasPattern||r.gradientSource||r.gradientPalette||r.patternAlpha)){
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
    assertTextureGradientWash180Planes(brush)
    assertBrushExecutionContext(brush,execution)
    const resources=bindBrushGradient(brushPreparationResources(brush),execution?.brushSource?.gradient)
    if(hasTextureGradientWash180Scope(brush)){const required=this.recordedStampResources(brush,resources,true);if(!required)throw Error('Texture Gradient Wash180 bank missing');this.acquireRecordedStampResources(required,true,brush)();return}
    assertNativeImageAdmission(resources,this.imageDimensionLimit())
    const release=this.textures.leaseRequired(brushTextureLeasePlan(resources,'stamp'));let failed=false
    try{this.prepareStampEffects(false,'gradient');for(const resource of resources)if(resource.painter==='stamp'&&!this.hasPreparedTexture(resource))this.prepareTexture(resources,resource)}catch(error){failed=true;throw error}finally{if(failed){try{release()}catch{/* Preserve first error. */}}else release()}
  }

  /** Recorded palette bound before any paint/state mutation; no lazy view upload. */
  preparePixelGradient(brush:BrushDescriptor,execution?:BrushExecutionContext):void{
    const mask190=hasIndependentMask190Scope(brush)
    if(mask190){
      const components=[brush,brush.behavior!.dual!.brush]
      if(!components.some(b=>usesPixelOriginalRgba(b)&&!!b.tip.color&&'gradient'in b.tip.color))return
      assertBrushExecutionContext(brush,execution)
      for(const component of components)if(usesPixelOriginalRgba(component))pixelOriginalRgbaFrames(component,true)
      const resources=bindBrushGradient(brushPreparationResources(brush),execution?.brushSource?.gradient)
      const required=this.recordedStampResources(brush,resources,true)
      if(!required)throw Error('Mask190 gradient resource bank is missing')
      this.acquireRecordedStampResources(required,true,brush,true)()
      return
    }
    if(!usesPixelOriginalRgba(brush)||!brush.tip.color||!('gradient'in brush.tip.color))return
    const sensor=!!brush.tip.animation
    if(sensor){pixelOriginalRgbaFrames(brush,mask190);assertBrushExecutionContext(brush,execution)}
    const resources=bindBrushGradient(brushPreparationResources(brush),execution?.brushSource?.gradient)
    if(sensor){
      const required=this.recordedStampResources(brush,resources,true)
      if(!required)throw Error('Bound Gradient125 resource owner is missing')
      this.acquireRecordedStampResources(required,true,brush,true)()
      return
    }
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
