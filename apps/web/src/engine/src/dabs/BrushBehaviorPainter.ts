import{hasParticleTimer157Scope}from'@grafetto/shared'
import{hasFilterGaussian153Scope}from'@grafetto/shared'
import{planGaussian153}from'./filterGaussian153Plan'
import{hasSprayRectangleNoise155Scope}from'@grafetto/shared'
import{planCloneHealing152}from'./cloneHealing152Math'
import{cloneSourceOffset152}from'./cloneHealing152Request'
import{hasCloneHealing152Scope}from'@grafetto/shared'
import{CanonicalBeginBlocked}from'./CanonicalBeginRuntime'
import{CloneHealingPass152}from'./CloneHealingPass152'
import{hasPixelOriginalDual151Scope}from'@grafetto/shared'
import {hasCloneProjection149Scope}from'@grafetto/shared'
import{FilterSmudge147Pass,FilterSmudge147State,FilterSmudge147Blocked,type FilterSmudge147Request}from'./FilterSmudge147'
import{hasFilterSmudge147Scope}from'@grafetto/shared'
import {CanonicalBeginSource} from './CanonicalBeginSource'
import {canonicalBeginBindingKey,type CanonicalBeginRuntime,type CanonicalBeginPrepareResult,type CanonicalBeginBinding} from './CanonicalBeginRuntime'
import {hasSpraySource146Scope} from '@grafetto/shared'
import {bristleNativeAA142Bounds} from './bristleNativeAA142'
import {firstBristleLine139} from './CanonicalBeginRuntime'
import {hasBristleSoak139Scope,hasBristleNativePointCoverage} from '@grafetto/shared'
import{hasPixelGradientWash138Scope}from'@grafetto/shared'
import type{BorrowedGridWash}from'./GridWashRuntime'
import{hasTangentNormalWash136Scope}from'@grafetto/shared'
import{hasBristleWash135Scope}from'@grafetto/shared'
import{hasParticleWash134Scope}from'@grafetto/shared'
import{RequestWashBatch}from'./RequestWashBatch'
import{sprayWashRegions}from'../presets/sprayWash133'
import{hasSprayWash133Scope,isBrushSpray}from'@grafetto/shared'
import{assertUnequalLightnessGih124}from'../presets/gihUnequalLightness124'
import{assertEqualLightnessGih123}from'../presets/gihEqualLightness123'
import{isFilterDescriptor}from'@grafetto/shared'
import {textureMaterialVariant,type TextureMaterialVariant} from '../presets/textureLightness'
import{prepareSketchMask}from'../presets/sketchMask'
import type {PreparedBristleSaturationResource} from './BristleSaturationResource'
import {advancePreparedBristleSaturationInk} from '../presets/brushBristleSaturationTable'
import {prepareVariableGih,usesVariableGih,variableGihStamp} from '../presets/gihFramePreparation'
import {usesPixelOriginalRgba,usesFilteredPixelGradient,assertPixelOriginalRgba,pixelOriginalRgbaFrames,capturePixelOriginalRgbaView,type PixelOriginalRgbaView} from '../presets/pixelOriginalRgba'
import{SprayRequestPainter}from'./SprayRequestPainter'
import{TiledLayerBuffer}from'../buffers/TiledLayerBuffer'
import{SprayImageBatch}from'./SprayImageBatch'
import type{PreparedBrushImageView}from'./PreparedBrushImageView'
import {prepareGaussianRectangle,gaussianRectangleUniforms} from '../raster/autoRectangle'
import {textureEraseId} from '../presets/brushTextureErase'
import {prepareAutoMaskNoise,autoMaskNoiseUniforms,autoMaskNoiseCoordinateBytes,prepareAutoMaskNoiseGrid,autoMaskNoiseGridUniforms,type AutoMaskNoiseGrid} from '../raster/autoMaskNoise'
import {createBristleInkState,type BristleInkSettings} from '../presets/brushBristleInk'
import {advanceBristleInkBulk} from '../presets/brushBristleInkBulk'
import type {BristleInkGeometry} from '../presets/brushBristle'
import {autoSpikeAllocation} from '../raster/autoSpikes'
import {hatchingBackgroundUniform} from '../raster/hatchingBackground'
import {BristleRequestBatch} from './BristleRequestBatch'
import{tangentNormalColor}from'../presets/brushTangentNormal'
import{MyPaintStrokePainter}from'./MyPaintStrokePainter'
import{CloneBrushPass}from'./CloneBrushPass'
import{curveInputRequests,finishCurveInput}from'../presets/curveInput'
import{FilterBrushPass}from'./FilterBrushPass'
import{PolygonFillBatch}from'./PolygonFillBatch'
import{hatchingStampFragment}from'../raster/brushHatchingShader'
import{hatchingPlane}from'../presets/brushHatching'
import {SketchLineBatch} from './SketchLineBatch'
import { SprayShapeBatch } from './SprayShapeBatch'
import { assertBrushSourceInputs, assertBrushExecutionContext, assertSameBrushExecutionContext, type BrushExecutionContext } from '../presets/brushExecutionContext'
import { brushAlphaThresholdValue } from '../presets/brushAlphaThreshold'
import { CIRCLE_BAND_STAMP_FRAG } from '../raster/circleBandShaders'
import { prepareCircleDifference, type CircleDifference } from '../raster/roundCoverage'
import { nativeImageResource, nativeImageDomain, nativeImageDomainUniform, nativeImageUVShift, type NativeImageResource } from './NativeImageBank'
import { proceduralProfileUniforms, standardSoftnessProfile, proceduralSampleCount } from '../raster/brushProcedural'
import { gaussianSampleCount } from '../raster/gaussianTip'
import { brushUsesStampEffects, brushTipSoftnessBasisUniforms, brushTipSamplerId, brushTipProfileUniforms, brushTipResource, brushTextureResourceKey } from './BrushPreparation'
import type { MaterialTextureGroup } from '../presets/brushMaterialPacking'
import { advanceWashOpacity } from '../presets/brushWash'
import { brushTextureApplication } from './brushTextureApplication'
import { brushFootprintBounds, brushFootprintCopyRect } from './brushFootprint'
import { BRUSH_BLEND_MODES, type BrushBristle, type BrushDescriptor, type BrushTip, type Dab } from '@grafetto/shared'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { ILayerBuffer } from '../buffers/ILayerBuffer'
import { wetMixStep } from '../presets/wetMix'
import type { PencilPreset } from '../presets/pencilPresets'
import { beginBrushBehavior, behaviorStampsForDab, secondaryBrushDabs, splitBrushTail, type BehaviorPlaced, type BrushBehaviorState, type SecondarySamplingState } from '../presets/brushBehavior'
import { digitalBrushCeiling, brushDabRandom, curveAt, type BrushPressureSettings } from '../presets/digitalBrushPresets'
import type { BrushTextureId, TipMaskId } from '../presets/tipMasks'
import { BRUSH_COMPOSITE_FRAG, createBrushCompositeFragment, BRUSH_STAMP_FRAG, createBrushStampFragment } from '../raster/brushBehaviorShaders'
import { DAB_VERT } from '../raster/shaders'
import { createProgram, getUniforms } from '../raster/utils'
import type { BrushContext, BrushScratch } from './BrushPainter'
const NOISE_UNIFORMS=['u_gihFrame','u_gihSampleX','u_gihSampleY','u_originalRgbaTip','u_rectangleCoefficients','u_rectangleGeometry','u_autoNoiseConfig','u_autoNoiseKey','u_autoNoiseGridX','u_autoNoiseGridY']
const STAMP_UNIFORMS = [ 'u_autoSpikes','u_autoSpikeAngle','u_dualFlip', 'u_hatchBackground', 'u_tipSoftnessBasis','u_dualSoftnessBasis','u_tipSoftness','u_dualSoftness', 'u_hatch0','u_hatch1','u_hatch2','u_hatchStyle',
  'u_circleClipped', 'u_circleClip0', 'u_circleClip1', 'u_circleClip2', 'u_circleClip3',
  'u_gaussianGeometry', 'u_tipProfile', 'u_dualProfile', 'u_wickPx',
  'u_wickCap', 'u_tipPacking', 'u_dualTipPacking', 'u_lightnessMaterial',
  'u_lightnessStrength', 'u_dualLightnessMaterial', 'u_textureApplication', 'u_textureMapping',
  'u_dualTextureApplication', 'u_dualTextureMapping', 'u_alphaThreshold', 'u_dualAlphaThreshold',
  'u_tipBounds', 'u_dualBounds', 'u_edgeBleed', 'u_ceilingPass',
  'u_uniformCeiling', 'u_washMode', 'u_washFlow', 'u_washAverage',
  'u_ceilingFallback', 'u_previousCeiling', 'u_dabCenter', 'u_dabRadius',
  'u_angle', 'u_aspectRatio', 'u_resolution', 'u_opacity',
  'u_paperHeightMap', 'u_tip', 'u_paperScale', 'u_paperOrigin',
  'u_paperTexSize', 'u_tipKind', 'u_hardness', 'u_aaPx',
  'u_ceiling', 'u_paper', 'u_paperPressure', 'u_texture',
  'u_texStrength', 'u_texPeriod', 'u_texOrigin', 'u_color',
  'u_flip', 'u_grainTransform', 'u_grainTone', 'u_grainBlend',
  'u_dual', 'u_dualKind', 'u_dualBlend', 'u_dualTransform',
  'u_dualHardness', 'u_dualStrength', 'u_dualTexture', 'u_dualTexOrigin',
  'u_dualTexPeriod', 'u_dualTexStrength', 'u_tipProcedural', 'u_dualProcedural',
  'u_tipProceduralGeometry', 'u_dualProceduralGeometry', 'u_dualProceduralAngle',
  'u_tipImageEnabled', 'u_dualImageEnabled', 'u_tipImageUVShift','u_dualImageUVShift','u_tipImageDomain', 'u_dualImageDomain',
]
type BrushTarget = Pick<ILayerBuffer,'resolveForPaint'|'markContentPainted'>&Partial<Pick<ILayerBuffer,'resolveVisible'>>
export interface BehaviorScratch extends BrushScratch {
  canonicalSource?:CanonicalBeginSource
  filterSmudge147State?:FilterSmudge147State
  brushSecondary(): {scratch:BehaviorScratch;sampling:SecondarySamplingState;tile:(source:AccumulationBuffer)=>AccumulationBuffer}
  brushNative?:{destroy():void}
  brushBehavior?: BrushBehaviorState
  brushCeiling(tile: AccumulationBuffer): AccumulationBuffer
  brushCeilingCopy(tile: AccumulationBuffer): AccumulationBuffer
  brushPreview(tile: AccumulationBuffer): {
    coverage: AccumulationBuffer
    ceiling: AccumulationBuffer
  }
}
const modes = ['lightGlaze', 'uniformGlaze', 'intenseGlaze', 'heavyGlaze', 'uniformBlend', 'intenseBlend', 'buildUp']
const clamp = (v: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, v))
const blend = (name: string | undefined): number => Math.max(0, BRUSH_BLEND_MODES.indexOf(name as typeof BRUSH_BLEND_MODES[number]))
type Uniforms = Record<string, WebGLUniformLocation | null>
type BrushBounds = { minX: number; minY: number; maxX: number; maxY: number }
const unionBounds = (a: BrushBounds | undefined, b: BrushBounds): BrushBounds => a ? ({
  minX: Math.min(a.minX,b.minX), minY: Math.min(a.minY,b.minY),
  maxX: Math.max(a.maxX,b.maxX), maxY: Math.max(a.maxY,b.maxY),
}) : b
/** Bounds in world coordinates -> integer GL copy rectangle. */
const boundsCopyRect = (bounds: BrushBounds, tile: { originX: number; originY: number; buffer: AccumulationBuffer }, halo = 0) => {
  const left = Math.max(0,Math.floor(bounds.minX-tile.originX-halo))
  const right = Math.min(tile.buffer.width,Math.ceil(bounds.maxX-tile.originX+halo))
  const top = Math.max(0,Math.floor(bounds.minY-tile.originY-halo))
  const bottom = Math.min(tile.buffer.height,Math.ceil(bounds.maxY-tile.originY+halo))
  return right>left && bottom>top ? { x:left,y:tile.buffer.height-bottom,width:right-left,height:bottom-top } : null
}
/** Uses the same frozen-original / coverage resources as the other digital brushes.
 * Only v2 descriptors opt into colour coverage and these equations. */
