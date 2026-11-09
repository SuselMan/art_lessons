import{prepareSketchMask}from'../presets/sketchMask'
import{assertTextureLightnessWash171Planes}from'../presets/textureLightnessWash171'
import{hasLegacyColorSmudgeMinMax172Scope}from'@grafetto/shared'
import{hasFilterBitmap169Scope}from'@grafetto/shared'
import {isBrushPattern,type BrushPattern} from '@grafetto/shared'
import{hasSprayRectangleNoise155Scope}from'@grafetto/shared'
import{hasLegacyColorSmudgeOverlay154Scope}from'@grafetto/shared'
import {assertBristleSource143Ready} from '../presets/bristleInitialization140'
import{hasTangentNormalWash136Scope}from'@grafetto/shared'
import{hasBristleWash135Scope}from'@grafetto/shared'
import{hasParticleWash134Scope}from'@grafetto/shared'
import{hasSprayWash133Scope,isBrushSpray}from'@grafetto/shared'
import{hasSmudgeTextureErase131Scope}from'@grafetto/shared'
import{assertIndependentLightness128}from'../presets/independentLightness128'
import{assertUnequalLightnessGih124}from'../presets/gihUnequalLightness124'
import{assertEqualLightnessGih123}from'../presets/gihEqualLightness123'
import {textureMaterialKind} from '../presets/textureLightness'
import {usesColorSmudgeTexture} from '../presets/colorSmudgeTexture'
import {BRISTLE_SATURATION_GPU_BYTES,BRISTLE_SATURATION_UPLOAD_BYTES,bristleSaturationResourceKey} from './BristleSaturationResource'
import {prepareVariableGih,usesVariableGih} from '../presets/gihFramePreparation'
import {usesPixelOriginalRgba,assertPixelOriginalRgba,pixelOriginalRgbaFrames} from '../presets/pixelOriginalRgba'
import {textureEraseId} from '../presets/brushTextureErase'
import {validateRadialSoftnessTexture,type RadialSoftnessLayout} from '../raster/radialSoftness'
import { radialCurveTextureSide } from '../raster/radialCurve'
import { proceduralProfileUniforms } from '../raster/brushProcedural'
import { nativeImageBank, type NativeImageResource } from './NativeImageBank'
import { materialPackingPlan, materialGroupBytes, type MaterialTextureGroup } from '../presets/brushMaterialPacking'
import { importedAssetPixels } from '../presets/importedBrushes'
import {brushTipColorPlanes,isBrushGradient,type BrushBristle,type BrushDescriptor,type BrushTip,type BrushTextureId,type TipMaskId} from '@grafetto/shared'

