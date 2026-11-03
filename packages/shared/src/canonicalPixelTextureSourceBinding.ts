export type {CanonicalPixelGradientMapTemplate,CanonicalPixelSourceMaterialInputs} from './canonicalPixelImageSourceCapture.js'
import {canonicalSourceColorFieldsForDescriptor,canonicalSourceColorFieldAssets,type CanonicalSourceColorFields} from './canonicalSourceSpatialColor.js'
import {capturePixelSourceMaterialInputs,pixelGradientMapMaterial,pixelPreparationImageAssets,type CanonicalPixelGradientMapTemplate,type CanonicalPixelSourceMaterialInputs,captureOriginalPixelImageSource} from './canonicalPixelImageSourceCapture.js'
import {captureCanonicalSourceScaleOptions,type CanonicalSourceScaleOptions} from './canonicalSourceScale.js'
import {canonicalBrushDescriptorJSON} from './canonicalBrushDescriptor.js'
import {extractCanonicalPixelImageSourceData,extractCanonicalPixelTextureSourceData} from './canonicalBrushCapability.js'
import {canonicalSourceMaterialContext,type CanonicalMaterialContextV2,canonicalPrimaryGrainMaterialContext,type CanonicalMaterialContextV8,type CanonicalMaterialAsset,type CanonicalTexturedAutoSource} from './canonicalMaterialCodec.js'
import {canonicalDefaultAutoStatic,canonicalDefaultAutoSourcePin,canonicalGaussianAutoStatic,canonicalGaussianAutoSourcePin} from './canonicalDefaultAutoMaterial.js'
import {canonicalSoftAutoStatic,canonicalSoftAutoSourcePin} from './canonicalSoftAutoMaterial.js'
import {CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE,canonicalStrokeRasterContract,canonicalStrokeCoverageMatches,type CanonicalStrokeRasterProfile} from './canonicalStrokeFrame.js'
import {canonicalTextureGradientRGBA,type CanonicalTextureGradientRGBA,resolveCanonicalTexturePhase,canonicalResolvedTexturePhase,type CanonicalResolvedTexturePhase} from './canonicalPrimaryTexture.js'
import {sourceColorRecording,hasActiveSourceMaterialOptions} from './sourceStampData.js'

