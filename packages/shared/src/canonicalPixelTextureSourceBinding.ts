import {captureOriginalPixelImageSource} from './canonicalPixelImageSourceCapture.js'
import {captureCanonicalSourceScaleOptions,type CanonicalSourceScaleOptions} from './canonicalSourceScale.js'
import {canonicalBrushDescriptorJSON} from './canonicalBrushDescriptor.js'
import {extractCanonicalPixelImageSourceData,extractCanonicalPixelTextureSourceData} from './canonicalBrushCapability.js'
import {canonicalSourceMaterialContext,type CanonicalMaterialContextV2,canonicalPrimaryGrainMaterialContext,type CanonicalMaterialContextV8,type CanonicalMaterialAsset,type CanonicalTexturedAutoSource} from './canonicalMaterialCodec.js'
import {canonicalDefaultAutoStatic,canonicalDefaultAutoSourcePin,canonicalGaussianAutoStatic,canonicalGaussianAutoSourcePin} from './canonicalDefaultAutoMaterial.js'
import {canonicalSoftAutoStatic,canonicalSoftAutoSourcePin} from './canonicalSoftAutoMaterial.js'
import {CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE,canonicalStrokeRasterContract,canonicalStrokeCoverageMatches,type CanonicalStrokeRasterProfile} from './canonicalStrokeFrame.js'
import {resolveCanonicalTexturePhase,canonicalResolvedTexturePhase,type CanonicalResolvedTexturePhase} from './canonicalPrimaryTexture.js'
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
 const native=data.source
 if(native.kind==='image'){const image=captureOriginalPixelImageSource(descriptor,data,descriptorSha256,available,foregroundOpacity,brushScale);source=image.source;assets.push(...image.assets)
 }else{
  if(native.randomness!==0||native.density!==1)coverageProfile=CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE
  if(!canonicalStrokeCoverageMatches(rasterProfile,coverageProfile))return fail()
  if(native.kind==='defaultAuto'){if(coverageProfile==='scalar-bionic-f64-fma-v1')return fail();source=canonicalDefaultAutoSourcePin({kind:'defaultAuto',...identity,coverageProfile,...canonicalDefaultAutoStatic(native,brushScale,data.brush.angle,coverageProfile)})}
  else if(native.kind==='gaussianAuto'){if(coverageProfile==='scalar-f64-fma-v1'||coverageProfile==='neon64-f32-fma-seeded-density-v1')return fail();source=canonicalGaussianAutoSourcePin({kind:'gaussianAuto',...identity,coverageProfile,...canonicalGaussianAutoStatic(native,brushScale,data.brush.angle,coverageProfile)})}
  else{if(coverageProfile==='scalar-bionic-f64-fma-v1'||coverageProfile==='neon64-f32-fma-seeded-density-v1'||data.compiled?.version!==2||!data.compiled.radialCurve)return fail();source=canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,...identity,coverageProfile,...canonicalSoftAutoStatic(native,brushScale,data.brush.angle,coverageProfile===CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE),reader:data.reader,compilerProfile:'eigen-5.0.1-mapped-arm64-f64-v3',buildId:data.compiled.buildId,radialCurve:data.compiled.radialCurve})}
 }
 if(assets.some(a=>a.id===c.patternAsset.id))return fail()
 assets.push(c.patternAsset)
 const textureGeometry=Object.freeze({kind:'canvasTexture' as const,asset:c.patternAsset.id,law:'pixel-texture-u8-v1' as const,mode:c.mode,soft:c.soft,width:c.patternAsset.width,height:c.patternAsset.height,periodX:c.patternAsset.width,periodY:c.patternAsset.height})
 return Object.freeze({kind:'pixel-texture-program-v1' as const,...scaleOptions,descriptorSha256,descriptor,data,source,assets:Object.freeze(assets),textureGeometry,phasePolicy:c.phasePolicy,strengthOption:c.strengthOption,composition:c.composition,foregroundOpacity,rasterProfile})
}
export type CanonicalPixelTextureSourceBinding=ReturnType<typeof canonicalPixelTextureSourceBinding>
/** Fixed axes are checked; random axes are sampled once by the stroke owner. */
export function canonicalPixelTextureMaterialContext(binding:CanonicalPixelTextureSourceBinding,savedPhase:CanonicalResolvedTexturePhase,budget:CanonicalMaterialContextV8['budget']):CanonicalMaterialContextV8{
 const coverage=binding.source.kind==='image'?'browser-number-coverage-v1':binding.source.coverageProfile
 const expected=canonicalPixelTextureSourceBinding(binding.descriptor,binding.descriptorSha256,binding.assets,coverage,binding.rasterProfile,binding.foregroundOpacity,binding.sourceScale!==undefined?{sourceScale:binding.sourceScale}:undefined)
 if(canonicalBrushDescriptorJSON(expected)!==canonicalBrushDescriptorJSON(binding))throw new TypeError('Pixel texture original binding differs')
 const p=expected.phasePolicy,phase=canonicalResolvedTexturePhase(savedPhase,p.width,p.height),fixed=resolveCanonicalTexturePhase(p,()=>0)
 if(!p.randomX&&phase.x!==fixed.x||!p.randomY&&phase.y!==fixed.y)throw new TypeError('Pixel texture fixed phase differs')
 const colorParams=sourceColorRecording(expected.data)
 return canonicalPrimaryGrainMaterialContext({version:8,...expected.sourceScale!==undefined?{scaledSource:'source-scale-v1'}:{},...expected.descriptor.tip.animation?{imageFrameIndices:'source-image-pipe-frame-v1'}:{},assets:expected.assets,primarySource:expected.source,primaryTexture:{...expected.textureGeometry,phase,strength:'recorded-grain-v1'},...hasActiveSourceMaterialOptions(expected.data)?{materialParams:'source-material-parameters-v1'}:{},...colorParams?{colorParams}:{},budget})
}