export interface BrushPreparationResource { painter: 'stamp' | 'wet';canvasPattern?:true; bristleSaturation?:BrushBristle; gradientMap?:true;gradientLut?:string;gradientSource?:true;gradientPalette?:true;colorPlanes?: readonly [string,string,string]; id: TipMaskId | BrushTextureId; grain: boolean; patternAlpha?:string;patternSize?:{width:number;height:number}; gray?: string; discrete?: true; materialGroup?: MaterialTextureGroup; materialChannels?: 'ra' | 'rg' | 'ba'; nativeImage?: NativeImageResource; lookup32?: true }
export interface BrushPreparationOptions { pattern?:BrushPattern;gradient?:string;signal?: AbortSignal; onProgress?: (done: number, total: number) => void }
export interface BrushPreparationResult { status: 'ready' | 'skipped' | 'cancelled' }
export const brushTextureResourceKey = (resource: Pick<BrushPreparationResource,'id'|'grain'|'discrete'|'patternAlpha'|'patternSize'|'gray'|'materialGroup'|'nativeImage'|'lookup32'|'colorPlanes'|'gradientMap'|'gradientLut'|'gradientSource'|'gradientPalette'|'bristleSaturation'>): string => resource.patternAlpha ? `g:lightness108:${resource.id}:${resource.patternAlpha}:${resource.patternSize?.width}x${resource.patternSize?.height}` : (resource.bristleSaturation ? bristleSaturationResourceKey(resource.bristleSaturation) : undefined) ?? (resource.gradientSource ? `t:gradient-source:filteredGray-v1:${resource.id}:${resource.colorPlanes?.[0]}` : undefined) ?? (resource.gradientPalette ? `t:gradient-palette:filteredGray-v1:${resource.gradientLut ?? 'unbound'}` : undefined) ?? (resource.gradientMap ? `t:gradient:${resource.id}:${resource.colorPlanes?.[0]}:${resource.gradientLut ?? 'unbound'}` : undefined) ?? (resource.colorPlanes ? `t:rgba:${resource.id}:${resource.colorPlanes.join(':')}` : undefined) ?? (resource.lookup32 ? `t:lookup32:${resource.id}` : undefined) ?? resource.nativeImage?.key ?? resource.materialGroup?.key ?? (resource.gray ? `t:lightness:${resource.id}:${resource.gray}` : `${resource.grain ? resource.discrete ? 'g:grid' : 'g' : 't'}:${resource.id}`)
export function bindBrushGradient(resources:readonly BrushPreparationResource[],lut:string|undefined):BrushPreparationResource[] {
 return resources.map(resource=>{
  if(!resource.gradientMap&&!resource.gradientPalette)return resource
  if(!isBrushGradient(lut))throw Error('Gradient tip preparation requires a captured palette')
  return {...resource,gradientLut:lut}
 })
}
/** Small preflight shared by selected and never-selected READ paths. */
export function brushUsesStampEffects(brush:BrushDescriptor):boolean {
 const activeNoise=!!brush.tip.autoNoise&&(brush.tip.autoNoise.density!==1||brush.tip.autoNoise.randomness!==0)
 const extended=(b:BrushDescriptor|undefined)=>{const mode=b?.texture?.application?.mode;return mode==='darken'||mode==='overlay'||mode==='linearDodge'||mode==='linearBurn'||mode==='colorDodge'||mode==='colorBurn'||mode==='hardMixPhotoshop'||mode==='hardMixSofterPhotoshop'}
 const inline=brush.behavior?.dual?.sampling!=='independent'?brush.behavior?.dual?.brush:undefined
 return !!textureMaterialKind(brush)||usesVariableGih(brush.tip)||usesPixelOriginalRgba(brush)||activeNoise||extended(brush)||extended(inline)||brush.tip.profile?.kind==='gaussian2D'||brush.tip.profile?.kind==='curveRectangle'||brush.tip.profile?.kind==='curveRectangleSoftness'
}
export const BRUSH_PREPARATION_BYTES = 16 * 1024 * 1024

export function brushTipSamplerId(tip?: BrushTip): TipMaskId | undefined {
  return ((tip?.profile?.kind === 'radialCurve') || tip?.profile?.kind === 'radialCurveSoftness' || tip?.profile?.kind === 'curveRectangle' || tip?.profile?.kind === 'curveRectangleSoftness') ? tip.profile.lookup : tip?.mask
}
const softnessBases=new WeakMap<BrushTip,{lookup:string;resolution:number;minimum:number;span:number;basis:RadialSoftnessLayout}>()
export function brushTipSoftnessLayout(tip:BrushTip):RadialSoftnessLayout {
  const profile=tip.profile
  if(profile?.kind!=='radialCurveSoftness'&&profile?.kind!=='curveRectangleSoftness')throw Error('Expected radial softness tip')
  const old=softnessBases.get(tip)
  if(old&&old.lookup===profile.lookup&&old.resolution===profile.resolution&&old.minimum===profile.minimum&&old.span===profile.span)return old.basis
  const basis=validateRadialSoftnessTexture(importedAssetPixels(profile.lookup),profile)
  softnessBases.set(tip,{lookup:profile.lookup,resolution:profile.resolution,minimum:profile.minimum,span:profile.span,basis})
  return basis
}
export function brushTipSoftnessBasisUniforms(tip?:BrushTip):[number,number,number,number] {
  if(tip?.profile?.kind!=='radialCurveSoftness'&&tip?.profile?.kind!=='curveRectangleSoftness')return [0,0,0,1]
  const basis=brushTipSoftnessLayout(tip)
  return [basis.resolution,basis.textureSide,basis.minimum,basis.span]
}
export function brushTipProfileUniforms(tip?: BrushTip): [number,number,number,number] {
  const profile=tip?.profile
  if((profile?.kind==='radialCurveSoftness'||profile?.kind==='curveRectangleSoftness'))return proceduralProfileUniforms(profile,brushTipSoftnessLayout(tip!).textureSide)
  return proceduralProfileUniforms(profile, (profile?.kind === 'radialCurve'||profile?.kind === 'curveRectangle') ? radialCurveTextureSide(importedAssetPixels(profile.lookup), profile.resolution) : undefined)
}