/** Original source/program + texture DATA; verified bytes and authority stay external. */
export function canonicalPixelTextureSourceBinding(original:unknown,descriptorSha256:string,available:readonly Readonly<{id:string;size:number}>[],coverageProfile:CanonicalTexturedAutoSource['coverageProfile'],rasterProfile:CanonicalStrokeRasterProfile,foregroundOpacity=1,options?:CanonicalSourceScaleOptions){
 const fail=():never=>{throw new TypeError('Invalid Pixel texture original binding')}
 if(!/^[a-f0-9]{64}$/.test(descriptorSha256)||!canonicalStrokeRasterContract(rasterProfile).genericSC||!Number.isFinite(foregroundOpacity)||foregroundOpacity<0||foregroundOpacity>1)return fail()
 const c=extractCanonicalPixelTextureSourceData(original,available);if(!c.supported)throw new TypeError(c.reasons.join(','))
 const scaleOptions=captureCanonicalSourceScaleOptions(options),brushScale=scaleOptions.sourceScale??c.data.brush.scale
 const {descriptor,data}=c,identity={descriptorId:descriptor.id,descriptorVersion:descriptor.version,descriptorSha256}
 const assets:CanonicalMaterialAsset[]=[]
 let source:CanonicalMaterialContextV8['primarySource']
 let gradientMapTemplate:CanonicalPixelGradientMapTemplate|undefined
 const native=data.source
 if(native.kind==='image'){const image=captureOriginalPixelImageSource(descriptor,data,descriptorSha256,available,foregroundOpacity,brushScale);source=image.source;gradientMapTemplate=image.gradientMapTemplate;assets.push(...image.assets)
 }else{
  if(native.randomness!==0||native.density!==1)coverageProfile=CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE
  if(!canonicalStrokeCoverageMatches(rasterProfile,coverageProfile))return fail()
  if(native.kind==='defaultAuto'){if(coverageProfile==='scalar-bionic-f64-fma-v1')return fail();source=canonicalDefaultAutoSourcePin({kind:'defaultAuto',...identity,coverageProfile,...canonicalDefaultAutoStatic(native,brushScale,data.brush.angle,coverageProfile)})}
  else if(native.kind==='gaussianAuto'){if(coverageProfile==='scalar-f64-fma-v1'||coverageProfile==='neon64-f32-fma-seeded-density-v1')return fail();source=canonicalGaussianAutoSourcePin({kind:'gaussianAuto',...identity,coverageProfile,...canonicalGaussianAutoStatic(native,brushScale,data.brush.angle,coverageProfile)})}
  else{if(coverageProfile==='scalar-bionic-f64-fma-v1'||coverageProfile==='neon64-f32-fma-seeded-density-v1'||data.compiled?.version!==2||!data.compiled.radialCurve)return fail();source=canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,...identity,coverageProfile,...canonicalSoftAutoStatic(native,brushScale,data.brush.angle,coverageProfile),reader:data.reader,compilerProfile:'eigen-5.0.1-mapped-arm64-f64-v3',buildId:data.compiled.buildId,radialCurve:data.compiled.radialCurve})}
 }
 const alphaAsset=c.alphaAsset
 for(const a of [...alphaAsset?[alphaAsset]:[],c.patternAsset]){
  const prior=assets.find(p=>p.id===a.id)
  if(prior){if(prior.size!==a.size)return fail()}else assets.push(a)
 }
 // Wire inventory keeps its pattern-last invariant even when the pattern CAS
 // also occurs as an image/side plane. Crops live in their original pins.
 const patternIndex=assets.findIndex(a=>a.id===c.patternAsset.id)
 assets.push(...assets.splice(patternIndex,1))
 const textureGeometry=c.textureGeometry
 return Object.freeze({kind:'pixel-texture-program-v1' as const,...scaleOptions,...c.originalAssets?{originalAssets:c.originalAssets}:{},descriptorSha256,descriptor,data,source,...gradientMapTemplate?{gradientMapTemplate}:{},assets:Object.freeze(assets),textureGeometry,phasePolicy:c.phasePolicy,strengthOption:c.strengthOption,composition:c.composition,foregroundOpacity,rasterProfile})
}
export type CanonicalPixelTextureSourceBinding=ReturnType<typeof canonicalPixelTextureSourceBinding>
/** Fixed axes are checked; random axes are sampled once by the stroke owner. */
function pixelTextureMaterialContext(binding:CanonicalPixelTextureSourceBinding,savedPhase:CanonicalResolvedTexturePhase,budget:CanonicalMaterialContextV8['budget'],inputs?:{readonly textureGradient?:CanonicalTextureGradientRGBA;readonly sourceColorFields?:CanonicalSourceColorFields;readonly sourceColorAvailable?:readonly Readonly<{id:string;size:number}>[];readonly sourceTipGradient?:import('./canonicalSourceTipGradient.js').CanonicalSourceTipGradient},stage:'prepare'|'start'='start'):CanonicalMaterialContextV8{
 const coverage=binding.source.kind==='image'?'browser-number-coverage-v1':binding.source.coverageProfile
 const expected=canonicalPixelTextureSourceBinding(binding.descriptor,binding.descriptorSha256,binding.originalAssets??binding.assets,coverage,binding.rasterProfile,binding.foregroundOpacity,binding.sourceScale!==undefined?{sourceScale:binding.sourceScale}:undefined)
 if(canonicalBrushDescriptorJSON(expected)!==canonicalBrushDescriptorJSON(binding))throw new TypeError('Pixel texture original binding differs')
 const p=expected.phasePolicy,phase=canonicalResolvedTexturePhase(savedPhase,p.width,p.height),fixed=resolveCanonicalTexturePhase(p,()=>0)
 if(!p.randomX&&phase.x!==fixed.x||!p.randomY&&phase.y!==fixed.y)throw new TypeError('Pixel texture fixed phase differs')
 const gradientMode=expected.textureGeometry.law==='pixel-color-texture-v1'&&expected.textureGeometry.mode==='gradient'
 let textureGradient:CanonicalTextureGradientRGBA|undefined
 let sourceColorFields:CanonicalSourceColorFields|undefined
 let spatialAssets:ReturnType<typeof canonicalSourceColorFieldAssets>=[]
 if(inputs!==undefined){
  if(!inputs||typeof inputs!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(inputs))||Reflect.ownKeys(inputs).some(k=>k!=='textureGradient'&&k!=='sourceColorFields'&&k!=='sourceColorAvailable'&&k!=='sourceTipGradient'))throw new TypeError('Invalid texture START inputs')
  const field=(key:string)=>{const d=Object.getOwnPropertyDescriptor(inputs,key);if(d&&!Object.hasOwn(d,'value'))throw new TypeError('Texture START accessor');return d}
  const g=field('textureGradient'),f=field('sourceColorFields'),available=field('sourceColorAvailable');field('sourceTipGradient')
  if(g){if(!gradientMode)throw new TypeError('Unexpected texture START gradient');textureGradient=canonicalTextureGradientRGBA(g.value)}
  if(f){sourceColorFields=canonicalSourceColorFieldsForDescriptor(expected.descriptor,f.value);if(!sourceColorFields)throw new TypeError('Unexpected source field');spatialAssets=canonicalSourceColorFieldAssets(sourceColorFields,available?.value??[])}else if(available)throw new TypeError('Unbound source color assets')
 }
 const assets=[...expected.assets]
 for(const a of spatialAssets){const prior=assets.find(p=>p.id===a.id);if(prior){if(prior.size!==a.size)throw new TypeError('Source pattern asset storage differs')}else assets.splice(Math.max(0,assets.length-1),0,a)}
 if(gradientMode&&!textureGradient)throw new TypeError('Missing selected texture gradient')
 const commonInputs=inputs?capturePixelSourceMaterialInputs(expected.descriptor,{...Object.hasOwn(inputs,'sourceTipGradient')?{sourceTipGradient:inputs.sourceTipGradient}:{},...sourceColorFields?{sourceColorFields,sourceColorAvailable:inputs.sourceColorAvailable??[]}:{}}):undefined
 const tipGradient=commonInputs?.sourceTipGradient
 if(stage==='start'&&!!expected.gradientMapTemplate!==!!tipGradient)throw new TypeError('Selected tip gradient resource mismatch')
 const source=expected.gradientMapTemplate&&stage==='start'?{...expected.source,imageMaterial:pixelGradientMapMaterial(expected.gradientMapTemplate,tipGradient!)}:expected.source
 if(stage==='prepare'&&expected.gradientMapTemplate){const keep=new Set(source.kind==='image'?pixelPreparationImageAssets(source,expected.assets).map(a=>a.id):[]);keep.add(expected.textureGeometry.asset);if(expected.textureGeometry.law==='pixel-color-texture-v1')keep.add(expected.textureGeometry.alphaAsset);for(let i=assets.length-1;i>=0;i--)if(!keep.has(assets[i].id))assets.splice(i,1)}
 const colorParams=sourceColorRecording(expected.data)
 return canonicalPrimaryGrainMaterialContext({version:8,...expected.composition.outerBlend==='colorHsyBrowser'?{outerCompositionLaw:'browser-hsy-rgba8-functional-v1'}:{},...expected.sourceScale!==undefined?{scaledSource:'source-scale-v1'}:{},...expected.source.kind==='image'&&expected.source.frameBounds?{imageFrameIndices:'source-image-pipe-frame-v1'}:{},assets,...sourceColorFields?{sourceColorFields}:{},primarySource:source,primaryTexture:{...expected.textureGeometry,...textureGradient?{gradient:textureGradient}:{},phase,strength:'recorded-grain-v1'},...hasActiveSourceMaterialOptions(expected.data)?{materialParams:'source-material-parameters-v1'}:{},...colorParams?{colorParams}:{},budget})
}