/** Named source2 pipe binding; old image/texture families remain unchanged. */
export function canonicalPixelImageSourceBinding(original:unknown,descriptorSha256:string,available:readonly Readonly<{id:string;size:number}>[],rasterProfile:CanonicalStrokeRasterProfile,foregroundOpacity=1,options?:CanonicalSourceScaleOptions){
 if(!/^[a-f0-9]{64}$/.test(descriptorSha256)||!canonicalStrokeRasterContract(rasterProfile).genericSC||!Number.isFinite(foregroundOpacity)||foregroundOpacity<0||foregroundOpacity>1)throw new TypeError('Invalid native image pipe binding')
 const c=extractCanonicalPixelImageSourceData(original,available);if(!c.supported)throw new TypeError(c.reasons.join(','))
 const scaleOptions=captureCanonicalSourceScaleOptions(options)
 const image=captureOriginalPixelImageSource(c.descriptor,c.data,descriptorSha256,available,foregroundOpacity,scaleOptions.sourceScale??c.data.brush.scale)
 return Object.freeze({kind:'pixel-image-program-v1' as const,...scaleOptions,descriptorSha256,descriptor:c.descriptor,data:c.data,source:image.source,assets:Object.freeze(image.assets),animation:c.animation,composition:c.composition,rasterProfile,foregroundOpacity})
}
export type CanonicalPixelImageSourceBinding=ReturnType<typeof canonicalPixelImageSourceBinding>
function pixelImageMaterialContext(binding:CanonicalPixelImageSourceBinding|CanonicalNativeImagePipeSourceBinding,budget:CanonicalMaterialContextV2['budget']):CanonicalMaterialContextV2{
 const capture=binding.kind==='native-image-pipe-program-v1'?canonicalNativeImagePipeSourceBinding:canonicalPixelImageSourceBinding
 const b=capture(binding.descriptor,binding.descriptorSha256,binding.assets,binding.rasterProfile,binding.foregroundOpacity,binding.sourceScale!==undefined?{sourceScale:binding.sourceScale}:undefined)
 if(canonicalBrushDescriptorJSON(b)!==canonicalBrushDescriptorJSON(binding))throw new TypeError('Native image pipe original differs')
 // Descriptor identity belongs to the binding; source2 captures original image planes.
 const s=b.source
 const colorParams=sourceColorRecording(b.data)
 return canonicalSourceMaterialContext({version:2,...b.sourceScale!==undefined?{scaledSource:'source-scale-v1'}:{},...b.animation?{imageFrameIndices:'source-image-pipe-frame-v1'}:{},primarySource:{kind:s.kind,asset:s.asset,brushScale:s.brushScale,brushAngle:s.brushAngle,frames:s.frames,...s.imageMaterial?{imageMaterial:s.imageMaterial}:{}},assets:b.assets,...hasActiveSourceMaterialOptions(b.data)?{materialParams:'source-material-parameters-v1'}:{},...colorParams?{colorParams}:{},budget})
}

export function canonicalNativeImagePipeSourceBinding(original:unknown,descriptorSha256:string,available:readonly Readonly<{id:string;size:number}>[],rasterProfile:CanonicalStrokeRasterProfile,foregroundOpacity=1,options?:CanonicalSourceScaleOptions){
 const b=canonicalPixelImageSourceBinding(original,descriptorSha256,available,rasterProfile,foregroundOpacity,options)
 if(b.animation?.mode!=='native-dimensions-v1')throw new TypeError('Native image dimensions required')
 return Object.freeze({...b,kind:'native-image-pipe-program-v1' as const,animation:b.animation})
}
export type CanonicalNativeImagePipeSourceBinding=ReturnType<typeof canonicalNativeImagePipeSourceBinding>
export function canonicalPixelImageMaterialContext(binding:CanonicalPixelImageSourceBinding,budget:CanonicalMaterialContextV2['budget']):CanonicalMaterialContextV2{return pixelImageMaterialContext(binding,budget)}
export function canonicalNativeImagePipeMaterialContext(binding:CanonicalNativeImagePipeSourceBinding,budget:CanonicalMaterialContextV2['budget']):CanonicalMaterialContextV2{return pixelImageMaterialContext(binding,budget)}