const materialPlans = new WeakMap<BrushTip, ReturnType<typeof materialPackingPlan>>()
/** One physical resource resolver for preparation, pinning and render lookup. */
export function brushTipResource(id: TipMaskId, gray?: string, tip?: BrushTip): Omit<BrushPreparationResource,'painter'> {
  if((tip?.profile?.kind==='radialCurveSoftness'||tip?.profile?.kind==='curveRectangleSoftness')){
    brushTipSoftnessLayout(tip)
    return {id:tip.profile.lookup,grain:false,lookup32:true}
  }
  if ((tip?.profile?.kind === 'radialCurve'||tip?.profile?.kind === 'curveRectangle')) {
    radialCurveTextureSide(importedAssetPixels(tip.profile.lookup),tip.profile.resolution)
    return {id:tip.profile.lookup,grain:false,lookup32:true}
  }
  if (!gray || !tip?.material || !tip.animation) return {id,grain:false,...(gray ? {gray} : {})}
  let plan=materialPlans.get(tip)
  if(!plan){
    const frames=tip.animation.frames.map((alpha,index)=>({alpha,gray:tip.material!.grayFrames?.[index] ?? tip.material!.gray}))
    const sizes=tip.animation?.geometry&&tip.material?frames.map(frame=>Math.sqrt(importedAssetPixels(frame.alpha).length)):undefined
    plan=materialPackingPlan(frames,Math.sqrt(importedAssetPixels(frames[0].alpha).length),sizes)
    materialPlans.set(tip,plan)
  }
  const index=tip.animation.frames.findIndex((alpha,index)=>alpha===id && (tip.material!.grayFrames?.[index] ?? tip.material!.gray)===gray)
  if(index<0)throw Error('Material frame is absent from its tip plan')
  const view=plan.frames[index]
  return {id,gray,grain:false,materialGroup:view.group,materialChannels:view.channels}
}