export class BrushBehaviorPainter {
  private polygonBatch?:PolygonFillBatch
  private hatchingStamp?: {program:WebGLProgram;uniforms:Uniforms;position:number}
  private sketchBatch?:SketchLineBatch
  private bristleRequests?:BristleRequestBatch
  private lineStaging?:Float32Array<ArrayBuffer>
  private sharedLineStaging():Float32Array<ArrayBuffer>{return this.lineStaging??=new Float32Array(2048*6*10)}
  private requestWash?:RequestWashBatch
  private sprayRequestPainter?:SprayRequestPainter
  private sprayImageBatch?:SprayImageBatch
  private sprayBatch?:SprayShapeBatch
  private circleStamp?: { program: WebGLProgram; uniforms: Uniforms; position: number }
  private previewBounds = new WeakMap<BrushBehaviorState,BrushBounds>()
  private bindings = new WeakMap<BehaviorScratch, {
    execution?: BrushExecutionContext
    effectiveErase:boolean
    runtime?:CanonicalBeginRuntime
    target: BrushTarget
    preset: PencilPreset
    brush: BrushDescriptor
    pressure: BrushPressureSettings
    color: [
      number,
      number,
      number
    ]
  }>();
  private minmax: {
    MAX_EXT: number
  } | null = null;
  private stamp!: WebGLProgram
  private textureGradientStamp?:{program:WebGLProgram;uniforms:Uniforms;position:number}
  private lightnessStamp?:{program:WebGLProgram;uniforms:Uniforms;position:number}
  private gradientStamp?:{program:WebGLProgram;uniforms:Uniforms;position:number}
  private effectsStamp?: {program:WebGLProgram;uniforms:Uniforms;position:number}
  private curveStamp?: { program: WebGLProgram; uniforms: Uniforms; position: number }
  private imageStamp?: { program: WebGLProgram; uniforms: Uniforms; position: number }
  private proceduralStamp?: { program: WebGLProgram; uniforms: Uniforms; position: number }
  private extendedComposite?: {program:WebGLProgram;uniforms:Uniforms;position:number}
  private composite!: WebGLProgram
  private su!: Uniforms
  private cu!: Uniforms
  private sp = -1;
  private cp = -1;
  private readonly saturationResource?:(bristle:BrushBristle)=>PreparedBristleSaturationResource
  private readonly ctx: BrushContext
  private readonly tip: (id: TipMaskId, gray?: string, group?: MaterialTextureGroup, native?: NativeImageResource, lookup32?: true) => WebGLTexture
  private readonly grain: (id: BrushTextureId, discrete?: boolean) => WebGLTexture
  private readonly protectTextures: (keys: readonly string[]) => void
  private readonly leaseTextures: (brush: BrushDescriptor,effectiveErase?:boolean,gradientLut?:string) => () => void
  private readonly preparedImage:(id:TipMaskId,planes:readonly[string,string,string],bounds?:BrushTip["maskBounds"],gradientLut?:string,sampling?:'filteredGray-v1')=>PreparedBrushImageView
  private readonly preparedTextureLightness:(brush:BrushDescriptor,lut?:string)=>PreparedBrushImageView
  private readonly preparedSprayMask:(id:TipMaskId,bounds?:BrushTip["maskBounds"])=>PreparedBrushImageView
  constructor(ctx: BrushContext, tip: (id: TipMaskId, gray?: string, group?: MaterialTextureGroup, native?: NativeImageResource, lookup32?: true) => WebGLTexture, grain: (id: BrushTextureId, discrete?: boolean) => WebGLTexture, protectTextures: (keys: readonly string[]) => void, leaseTextures: (brush: BrushDescriptor,effectiveErase?:boolean,gradientLut?:string) => () => void,preparedImage:(id:TipMaskId,planes:readonly[string,string,string],bounds?:BrushTip["maskBounds"],gradientLut?:string,sampling?:'filteredGray-v1')=>PreparedBrushImageView=()=>{throw Error('Spray RGBA view owner is not installed')},preparedSprayMask:(id:TipMaskId,bounds?:BrushTip["maskBounds"])=>PreparedBrushImageView=()=>{throw Error('Spray mask view owner is not installed')},saturationResource?:(bristle:BrushBristle)=>PreparedBristleSaturationResource,preparedTextureLightness:(brush:BrushDescriptor,lut?:string)=>PreparedBrushImageView=()=>{throw Error('Texture Lightness108 view owner is not installed')}) { this.preparedTextureLightness=preparedTextureLightness;this.saturationResource=saturationResource;this.preparedImage=preparedImage;this.preparedSprayMask=preparedSprayMask;this.ctx = ctx; this.tip = tip; this.grain = grain; this.protectTextures = protectTextures; this.leaseTextures = leaseTextures }
  private tipView(id: TipMaskId, gray?: string, tip?: BrushTip, native?: NativeImageResource): {texture:WebGLTexture; mode:number} {
    if (tip?.imageSampling && !native) throw Error('Native image lookup requires an explicit selected level')
    const resource=brushTipResource(id,gray,tip)
    return {texture:this.tip(resource.id as TipMaskId,gray,resource.materialGroup,native,resource.lookup32),mode:resource.materialChannels==='rg' ? 1 : resource.materialChannels==='ba' ? 2 : 0}
  }
  private mypaintPass?:MyPaintStrokePainter
  private healingPass?:CloneHealingPass152
  prepareCloneHealing152():void{(this.healingPass??=new CloneHealingPass152(this.ctx.gl)).prepare();this.prepareClone()}
  private clonePass?:CloneBrushPass
  prepareClone():void{(this.clonePass??=new CloneBrushPass(this.ctx.gl)).prepare()}
  private filterSmudge147?:FilterSmudge147Pass
  prepareFilterSmudge147():void{(this.filterSmudge147??=new FilterSmudge147Pass(this.ctx.gl)).prepare()}
  private filterPass?:FilterBrushPass
  prepareFilter():void{(this.filterPass??=new FilterBrushPass(this.ctx.gl)).prepare()}
  initGL(): void {
    this.mypaintPass?.destroy();this.mypaintPass=undefined
    this.healingPass?.forget();this.clonePass?.forget()
    this.filterSmudge147?.forget()
    this.filterPass?.forget()
    this.polygonBatch?.reset()
    this.sketchBatch?.reset()
    this.bristleRequests?.reset()
    this.sprayRequestPainter?.reset()
    this.requestWash?.reset()
    this.sprayImageBatch?.reset()
    this.sprayBatch?.reset()
    this.hatchingStamp=undefined
    this.circleStamp = undefined
    this.proceduralStamp = undefined
    this.curveStamp = undefined
    this.gradientStamp=undefined
    this.lightnessStamp=undefined
    this.textureGradientStamp=undefined
    this.effectsStamp = undefined
    this.imageStamp = undefined
    const gl = this.ctx.gl
    this.minmax = gl.getExtension('EXT_blend_minmax') as {
      MAX_EXT: number
    } | null
    this.stamp = createProgram(gl, DAB_VERT, BRUSH_STAMP_FRAG)
    this.extendedComposite=undefined
    this.composite = createProgram(gl, DAB_VERT, BRUSH_COMPOSITE_FRAG)
    this.su = getUniforms(gl, this.stamp, STAMP_UNIFORMS)
    this.cu = getUniforms(gl, this.composite, ['u_physicalAccumulation','u_dabCenter', 'u_dabRadius', 'u_angle', 'u_aspectRatio', 'u_resolution', 'u_original', 'u_strokeCoverage', 'u_ceiling', 'u_opacity', 'u_blend', 'u_mode', 'u_burntEdge', 'u_burntBlend', 'u_edgePx', 'u_luminance', 'u_gammaCorrect', 'u_secondaryCoverage', 'u_secondaryMode', 'u_secondaryEnabled', 'u_surfaceCloud', 'u_surfaceGrain', 'u_surface', 'u_surfaceOrigin', 'u_screenOrigin', 'u_screentone', 'u_erase'])
    this.sp = gl.getAttribLocation(this.stamp, 'a_position')
    this.cp = gl.getAttribLocation(this.composite, 'a_position')
  }
  /** Compile the bounded profile capability during explicit brush readiness. */
  prepareCompositeEffects():void{if(!this.extendedComposite){const gl=this.ctx.gl,program=createProgram(gl,DAB_VERT,createBrushCompositeFragment(true));this.extendedComposite={program,uniforms:getUniforms(gl,program,['u_physicalAccumulation','u_dabCenter', 'u_dabRadius', 'u_angle', 'u_aspectRatio', 'u_resolution', 'u_original', 'u_strokeCoverage', 'u_ceiling', 'u_opacity', 'u_blend', 'u_mode', 'u_burntEdge', 'u_burntBlend', 'u_edgePx', 'u_luminance', 'u_gammaCorrect', 'u_secondaryCoverage', 'u_secondaryMode', 'u_secondaryEnabled', 'u_surfaceCloud', 'u_surfaceGrain', 'u_surface', 'u_surfaceOrigin', 'u_screenOrigin', 'u_screentone', 'u_erase']),position:gl.getAttribLocation(program,'a_position')}}}
  preparePolygon():void{(this.polygonBatch??=new PolygonFillBatch(this.ctx.gl)).prepare()}
  prepareHatching():void{this.hatchingProgram()}
  private hatchingProgram():{program:WebGLProgram;uniforms:Uniforms;position:number}{
    if(!this.hatchingStamp){const gl=this.ctx.gl,program=createProgram(gl,DAB_VERT,hatchingStampFragment(createBrushStampFragment(true,true,true)));this.hatchingStamp={program,uniforms:getUniforms(gl,program,STAMP_UNIFORMS),position:gl.getAttribLocation(program,'a_position')}}
    return this.hatchingStamp
  }
  prepareProcedural(): void { this.stampFor(true) }

  prepareBristleInk(settings:BristleInkSettings,antialias:boolean,compositing:boolean,bristle?:BrushBristle):void{
    const batch=this.bristleRequests??=new BristleRequestBatch(this.ctx.gl,this.sharedLineStaging())
    if(settings.useSaturation){
      if(!bristle||bristle.version!==2||bristle.ink!==settings||!this.saturationResource)throw Error('Compiled Bristle saturation owner is not installed')
      if(bristle.version===2&&bristle.soak)batch.prepareCompiledSaturation(settings,this.saturationResource(bristle),!antialias&&!compositing,true)
      else batch.prepareCompiledSaturation(settings,this.saturationResource(bristle),!antialias&&!compositing)
    }else if(bristle?.version===2&&bristle.soak)batch.prepareInkProfile(settings,!antialias&&!compositing,true)
    else batch.prepareInkProfile(settings,!antialias&&!compositing)
  }
  releaseBristleSaturation():void{this.bristleRequests?.releaseSaturationResource()}
  prepareBristleNativeAA142():void{(this.bristleRequests??=new BristleRequestBatch(this.ctx.gl,this.sharedLineStaging())).prepareNativeAA142()}
  prepareBristleRequests():void{(this.bristleRequests??=new BristleRequestBatch(this.ctx.gl,this.sharedLineStaging())).preparePrograms()}
  prepareSketchLines():void{(this.sketchBatch??=new SketchLineBatch(this.ctx.gl,this.sharedLineStaging())).prepare()}
  prepareSpraySources(wash=false):void{
    this.sprayRequestPainter??=new SprayRequestPainter(this.ctx,(w,h)=>{if(!this.ctx.acquireSprayScratch)throw Error('Spray scratch owner is unavailable');return this.ctx.acquireSprayScratch(w,h)},(stamp,brush)=>{const id=stamp.mask??brush.tip.mask,planes=stamp.colorPlanes;if(!id||!planes)throw Error('Spray original image is unavailable');return this.preparedImage(id,planes,brush.tip.maskBounds)},(stamp,brush)=>{if(brush.spray?.particle.shape!=='tip')return undefined;const id=stamp.mask??brush.tip.mask;return id?this.preparedSprayMask(id,brush.tip.maskBounds):undefined})
    this.sprayRequestPainter.prepare(wash,wash?this.prepareRequestWash():undefined)
  }
  prepareSprayImages():void{(this.sprayImageBatch??=new SprayImageBatch(this.ctx.gl)).prepare()}
  private prepareRequestWash():RequestWashBatch{const batch=this.requestWash??=new RequestWashBatch(this.ctx.gl);batch.prepare();return batch}
  prepareGridWash():void{this.prepareRequestWash()}
  assertGridWashPrepared():void{if(!this.requestWash||!this.composite)throw Error('Grid Wash was not prepared');this.requestWash.assertPrepared()}
  borrowGridWash():Omit<BorrowedGridWash,'release'>{
    const kernel=this.requestWash
    if(!kernel||!this.composite)throw Error('Grid Wash pipeline was not prepared')
    kernel.assertPrepared();const current=kernel.captureCurrent()
    return{kernel,present:(tile,bounds,entry,brush,opacity)=>{current();if(!entry.inkLoad)throw Error('Grid Wash ceiling missing');this.presentStrokeTile(tile,bounds,entry.inkLoad,entry.coverage,entry.inkLoad,brush,opacity)}}
  }
  prepareParticleWash():void{this.prepareRequestWash();this.prepareSprayShapes()}
  prepareBristleWash():void{this.prepareRequestWash();this.prepareSketchLines()}
  prepareSprayShapes():void{(this.sprayBatch??=new SprayShapeBatch(this.ctx.gl)).prepare()}

  prepareCircleBand(): void { this.circleProgram() }

  private circleProgram(): { program: WebGLProgram; uniforms: Uniforms; position: number } {
    if (!this.circleStamp) {
      const gl = this.ctx.gl, program = createProgram(gl, DAB_VERT, CIRCLE_BAND_STAMP_FRAG)
      this.circleStamp = { program, uniforms: getUniforms(gl, program, STAMP_UNIFORMS), position: gl.getAttribLocation(program, 'a_position') }
    }
    return this.circleStamp
  }

  prepareStampEffects(filteredGradient=false,textureLightness:TextureMaterialVariant=false):void{this.stampFor(true,true,true,true,filteredGradient,textureLightness)}
  prepareAutoNoise():void{this.prepareStampEffects()}
  prepareRadialCurves(): void { this.stampFor(true,true,true) }
  prepareIntegerImages(): void { this.stampFor(true, true) }