export function canonicalPixelTextureMaterialContext(binding:CanonicalPixelTextureSourceBinding,phase:CanonicalResolvedTexturePhase,budget:CanonicalMaterialContextV8['budget'],inputs?:CanonicalPixelSourceMaterialInputs&{readonly textureGradient?:CanonicalTextureGradientRGBA}){return pixelTextureMaterialContext(binding,phase,budget,inputs,'start')}
/** Geometry/resource PREP DATA only; a GradientMap program cannot execute it. */
export function canonicalPixelTexturePreparationContext(binding:CanonicalPixelTextureSourceBinding,phase:CanonicalResolvedTexturePhase,budget:CanonicalMaterialContextV8['budget'],inputs?:{readonly textureGradient?:CanonicalTextureGradientRGBA}){return pixelTextureMaterialContext(binding,phase,budget,inputs,'prepare')}

/** Named source2 pipe binding; old image/texture families remain unchanged. */
export function canonicalPixelImageSourceBinding(original:unknown,descriptorSha256:string,available:readonly Readonly<{id:string;size:number}>[],rasterProfile:CanonicalStrokeRasterProfile,foregroundOpacity=1,options?:CanonicalSourceScaleOptions){
 if(!/^[a-f0-9]{64}$/.test(descriptorSha256)||!canonicalStrokeRasterContract(rasterProfile).genericSC||!Number.isFinite(foregroundOpacity)||foregroundOpacity<0||foregroundOpacity>1)throw new TypeError('Invalid native image pipe binding')
 const c=extractCanonicalPixelImageSourceData(original,available);if(!c.supported)throw new TypeError(c.reasons.join(','))
 const scaleOptions=captureCanonicalSourceScaleOptions(options)
 const image=captureOriginalPixelImageSource(c.descriptor,c.data,descriptorSha256,available,foregroundOpacity,scaleOptions.sourceScale??c.data.brush.scale)
 return Object.freeze({kind:'pixel-image-program-v1' as const,...scaleOptions,descriptorSha256,descriptor:c.descriptor,data:c.data,source:image.source,...image.gradientMapTemplate?{gradientMapTemplate:image.gradientMapTemplate}:{},assets:Object.freeze(image.assets),animation:c.animation,composition:c.composition,rasterProfile,foregroundOpacity})
}
export type CanonicalPixelImageSourceBinding=ReturnType<typeof canonicalPixelImageSourceBinding>
function pixelImageMaterialContext(binding:CanonicalPixelImageSourceBinding|CanonicalNativeImagePipeSourceBinding,budget:CanonicalMaterialContextV2['budget'],inputs:CanonicalPixelSourceMaterialInputs|undefined,stage:'prepare'|'start'):CanonicalMaterialContextV2{
 const capture=binding.kind==='native-image-pipe-program-v1'?canonicalNativeImagePipeSourceBinding:canonicalPixelImageSourceBinding
 const b=capture(binding.descriptor,binding.descriptorSha256,binding.assets,binding.rasterProfile,binding.foregroundOpacity,binding.sourceScale!==undefined?{sourceScale:binding.sourceScale}:undefined)
 if(canonicalBrushDescriptorJSON(b)!==canonicalBrushDescriptorJSON(binding))throw new TypeError('Native image pipe original differs')
 // Descriptor identity belongs to the binding; source2 captures original image planes.
 const selected=stage==='start'?capturePixelSourceMaterialInputs(b.descriptor,inputs):undefined
 if(stage==='start'&&!!b.gradientMapTemplate!==!!selected?.sourceTipGradient)throw new TypeError('Selected tip gradient resource mismatch')
 const s=b.gradientMapTemplate&&stage==='start'?{...b.source,imageMaterial:pixelGradientMapMaterial(b.gradientMapTemplate,selected!.sourceTipGradient!)}:b.source
 const assets=stage==='prepare'&&b.gradientMapTemplate?[...pixelPreparationImageAssets(s,b.assets)]:[...b.assets]
 for(const a of selected?.spatialAssets??[]){const prior=assets.find(p=>p.id===a.id);if(prior){if(prior.size!==a.size)throw new TypeError('Spatial source storage mismatch')}else assets.push(a)}
 const colorParams=sourceColorRecording(b.data)
 return canonicalSourceMaterialContext({version:2,...b.composition.outerBlend==='colorHsyBrowser'?{outerCompositionLaw:'browser-hsy-rgba8-functional-v1'}:{},...b.sourceScale!==undefined?{scaledSource:'source-scale-v1'}:{},...b.source.frameBounds?{imageFrameIndices:'source-image-pipe-frame-v1'}:{},primarySource:{kind:s.kind,asset:s.asset,brushScale:s.brushScale,brushAngle:s.brushAngle,frames:s.frames,...s.frameBounds?{frameBounds:s.frameBounds}:{},...s.imageMaterial?{imageMaterial:s.imageMaterial}:{}},assets,...selected?.sourceColorFields?{sourceColorFields:selected.sourceColorFields}:{},...hasActiveSourceMaterialOptions(b.data)?{materialParams:'source-material-parameters-v1'}:{},...colorParams?{colorParams}:{},budget})
}