/** Matches sampler routes, rather than uploading both formats for every tip. */
export function brushPreparationPlan(brush: BrushDescriptor, capturedErase = !!brush.behavior?.erase): {
  resources: BrushPreparationResource[]
  capabilities: ('stamp' | 'wet' | 'stampImage' | 'wetImage' | 'stampCircleBand' | 'stampCurve' | 'stampEffects' | 'compositeEffects' | 'wetCurve' | 'colorSmudge' | 'colorSmudgeTexture' | 'colorSmudgeForeground' | 'colorSmudgeLegacy' | 'colorSmudgeLegacyMinMax172' | 'colorSmudgeMean' | 'projectionCanvas' | 'sprayShapes'|'sprayImages'|'spraySources'|'sprayWash'|'requestWash'|'bristleWash'|'sketchLines'|'hatching'|'grid'|'polygonFill'|'canvasEffect'|'filterBrush'|'cloneBrush')[]
} {
  if(brush.spray&&brush.version===155&&(!hasSprayRectangleNoise155Scope(brush)||capturedErase))throw Error('Invalid Spray rectangle noise155 scope')
  if((brush.mixer?.colorRateComposite==='darken'||brush.mixer?.colorRateComposite==='lighten')&&(!hasLegacyColorSmudgeMinMax172Scope(brush)||capturedErase))throw Error('Invalid legacy foreground MinMax172 scope')
  if(brush.mixer?.colorRateComposite==='overlay'&&(!hasLegacyColorSmudgeOverlay154Scope(brush)||capturedErase))throw Error('Invalid legacy foreground Overlay154 scope')
  if(brush.tangentNormal&&brush.behavior?.rendering?.accumulation==='alphaDarken'&&!hasTangentNormalWash136Scope(brush))throw Error('Invalid Tangent Wash136 scope')
  const bristleWash=hasBristleWash135Scope(brush)
  if(brush.bristle&&brush.behavior?.rendering?.accumulation==='alphaDarken'&&!bristleWash)throw Error('Invalid Bristle Wash135 scope')
  const particleWash=hasParticleWash134Scope(brush)
  if(brush.particle&&brush.behavior?.rendering?.accumulation==='alphaDarken'&&!particleWash)throw Error('Invalid Particle Wash134 scope')
  const sprayWash=hasSprayWash133Scope(brush)
  if(brush.spray&&brush.behavior?.rendering?.accumulation==='alphaDarken'&&(!sprayWash||!isBrushSpray(brush.spray)))throw Error('Invalid Spray Wash133 scope')
  if(assertIndependentLightness128(brush)&&brush.tip.animation)materialPlans.delete(brush.tip)
  // New123 inputs validate before touching the existing descriptor plan cache.
  // A fresh metadata plan avoids stale rows for direct mutable test/API inputs.
  if(assertEqualLightnessGih123(brush)||assertUnequalLightnessGih124(brush))materialPlans.delete(brush.tip)
  usesColorSmudgeTexture(brush)
  textureMaterialKind(brush)
  assertTextureLightnessWash171Planes(brush)
  if(brush.sketch?.maskSignal==='procedural-standard-v1')prepareSketchMask(brush)
  if(usesVariableGih(brush.tip))prepareVariableGih(brush)
  const capabilities = new Set<'stamp' | 'wet' | 'stampImage' | 'wetImage' | 'stampCircleBand' | 'stampCurve' | 'stampEffects' | 'compositeEffects' | 'wetCurve' | 'colorSmudge' | 'colorSmudgeTexture' | 'colorSmudgeForeground' | 'colorSmudgeLegacy' | 'colorSmudgeLegacyMinMax172' | 'colorSmudgeMean' | 'projectionCanvas' | 'sprayShapes'|'sprayImages'|'spraySources'|'sprayWash'|'requestWash'|'bristleWash'|'sketchLines'|'hatching'|'grid'|'polygonFill'|'canvasEffect'|'filterBrush'|'cloneBrush'>()
  if((brush.behavior?.rendering?.blendMode==='hardMixPhotoshop'||brush.behavior?.rendering?.blendMode==='kritaHardMix'))capabilities.add('compositeEffects')
  if(brush.experiment){capabilities.add('polygonFill');capabilities.add('sketchLines')}
  if(bristleWash)capabilities.add('bristleWash')
  if(particleWash)capabilities.add('requestWash')
  else if(brush.particle){capabilities.add('sketchLines');capabilities.add('sprayShapes')}
  if(brush.clone)capabilities.add('cloneBrush')
  if(brush.filter)capabilities.add('filterBrush')
  if(brush.deform)capabilities.add('canvasEffect')
  if(brush.grid)capabilities.add('grid')
  if(brush.hatching)capabilities.add('hatching')
  if(brush.sketch||brush.bristle&&!bristleWash||brush.curveTrace)capabilities.add('sketchLines')
  if(sprayWash)capabilities.add('sprayWash')
  else if(brush.spray&&(brush.spray.color.sampleInput||brush.spray.color.mixBackground||brush.spray.color.fillBackground))capabilities.add('spraySources')
  else if(brush.spray?.particle.image)capabilities.add('sprayImages')
  else if(brush.spray && brush.spray.particle.shape!=='tip')capabilities.add('sprayShapes')
  if(brush.mixer?.algorithm)capabilities.add(brush.texture?.application&&['darken','overlay','linearDodge','linearBurn','colorDodge','colorBurn','hardMixPhotoshop','hardMixSofterPhotoshop'].includes(brush.texture.application.mode)?'colorSmudgeTexture':['grainMerge','grainExtract','negation','erase'].includes(brush.mixer.colorRateComposite ?? '')?'colorSmudgeForeground':'colorSmudge')
  else if(brush.mixer?.colorRateComposite==='darken'||brush.mixer?.colorRateComposite==='lighten')capabilities.add('colorSmudgeLegacyMinMax172')
  else if(['multiply','screen','erase','overlay'].includes(brush.mixer?.colorRateComposite ?? '')){if(brush.mixer?.colorRateComposite==='overlay'&&!hasLegacyColorSmudgeOverlay154Scope(brush))throw Error('Invalid legacy foreground Overlay154 scope');capabilities.add('colorSmudgeLegacy')}
  if(brush.mixer?.source==='projectionCanvas')capabilities.add('projectionCanvas')
  if(brush.mixer?.sampling?.mode==='adaptiveMean')capabilities.add('colorSmudgeMean')
  const resources = new Map<string, BrushPreparationResource>()
  const add = (painter: 'stamp' | 'wet', id: TipMaskId | BrushTextureId | undefined, grain = false, discrete = false, gray?: string, tip?: BrushTip, colorPlanes?:readonly [string,string,string]) => {
    if (id) {
      if (!grain && tip?.imageSampling) {
        for (const nativeImage of nativeImageBank(id as TipMaskId, tip)) {
          const resource: BrushPreparationResource = { painter, id, grain: false, nativeImage }
          resources.set(`${painter}:${brushTextureResourceKey(resource)}`, resource)
        }
        return
      }
      if(colorPlanes&&tip?.color&&'gradient'in tip.color&&tip.color.gradient.sampling==='filteredGray-v1'){
        const source:BrushPreparationResource={painter,id,grain:false,colorPlanes,gradientSource:true},palette:BrushPreparationResource={painter,id,grain:false,gradientPalette:true}
        resources.set(`${painter}:${brushTextureResourceKey(source)}`,source);resources.set(`${painter}:${brushTextureResourceKey(palette)}`,palette);return
      }
      const resource:BrushPreparationResource=colorPlanes ? {painter,id,grain:false,colorPlanes,...(tip?.color&&'gradient' in tip.color?{gradientMap:true as const}:{})} : {painter,...(grain ? {id,grain,...(discrete ? {discrete:true as const} : {})} : brushTipResource(id as TipMaskId,gray,tip))}
      resources.set(`${painter}:${brushTextureResourceKey(resource)}`,resource)
    }
  }
  const visit = (b: BrushDescriptor, painter: 'stamp' | 'wet', covered = false) => {
    // Source143 is CPU initialization data, never a GPU sampler or lease.
    assertBristleSource143Ready(b)
    if(b.texture?.application&&['colorDodge','colorBurn','hardMixPhotoshop','hardMixSofterPhotoshop'].includes(b.texture.application.mode)){
      if(b!==brush||b.version<105)throw Error('Texture105 requires a root prepared brush')
      if(b.model==='mixer')usesColorSmudgeTexture(b)
      else if(b.model!=='stamp'||b.behavior?.dual||['mixer','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].some(k=>b[k as keyof BrushDescriptor]!==undefined))throw Error('Texture105 requires root Pixel or modern MASK')
    }
    if(b.bristle?.version===2&&b.bristle.ink.useSaturation){
      if(painter!=='stamp'||!b.bristle.saturationLookup)throw Error('Compiled Bristle saturation requires the stamp renderer')
      const resource:BrushPreparationResource={painter,id:b.bristle.saturationLookup.asset,grain:false,bristleSaturation:b.bristle}
      resources.set(`${painter}:${brushTextureResourceKey(resource)}`,resource)
    }
    if(b.behavior?.dual&&usesVariableGih(b.behavior.dual.brush.tip))throw Error('Variable GIH child is unsupported')
    if(usesPixelOriginalRgba(b)){assertPixelOriginalRgba(b);if(b.tip.animation&&b.tip.color&&'gradient'in b.tip.color)pixelOriginalRgbaFrames(b)}
    if(b.behavior?.dual&&usesPixelOriginalRgba(b.behavior.dual.brush))throw Error('Pixel original RGBA child is not supported')
    if(painter!=='stamp'&&b.texture?.eraseId){
      if(b!==brush||!hasSmudgeTextureErase131Scope(b))throw Error('Texture erase variants require the stamp renderer or closed modern MASK131')
      const ids=[b.tip.kind==='bitmap'?b.tip.mask:undefined,b.texture.id,b.texture.eraseId]
      const sides=ids.map(id=>id?.startsWith('asset:')?Math.sqrt(importedAssetPixels(id).length):NaN)
      if(sides.some(side=>!Number.isInteger(side)||side<2||side>512||(side&(side-1))!==0)||sides[1]!==sides[2])throw Error('Texture erase131 requires bounded paired CAS')
    }
    const newMask=(tip:BrushTip)=>tip.profile?.kind==='gaussian2D'||tip.profile?.kind==='curveRectangle'||tip.profile?.kind==='curveRectangleSoftness'
    if(newMask(b.tip)&&(painter!=='stamp'||b.model!=='stamp'||b.tip.autoNoise&&(b.version<98||b.tip.autoShape||b.spray&&!hasSprayRectangleNoise155Scope(b))||b.behavior?.dual))throw Error('New rectangle profiles require an unpaired stamp without noise')
    if(b.behavior?.dual&&newMask(b.behavior.dual.brush.tip))throw Error('New rectangle child profiles are not supported')
    if(b.behavior?.dual?.brush.tip.autoNoise)throw Error('Child Auto-mask noise is not supported')
    if(b.tip.autoNoise&&painter!=='stamp')throw Error('Auto-mask noise requires the stamp renderer')
    if (b.tip.profile?.kind === 'circleBand') {
      if (painter !== 'stamp' || b.behavior?.rendering?.accumulation !== 'maxAlpha') throw Error('Circle band requires stamp max-alpha accumulation')
      capabilities.add('stampCircleBand')
    }
    if(painter==='wet'&&(b.tip.autoShape||b.behavior?.dual?.sampling!=='independent'&&b.behavior?.dual?.brush.tip.autoShape))throw Error('Auto spikes require the stamp renderer')
    if(painter==='wet'&&(b.tip.profile?.kind==='radialCurveSoftness'||b.behavior?.dual?.sampling!=='independent'&&b.behavior?.dual?.brush.tip.profile?.kind==='radialCurveSoftness'))throw Error('Dynamic radial softness requires the stamp renderer')
    if(b.tip.profile?.kind==='gaussian' && painter==='wet') throw Error('Procedural tip profile requires the stamp renderer')
    if(b.tip.material && painter==='wet' && !b.mixer?.paintThickness) throw Error('Lightness tip material requires a material renderer')
    const inline = b.behavior?.dual?.sampling !== 'independent' ? b.behavior?.dual?.brush : undefined
    if (!covered) {
      const curve = !!b.tip.autoShape || !!inline?.tip.autoShape || b.tip.profile?.kind === 'radialCurve' || b.tip.profile?.kind === 'radialCurveSoftness' || inline?.tip.profile?.kind === 'radialCurve' || inline?.tip.profile?.kind === 'radialCurveSoftness'
      if(painter==='stamp'&&brushUsesStampEffects(b))capabilities.add('stampEffects')
      else if (curve) capabilities.add(painter === 'stamp' ? 'stampCurve' : 'wetCurve')
      else {
        if (b.tip.imageSampling || inline?.tip.imageSampling) capabilities.add(painter === 'stamp' ? 'stampImage' : 'wetImage')
        if (painter === 'stamp'
          ? b.tip.kind === 'procedural' && b.tip.profile?.kind !== 'circleBand' || inline?.tip.kind === 'procedural'
          : b.tip.profile?.kind === 'standard' || inline?.tip.profile?.kind === 'standard') capabilities.add(painter)
      }
    }
    const frames=b.tip.animation?.frames ?? (brushTipSamplerId(b.tip) ? [brushTipSamplerId(b.tip)!] : [])
    frames.forEach((id,index)=>{
      const gray=b.tip.material?.grayFrames?.[index] ?? b.tip.material?.gray
      const colorPlanes=painter==='wet' && b.mixer?.paintThickness && gray ? [gray,gray,gray] as const : brushTipColorPlanes(b.tip,index)
      add(painter,id,false,false,gray,b.tip,colorPlanes)
    })
    if(b.texture?.material){
      if(b!==brush||!textureMaterialKind(b)||painter!=='stamp')throw Error('Texture Lightness108 is root-only')
      const resource:BrushPreparationResource={painter,id:b.texture.id,grain:true,discrete:true,patternAlpha:b.texture.material.alpha,patternSize:b.texture.patternSize}
      resources.set(`${painter}:${brushTextureResourceKey(resource)}`,resource)
      if(b.texture.material.kind==='gradient'){const palette:BrushPreparationResource={painter,id:b.texture.id,grain:false,gradientPalette:true};resources.set(`${painter}:${brushTextureResourceKey(palette)}`,palette)}
    }else add(painter, textureEraseId(b.texture,capturedErase), true,!!b.texture?.application)
    if (painter === 'stamp') { add('stamp', 'cloud', true); add('stamp', 'grit', true) }
    const dual = b.behavior?.dual
    if (!dual) return
    if (dual.sampling === 'independent') visit(dual.brush, 'stamp')
    else if (painter === 'stamp') visit(dual.brush, 'stamp', true)
    else {
      if(dual.brush.texture?.eraseId)throw Error('Texture erase variants require the stamp renderer')
      if(dual.brush.tip.profile?.kind==='gaussian') throw Error('Procedural dual profile requires the stamp renderer')
      if(dual.brush.tip.material) throw Error('Lightness dual material requires the stamp renderer')
      for (const id of dual.brush.tip.animation?.frames ?? (brushTipSamplerId(dual.brush.tip) ? [brushTipSamplerId(dual.brush.tip)!] : [])) add('wet', id, false, false, undefined, dual.brush.tip)
      if(dual.brush.texture?.application)add('wet',textureEraseId(dual.brush.texture,capturedErase),true,true)
    }
  }
  // Filter169 mask is consumed by the existing stamp renderer; no WET duplicate bank.
  visit(brush, hasFilterBitmap169Scope(brush)?'stamp':brush.model === 'mixer' ? 'wet' : 'stamp',sprayWash||particleWash||bristleWash)
  return { resources: [...resources.values()], capabilities: [...capabilities] }
}

export function brushPreparationResources(brush: BrushDescriptor, capturedErase?:boolean): BrushPreparationResource[] {
  return brushPreparationPlan(brush,capturedErase).resources
}

export function brushPreparationBytes(resources: readonly BrushPreparationResource[], size: (id: string) => number): number {
  return resources.reduce((total, resource) => {
    if (resource.bristleSaturation) return total+BRISTLE_SATURATION_GPU_BYTES
    if(resource.gradientPalette)return total+1024
    if (resource.colorPlanes) return total + size(resource.id) ** 2 * 4
    if (resource.lookup32) return total + size(resource.id) ** 2
    if (resource.nativeImage) return total + resource.nativeImage.width * resource.nativeImage.height * 4
    if(resource.materialGroup)return total+materialGroupBytes(resource.materialGroup).gpu
    let side = size(resource.id), bytes = 0
    while (side >= 1) { bytes += side * side * 4; if(resource.discrete)break; side = Math.floor(side / 2) }
    return total + bytes
  }, 0)
}

/** Native policy promises a complete finite working bank, never a legacy
 * lazy-upload fallback after readiness reported an oversized skip. */
export function assertNativeImageAdmission(resources: readonly BrushPreparationResource[], maximumTextureSide: number): void {
  if (!resources.some(resource => resource.canvasPattern||resource.nativeImage || resource.lookup32 || resource.bristleSaturation || resource.gradientSource || resource.gradientPalette || resource.patternAlpha)) return
  const bytes = brushPreparationBytes(resources, id => id.startsWith('asset:') ? Math.sqrt(importedAssetPixels(id).length) : 256)
  if (bytes+brushPreparationTransientBytes(resources) > BRUSH_PREPARATION_BYTES) throw Error('Native image bank exceeds the brush texture budget')
  for (const resource of resources) {
    if(resource.canvasPattern&&(!Number.isFinite(maximumTextureSide)||Math.sqrt(importedAssetPixels(resource.id).length)>maximumTextureSide))throw Error('Canvas pattern exceeds GPU dimension limit')
    if(resource.patternAlpha&&Math.sqrt(importedAssetPixels(resource.id).length)>maximumTextureSide)throw Error('Lightness pattern exceeds GPU dimension limit')
    if(resource.gradientPalette&&maximumTextureSide<256||resource.gradientSource&&Math.sqrt(importedAssetPixels(resource.id).length)>maximumTextureSide)throw Error('Filtered-gradient resources exceed GPU dimension limit')
    if(resource.bristleSaturation&&(!Number.isFinite(maximumTextureSide)||maximumTextureSide<1024))throw Error('Bristle saturation exceeds GPU texture dimension limit')
    if (resource.lookup32 && (!Number.isFinite(maximumTextureSide) || Math.sqrt(importedAssetPixels(resource.id).length)/2 > maximumTextureSide)) throw Error('Radial curve exceeds GPU texture dimension limit')
    const image = resource.nativeImage
    if (!image) continue
    if (!Number.isFinite(maximumTextureSide) || image.width > maximumTextureSide || image.height > maximumTextureSide) throw Error('Native image bank exceeds the GPU texture dimension limit')
    if (image.nativeWidth > 4096 || image.nativeHeight > 4096 || image.width * image.height > 4 * 1024 * 1024) throw Error('Native image bank exceeds the CPU derivative dimensions budget')
  }
}

/** Cheap metadata-only batch pin plan; CPU mip arrays are not built here. */
export function brushTextureLeaseResources(brush: BrushDescriptor, painter: 'stamp' | 'wet'): { key: string; bytes: number }[] {
  return brushTextureLeasePlan(brushPreparationResources(painter === 'stamp' && brush.model === 'mixer' ? { ...brush, model: 'stamp' } : brush), painter)
}

/** Reuse a single paint-local plan for admission and pinning. */
export function brushTextureLeasePlan(resources: readonly BrushPreparationResource[], painter: 'stamp' | 'wet'): { key: string; bytes: number }[] {
  return resources.filter(resource => resource.painter === painter)
    .map(resource => ({ key: brushTextureResourceKey(resource), bytes: brushPreparationBytes([resource], id => id.startsWith('asset:') ? Math.sqrt(importedAssetPixels(id).length) : 256) }))
}

type PreparationOutcome = { result: BrushPreparationResult } | { error: unknown }
interface PreparationSubscriber {
  finish: (outcome: PreparationOutcome) => void
  progress?: (done: number, total: number) => void
}
interface PreparationRun {
  key?: string
  done: number
  total: number
  finished: boolean
  subscribers: Set<PreparationSubscriber>
  finish: (outcome: PreparationOutcome) => void
}
const cancelledPreparation: PreparationOutcome = { result: { status: 'cancelled' } }

/** One upload per frame. A selected immutable preset may share its work, but
 * each caller owns its cancellation/progress subscription. No stroke state.
 */
export class BrushPreparation {
  private active?: PreparationRun
  cancel(): void { this.active?.finish(cancelledPreparation) }

  private subscribe(run: PreparationRun, options: BrushPreparationOptions): Promise<BrushPreparationResult> {
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (outcome: PreparationOutcome) => {
        if (settled) return
        settled = true
        options.signal?.removeEventListener('abort', abort)
        run.subscribers.delete(subscriber)
        if ('error' in outcome) reject(outcome.error); else resolve(outcome.result)
        if (!run.finished && !run.subscribers.size) run.finish(cancelledPreparation)
      }
      const abort = () => finish(cancelledPreparation)
      const subscriber: PreparationSubscriber = { finish, progress: options.onProgress }
      run.subscribers.add(subscriber)
      if (options.signal?.aborted) { abort(); return }
      options.signal?.addEventListener('abort', abort, { once: true })
      // Late joiners see the actual shared bank's progress, not a second
      // missing-resource plan's smaller total. An observer error is local.
      if (run.done && subscriber.progress) {
        try { subscriber.progress(run.done, run.total) }
        catch (error) { finish({ error }) }
      }
    })
  }

  run(jobs: readonly (() => void)[], options: BrushPreparationOptions, available: () => boolean, key?: string): Promise<BrushPreparationResult> {
    if (options.signal?.aborted) return Promise.resolve({ status: 'cancelled' })
    try { if (!available()) return Promise.resolve({ status: 'cancelled' }) }
    catch (error) { return Promise.reject(error) }
    if (key !== undefined && this.active?.key === key) return this.subscribe(this.active, options)
    this.cancel()
    let frame: number | undefined
    const run: PreparationRun = {
      key, done: 0, total: jobs.length, finished: false, subscribers: new Set(),
      finish: outcome => {
        if (run.finished) return
        run.finished = true
        if (frame !== undefined) cancelAnimationFrame(frame)
        if (this.active === run) this.active = undefined
        for (const subscriber of [...run.subscribers]) subscriber.finish(outcome)
      },
    }
    this.active = run
    const pending = this.subscribe(run, options)
    const step = () => {
      frame = undefined
      if (run.finished) return
      try {
        if (!available()) { run.finish(cancelledPreparation); return }
        jobs[run.done]?.()
        if (run.done < jobs.length) run.done++
        for (const subscriber of [...run.subscribers]) {
          // A preceding callback may abort another subscriber or cancel all.
          if (!run.subscribers.has(subscriber)) continue
          try { subscriber.progress?.(run.done, jobs.length) }
          catch (error) { subscriber.finish({ error }) }
        }
        if (run.finished) return
        if (run.done === jobs.length) run.finish({ result: { status: 'ready' } })
        else frame = requestAnimationFrame(step)
      } catch (error) { run.finish({ error }) }
    }
    if (!run.finished) {
      if (!jobs.length) run.finish({ result: { status: 'ready' } })
      else frame = requestAnimationFrame(step)
    }
    return pending
  }
}