  private stampFor(procedural: boolean, integerImages = false, radialCurves = false,autoNoise=false,filteredGradient=false,textureLightness:TextureMaterialVariant=false): { program: WebGLProgram; uniforms: Uniforms; position: number } {
    if(textureLightness==='gradient'){
      if(!this.textureGradientStamp){const gl=this.ctx.gl,program=createProgram(gl,DAB_VERT,createBrushStampFragment(true,true,true,true,false,false,true));this.textureGradientStamp={program,uniforms:getUniforms(gl,program,[...STAMP_UNIFORMS,...NOISE_UNIFORMS,'u_textureMaterial','u_gradientPalette']),position:gl.getAttribLocation(program,'a_position')}}
      return this.textureGradientStamp
    }
    if(textureLightness){
      if(!this.lightnessStamp){const gl=this.ctx.gl,program=createProgram(gl,DAB_VERT,createBrushStampFragment(true,true,true,true,false,true));this.lightnessStamp={program,uniforms:getUniforms(gl,program,[...STAMP_UNIFORMS,...NOISE_UNIFORMS,'u_textureMaterial']),position:gl.getAttribLocation(program,'a_position')}}
      return this.lightnessStamp
    }
    if(filteredGradient){
      if(!this.gradientStamp){const gl=this.ctx.gl,program=createProgram(gl,DAB_VERT,createBrushStampFragment(true,true,true,true,true));this.gradientStamp={program,uniforms:getUniforms(gl,program,[...STAMP_UNIFORMS,...NOISE_UNIFORMS,'u_gradientPalette']),position:gl.getAttribLocation(program,'a_position')}}
      return this.gradientStamp
    }
    if(autoNoise){
      if(!this.effectsStamp){
        const gl=this.ctx.gl,program=createProgram(gl,DAB_VERT,createBrushStampFragment(true,true,true,true))
        this.effectsStamp={program,uniforms:getUniforms(gl,program,[...STAMP_UNIFORMS,...NOISE_UNIFORMS]),position:gl.getAttribLocation(program,'a_position')}
      }
      return this.effectsStamp
    }
    if (radialCurves) {
      if (!this.curveStamp) {
        const gl=this.ctx.gl,program=createProgram(gl,DAB_VERT,createBrushStampFragment(true,true,true))
        this.curveStamp={program,uniforms:getUniforms(gl,program,STAMP_UNIFORMS),position:gl.getAttribLocation(program,'a_position')}
      }
      return this.curveStamp
    }
    if (integerImages) {
      if (!this.imageStamp) {
        const gl = this.ctx.gl, program = createProgram(gl, DAB_VERT, createBrushStampFragment(true, true))
        this.imageStamp = { program, uniforms: getUniforms(gl, program, STAMP_UNIFORMS), position: gl.getAttribLocation(program, 'a_position') }
      }
      return this.imageStamp
    }
    if (!procedural) return { program: this.stamp, uniforms: this.su, position: this.sp }
    if (!this.proceduralStamp) {
      const gl = this.ctx.gl
      const program = createProgram(gl, DAB_VERT, createBrushStampFragment(true))
      this.proceduralStamp = { program, uniforms: getUniforms(gl, program, STAMP_UNIFORMS), position: gl.getAttribLocation(program, 'a_position') }
    }
    return this.proceduralStamp
  }
  sprayBeginBinding(scratch:BehaviorScratch):CanonicalBeginBinding|undefined{return scratch.canonicalSource?.capability==='spray146'?scratch.canonicalSource.binding:undefined}
  invalidateSprayBegin(scratch:BehaviorScratch):void{if(scratch.canonicalSource?.capability==='spray146'){const owner=scratch.canonicalSource;scratch.canonicalSource=undefined;scratch.brushBehavior=undefined;owner.release()}}
  prepareSprayBeginGesture(target:ILayerBuffer,first:Dab,userId:string,strokeId:string,paint:{brush:BrushDescriptor;pressure:BrushPressureSettings},execution:BrushExecutionContext|undefined,runtime:CanonicalBeginRuntime,scratch:BehaviorScratch):CanonicalBeginPrepareResult{
    const brush=paint.brush,binding=runtime.binding
    if(!hasSpraySource146Scope(brush)||runtime.capability!=='spray146'||userId!==binding.userId||strokeId!==binding.strokeId||!Number.isFinite(first.size)||first.size<=0)throw Error('Invalid Spray146 BEGIN identity')
    assertBrushSourceInputs(brush,[first]);assertBrushExecutionContext(brush,execution)
    if(scratch.brushBehavior)assertSameBrushExecutionContext(scratch.brushBehavior.execution,execution)
    const existing=scratch.canonicalSource
    if(existing){existing.assertCurrent();return existing.target===target&&existing.capability==='spray146'&&canonicalBeginBindingKey(existing.binding)===canonicalBeginBindingKey(binding)?{kind:'ready'}:{kind:'notReady',reason:'prefix',retryKey:binding.prefixKey+':spray146'}}
    if(scratch.brushBehavior?.dabSequence)throw Error('Spray146 capture after accepted request is forbidden')
    if(!this.ctx.openCanonicalBegin||!this.ctx.acquireSprayScratch||!this.ctx.reserveCanonicalBeginSource)throw Error('Spray146 canonical source owner is unavailable')
    if(!this.sprayRequestPainter)throw Error('Spray146 source pipeline is not prepared');this.sprayRequestPainter.assertSourcePrepared()
    const prior=scratch.brushBehavior,opened=this.ctx.openCanonicalBegin(target,binding,'spray146')
    if(opened.kind==='notReady')return opened
    const captured=CanonicalBeginSource.capture(target,binding,opened.view,(w,h)=>this.ctx.acquireSprayScratch!(w,h),bytes=>this.ctx.reserveCanonicalBeginSource!(binding,bytes),()=>this.ctx.canonicalResourcesReleased?.(),'spray146')
    if(captured.kind==='notReady')return captured
    if(scratch.brushBehavior!==prior||scratch.canonicalSource){captured.owner.release();throw Error('Spray146 owner changed during capture')}
    scratch.canonicalSource=captured.owner
    return{kind:'ready'}
  }
  filterBeginBinding(scratch:BehaviorScratch):CanonicalBeginBinding|undefined{return scratch.canonicalSource?.capability==='filterSmudge147'?scratch.canonicalSource.binding:undefined}
  invalidateFilterBegin(scratch:BehaviorScratch):void{if(scratch.canonicalSource?.capability!=='filterSmudge147')return;const state=scratch.filterSmudge147State,source=scratch.canonicalSource;scratch.filterSmudge147State=undefined;scratch.canonicalSource=undefined;scratch.brushBehavior=undefined;let failed=false,error:unknown;try{state?.release()}catch(e){failed=true;error=e}try{source.release()}catch(e){if(!failed){failed=true;error=e}}if(failed)throw error}
  prepareFilterBeginGesture(target:ILayerBuffer,first:Dab,userId:string,strokeId:string,paint:{brush:BrushDescriptor;pressure:BrushPressureSettings},execution:BrushExecutionContext|undefined,runtime:CanonicalBeginRuntime,scratch:BehaviorScratch):CanonicalBeginPrepareResult{
    const brush=paint.brush,binding=runtime.binding
    if(!hasFilterSmudge147Scope(brush)||runtime.capability!=='filterSmudge147'||userId!==binding.userId||strokeId!==binding.strokeId||!Number.isFinite(first.size)||first.size<=0)throw Error('Invalid Filter147 BEGIN identity')
    assertBrushSourceInputs(brush,[first]);assertBrushExecutionContext(brush,execution);if(scratch.brushBehavior)assertSameBrushExecutionContext(scratch.brushBehavior.execution,execution)
    const existing=scratch.canonicalSource;if(existing){existing.assertCurrent();return existing.target===target&&existing.capability==='filterSmudge147'&&canonicalBeginBindingKey(existing.binding)===canonicalBeginBindingKey(binding)?{kind:'ready'}:{kind:'notReady',reason:'prefix',retryKey:binding.prefixKey+':filter147'}}
    if(scratch.brushBehavior?.dabSequence)throw Error('Filter147 capture after accepted request forbidden')
    if(!this.ctx.openCanonicalBegin||!this.ctx.acquireSprayScratch||!this.ctx.reserveCanonicalBeginSource||!this.filterSmudge147)throw Error('Filter147 canonical source/prewarm unavailable')
    this.filterSmudge147.assertPrepared();const prior=scratch.brushBehavior,opened=this.ctx.openCanonicalBegin(target,binding,'filterSmudge147');if(opened.kind==='notReady')return opened
    const captured=CanonicalBeginSource.capture(target,binding,opened.view,(w,h)=>this.ctx.acquireSprayScratch!(w,h),bytes=>this.ctx.reserveCanonicalBeginSource!(binding,bytes),()=>this.ctx.canonicalResourcesReleased?.(),'filterSmudge147');if(captured.kind==='notReady')return captured
    if(scratch.brushBehavior!==prior||scratch.canonicalSource){captured.owner.release();throw Error('Filter147 owner changed during capture')}scratch.canonicalSource=captured.owner;return{kind:'ready'}
  }
  private paintFilter147Requests(target:BrushTarget,dabs:readonly Dab[],preset:PencilPreset,brush:BrushDescriptor,pressure:BrushPressureSettings,color:[number,number,number],scratch:BehaviorScratch,finish:boolean,endpoint:(Dab&{baseSize:number})|undefined,execution:BrushExecutionContext|undefined,runtime:CanonicalBeginRuntime):void{
    assertBrushSourceInputs(brush,dabs,endpoint);assertBrushExecutionContext(brush,execution);if(scratch.brushBehavior)assertSameBrushExecutionContext(scratch.brushBehavior.execution,execution)
    if(!this.ctx.acquireSprayScratch||!this.ctx.reserveCanonicalBeginSource)throw Error('Filter147 resource owner unavailable')
    let accepted=0
    for(const dab of dabs){
      const prior=scratch.brushBehavior,base=prior?structuredClone(prior):beginBrushBehavior(dab,execution),probe=structuredClone(base),stamps=behaviorStampsForDab(brush,dab,probe,color)
      let bounds:BrushBounds|undefined
      for(const stamp of stamps){const radius=stamp.size*preset.sizeMultiplier*.5;if(radius<.25)continue;const footprint=brushFootprintBounds(stamp.x,stamp.y,radius,stamp.aspect,stamp.angle,1);if(footprint)bounds=unionBounds(bounds,footprint)}
      if(!bounds){scratch.brushBehavior=probe;accepted++;continue}
      // Recovery/reentrant replay must finish before any outer request lease.
      const tiles=target.resolveForPaint(bounds)
      const f=brush.filter,spatial=hasFilterGaussian153Scope(brush)&&f&&'radiusX'in f?{...planGaussian153(bounds,f.radiusX,f.radiusY),destinations:[]as Array<{tile:ReturnType<BrushTarget['resolveForPaint']>[number];mask:AccumulationBuffer}>}:undefined
      const temporaryTiles=spatial?target.resolveForPaint(spatial.needed):tiles
      if(scratch.brushBehavior!==prior)throw Error('Filter147 gesture changed during recovery')
      const existing=scratch.filterSmudge147State,state=existing??new FilterSmudge147State(scratch.canonicalSource!.retain(),(w,h)=>this.ctx.acquireSprayScratch!(w,h),bytes=>this.ctx.reserveCanonicalBeginSource!(runtime.binding,bytes))
      let request:FilterSmudge147Request|undefined,published=false,failed=false,failure:unknown
      try{
        const planned=state.prepareRequest(temporaryTiles,spatial);if(planned.kind==='notReady')throw new FilterSmudge147Blocked(planned,accepted);request=planned.request
        let staged=base
        const proxy=new Proxy(scratch,{get:(target,key)=>key==='brushBehavior'?staged:typeof Reflect.get(target,key)==='function'?Reflect.get(target,key).bind(target):Reflect.get(target,key),set:(target,key,value)=>{if(key==='brushBehavior'){staged=value;return true}return Reflect.set(target,key,value)}})
        this.paint(target,[dab],preset,brush,pressure,color,proxy,finish&&accepted===dabs.length-1,finish?endpoint:undefined,execution,false,runtime,{state,request,tiles})
        scratch.brushBehavior=staged;scratch.filterSmudge147State=state;this.bindings.set(scratch,{target,preset,brush,pressure,color,execution,effectiveErase:false,runtime});published=true;accepted++
      }catch(error){failed=true;failure=error}
      finally{for(const release of[()=>request?.release(),()=>{if(!existing&&!published)state.release()}])try{release()}catch(error){if(!failed){failed=true;failure=error}}}
      if(failed)throw failure
    }
  }
cloneBeginBinding(scratch:BehaviorScratch):CanonicalBeginBinding|undefined{return (scratch.canonicalSource?.capability==='cloneProjection149'||scratch.canonicalSource?.capability==='cloneHealing152')?scratch.canonicalSource.binding:undefined}
invalidateCloneBegin(scratch:BehaviorScratch):void{if(scratch.canonicalSource?.capability==='cloneProjection149'||scratch.canonicalSource?.capability==='cloneHealing152'){const owner=scratch.canonicalSource;scratch.canonicalSource=undefined;scratch.brushBehavior=undefined;owner.release()}}
prepareCloneBeginGesture(target:ILayerBuffer,first:Dab,userId:string,strokeId:string,paint:{brush:BrushDescriptor;pressure:BrushPressureSettings},execution:BrushExecutionContext|undefined,runtime:CanonicalBeginRuntime,scratch:BehaviorScratch):CanonicalBeginPrepareResult{
 const brush=paint.brush,binding=runtime.binding,healing=hasCloneHealing152Scope(brush),capability=healing?'cloneHealing152':'cloneProjection149'
 if(!(healing||hasCloneProjection149Scope(brush))||runtime.capability!==capability||userId!==binding.userId||strokeId!==binding.strokeId||!Number.isFinite(first.size)||first.size<=0)throw Error('Invalid canonical Clone BEGIN identity')
 assertBrushSourceInputs(brush,[first]);assertBrushExecutionContext(brush,execution);if(scratch.brushBehavior)assertSameBrushExecutionContext(scratch.brushBehavior.execution,execution)
 const existing=scratch.canonicalSource;if(existing){existing.assertCurrent();return existing.target===target&&existing.capability===capability&&canonicalBeginBindingKey(existing.binding)===canonicalBeginBindingKey(binding)?{kind:'ready'}:{kind:'notReady',reason:'prefix',retryKey:binding.prefixKey+':clone'}}
 if(scratch.brushBehavior?.dabSequence)throw Error('Clone capture after accepted request forbidden')
 if(!this.clonePass||!this.ctx.acquireSprayScratch||!this.ctx.reserveCanonicalBeginSource)throw Error('Clone source owner unavailable')
 this.clonePass.assertPrepared();if(healing){if(!this.healingPass)throw Error('Healing152 not prepared');this.healingPass.assertPrepared()}
 const prior=scratch.brushBehavior,merged=brush.clone?.source==='projectionCanvas'
 const projection=execution?.brushSource?.projection
 if(merged&&!projection)throw Error('Merged Clone requires captured projection')
 const opened=merged?this.ctx.openLayeredCanonicalBegin?.(target,binding,projection!,capability):this.ctx.openCanonicalBegin?.(target,binding,capability)
 if(!opened)throw Error('Clone canonical source provider unavailable')
 if(opened.kind==='notReady')return opened
 const acquire=(w:number,h:number)=>this.ctx.acquireSprayScratch!(w,h),claim=(bytes:number)=>this.ctx.reserveCanonicalBeginSource!(binding,bytes),released=()=>this.ctx.canonicalResourcesReleased?.()
 // Explicit provider branch preserves its exact view type and never uses currenttarget fallback.
 let captured:ReturnType<typeof CanonicalBeginSource.capture>
 if(merged){if(!('layers'in opened.view)){try{opened.view.release()}catch{}throw Error('Expected layered Clone BEGIN')};captured=this.clonePass.captureMergedSource(target,binding,opened.view,acquire,claim,released,capability)}
 else{if('layers'in opened.view){try{opened.view.release()}catch{}throw Error('Expected local Clone BEGIN')};captured=CanonicalBeginSource.capture(target,binding,opened.view,acquire,claim,released,capability)}
 if(captured.kind==='notReady')return captured
 if(scratch.brushBehavior!==prior||scratch.canonicalSource){captured.owner.release();throw Error('Clone owner changed during capture')}
 scratch.canonicalSource=captured.owner;return{kind:'ready'}
}

  finish(scratch: BehaviorScratch, endpoint?: Dab & {baseSize:number}): void {
    const b = this.bindings.get(scratch); if (!b)return
    this.paint(b.target, [], b.preset, b.brush, b.pressure, b.color, scratch, true, endpoint, b.execution,b.effectiveErase,b.runtime)
    if(b.runtime?.capability==='filterSmudge147'||b.runtime?.capability==='spray146'||b.runtime?.capability==='cloneProjection149'||b.runtime?.capability==='cloneHealing152'){
      // END closes this source lifetime; duplicate END has no binding to dispatch.
      this.bindings.delete(scratch)
      const state=scratch.filterSmudge147State,source=scratch.canonicalSource
      scratch.filterSmudge147State=undefined;scratch.canonicalSource=undefined
      let failed=false,error:unknown
      for(const release of[()=>state?.release(),()=>source?.release()])try{release()}catch(e){if(!failed){failed=true;error=e}}
      if(failed)throw error
    }
  }
  destroy(): void {
    this.mypaintPass?.destroy();this.mypaintPass=undefined
    this.healingPass?.destroy();this.clonePass?.destroy()
    this.filterSmudge147?.destroy()
    this.filterPass?.destroy()
    if(this.hatchingStamp)this.ctx.gl.deleteProgram(this.hatchingStamp.program)
    this.polygonBatch?.destroy()
    this.sketchBatch?.destroy()
    this.bristleRequests?.destroy()
    this.sprayRequestPainter?.destroy()
    this.requestWash?.destroy()
    this.sprayImageBatch?.destroy()
    this.sprayBatch?.destroy()
    const gl = this.ctx.gl
    if (this.circleStamp) gl.deleteProgram(this.circleStamp.program)
    this.hatchingStamp=undefined
    this.circleStamp = undefined
    gl.deleteProgram(this.stamp)
    if(this.extendedComposite)gl.deleteProgram(this.extendedComposite.program)
    this.extendedComposite=undefined
    gl.deleteProgram(this.composite)
    if (this.proceduralStamp) gl.deleteProgram(this.proceduralStamp.program)
    this.proceduralStamp = undefined
    if(this.textureGradientStamp)gl.deleteProgram(this.textureGradientStamp.program)
    if(this.lightnessStamp)gl.deleteProgram(this.lightnessStamp.program)
    if(this.gradientStamp)gl.deleteProgram(this.gradientStamp.program)
    this.gradientStamp=undefined
    this.lightnessStamp=undefined
    this.textureGradientStamp=undefined
    if(this.effectsStamp)gl.deleteProgram(this.effectsStamp.program)
    this.effectsStamp=undefined
    if (this.curveStamp) gl.deleteProgram(this.curveStamp.program)
    this.curveStamp=undefined
    if (this.imageStamp) gl.deleteProgram(this.imageStamp.program)
    this.imageStamp = undefined
  }
  /** One final composition owner for ordinary stamps and Spray request Wash.
   * Frozen original and stroke coverage survive chunks/savepoints exactly as before. */
  private presentStrokeTile(tile:{originX:number;originY:number;buffer:AccumulationBuffer},bounds:BrushBounds,original:AccumulationBuffer,coverage:AccumulationBuffer,ceiling:AccumulationBuffer,brush:BrushDescriptor,opacity:number,edge=0,secondaryState?:{tile:(source:AccumulationBuffer)=>AccumulationBuffer},extendedComposite?:{program:WebGLProgram;uniforms:Uniforms;position:number}):void{
    const {gl,paper}=this.ctx,behavior=brush.behavior!,accumulation=behavior.rendering?.accumulation
      tile.buffer.beginReplaceDraw()
      gl.useProgram(extendedComposite?.program??this.composite)
      const c = extendedComposite?.uniforms??this.cu, render = behavior.rendering
      gl.uniform2f(c.u_resolution, tile.buffer.width, tile.buffer.height)
      for (const [unit, tex, name] of [[0, original.texture, 'u_original'], [1, coverage.texture, 'u_strokeCoverage'], [2, ceiling.texture, 'u_ceiling']] as const) {
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.uniform1i(c[name], unit)
      }
      gl.uniform1f(c.u_opacity, accumulation==='directOver' ? 1 : opacity)
      gl.uniform1f(c.u_physicalAccumulation,accumulation?1:0)
      gl.uniform1f(c.u_mode, render ? modes.indexOf(render.mode) : 6)
      gl.uniform1f(c.u_blend, blend(render?.blendMode))
      gl.uniform1f(c.u_burntEdge, render?.burntEdges ?? 0)
      gl.uniform1f(c.u_burntBlend, blend(render?.burntEdgesMode))
      gl.uniform1f(c.u_edgePx, edge)
      gl.uniform1f(c.u_luminance, render?.luminance ? 1 : 0)
      gl.uniform1f(c.u_gammaCorrect, render?.gammaCorrect ? 1 : 0)
      gl.activeTexture(gl.TEXTURE6)
      gl.bindTexture(gl.TEXTURE_2D,secondaryState ? secondaryState.tile(tile.buffer).texture : paper.texture)
      gl.uniform1i(c.u_secondaryCoverage,6)
      gl.uniform1f(c.u_secondaryMode,blend(behavior.dual?.blendMode))
      gl.uniform1f(c.u_secondaryEnabled,secondaryState?1:0)
      const wet=brush.wet
      const wrapSurface=(v:number,p:number):number=>((v%p)+p)%p
      gl.uniform4f(c.u_surface,wet?.granulation??0,wet?.mottle??0,wet?.bloom??0,wet?.feather??0)
      gl.uniform4f(c.u_surfaceOrigin,wrapSurface(tile.originX,640),wrapSurface(tile.originY,640),wrapSurface(tile.originX,224),wrapSurface(tile.originY,224))
      for(const [unit,id,name] of [[3,'cloud','u_surfaceCloud'],[4,'grit','u_surfaceGrain']] as const){
        gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,this.grain(id));gl.uniform1i(c[name],unit)
      }
      gl.uniform1f(c.u_screentone,brush.screentonePx??0)
      gl.uniform1f(c.u_erase,behavior.erase?1:0)
      const screenPeriod=(brush.screentonePx??0)*2
      gl.uniform2f(c.u_screenOrigin,screenPeriod?wrapSurface(tile.originX,screenPeriod):0,screenPeriod?wrapSurface(tile.originY,screenPeriod):0)