export function canonicalNativeImagePipeSourceBinding(original:unknown,descriptorSha256:string,available:readonly Readonly<{id:string;size:number}>[],rasterProfile:CanonicalStrokeRasterProfile,foregroundOpacity=1,options?:CanonicalSourceScaleOptions){
 const b=canonicalPixelImageSourceBinding(original,descriptorSha256,available,rasterProfile,foregroundOpacity,options)
 if(b.animation?.mode!=='native-dimensions-v1')throw new TypeError('Native image dimensions required')
 return Object.freeze({...b,kind:'native-image-pipe-program-v1' as const,animation:b.animation})
}
export type CanonicalNativeImagePipeSourceBinding=ReturnType<typeof canonicalNativeImagePipeSourceBinding>
export function canonicalPixelImageMaterialContext(binding:CanonicalPixelImageSourceBinding,budget:CanonicalMaterialContextV2['budget'],inputs?:CanonicalPixelSourceMaterialInputs):CanonicalMaterialContextV2{return pixelImageMaterialContext(binding,budget,inputs,'start')}
export function canonicalPixelImagePreparationContext(binding:CanonicalPixelImageSourceBinding,budget:CanonicalMaterialContextV2['budget']):CanonicalMaterialContextV2{return pixelImageMaterialContext(binding,budget,undefined,'prepare')}
export function canonicalNativeImagePipeMaterialContext(binding:CanonicalNativeImagePipeSourceBinding,budget:CanonicalMaterialContextV2['budget'],inputs?:CanonicalPixelSourceMaterialInputs):CanonicalMaterialContextV2{return pixelImageMaterialContext(binding,budget,inputs,'start')}