/** At most one selected page is repacked at once. This is CPU upload staging,
 * separate from both GPU residency and the room-owned raw CAS byte plane. */
export function brushPreparationTransientBytes(resources:readonly BrushPreparationResource[]):number {
 return Math.max(resources.some(r=>r.bristleSaturation)?BRISTLE_SATURATION_UPLOAD_BYTES:0,...resources.map(r=>r.patternAlpha?importedAssetPixels(r.id).length*4:r.gradientSource?importedAssetPixels(r.id).length*4:r.gradientPalette?1024:0))
}

/** Bound execution resource joins the same existing stamp texture inventory. */
export function bindBrushPattern(resources:readonly BrushPreparationResource[],pattern:BrushPattern|undefined):BrushPreparationResource[]{
 if(pattern===undefined)return [...resources]
 if(!isBrushPattern(pattern))throw Error('Invalid canvas pattern metadata')
 if(pattern.kind==='none')return [...resources]
 if([pattern.alpha,...pattern.planes].some(id=>importedAssetPixels(id).length!==pattern.side*pattern.side))throw Error('Canvas pattern CAS dimensions mismatch')
 const resource:BrushPreparationResource={painter:'stamp',id:pattern.alpha,colorPlanes:pattern.planes,grain:false,canvasPattern:true}
 return resources.some(r=>brushTextureResourceKey(r)===brushTextureResourceKey(resource))?[...resources]:[...resources,resource]
}