      const cx = (bounds.minX + bounds.maxX) * 0.5, cy = (bounds.minY + bounds.maxY) * 0.5
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.quadBuf())
      const compositePosition=extendedComposite?.position??this.cp
      gl.enableVertexAttribArray(compositePosition)
      gl.vertexAttribPointer(compositePosition, 2, gl.FLOAT, false, 0, 0)
      gl.uniform2f(c.u_dabCenter, cx - tile.originX, cy - tile.originY)
      // Tight axis-aligned quad: partial preview storage is valid only in
      // bounds (+ sampling halo). The former enclosing square wrote outside it.
      const width=bounds.maxX-bounds.minX,height=bounds.maxY-bounds.minY
      gl.uniform1f(c.u_dabRadius, height*0.5)
      gl.uniform1f(c.u_angle, 0)
      gl.uniform1f(c.u_aspectRatio, width/height)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      tile.buffer.endDraw()
  }
  /** One existing Particle solver request, staged before physical tile recovery.
   * The SAME owner/snapshot planes and charged request scratch as Spray133. */
  private paintParticleWash(target:TiledLayerBuffer,dabs:readonly Dab[],brush:BrushDescriptor,state:BrushBehaviorState,color:[number,number,number],scratch:BehaviorScratch,sizeMultiplier:number,accepted:()=>void):void{
    const kernel=this.requestWash!,current=kernel.captureCurrent(),batch=this.sprayBatch!
    batch.assertPrepared()
    const dimensions=target.coarseWorldSize(1)
    for(const dab of dabs){
      const entries=Object.entries(state),keys=Object.keys(state),{execution,...plain}=state
      const working:BrushBehaviorState={...structuredClone(plain),...(execution===undefined?{}:{execution})}
      const stamps=behaviorStampsForDab(brush,dab,working,color)
      if(stamps.length>16384)throw RangeError('Particle Wash request exceeds16384 points')
      const commit=()=>{if(Object.keys(state).length!==keys.length||entries.some(([key,value])=>Reflect.get(state,key)!==value))throw Error('Particle request state changed before commit');for(const key of keys)if(!Object.prototype.hasOwnProperty.call(working,key))Reflect.deleteProperty(state,key);Object.assign(state,working);accepted()}
      current()
      if(!stamps.some(s=>s.flowScale>0)){commit();continue}
      const bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity}
      for(const stamp of stamps){bounds.minX=Math.min(bounds.minX,stamp.x-1);bounds.minY=Math.min(bounds.minY,stamp.y-1);bounds.maxX=Math.max(bounds.maxX,stamp.x+1);bounds.maxY=Math.max(bounds.maxY,stamp.y+1)}
      // Recovery may reenter this same Painter, but never with our lease held.
      const tiles=target.resolveForPaint(bounds);current();batch.assertPrepared()
      let request:ReturnType<NonNullable<BrushContext['acquireSprayScratch']>>|undefined,failed=false,failure:unknown
      try{
        if(!this.ctx.acquireSprayScratch)throw Error('Particle request scratch owner is unavailable')
        request=this.ctx.acquireSprayScratch(Math.min(512,dimensions.w),Math.min(512,dimensions.h));request.assertCurrent();current()
        if(request.buffer.width>512||request.buffer.height>512)throw Error('Particle Wash lease exceeds512')
        const step=advanceWashOpacity(working.washOpacity??={average:0,maximum:0},1)
        const placed=stamps.map(stamp=>({...stamp,radius:stamp.size*sizeMultiplier*.5,flow:stamp.flowScale,ceiling:1,pressure:dab.pressure}))
        commit()
        for(const tile of tiles){
          const entry=scratch.getOrCreate(tile.buffer),previous=scratch.brushCeiling(tile.buffer)
          for(const region of sprayWashRegions(bounds,tile,request.buffer.width,request.buffer.height)){
            current();request.assertCurrent();batch.assertPrepared();request.buffer.clear();request.buffer.beginDraw()
            try{this.ctx.gl.blendFunc(this.ctx.gl.ONE,this.ctx.gl.ONE);batch.paint(placed,'bilinear',region.originX,region.originY,request.buffer.width,request.buffer.height)}finally{request.buffer.endDraw()}
            const bottom=tile.buffer.height-region.y-region.height
            entry.coverage.copyRegionInto(previous,region.x,bottom,region.x,bottom,region.width,region.height)
            kernel.transfer(request.buffer,previous,entry.coverage,region,1,step.average,color)
          }
          this.presentStrokeTile(tile,bounds,entry.original,entry.coverage,previous,brush,state.opacity)
        }
        target.markContentPainted(bounds)
      }catch(error){failed=true;failure=error}
      finally{try{request?.release()}catch(error){if(!failed){failed=true;failure=error}}}
      if(failed)throw failure
    }
  }
  /** Same shared request owner; one existing no-ink AA line, not one Wash per hair. */
  private paintBristleWash(target:TiledLayerBuffer,dabs:readonly Dab[],brush:BrushDescriptor,state:BrushBehaviorState,color:[number,number,number],scratch:BehaviorScratch,sizeMultiplier:number,pressure:BrushPressureSettings,accepted:()=>void):void{
    const kernel=this.requestWash!,current=kernel.captureCurrent(),batch=this.sketchBatch!
    batch.assertPrepared()
    const dimensions=target.coarseWorldSize(1)
    for(const dab of dabs){
      const entries=Object.entries(state),keys=Object.keys(state),{execution,...plain}=state
      const working:BrushBehaviorState={...structuredClone(plain),...(execution===undefined?{}:{execution})}
      const stamps=behaviorStampsForDab(brush,dab,working,color)
      if(stamps.length>4096)throw RangeError('Bristle Wash request exceeds4096 points')
      const commit=()=>{if(Object.keys(state).length!==keys.length||entries.some(([key,value])=>Reflect.get(state,key)!==value))throw Error('Bristle request state changed before commit');for(const key of keys)if(!Object.prototype.hasOwnProperty.call(working,key))Reflect.deleteProperty(state,key);Object.assign(state,working);accepted()}
      current()
      if(!stamps.some(s=>s.flowScale>0)){commit();continue}
      const bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity}
      for(const stamp of stamps){const half=(stamp.segmentLength??0)*.5,radius=stamp.size*sizeMultiplier*.5+1,rx=Math.abs(Math.cos(stamp.angle))*half+radius,ry=Math.abs(Math.sin(stamp.angle))*half+radius;bounds.minX=Math.min(bounds.minX,stamp.x-rx);bounds.minY=Math.min(bounds.minY,stamp.y-ry);bounds.maxX=Math.max(bounds.maxX,stamp.x+rx);bounds.maxY=Math.max(bounds.maxY,stamp.y+ry)}
      // Recovery may reenter this same Painter, but never with our lease held.
      const tiles=target.resolveForPaint(bounds);current();batch.assertPrepared()
      let request:ReturnType<NonNullable<BrushContext['acquireSprayScratch']>>|undefined,failed=false,failure:unknown
      try{
        if(!this.ctx.acquireSprayScratch)throw Error('Bristle request scratch owner is unavailable')
        request=this.ctx.acquireSprayScratch(Math.min(512,dimensions.w),Math.min(512,dimensions.h));request.assertCurrent();current()
        if(request.buffer.width>512||request.buffer.height>512)throw Error('Bristle Wash lease exceeds512')
        const opacity=clamp(digitalBrushCeiling(brush,dab.pressure,pressure.opacity)*(stamps[0].opacityScale??1))
        const step=advanceWashOpacity(working.washOpacity??={average:0,maximum:0},opacity)
        const placed=stamps.map(stamp=>({...stamp,radius:stamp.size*sizeMultiplier*.5,flow:stamp.flowScale,ceiling:1,pressure:dab.pressure}))
        commit()
        for(const tile of tiles){
          const entry=scratch.getOrCreate(tile.buffer),previous=scratch.brushCeiling(tile.buffer)
          for(const region of sprayWashRegions(bounds,tile,request.buffer.width,request.buffer.height)){
            current();request.assertCurrent();batch.assertPrepared();batch.paintRequest(placed,request.buffer,region.originX,region.originY)
            const bottom=tile.buffer.height-region.y-region.height
            entry.coverage.copyRegionInto(previous,region.x,bottom,region.x,bottom,region.width,region.height)
            kernel.transfer(request.buffer,previous,entry.coverage,region,opacity,step.average,color)
          }
          this.presentStrokeTile(tile,bounds,entry.original,entry.coverage,previous,brush,state.opacity)
        }
        target.markContentPainted(bounds)
      }catch(error){failed=true;failure=error}
      finally{try{request?.release()}catch(error){if(!failed){failed=true;failure=error}}}
      if(failed)throw failure
    }
  }
  assertBristleSoakPrepared139(brush:BrushDescriptor):void {
    if(!hasBristleSoak139Scope(brush)||brush.bristle?.version!==2||!this.bristleRequests)throw Error('Bristle Soak scope/prewarm unavailable')
    this.bristleRequests.assertInkPrepared(brush.bristle.ink,!brush.bristle.antialias&&!brush.bristle.compositing,true)
  }

 private paintHealing152Requests(target:BrushTarget,dabs:readonly Dab[],preset:PencilPreset,brush:BrushDescriptor,pressure:BrushPressureSettings,color:[number,number,number],scratch:BehaviorScratch,finish:boolean,endpoint:(Dab&{baseSize:number})|undefined,execution:BrushExecutionContext|undefined,runtime:CanonicalBeginRuntime):void{
  assertBrushSourceInputs(brush,dabs,endpoint);assertBrushExecutionContext(brush,execution);if(scratch.brushBehavior)assertSameBrushExecutionContext(scratch.brushBehavior.execution,execution)
  if(!this.healingPass||!this.ctx.acquireSprayScratch||!this.ctx.reserveCanonicalBeginSource)throw Error('Healing152 resources unavailable')
  let accepted=0
  for(const dab of dabs){
   const prior=scratch.brushBehavior,base=prior?structuredClone(prior):beginBrushBehavior(dab,execution),probe=structuredClone(base),stamps=behaviorStampsForDab(brush,dab,probe,color)
   let full:BrushBounds|undefined
   for(const stamp of stamps){const radius=stamp.size*preset.sizeMultiplier*.5;if(radius<=0)continue;const box=brushFootprintBounds(stamp.x,stamp.y,radius,stamp.aspect,stamp.angle,0);if(box)full=unionBounds(full,box)}
   if(!full){scratch.brushBehavior=probe;accepted++;continue}
   // Full logical mask allocation, NEVER tileclip or alpha nonzero ROI.
   const rect={minX:Math.floor(full.minX),minY:Math.floor(full.minY),maxX:Math.ceil(full.maxX),maxY:Math.ceil(full.maxY)},source=scratch.canonicalSource!
   try{if(!planCloneHealing152(rect)){scratch.brushBehavior=probe;accepted++;continue}}catch(error){if(error instanceof RangeError)throw new CanonicalBeginBlocked({kind:'notReady',reason:'resource',retryKey:source.binding.prefixKey+':healing-geometry',detail:'geometry'},accepted);throw error}
   const offset=cloneSourceOffset152(rect,dab,execution!.brushSource!.clone!,brush.clone!.moveSourcePoint)
   const tiles=target.resolveForPaint(rect);source.assertCurrent();if(scratch.brushBehavior!==prior)throw Error('Healing gesture changed during recovery')
   let staged=base
   const destinations:Array<{tile:ReturnType<BrushTarget['resolveForPaint']>[number];mask:AccumulationBuffer}>=[]
   const proxy=new Proxy(scratch,{get:(target,key)=>key==='brushBehavior'?staged:typeof Reflect.get(target,key)==='function'?Reflect.get(target,key).bind(target):Reflect.get(target,key),set:(target,key,value)=>{if(key==='brushBehavior'){staged=value;return true}return Reflect.set(target,key,value)}})
   const result=this.healingPass.withHealedPatch(source,rect,offset,(w,h)=>this.ctx.acquireSprayScratch!(w,h),bytes=>this.ctx.reserveCanonicalBeginSource!(runtime.binding,bytes),(patch)=>{
    this.paint(target,[dab],preset,brush,pressure,color,proxy,finish&&accepted===dabs.length-1,finish?endpoint:undefined,execution,false,runtime,undefined,{tiles,destinations})
    // Normal directOver mask already contains captured global opacity ONCE.
    this.healingPass!.compositePreparedPatch(source,patch,rect,destinations,1)
   },new Set(tiles.map(t=>t.buffer.texture)))
   if(result.kind==='notReady')throw new CanonicalBeginBlocked(result,accepted)
   scratch.brushBehavior=staged;this.bindings.set(scratch,{target,preset,brush,pressure,color,execution,effectiveErase:false,runtime});target.markContentPainted(rect);accepted++
  }
 }
  paint(target: BrushTarget, dabs: Dab[], preset: PencilPreset, brush: BrushDescriptor, pressure: BrushPressureSettings, color: [
    number,
    number,
    number
  ], scratch: BehaviorScratch, finish = false, endpoint?:Dab & {baseSize:number}, execution?:BrushExecutionContext,effectiveErase = !!brush.behavior?.erase,runtime?:CanonicalBeginRuntime,filterRequest?:{state:FilterSmudge147State;request:FilterSmudge147Request;tiles:ReturnType<BrushTarget['resolveForPaint']>},healingRequest?:{tiles:ReturnType<BrushTarget['resolveForPaint']>;destinations:Array<{tile:ReturnType<BrushTarget['resolveForPaint']>[number];mask:AccumulationBuffer}>}): void {
    if(brush.particle&&brush.behavior?.timing){if(!hasParticleTimer157Scope(brush)||effectiveErase)throw Error('Invalid Particle timer157 scope');assertBrushSourceInputs(brush,dabs,endpoint);assertBrushExecutionContext(brush,execution)}
    const healing=brush.clone?.healing!==undefined
    if(healing){const source=scratch.canonicalSource;if(!hasCloneHealing152Scope(brush)||effectiveErase||runtime?.capability!=='cloneHealing152'||!source||source.capability!=='cloneHealing152'||source.target!==target||canonicalBeginBindingKey(source.binding)!==canonicalBeginBindingKey(runtime.binding))throw Error('Healing152 requires prepared canonical BEGIN');source.assertCurrent();if(!this.healingPass)throw Error('Healing152 not prepared');this.healingPass.assertPrepared();if(!healingRequest){this.paintHealing152Requests(target,dabs,preset,brush,pressure,color,scratch,finish,endpoint,execution,runtime);return}}
    const sprayRectangleNoise155=hasSprayRectangleNoise155Scope(brush)
    if(brush.spray&&brush.version===155&&(!sprayRectangleNoise155||effectiveErase))throw Error('Invalid Spray rectangle noise155 scope')
    const clone149=!healing&&!!brush.clone&&(brush.clone.source!==undefined||brush.clone.sourcePolicy!==undefined)
    if(clone149){
      const source=scratch.canonicalSource
      if(!hasCloneProjection149Scope(brush)||effectiveErase||runtime?.capability!=='cloneProjection149'||!source||source.capability!=='cloneProjection149'||source.target!==target||canonicalBeginBindingKey(source.binding)!==canonicalBeginBindingKey(runtime.binding))throw Error('Merged Clone149 requires its prepared canonical BEGIN source')
      source.assertCurrent();if(!this.clonePass)throw Error('Merged Clone149 program is not prepared');this.clonePass.assertPrepared()
    }

    const filter147=!!brush.filter&&'smudgeMode'in brush.filter
    if(filter147){
      const source=scratch.canonicalSource
      if(!hasFilterSmudge147Scope(brush)||effectiveErase||runtime?.capability!=='filterSmudge147'||!source||source.capability!=='filterSmudge147'||source.target!==target||canonicalBeginBindingKey(source.binding)!==canonicalBeginBindingKey(runtime.binding))throw Error('Filter147 requires its prepared canonical BEGIN source')
      source.assertCurrent();this.filterSmudge147?.assertPrepared();if(!this.filterSmudge147)throw Error('Filter147 programs not prepared')
      if(!filterRequest){this.paintFilter147Requests(target,dabs,preset,brush,pressure,color,scratch,finish,endpoint,execution,runtime);return}
    }
    if(brush.bristle?.version===2&&brush.bristle.soak){if(effectiveErase)throw Error('Bristle Soak139 erase override is not supported');this.assertBristleSoakPrepared139(brush);if(firstBristleLine139(dabs,scratch.brushBehavior?.previous)&&!scratch.brushBehavior?.bristle?.soak)throw Error('Bristle Soak source was not prepared')}
    const gradientWash=usesPixelOriginalRgba(brush)&&!!brush.tip.color&&'gradient'in brush.tip.color&&brush.behavior?.rendering?.accumulation==='alphaDarken'
    if(gradientWash&&(!hasPixelGradientWash138Scope(brush)||effectiveErase))throw Error('Invalid Pixel Gradient Wash138 scope')
    if(gradientWash&&!this.gradientStamp)throw Error('Pixel Gradient Wash138 program was not prepared')
    const tangentWash=!!brush.tangentNormal&&brush.behavior?.rendering?.accumulation==='alphaDarken'
    if(tangentWash&&(!hasTangentNormalWash136Scope(brush)||effectiveErase))throw Error('Invalid Tangent Wash136 scope')
    if(tangentWash&&!this.proceduralStamp)throw Error('Tangent Wash136 procedural program was not prepared')
    const bristleWash=!!brush.bristle&&brush.behavior?.rendering?.accumulation==='alphaDarken'
    if(bristleWash&&(!hasBristleWash135Scope(brush)||effectiveErase))throw Error('Invalid Bristle Wash135 scope')
    if(bristleWash){if(!this.requestWash||!this.sketchBatch)throw Error('Bristle Wash pipeline was not prepared');this.requestWash.assertPrepared();this.sketchBatch.assertPrepared()}
    const particleWash=!!brush.particle&&brush.behavior?.rendering?.accumulation==='alphaDarken'
    if(particleWash&&(!hasParticleWash134Scope(brush)||effectiveErase))throw Error('Invalid Particle Wash134 scope')
    if(particleWash){if(!this.requestWash||!this.sprayBatch)throw Error('Particle Wash pipeline was not prepared');this.requestWash.assertPrepared();this.sprayBatch.assertPrepared()}
    const sprayWash=!!brush.spray&&brush.behavior?.rendering?.accumulation==='alphaDarken'
    if(sprayWash&&(!hasSprayWash133Scope(brush)||!isBrushSpray(brush.spray)||effectiveErase))throw Error('Invalid Spray Wash133 scope')
    if(sprayWash){if(!this.sprayRequestPainter)throw Error('Spray Wash pipeline was not prepared');this.sprayRequestPainter.assertWashPrepared()}
    if(brush.filter?.kind==='posterize'&&!isFilterDescriptor(brush as unknown as Record<string,unknown>))throw Error('Invalid Posterize117 brush scope')
    assertEqualLightnessGih123(brush)
    assertUnequalLightnessGih124(brush)
    const extendedComposite=(brush.behavior?.rendering?.blendMode==='hardMixPhotoshop'||brush.behavior?.rendering?.blendMode==='kritaHardMix')?this.extendedComposite:undefined
    if((brush.behavior?.rendering?.blendMode==='hardMixPhotoshop'||brush.behavior?.rendering?.blendMode==='kritaHardMix')&&!extendedComposite)throw Error('Extended composite is not prepared')
    const gihFrames=usesVariableGih(brush.tip)?prepareVariableGih(brush):undefined
    if(brush.behavior?.dual&&usesVariableGih(brush.behavior.dual.brush.tip))throw Error('Variable GIH child is unsupported')
    // Bound expanded populations independently of network/author batch size.
    // Gesture state stays on the same scratch; endpoint/finish belong to the last slice.
    if((brush.clone||brush.filter||brush.spray||brush.sketch||brush.bristle||brush.curveTrace||brush.particle||brush.experiment) && dabs.length>(brush.particle||brush.clone?1:4)){
      for(let i=0;i<dabs.length;i+=(brush.particle||brush.clone?1:4)){const last=i+(brush.particle||brush.clone?1:4)>=dabs.length;this.paint(target,dabs.slice(i,i+(brush.particle||brush.clone?1:4)),preset,brush,pressure,color,scratch,finish&&last,last?endpoint:undefined,execution,effectiveErase,runtime)}
      return
    }
    if(brush.bristle?.version===2){if(!this.bristleRequests)throw Error('Bristle ink profile is not prepared');if(brush.bristle.soak)this.bristleRequests.assertInkPrepared(brush.bristle.ink,!brush.bristle.antialias&&!brush.bristle.compositing,true);else this.bristleRequests.assertInkPrepared(brush.bristle.ink,!brush.bristle.antialias&&!brush.bristle.compositing)}
    if(brush.behavior?.dual?.brush.tip.autoNoise)throw Error('Child Auto-mask noise is not supported')
    const spray146=brush.spray?.color.sourcePolicy!==undefined
    if(spray146){
      const source=scratch.canonicalSource
      if(!hasSpraySource146Scope(brush)||effectiveErase||runtime?.capability!=='spray146'||!source||source.capability!=='spray146'||source.target!==target||canonicalBeginBindingKey(source.binding)!==canonicalBeginBindingKey(runtime.binding))throw Error('Spray146 requires its prepared canonical BEGIN source')
      source.assertCurrent();if(!this.sprayRequestPainter)throw Error('Spray146 source pipeline is not prepared');this.sprayRequestPainter.assertSourcePrepared()
    }
    assertBrushSourceInputs(brush,dabs,endpoint)
    assertBrushExecutionContext(brush,execution)
    const materialVariant=textureMaterialVariant(brush),textureLightness=materialVariant===true,textureGradient=materialVariant==='gradient'
    if(textureLightness&&!this.lightnessStamp)throw Error('Texture Lightness108 program was not prepared')
    if(textureGradient&&!this.textureGradientStamp)throw Error('Texture Gradient111 program was not prepared')
    const sketchMask=brush.sketch?.mode==='mask'?prepareSketchMask(brush):undefined
    if(scratch.brushBehavior)assertSameBrushExecutionContext(scratch.brushBehavior.execution,execution)
    const { gl, paper } = this.ctx, behavior = brush.behavior!
    const filteredGradient=usesFilteredPixelGradient(brush)
    const originalRgba=usesPixelOriginalRgba(brush)
    if(originalRgba&&brush.behavior?.dual&&(!hasPixelOriginalDual151Scope(brush)||effectiveErase))throw Error('Invalid original RGBA dual151 scope')
    const originalFrames=originalRgba?pixelOriginalRgbaFrames(brush):undefined
    if(originalRgba)assertPixelOriginalRgba(brush)
    if(brush.behavior?.dual&&usesPixelOriginalRgba(brush.behavior.dual.brush))throw Error('Pixel original RGBA child is not supported')
    const noise=brush.tip.autoNoise
    if(brush.tip.profile?.kind==='gaussian2D'||brush.tip.profile?.kind==='curveRectangle'||brush.tip.profile?.kind==='curveRectangleSoftness'){
      if(brush.tip.autoNoise&&(brush.version<98||brush.tip.autoShape||brush.spray&&!sprayRectangleNoise155)||brush.behavior?.dual||brush.model!=='stamp')throw Error('New rectangle profiles require an unpaired stamp without noise')
    }
    const noiseSettings=noise&&(noise.density!==1||noise.randomness!==0)?prepareAutoMaskNoise(noise.density,noise.randomness):undefined
    const noiseConfig=noiseSettings?autoMaskNoiseUniforms(noiseSettings):undefined

    if (!dabs.length && !scratch.brushBehavior && !scratch.brushNative)
      return
    const gradientLut=textureGradient||originalRgba&&brush.tip.color&&'gradient' in brush.tip.color?execution?.brushSource?.gradient:undefined
    if(originalRgba&&brush.tip.color&&'gradient' in brush.tip.color&&!gradientLut)throw Error('Pixel gradient map requires a captured palette')
    const imageResource=(id:TipMaskId,planes:readonly[string,string,string]|undefined)=>({id,grain:false,colorPlanes:planes,...(filteredGradient?{gradientSource:true as const}:gradientLut?{gradientMap:true as const,gradientLut}:{})})
    const releaseTextures = this.leaseTextures(brush,effectiveErase,gradientLut)
    try {
    const materialPattern=materialVariant?this.preparedTextureLightness(brush,gradientLut):undefined
    materialPattern?.assertCurrent()
    // The common prepared callback/lease is installed by Spray V2. No lazy
    // RGB upload, alternate cache or foreground fallback is permitted here.
    const originalViews=originalFrames?new Map<string,PixelOriginalRgbaView>():undefined
    if(originalFrames&&originalViews)for(const [frameIndex,frame] of originalFrames.entries()){
      const key=(gihFrames?frameIndex+':':'')+brushTextureResourceKey(imageResource(frame.id,frame.planes))
      if(!originalViews.has(key))originalViews.set(key,capturePixelOriginalRgbaView(this.preparedImage(frame.id,frame.planes,gihFrames?.[frameIndex].maskBounds??brush.tip.maskBounds,gradientLut,filteredGradient?'filteredGray-v1':undefined)))
    }
    if(filteredGradient)for(const image of originalViews?.values()??[]){if(!image.palette)throw Error('Filtered gradient palette view is missing');image.palette.assertCurrent()}
    const originalView=(id:TipMaskId|undefined,planes:readonly[string,string,string]|undefined,frameIndex?:number):PixelOriginalRgbaView=>{
      if(!id||!planes)throw Error('Pixel original RGBA frame identity is missing')
      const view=originalViews?.get((gihFrames?frameIndex+':':'')+brushTextureResourceKey(imageResource(id,planes)))
      if(!view)throw Error('Pixel original RGBA frame was not prepared')
      view.assertCurrent();return view
    }
    if(!filter147&&!sprayWash&&!particleWash&&!bristleWash)this.bindings.set(scratch, { target, preset, brush, pressure, color, execution, effectiveErase, runtime })
    if(brush.mypaint){(this.mypaintPass??=new MyPaintStrokePainter()).paint(target,dabs,brush,color,pressure,scratch,execution,finish,endpoint);return}
    const state = scratch.brushBehavior ?? beginBrushBehavior(dabs[0],execution)
    if(bristleWash){
      if(!(target instanceof TiledLayerBuffer))throw Error('Bristle Wash requires its tiled stroke target')
      this.paintBristleWash(target,dabs,brush,state,color,scratch,preset.sizeMultiplier,pressure,()=>{scratch.brushBehavior=state;this.bindings.set(scratch,{target,preset,brush,pressure,color,execution,effectiveErase,runtime})})
      return
    }
    if(particleWash){
      if(!(target instanceof TiledLayerBuffer))throw Error('Particle Wash requires its tiled stroke target')
      this.paintParticleWash(target,dabs,brush,state,color,scratch,preset.sizeMultiplier,()=>{scratch.brushBehavior=state;this.bindings.set(scratch,{target,preset,brush,pressure,color,execution,effectiveErase,runtime})})
      return
    }
    if(sprayWash){
      if(!(target instanceof TiledLayerBuffer))throw Error('Spray Wash requires its tiled stroke target')
      this.sprayRequestPainter!.paint(target,dabs,brush,state,color,pressure,preset.sizeMultiplier,{
        accepted:()=>{scratch.brushBehavior=state;this.bindings.set(scratch,{target,preset,brush,pressure,color,execution,effectiveErase,runtime})},
        tile:tile=>{const entry=scratch.getOrCreate(tile.buffer);return{coverage:entry.coverage,previous:scratch.brushCeiling(tile.buffer)}},
        present:(tile,bounds)=>{const entry=scratch.getOrCreate(tile.buffer);this.presentStrokeTile(tile,bounds,entry.original,entry.coverage,scratch.brushCeiling(tile.buffer),brush,state.opacity)},
      })
      return
    }
    scratch.brushBehavior=state
    if(brush.spray&&(brush.spray.color.sampleInput||brush.spray.color.mixBackground||brush.spray.color.fillBackground)){
      if(effectiveErase||!(target instanceof TiledLayerBuffer)||!this.sprayRequestPainter)throw Error('Spray source pipeline is not prepared for this target')
      this.sprayRequestPainter.paint(target,dabs,brush,state,color,pressure,preset.sizeMultiplier,undefined,spray146?scratch.canonicalSource:undefined)
      return
    }

    if(brush.curveTrace?.version===2){
      const trace=state.curveTrace??={points:[],ordinal:0},input=trace.input??={}
      dabs=dabs.flatMap(dab=>curveInputRequests(dab,input))
      if(finish)dabs.push(...finishCurveInput(input))
    }
    const independent = behavior.dual?.sampling === 'independent' ? behavior.dual.brush : undefined
    const secondaryState = independent ? scratch.brushSecondary() : undefined
    let secondaryDirty: BrushBounds | undefined
    if (independent && secondaryState) {
      const secondaryTarget: BrushTarget={
        resolveForPaint:bounds=>target.resolveForPaint(bounds).map(tile=>({...tile,buffer:secondaryState.tile(tile.buffer)})),
        // Includes the child's old + new provisional tail, even on finish()
        // or when centreline resampling emits no new secondary dab.
        markContentPainted:bounds=>{ secondaryDirty=unionBounds(secondaryDirty,bounds) },
      }
      const child={...independent,behavior:independent.behavior??{version:2 as const}}
      this.paint(secondaryTarget, secondaryBrushDabs(brush,child,dabs,secondaryState.sampling,pressure.size,endpoint,execution),{...preset,sizeMultiplier:1/Math.max(child.tip.aspect,1)},child,pressure,[1,1,1],secondaryState.scratch,finish,undefined,execution,effectiveErase)
    }

    const accumulation=behavior.rendering?.accumulation
    // Source ellipse geometry remains on each stamp. Allocation uses native
    // square characteristic axes for spiked generators, independently of Ratio.
    const gihPlans=new WeakMap<BehaviorPlaced,ReturnType<typeof variableGihStamp>>()
    const gihPlan=(stamp:BehaviorPlaced)=>{if(!gihFrames)return undefined;let p=gihPlans.get(stamp);if(!p){p=variableGihStamp(brush,gihFrames,stamp);gihPlans.set(stamp,p)}return p}
    const allocationFor=(stamp:BehaviorPlaced)=>brush.tip.autoShape?autoSpikeAllocation(stamp.radius,stamp.aspect,brush.tip.autoShape.spikes):stamp
    const footprintFor=(stamp:BehaviorPlaced,pad:number)=>{
      if(hasBristleNativePointCoverage(brush)){const line=(stamp as BehaviorPlaced&{bristleTrajectory142?:{start:readonly[number,number];end:readonly[number,number]}}).bristleTrajectory142;if(!line)throw Error('Missing native AA142 footprint');return bristleNativeAA142Bounds(line,pad)}
      const selected=gihPlan(stamp);if(selected)return {minX:selected.x-pad,minY:selected.y-pad,maxX:selected.x+selected.width+pad,maxY:selected.y+selected.height+pad}
      const allocation=allocationFor(stamp)
      return brushFootprintBounds(stamp.x,stamp.y,allocation.radius,allocation.aspect,stamp.angle,pad)
    }
    const copyRectFor=(stamp:BehaviorPlaced,width:number,height:number,originX:number,originY:number)=>{
      const selected=gihPlan(stamp);if(selected)return brushFootprintCopyRect(selected.x+selected.width/2,selected.y+selected.height/2,selected.height/2,selected.width/selected.height,0,originX,originY,width,height)
      const allocation=allocationFor(stamp)
      return brushFootprintCopyRect(stamp.x,stamp.y,allocation.radius,allocation.aspect,stamp.angle,originX,originY,width,height)
    }

    const circleBand = brush.tip.profile?.kind === 'circleBand'
    if (circleBand !== (accumulation === 'maxAlpha')) throw Error('Circle band requires max-alpha accumulation')
    if(accumulation==='alphaDarken'){
      if(state.washColor && color.some((value,index)=>value!==state.washColor![index]))state.washVaryingPigment=true
      state.washColor??=[...color]
    }
    const constantPigment=!tangentWash&&!originalRgba&&!state.washVaryingPigment && !brush.tip.material && !behavior.colorAdjustment && !['hue','saturation','brightness'].some(key=>behavior.dynamics?.[key as 'hue'] || behavior.modulations?.[key as 'hue'])
    const bristleInkProfile=brush.bristle?.version===2?this.bristleRequests!.preparedInkProfile(brush.bristle.ink):undefined
    const saturationTable=brush.bristle?.version===2&&brush.bristle.ink.useSaturation?this.bristleRequests!.preparedSaturationTable(brush.bristle.ink):undefined
    const incoming = dabs.flatMap(dab => {
      const previous = state.previous
      let flow = brush.flow
      if (brush.flowPer === 'pass' && flow < 1) {
        const diameter = Math.max(dab.size * preset.sizeMultiplier, 0.5)
        const travel = previous ? this.ctx.segmentLength(dab, previous, diameter * 0.5) : diameter * Math.max(brush.spacing, 0.001)
        flow = 1 - Math.pow(1 - flow, Math.min(travel / (diameter * (brush.flowSpan ?? 1)), 1))
      }
      // A secondary wet component contributes optical coverage here. Canvas
      // colour pickup remains the parent mixer's job, rather than a second
      // competing reservoir painting directly into the same layer.
      const wet=brush.model==='mixer' && behavior.wetMix ? wetMixStep(behavior.wetMix,state,dab,previous?Math.hypot(dab.x-previous.x,dab.y-previous.y)/Math.max(.5,dab.size):0,!previous,state):undefined
      if(wet)flow*=wet.strength
      const opacity = digitalBrushCeiling(brush, dab.pressure, pressure.opacity)*(wet?state.charge:1)
      // Only admitted paint dabs enter the native-style opacity history.
      // Geometry/RNG still advance above, but a discarded tiny footprint must
      // not leave a high average behind for the next visible low-opacity dab.
      return behaviorStampsForDab(brush, dab, state, brush.tangentNormal?tangentNormalColor(brush.tangentNormal,dab,execution!.brushSource!.normalRotation!):color,sketchMask?{sketchMask}:undefined).map(st=>{
        if(brush.bristle?.version!==2)return st
        const geometry=(st as typeof st&{bristleInk?:BristleInkGeometry}).bristleInk
        if(!geometry)throw Error('Missing Bristle ink geometry')
        const ink=state.bristle!.ink??=createBristleInkState(brush.bristle.hairs.length)
        const span=saturationTable?advancePreparedBristleSaturationInk(saturationTable,bristleInkProfile!,ink,geometry.hair,geometry.start,geometry.end,geometry.length,geometry.pressure,brush.bristle.antialias):advanceBristleInkBulk(bristleInkProfile!,ink,geometry.hair,geometry.start,geometry.end,geometry.length,geometry.pressure,brush.bristle.antialias)
        return {...st,flowScale:1,bristleInkSpan:geometry.sampleAlpha===undefined?span:{...span,sampleAlpha:geometry.sampleAlpha}}
      }).filter(st=>gihFrames||brush.behavior?.sequentialRandom ? st.size>0 : st.size*preset.sizeMultiplier*.5>=.25).map(st => {
        // Native BuildUp OVER consumes the operation opacity per dab. Keeping
        // it for the final composite instead imposes a whole-stroke ceiling.
        const ceiling=clamp(opacity*st.opacityScale*(accumulation==='directOver' ? state.opacity : 1))
        const wash=accumulation==='alphaDarken' ? advanceWashOpacity(state.washOpacity??=( {average:0,maximum:0} ),ceiling) : undefined
        return {...st,...(circleBand ? {aspect:1,angle:0} : {}),radius:st.size*preset.sizeMultiplier*.5,flow:flow*st.flowScale,ceiling,pressure:dab.pressure,
          ...(wash ? {washAverage:wash.average,washFeedback:!wash.canBlend || !constantPigment} : {})}
      })
    })
    // Prepare once per admitted placed dab, before tile traversal. The same
    // stroke state survives operation chunks; a new scratch starts a new disc.
    const circleClips = new Map<BehaviorPlaced, CircleDifference>()
    if (circleBand) {
      let previous = state.previousCoverageCircle
      for (const stamp of incoming) {
        const current = { x: stamp.x, y: stamp.y, radius: stamp.radius }
        circleClips.set(stamp, prepareCircleDifference(previous, current))
        previous = current
      }
      if (previous) state.previousCoverageCircle = previous
    }
    const all = [...(state.pending ?? []), ...incoming]
    const tail = splitBrushTail(all, state.distance, behavior.taper?.end ?? 0, finish, behavior.taper?.size, behavior.taper?.opacity)
    state.pending = tail.pending
    const stamps = [...tail.ready, ...tail.preview]
    // Prepare only small immutable geometry metadata, once per actual stamp.
    // Do this before framebuffer/texture effects; never derive an origin from a tile.
    const noiseGrids=noiseSettings?new WeakMap<BehaviorPlaced,AutoMaskNoiseGrid>():undefined
    if(noiseGrids)for(const stamp of stamps){
      if(stamp.autoNoiseKey===undefined)throw Error('Auto-mask noise stamp has no captured identity')
      const rx=Math.fround(Math.fround(stamp.radius)*Math.fround(stamp.aspect)),ry=Math.fround(stamp.radius)
      noiseGrids.set(stamp,prepareAutoMaskNoiseGrid(stamp.x,stamp.y,rx,ry,!!brush.tip.autoShape,stamp.flipX as 1|-1,stamp.flipY as 1|-1))
    }

    const rectangleUniforms=brush.tip.profile?.kind==='gaussian2D'&&brush.tip.profile.shape==='rectangle'?new WeakMap<BehaviorPlaced,ReturnType<typeof gaussianRectangleUniforms>>():undefined
    if(rectangleUniforms&&brush.tip.profile?.kind==='gaussian2D')for(const stamp of stamps){
      const rx=Math.fround(Math.fround(stamp.radius)*Math.fround(stamp.aspect)),ry=Math.fround(stamp.radius)
      rectangleUniforms.set(stamp,gaussianRectangleUniforms(prepareGaussianRectangle(rx,ry,brush.tip.profile.horizontalFade,brush.tip.profile.verticalFade,brush.tip.profile.antialias)))
    }
    const oldPreview = this.previewBounds.get(state)
    if (!stamps.length && !secondaryDirty && !oldPreview)
      return
    const edge = (behavior.rendering?.burntEdges || brush.wet?.feather) ? scratch.noteBrushEdgePx(clamp((dabs[0]?.size ?? state.previous?.size ?? 1) * preset.sizeMultiplier * 0.06, 1.5, 14)) : 0
    let dirty: BrushBounds | undefined = oldPreview
    let nextPreview: BrushBounds | undefined
    for (const s of all) {
      const footprint=footprintFor(s,edge+1)
      if(footprint) dirty=unionBounds(dirty,footprint)
    }
    for (const s of tail.preview) {
      const footprint=footprintFor(s,edge+1)
      if(footprint) nextPreview=unionBounds(nextPreview,footprint)
    }
    if (nextPreview) this.previewBounds.set(state,nextPreview)
    else this.previewBounds.delete(state)
    if(secondaryDirty) dirty=unionBounds(dirty,secondaryDirty)
    if(!dirty)return
    // Only current changes are dirty. Historical primary coverage remains in
    // scratch and the output tile; it does not require recompositing.
    const bounds = {minX:Math.floor(dirty.minX),minY:Math.floor(dirty.minY),maxX:Math.ceil(dirty.maxX),maxY:Math.ceil(dirty.maxY)}
    const secondary = independent ? undefined : behavior.dual?.brush
    const protect=(tip?:TipMaskId,grain?:BrushTextureId,dual?:TipMaskId,dualGrain?:BrushTextureId,grid?:boolean,dualGrid?:boolean,gray?:string,dualGray?:string,mainImage?:NativeImageResource,dualImage?:NativeImageResource,planes?:readonly[string,string,string]):void=>{
      const colorPlanes=planes??originalFrames?.[0].planes
      if(originalRgba&&tip&&!colorPlanes)throw Error('Missing protected RGB frame')
      this.protectTextures([
      'g:cloud','g:grit',
      ...((filteredGradient||textureGradient)&&brush.tip.mask?[brushTextureResourceKey({id:brush.tip.mask,grain:false,gradientPalette:true,gradientLut})]:[]),
      ...(tip&&originalRgba ? [brushTextureResourceKey(imageResource(tip,colorPlanes))] : tip && (!brush.tip.imageSampling || mainImage) ? [brushTextureResourceKey({...brushTipResource(tip,gray,brush.tip),nativeImage:mainImage})] : []),
      ...(dual && (!secondary?.tip.imageSampling || dualImage) ? [brushTextureResourceKey({...brushTipResource(dual,dualGray,secondary?.tip),nativeImage:dualImage})] : []),
      ...(grain ? [brushTextureResourceKey({id:grain,grain:true,discrete:grid?true:undefined,patternAlpha:brush.texture?.material?.alpha,patternSize:brush.texture?.patternSize})] : []),
      ...(dualGrain ? [brushTextureResourceKey({id:dualGrain,grain:true,discrete:dualGrid?true:undefined})] : []),
    ])}
    const effects=brushUsesStampEffects(brush)
    const curveProfiles = effects || !!brush.tip.autoShape || !!secondary?.tip.autoShape || brush.tip.profile?.kind === 'radialCurve' || brush.tip.profile?.kind === 'radialCurveSoftness' || secondary?.tip.profile?.kind === 'radialCurve' || secondary?.tip.profile?.kind === 'radialCurveSoftness'
    const integerImages = curveProfiles || !!brush.tip.imageSampling || !!secondary?.tip.imageSampling
    const animated = !!brush.spray?.particle.image || !!brush.tip.animation || !!secondary?.tip.animation || integerImages
    const primaryTextureId=textureEraseId(brush.texture,effectiveErase),secondaryTextureId=textureEraseId(secondary?.texture,effectiveErase)
    protect(stamps[0]?.mask ?? brushTipSamplerId(brush.tip),primaryTextureId,stamps[0]?.dualMask ?? brushTipSamplerId(secondary?.tip),secondaryTextureId,!!(brush.texture?.application||brush.texture?.material),!!secondary?.texture?.application,stamps[0]?.gray ?? brush.tip.material?.gray,stamps[0]?.dualGray ?? secondary?.tip.material?.gray,undefined,undefined,stamps[0]?.colorPlanes)
    const procedural = !!brush.hatching || brush.tip.kind === 'procedural' || secondary?.tip.kind === 'procedural' || integerImages
    const selected = brush.hatching?this.hatchingProgram():circleBand ? this.circleProgram() : this.stampFor(procedural, integerImages, curveProfiles,effects,filteredGradient,materialVariant)
    const mainView = !animated && brushTipSamplerId(brush.tip) ? this.tipView(brushTipSamplerId(brush.tip)!,brush.tip.material?.gray,brush.tip) : {texture:paper.texture,mode:0}
    const mask=mainView.texture
    const texture = brush.texture ? materialPattern?.texture??this.grain(primaryTextureId!,!!brush.texture.application) : paper.texture
    const dualView = !animated && brushTipSamplerId(secondary?.tip) ? this.tipView(brushTipSamplerId(secondary?.tip)!,secondary?.tip.material?.gray,secondary?.tip) : {texture:paper.texture,mode:0}
    const dualMask=dualView.texture
    const dualTexture = secondary?.texture ? this.grain(secondaryTextureId!,!!secondary.texture.application) : paper.texture
    const dualPeriod = Math.max(0.5, secondary?.texture?.periodPx ?? 1)
    const g = behavior.grain
    const period = Math.max(0.5, (brush.texture?.periodPx ?? 1) * (g ? 0.1 + g.zoom * 1.9 : 1))
    const wrap = (v: number): number => ((v % period) + period) % period
    for (const tile of healingRequest?.tiles??filterRequest?.tiles??target.resolveForPaint(bounds)) {
      const original = scratch.getOrCreate(tile.buffer).original
      let coverage = scratch.getOrCreate(tile.buffer).coverage
      let ceiling = scratch.brushCeiling(tile.buffer)
      if(brush.clone)coverage.clear()
      coverage.beginDraw()
      gl.useProgram(selected.program)
      const u = selected.uniforms
      if(effects){gl.uniform1f(u.u_originalRgbaTip,originalRgba?1:0);gl.uniform4f(u.u_gihFrame,0,0,0,1)}
      if(effects&&!noiseSettings){
        gl.uniform4f(u.u_autoNoiseConfig,65535,0,0,0)
        gl.uniform4f(u.u_autoNoiseKey,0,0,0,0)
        gl.uniform4f(u.u_autoNoiseGridX,0,0,0,0)
        gl.uniform4f(u.u_autoNoiseGridY,0,0,0,0)
      }
      if(materialVariant)gl.uniform1f(u.u_textureMaterial,1)
      if(materialPattern){materialPattern.assertCurrent();if([coverage.texture,original.texture,tile.buffer.texture,ceiling.texture].includes(materialPattern.texture))throw Error('Lightness pattern sampler aliases its paint target')}
      if(textureGradient){const palette=materialPattern?.palette;if(!palette)throw Error('Texture gradient palette view is missing');palette.assertCurrent();if([coverage.texture,original.texture,tile.buffer.texture,ceiling.texture,materialPattern?.texture].includes(palette.texture))throw Error('Texture gradient palette sampler aliases its paint target');gl.activeTexture(gl.TEXTURE0+6);gl.bindTexture(gl.TEXTURE_2D,palette.texture);gl.uniform1i(u.u_gradientPalette,6)}
      const primaryApplication=brushTextureApplication(brush.texture,state.seed,tile.originX,tile.originY)
      const secondaryApplication=brushTextureApplication(secondary?.texture,state.seed,tile.originX,tile.originY,1)
      gl.uniform4f(u.u_textureApplication,...primaryApplication.application);gl.uniform4f(u.u_textureMapping,...primaryApplication.mapping)
      gl.uniform4f(u.u_dualTextureApplication,...secondaryApplication.application);gl.uniform4f(u.u_dualTextureMapping,...secondaryApplication.mapping)
      gl.uniform2f(u.u_resolution, coverage.width, coverage.height)
      const world = paper.worldSize()
      gl.uniform2f(u.u_paperTexSize, world.w, world.h)
      gl.uniform2f(u.u_paperScale, paper.scale, paper.scale)
      gl.uniform2f(u.u_paperOrigin, tile.originX, -tile.originY || 0)
      for (const [unit, tex, name] of [[0, paper.texture, 'u_paperHeightMap'], [1, animated ? paper.texture : mask, 'u_tip'], [2, texture, 'u_texture'], [3, animated ? paper.texture : dualMask, 'u_dual'], [4, dualTexture, 'u_dualTexture'], [5, paper.texture, 'u_previousCeiling']] as const) {
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.uniform1i(u[name], unit)
      }
      if(filteredGradient){gl.activeTexture(gl.TEXTURE0+6);gl.bindTexture(gl.TEXTURE_2D,paper.texture);gl.uniform1i(u.u_gradientPalette,6)}
      const threshold=brush.tip.alphaThreshold, dualThreshold=secondary?.tip.alphaThreshold
      gl.uniform3f(u.u_alphaThreshold,threshold?.value ?? 0,threshold?.softness ?? 0,threshold ? 1 : 0)
      gl.uniform3f(u.u_dualAlphaThreshold,dualThreshold?.value ?? 0,dualThreshold?.softness ?? 0,dualThreshold ? 1 : 0)
      const tipBounds=brush.tip.maskBounds, dualBounds=secondary?.tip.maskBounds
      gl.uniform4f(u.u_tipBounds,tipBounds?.x ?? 0,tipBounds?.y ?? 0,tipBounds?.width ?? 1,tipBounds?.height ?? 1)
      gl.uniform4f(u.u_dualBounds,dualBounds?.x ?? 0,dualBounds?.y ?? 0,dualBounds?.width ?? 1,dualBounds?.height ?? 1)
      gl.uniform1f(u.u_tipPacking,mainView.mode);gl.uniform1f(u.u_dualTipPacking,dualView.mode)
      gl.uniform1f(u.u_lightnessMaterial,brush.tip.material ? 1 : 0)
      gl.uniform1f(u.u_lightnessStrength,brush.tip.material?.strength ?? 1)
      gl.uniform1f(u.u_dualLightnessMaterial,secondary?.tip.material ? 1 : 0)
      gl.uniform1f(u.u_tipKind, brush.tip.profile ? 2 : brush.tip.kind === 'bitmap' ? 1 : 0)
      gl.uniform2f(u.u_tipProfile,brush.tip.profile?.kind === 'gaussian' ? brush.tip.profile.fade : .5,brush.tip.profile?.antialias ? 1 : 0)
      gl.uniform2f(u.u_dualProfile,secondary?.tip.profile?.kind === 'gaussian' ? secondary.tip.profile.fade : .5,secondary?.tip.profile?.antialias ? 1 : 0)
      gl.uniform1f(u.u_wickCap,4)
      if(curveProfiles){
        gl.uniform2f(u.u_autoSpikes,brush.tip.autoShape?.spikes??2,secondary?.tip.autoShape?.spikes??2)
        gl.uniform4f(u.u_tipSoftnessBasis,...brushTipSoftnessBasisUniforms(brush.tip))
        gl.uniform4f(u.u_dualSoftnessBasis,...brushTipSoftnessBasisUniforms(secondary?.tip))
        gl.uniform1f(u.u_tipSoftness,1)
        gl.uniform1f(u.u_dualSoftness,1)
      }
      if ((procedural||brush.hatching) && !circleBand) {
        gl.uniform4f(u.u_tipProcedural, ...brushTipProfileUniforms(brush.tip))
        gl.uniform4f(u.u_dualProcedural, ...brushTipProfileUniforms(secondary?.tip))
      }
      gl.uniform1f(u.u_wickPx,brush.tip.profile || secondary?.tip.profile ? 1 : 0)
      gl.uniform1f(u.u_hardness, brush.tip.hardness)
      gl.uniform1f(u.u_aaPx, 1)
      gl.uniform1f(u.u_paper, brush.paperInteraction)
      gl.uniform1f(u.u_texPeriod, period)
      gl.uniform2f(u.u_texOrigin, wrap(tile.originX), wrap(tile.originY))
      gl.uniform2f(u.u_grainTone, g?.brightness ?? 0, g?.contrast ?? 0)
      gl.uniform1f(u.u_grainBlend, g ? blend(g.blendMode) : 1)
      gl.uniform1f(u.u_dualHardness, secondary?.tip.hardness ?? 0.7)
      gl.uniform1f(u.u_dualTexPeriod, dualPeriod)
      gl.uniform1f(u.u_dualTexStrength, secondary?.texture?.strength ?? 0)
      gl.uniform2f(u.u_dualTexOrigin, ((tile.originX % dualPeriod) + dualPeriod) % dualPeriod, ((tile.originY % dualPeriod) + dualPeriod) % dualPeriod)
      gl.uniform1f(u.u_dualKind, secondary ? secondary.tip.profile ? 3 : secondary.tip.kind === 'bitmap' ? 2 : 1 : 0)
      gl.uniform1f(u.u_dualBlend, blend(behavior.dual?.blendMode))
      gl.uniform2f(u.u_dualFlip,1,1)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ctx.quadBuf())
      gl.enableVertexAttribArray(selected.position)
      gl.vertexAttribPointer(selected.position, 2, gl.FLOAT, false, 0, 0)
      const drawStamps = (list: BehaviorPlaced[], ceilingPass: boolean, fallback = false, beforeStamp?: (stamp:BehaviorPlaced)=>void): void => {
        gl.uniform1f(u.u_ceilingFallback, fallback ? 1 : 0)
        gl.activeTexture(gl.TEXTURE3)
        gl.bindTexture(gl.TEXTURE_2D, animated ? paper.texture : dualMask)
        gl.activeTexture(gl.TEXTURE4)
        gl.bindTexture(gl.TEXTURE_2D, dualTexture)
        gl.uniform1f(u.u_ceilingPass, ceilingPass ? 1 : 0)
        gl.uniform1f(u.u_uniformCeiling, behavior.rendering?.opacityCeiling==='uniform' ? 1 : 0)
        let lastFlow:number|undefined, lastAverage:number|undefined
        let lastMode=accumulation==='directOver' ? 4 : accumulation==='over' ? 1 : 0
        gl.uniform1f(u.u_washMode,lastMode)
        if(accumulation)gl.uniform1f(u.u_opacity,1)
        for (const s of list) {
          if(animated) {
            const currentMask=s.mask ?? brushTipSamplerId(brush.tip), currentDual=s.dualMask ?? brushTipSamplerId(secondary?.tip)
            const imageRatio = secondary ? Math.max(0.01, curveAt(secondary.sizeByPressure, s.pressure) / Math.max(0.01, curveAt(brush.sizeByPressure, s.pressure)) * (secondary.scatter?.scale ?? 1)) : 1
            const mainImage = currentMask && brush.tip.imageSampling ? nativeImageResource(currentMask, brush.tip, 2 * s.radius * s.aspect) : undefined
            const childRadiusX = s.radius * s.aspect * imageRatio / (1 + s.edgeSoftness * .15)
            const dualImage = currentDual && secondary?.tip.imageSampling ? nativeImageResource(currentDual, secondary.tip, 2 * childRadiusX) : undefined
            protect(currentMask,brush.texture?.id,currentDual,secondary?.texture?.id,!!(brush.texture?.application||brush.texture?.material),!!secondary?.texture?.application,s.gray ?? brush.tip.material?.gray,s.dualGray ?? secondary?.tip.material?.gray,mainImage,dualImage,s.colorPlanes)
            // Resolve the whole group before binding. Lazy upload restores GL
            // state and cannot evict another sampler in this protected group.
            const rgbaView=originalRgba?originalView(currentMask,s.colorPlanes,s.frameIndex):undefined
            if(rgbaView&&(rgbaView.texture===coverage.texture||rgbaView.texture===original.texture||rgbaView.texture===tile.buffer.texture||rgbaView.texture===ceiling.texture))throw Error('Pixel RGBA sampler aliases its paint target')
            if(filteredGradient){const palette=rgbaView?.palette;if(!palette)throw Error('Filtered gradient palette view is missing');palette.assertCurrent();if([coverage.texture,original.texture,tile.buffer.texture,ceiling.texture].includes(palette.texture))throw Error('Gradient palette sampler aliases its paint target');gl.activeTexture(gl.TEXTURE0+6);gl.bindTexture(gl.TEXTURE_2D,palette.texture)}
            const mainView=rgbaView ? {texture:rgbaView.texture,mode:0} : currentMask ? this.tipView(currentMask,s.gray ?? brush.tip.material?.gray,brush.tip,mainImage) : {texture:paper.texture,mode:0}
            if(rgbaView)gl.uniform4f(u.u_tipBounds,...rgbaView.bounds)
            const mainTexture=mainView.texture
            const secondView=currentDual ? this.tipView(currentDual,s.dualGray ?? secondary?.tip.material?.gray,secondary?.tip,dualImage) : {texture:paper.texture,mode:0}
            const secondTexture=secondView.texture
            gl.uniform1f(u.u_tipPacking,mainView.mode);gl.uniform1f(u.u_dualTipPacking,secondView.mode)
            gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,mainTexture)
            gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,secondTexture)
            if (integerImages) {
              const mainBounds = (gihFrames&&s.frameIndex!==undefined?gihFrames[s.frameIndex].maskBounds:undefined)??mainImage?.bounds ?? brush.tip.maskBounds
              const childBounds = dualImage?.bounds ?? secondary?.tip.maskBounds
              gl.uniform4f(u.u_tipBounds, mainBounds?.x ?? 0, mainBounds?.y ?? 0, mainBounds?.width ?? 1, mainBounds?.height ?? 1)
              gl.uniform4f(u.u_dualBounds, childBounds?.x ?? 0, childBounds?.y ?? 0, childBounds?.width ?? 1, childBounds?.height ?? 1)
              gl.uniform1f(u.u_tipImageEnabled, mainImage ? 1 : 0)
              gl.uniform1f(u.u_dualImageEnabled, dualImage ? 1 : 0)
              const tipShift = mainImage ? nativeImageUVShift(mainImage, s.radius*s.aspect, s.radius, s.angle, s.flipX, s.flipY) : [0,0] as const
              gl.uniform2f(u.u_tipImageUVShift, tipShift[0], tipShift[1])
              gl.uniform2f(u.u_dualImageUVShift, 0, 0)
              if (mainImage) gl.uniform4f(u.u_tipImageDomain, ...nativeImageDomainUniform(nativeImageDomain(brush.tip,s.x,s.y,s.radius*s.aspect,s.radius,s.angle), tile.originX,tile.originY,coverage.height))
              if (dualImage && secondary) {
                const childAngle = secondary.tip.rotation === 'fixed' ? secondary.tip.angle : s.angle
                gl.uniform2f(u.u_dualImageUVShift, ...nativeImageUVShift(dualImage, childRadiusX, childRadiusX/secondary.tip.aspect, childAngle))
                gl.uniform4f(u.u_dualImageDomain, ...nativeImageDomainUniform(nativeImageDomain(secondary.tip,s.x,s.y,childRadiusX,childRadiusX/secondary.tip.aspect,childAngle), tile.originX,tile.originY,coverage.height))
              }
            }
          }
          const footprint=footprintFor(s,1)
          if(!footprint || footprint.maxX<tile.originX || footprint.maxY<tile.originY || footprint.minX>tile.originX+coverage.width || footprint.minY>tile.originY+coverage.height) continue
          beforeStamp?.(s)
          if(noiseGrids&&noiseConfig){
            const grid=noiseGrids.get(s)
            if(!grid||s.autoNoiseKey===undefined)throw Error('Auto-mask noise grid was not prepared')
            const mapping=autoMaskNoiseGridUniforms(grid,tile.originX,tile.originY,coverage.height)
            gl.uniform4f(u.u_autoNoiseConfig,noiseConfig[0],noiseConfig[1],mapping.stepX,mapping.stepY)
            gl.uniform4f(u.u_autoNoiseKey,...autoMaskNoiseCoordinateBytes(s.autoNoiseKey))
            gl.uniform4f(u.u_autoNoiseGridX,...mapping.x)
            gl.uniform4f(u.u_autoNoiseGridY,...mapping.y)
          }

          if(brush.hatching&&s.hatching){
            gl.uniform4f(u.u_hatchBackground,...hatchingBackgroundUniform(brush.hatching,execution?.brushSource))
            const h=s.hatching
            gl.uniform2f(u.u_hatchStyle,h.thickness,brush.hatching.antialias?1:0)
            for(let i=0;i<3;i++)gl.uniform4f(u['u_hatch'+i],...(i<h.angles.length?hatchingPlane(h.angles[i],h.separation,brush.hatching.origin,tile.originX,tile.originY,brush.hatching.subpixel):[0,0,0,0])as [number,number,number,number])
          }
          if((brush.tip.profile?.kind==='radialCurveSoftness'||brush.tip.profile?.kind==='curveRectangleSoftness') && s.softnessScale!==undefined)gl.uniform1f(u.u_tipSoftness,s.softnessScale)
          if(secondary?.tip.profile?.kind==='radialCurveSoftness' && s.dualSoftnessScale!==undefined)gl.uniform1f(u.u_dualSoftness,s.dualSoftnessScale)
          if (s.sharpnessScale !== undefined) gl.uniform3f(u.u_alphaThreshold, brushAlphaThresholdValue(threshold, s.sharpnessScale), threshold?.softness ?? 0, threshold ? 1 : 0)
          if (s.dualSharpnessScale !== undefined) gl.uniform3f(u.u_dualAlphaThreshold, brushAlphaThresholdValue(dualThreshold, s.dualSharpnessScale), dualThreshold?.softness ?? 0, dualThreshold ? 1 : 0)
          if (circleBand) {
            const difference = circleClips.get(s)
            gl.uniform2f(u.u_dabCenter, s.x - tile.originX, s.y - tile.originY)
            gl.uniform1f(u.u_dabRadius, s.radius)
            gl.uniform1f(u.u_angle, 0)
            gl.uniform1f(u.u_aspectRatio, 1)
            gl.uniform1f(u.u_wickPx, 1)
            gl.uniform1f(u.u_wickCap, Math.max(4, 1 / s.radius))
            gl.uniform3fv(u.u_color, s.color)
            gl.uniform1f(u.u_circleClipped, difference?.clips.length ? 1 : 0)
            const planes = difference?.clips.flat() ?? []
            for (let i = 0; i < 4; i++) {
              const plane = planes[i]
              if (!plane) { gl.uniform3f(u[`u_circleClip${i}`], 0, 0, 0); continue }
              const [a, b] = plane, dx = b.x - a.x, dy = b.y - a.y
              // Local displacement keeps the plane stable across tile origins.
              gl.uniform3f(u[`u_circleClip${i}`], -dy, dx, dx * (s.y - a.y) - dy * (s.x - a.x))
            }
            gl.drawArrays(gl.TRIANGLES, 0, 6)
            continue
          }
          gl.uniform2f(u.u_dabCenter, s.x - tile.originX, s.y - tile.originY)
          gl.uniform2f(u.u_grainTone,g?.brightness??0,clamp((g?.contrast??0)+s.wetGrade,-1,1))
          gl.uniform1f(u.u_edgeBleed, s.edgeSoftness)
          gl.uniform1f(u.u_dabRadius, s.radius)
          gl.uniform1f(u.u_angle, s.angle)
          gl.uniform1f(u.u_aspectRatio, s.aspect)
          const ratio = secondary ? Math.max(0.01, curveAt(secondary.sizeByPressure, s.pressure) / Math.max(0.01, curveAt(brush.sizeByPressure, s.pressure)) * (secondary.scatter?.scale ?? 1)) : 1
          if(brush.tip.profile || secondary?.tip.profile) {
            const radius=Math.fround(s.radius),aspect=Math.fround(s.aspect)
            const mainRadius=Math.fround(radius*aspect)
            const childRadius=Math.fround(mainRadius*ratio/(1+s.edgeSoftness*.15))
            const childAspect=(secondary?.tip.aspect ?? 1)/brush.tip.aspect*aspect
            gl.uniform4f(u.u_gaussianGeometry,mainRadius,gaussianSampleCount(2*mainRadius/Math.max(1,aspect),!!brush.tip.profile?.antialias),
              childRadius,gaussianSampleCount(2*childRadius/Math.max(1,childAspect),!!secondary?.tip.profile?.antialias))
          }
          if (procedural) {
            const mainRx = Math.fround(Math.fround(s.radius) * Math.fround(s.aspect))
            const mainRy = Math.fround(s.radius)
            if(brush.tip.profile?.kind==='gaussian2D'&&brush.tip.profile.shape==='rectangle'){
              const uniforms=rectangleUniforms?.get(s)
              if(!uniforms)throw Error('Gaussian rectangle geometry was not prepared')
              gl.uniform4f(u.u_rectangleCoefficients,...uniforms.coefficients)
              gl.uniform4f(u.u_rectangleGeometry,...uniforms.geometry)
            }
            const childRx = Math.fround(mainRx * ratio / (1 + s.edgeSoftness * .15))
            const childRy = Math.fround(childRx / (secondary?.tip.aspect ?? 1))
            if(s.softnessScale!==undefined && brush.tip.profile?.kind==='standard') gl.uniform4f(u.u_tipProcedural,...proceduralProfileUniforms(standardSoftnessProfile(brush.tip.profile,mainRx,mainRy,s.softnessScale??1)))
            if(s.dualSoftnessScale!==undefined && secondary?.tip.profile?.kind==='standard') gl.uniform4f(u.u_dualProcedural,...proceduralProfileUniforms(standardSoftnessProfile(secondary.tip.profile,childRx,childRy,s.dualSoftnessScale??1)))
            const standard = (brush.tip.profile?.kind === 'standard' || brush.tip.profile?.kind === 'radialCurve' || brush.tip.profile?.kind === 'radialCurveSoftness'||brush.tip.profile?.kind === 'gaussian2D'||brush.tip.profile?.kind === 'curveRectangle'||brush.tip.profile?.kind === 'curveRectangleSoftness') || !!brush.tip.imageSampling
            // A child profile does not expand a legacy parent's clipping quad.
            const wick = standard ? Math.SQRT2 / Math.min(1, s.aspect)
              : brush.tip.profile || secondary?.tip.profile?.kind === 'gaussian' ? 1 : 0
            gl.uniform1f(u.u_wickPx, wick)
            gl.uniform1f(u.u_wickCap, Math.max(4, wick / Math.max(s.radius, .0001)))
            gl.uniform4f(u.u_tipProceduralGeometry, mainRx, mainRy, proceduralSampleCount(2 * Math.min(mainRx, mainRy), !!brush.tip.profile?.antialias), 0)
            gl.uniform4f(u.u_dualProceduralGeometry, childRx, childRy, proceduralSampleCount(2 * Math.min(childRx, childRy), !!secondary?.tip.profile?.antialias), 0)
            gl.uniform1f(u.u_dualProceduralAngle, secondary?.tip.rotation === 'fixed' ? secondary.tip.angle : s.angle)
            if(brush.tip.autoShape){
              // Native allocation is the world-axis bbox of a rotated square.
              // Keep the generator's physical angle/radii independent of this quad.
              const extent=mainRx*(Math.abs(Math.cos(s.angle))+Math.abs(Math.sin(s.angle)))
              gl.uniform1f(u.u_autoSpikeAngle,s.angle)
              gl.uniform1f(u.u_dabRadius,extent)
              gl.uniform1f(u.u_aspectRatio,1)
              gl.uniform1f(u.u_angle,0)
              gl.uniform1f(u.u_wickPx,0)
            }

          }
          const dualAngle = (secondary?.tip.rotation === 'fixed' ? secondary.tip.angle : s.angle) - s.angle
          gl.uniform4f(u.u_dualTransform, (1+s.edgeSoftness*.15) / ratio, (1+s.edgeSoftness*.15)*(secondary?.tip.aspect ?? 1) / brush.tip.aspect / ratio, Math.cos(dualAngle), Math.sin(dualAngle))
          gl.uniform1f(u.u_dualStrength, secondary ? secondary.flow * curveAt(secondary.flowByPressure, s.pressure) * curveAt(secondary.opacityByPressure, s.pressure) : 1)
          // The setup value restores legacy/static state on every brush switch.
          // A child material only contributes alpha; its RGB strength does not
          // multiply the masking coverage. Independent children paint normally.
          if(s.lightnessStrength!==undefined)gl.uniform1f(u.u_lightnessStrength,s.lightnessStrength)
          const flowValue=clamp(s.flow)
          if(lastFlow!==flowValue){gl.uniform1f(accumulation?u.u_washFlow:u.u_opacity,flowValue);lastFlow=flowValue}
          if(accumulation==='alphaDarken'){
            const average=s.washAverage??0, mode=s.washFeedback?2:3
            if(lastAverage!==average){gl.uniform1f(u.u_washAverage,average);lastAverage=average}
            if(lastMode!==mode){gl.uniform1f(u.u_washMode,mode);lastMode=mode}
          }
          gl.uniform1f(u.u_ceiling, s.ceiling)
          gl.uniform1f(u.u_paperPressure, s.pressure)
          gl.uniform3fv(u.u_color, s.color)
          gl.uniform2f(u.u_flip, s.flipX, s.flipY)
          if(s.dualFlipX!==undefined&&s.dualFlipY!==undefined)gl.uniform2f(u.u_dualFlip,s.dualFlipX,s.dualFlipY)
          const jitter = g?.offsetJitter ? brushDabRandom(state.seed, 42) * period : 0
          const moving = g?.mode === 'moving' ? 1 - g.movement : 0
          const rotation = (g?.rotation ?? 0) * Math.PI
          // Rotate the full world origin before reducing modulo the grain period.
          // Reducing first would create a phase seam at every tile for arbitrary angles.
          const cos = Math.cos(rotation), sin = Math.sin(rotation)
          const ox = tile.originX - s.x * moving + jitter, oy = tile.originY - s.y * moving + jitter
          gl.uniform4f(u.u_grainTransform, wrap(cos * ox + sin * oy), wrap(-sin * ox + cos * oy), cos, sin)
          const depth = (brush.texture?.strength ?? 0) * s.grainDepth
          gl.uniform1f(u.u_texStrength, g ? clamp(Math.max(g.depthMinimum, depth) * (1 - g.depthJitter * brushDabRandom(state.seed, 43))) : depth)
          const selectedGih=gihPlan(s)
          if(selectedGih){
            gl.uniform4f(u.u_gihFrame,...selectedGih.frame)
            gl.uniform4f(u.u_gihSampleX,...selectedGih.sampleX);gl.uniform4f(u.u_gihSampleY,...selectedGih.sampleY)
            gl.uniform2f(u.u_dabCenter,selectedGih.x+selectedGih.width/2-tile.originX,selectedGih.y+selectedGih.height/2-tile.originY)
            gl.uniform1f(u.u_dabRadius,selectedGih.height/2);gl.uniform1f(u.u_aspectRatio,selectedGih.width/selectedGih.height);gl.uniform1f(u.u_angle,0)
          }
          gl.drawArrays(gl.TRIANGLES, 0, 6)
        }
      }
      const drawCeilings = (list: BehaviorPlaced[]): void => {
        if (this.minmax) {
          ceiling.beginMaxDraw(this.minmax)
          drawStamps(list, true)
          ceiling.endDraw()
          return
        }
        const copy = scratch.brushCeilingCopy(tile.buffer)
        for (const item of list) {
          const rect = copyRectFor(item,ceiling.width,ceiling.height,tile.originX,tile.originY)
          if (!rect) continue
          gl.activeTexture(gl.TEXTURE7)
          // Only this quad samples previous ceiling. Keep tile-sized storage
          // and identical offsets so the shader's gl_FragCoord UV is unchanged.
          ceiling.copyRegionInto(copy, rect.x, rect.y, rect.x, rect.y, rect.width, rect.height)
          ceiling.beginReplaceDraw()
          gl.activeTexture(gl.TEXTURE5)
          gl.bindTexture(gl.TEXTURE_2D, copy.texture)
          drawStamps([item], true, true)
          ceiling.endDraw()
        }
        gl.activeTexture(gl.TEXTURE5)
        gl.bindTexture(gl.TEXTURE_2D, paper.texture)
      }
      const drawPhysical=(list:BehaviorPlaced[]):void=>{
        if(brush.experiment){
          (this.sketchBatch??=new SketchLineBatch(gl,this.sharedLineStaging())).paintPolygon(list,coverage,ceiling,tile.originX,tile.originY,this.polygonBatch??=new PolygonFillBatch(gl))
          return
        }
        if(brush.particle){
          (this.sketchBatch??=new SketchLineBatch(gl,this.sharedLineStaging())).paintParticlePoints(list,coverage,ceiling,tile.originX,tile.originY,this.sprayBatch??=new SprayShapeBatch(gl))
          return
        }
        if(brush.curveTrace){
          (this.sketchBatch??=new SketchLineBatch(gl,this.sharedLineStaging())).paintCurves(list,coverage,ceiling,scratch.brushCeilingCopy(tile.buffer),tile.originX,tile.originY)
          return
        }
        if(hasBristleNativePointCoverage(brush)){
          if(!this.bristleRequests)throw Error('Native Bristle AA142 is not prepared')
          this.bristleRequests.prepareDimensions(coverage.width,coverage.height,true)
          this.bristleRequests.paint(list,coverage,ceiling,tile.originX,tile.originY,undefined,true,brush.version===144)
          return
        }
        if(brush.bristle?.version===2){
          if(!this.bristleRequests)throw Error('Bristle ink profile is not prepared')
          this.bristleRequests.prepareDimensions(coverage.width,coverage.height)
          this.bristleRequests.paint(list,coverage,ceiling,tile.originX,tile.originY,{antialias:brush.bristle.antialias,compositing:brush.bristle.compositing})
          return
        }
        if(brush.bristle&&!brush.bristle.antialias&&!brush.bristle.compositing){
          if(!this.bristleRequests)throw Error('Bristle alpha-winner programs are not prepared')
          this.bristleRequests.prepareDimensions(coverage.width,coverage.height)
          this.bristleRequests.paint(list,coverage,ceiling,tile.originX,tile.originY)
          return
        }
        if(brush.sketch||brush.bristle){
          (this.sketchBatch??=new SketchLineBatch(gl,this.sharedLineStaging())).paint(list,coverage,ceiling,tile.originX,tile.originY,brush.sketch?.antialias??brush.bristle!.antialias,!!brush.bristle&&!brush.bristle.compositing)
          return
        }
        if(brush.spray?.particle.image){
          if(accumulation!=='directOver'||secondary||brush.texture||brush.tip.material||brush.paperInteraction||behavior.edgeBleed||behavior.wetMix||!brush.tip.color||!('planes'in brush.tip.color)||brush.tip.imageSampling)throw Error('Spray original image combination is not supported')
          const batch=this.sprayImageBatch;if(!batch)throw Error('Spray images are not prepared')
          // Preserve order across animation frame changes. The existing draw
          // lease pins the union of all prepared frames under the same16MiB.
          let start=0
          while(start<list.length){const first=list[start],id=first.mask??brush.tip.mask,planes=first.colorPlanes??brush.tip.color.planes
            if(!id||!planes||!first.sprayImageHsv)throw Error('Spray image particle has no original resource')
            let end=start+1;while(end<list.length&&(list[end].mask??brush.tip.mask)===id&&(list[end].colorPlanes??brush.tip.color.planes)===planes)end++
            const view=this.preparedImage(id,planes,brush.tip.maskBounds)
            batch.paint(list.slice(start,end).map(s=>({x:s.x,y:s.y,width:2*s.radius*s.aspect,height:2*s.radius,angle:s.angle,opacity:s.flow*s.ceiling,hsv:s.sprayImageHsv??(()=>{throw Error('Spray image particle has no captured HSV')})()})),view,coverage,tile.originX,tile.originY)
            start=end
          }
          return
        }
        if(brush.spray && brush.spray.particle.shape!=='tip' && accumulation==='directOver' && !secondary && !brush.texture && !brush.tip.material && !brush.tip.color && !brush.paperInteraction && !behavior.edgeBleed && !behavior.wetMix){
          coverage.beginDraw()
          ;(this.sprayBatch??=new SprayShapeBatch(gl)).paint(list,brush.spray.particle.shape,tile.originX,tile.originY,coverage.width,coverage.height)
          coverage.endDraw();return
        }
        const copy=circleBand || accumulation==='alphaDarken' && list.some(s=>s.washFeedback) ? ceiling : undefined
        let fastBound=false, lastAverage:number|undefined
        // Preserve one uninterrupted render pass for ordinary OVER and rising
        // constant-pigment Wash. Max-alpha always samples its previous stroke
        // pixel; Wash needs feedback only on its explicitly selected dabs.
        drawStamps(list,false,false,item=>{
          if((circleBand || item.washFeedback) && copy){
            const rect=copyRectFor(item,coverage.width,coverage.height,tile.originX,tile.originY)
            if(!rect)return
            gl.activeTexture(gl.TEXTURE7)
            coverage.copyRegionInto(copy,rect.x,rect.y,rect.x,rect.y,rect.width,rect.height)
            coverage.beginReplaceDraw()
            gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,copy.texture)
            fastBound=false
          }else{
            if(!fastBound){
              coverage.beginDraw()
              if(accumulation==='alphaDarken')gl.blendFunc(gl.CONSTANT_ALPHA,gl.ONE_MINUS_SRC_ALPHA)
              fastBound=true
            }
            if(accumulation==='alphaDarken' && lastAverage!==item.washAverage){
              gl.blendColor(0,0,0,item.washAverage??0);lastAverage=item.washAverage
            }
          }
        })
        coverage.endDraw()
        if (!circleBand) gl.blendColor(0,0,0,0)
        gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,paper.texture)
      }
      if(filter147)coverage.clear()
      if(accumulation)drawPhysical(tail.ready)
      else {drawStamps(tail.ready,false);coverage.endDraw();drawCeilings(tail.ready)}
      if (tail.preview.length) {
        const preview = scratch.brushPreview(tile.buffer)
        gl.activeTexture(gl.TEXTURE7)
        // The composite only reads dirty pixels, plus bounded neighbor taps
        // for Burnt Edges/feather. Never sample pooled pixels outside this copy.
        const rect=boundsCopyRect(bounds,tile,edge+2)
        if(!rect)continue
        coverage.copyRegionInto(preview.coverage,rect.x,rect.y,rect.x,rect.y,rect.width,rect.height)
        ceiling.copyRegionInto(preview.ceiling,rect.x,rect.y,rect.x,rect.y,rect.width,rect.height)
        coverage = preview.coverage
        ceiling = preview.ceiling
        coverage.beginDraw()
        if(accumulation)drawPhysical(tail.preview)
        else {drawStamps(tail.preview,false);coverage.endDraw();drawCeilings(tail.preview)}
      }
      if(healingRequest){healingRequest.destinations.push({tile,mask:coverage});continue}
      if(brush.clone){
        const source=execution?.brushSource?.clone
        if(!source)throw Error('Clone requires a recorded source')
        ;(this.clonePass??=new CloneBrushPass(gl)).paint(tile,bounds,coverage,scratch,target,source,dabs[0],brush.clone.moveSourcePoint,state.opacity,clone149?scratch.canonicalSource:undefined)
        continue
      }
      if(filter147){
        this.filterSmudge147!.paint(brush,filterRequest!.state,filterRequest!.request,tile,bounds,coverage,1)
        continue
      }
      if(brush.filter){
        (this.filterPass??=new FilterBrushPass(gl)).paint(brush.filter,tile,bounds,coverage,scratch,target)
        continue
      }
      this.presentStrokeTile(tile,bounds,original,coverage,ceiling,brush,state.opacity,edge,secondaryState,extendedComposite)
    }
    if(filter147)this.filterSmudge147!.finishSpatial(brush,filterRequest!.state,filterRequest!.request)
    if(!healingRequest)target.markContentPainted(bounds)
    } finally { releaseTextures() }
  }
}
