import {canonicalBrushDescriptorJSON} from './canonicalBrushDescriptor.js'
import {extractCanonicalPixelTextureSourceData} from './canonicalBrushCapability.js'
import {canonicalPrimaryGrainMaterialContext,type CanonicalMaterialContextV8,type CanonicalMaterialAsset,type CanonicalPrimaryGrainImageSource,type CanonicalTexturedAutoSource} from './canonicalMaterialCodec.js'
import {canonicalDefaultAutoStatic,canonicalDefaultAutoSourcePin,canonicalGaussianAutoStatic,canonicalGaussianAutoSourcePin} from './canonicalDefaultAutoMaterial.js'
import {canonicalSoftAutoStatic,canonicalSoftAutoSourcePin} from './canonicalSoftAutoMaterial.js'
import {canonicalStrokeRasterContract,canonicalStrokeCoverageMatches,type CanonicalStrokeRasterProfile} from './canonicalStrokeFrame.js'
import {resolveCanonicalTexturePhase,canonicalResolvedTexturePhase,type CanonicalResolvedTexturePhase} from './canonicalPrimaryTexture.js'
import {hasActiveSourceColorOptions,hasActiveSourceMaterialOptions} from './sourceStampData.js'

/** Original source/program + texture DATA; verified bytes and authority stay external. */
export function canonicalPixelTextureSourceBinding(original:unknown,descriptorSha256:string,available:readonly Readonly<{id:string;size:number}>[],coverageProfile:CanonicalTexturedAutoSource['coverageProfile'],rasterProfile:CanonicalStrokeRasterProfile,foregroundOpacity=1){
 const fail=():never=>{throw new TypeError('Invalid Pixel texture original binding')}
 if(!/^[a-f0-9]{64}$/.test(descriptorSha256)||!canonicalStrokeRasterContract(rasterProfile).genericSC||!Number.isFinite(foregroundOpacity)||foregroundOpacity<0||foregroundOpacity>1)return fail()
 const c=extractCanonicalPixelTextureSourceData(original,available);if(!c.supported)throw new TypeError(c.reasons.join(','))
 const {descriptor,data}=c,identity={descriptorId:descriptor.id,descriptorVersion:descriptor.version,descriptorSha256}
 const assets:CanonicalMaterialAsset[]=[]
 let source:CanonicalMaterialContextV8['primarySource']
 const native=data.source
 if(native.kind==='image'){
  const ids=descriptor.tip.animation?.frames??[descriptor.tip.mask!],bounds=descriptor.tip.maskBounds
  if(!bounds||!ids.length)return fail()
  for(const id of ids){const a=available.find(a=>a.id===id);if(!a)return fail();const rect={x:bounds.x*a.size,y:bounds.y*a.size,width:bounds.width*a.size,height:bounds.height*a.size};if(!Object.values(rect).every(Number.isSafeInteger)||rect.width!==data.brush.width||rect.height!==data.brush.height)return fail();assets.push(Object.freeze({...a,...rect}))}
  const alpha=assets[0],material=descriptor.tip.material
  let imageMaterial:CanonicalPrimaryGrainImageSource['imageMaterial']
  const plane=(id:string)=>{const a=available.find(a=>a.id===id);if(!a||a.size!==alpha.size)return fail();const p=Object.freeze({...alpha,id});if(!assets.some(a=>a.id===id))assets.push(p);return id}
  if(material?.kind==='lightness'){
   if(material.grayFrames)return fail()
   const enabled=data.settings.PressureLightnessStrength==='true',strength=enabled?Math.max(0,Math.min(1,Number(data.settings.LightnessStrengthValue??'1'))):1
   if(!Number.isFinite(strength)||material.strength!==strength)return fail()
   imageMaterial=Object.freeze({kind:'lightness-map-v1',grayAsset:plane(material.gray),strength,foregroundAlpha:foregroundOpacity})
  }else if(material?.kind==='color'){
   if(material.frames)return fail()
   imageMaterial=Object.freeze({kind:'color-stamp-v1',channels:Object.freeze([plane(material.channels[0]),plane(material.channels[1]),plane(material.channels[2])] as const),foregroundOpacity})
  }
  source=Object.freeze({kind:'image',asset:alpha.id,brushScale:data.brush.scale,brushAngle:data.brush.angle,descriptorId:descriptor.id,descriptorVersion:descriptor.version,descriptorSha256,...ids.length>1?{frames:Object.freeze([...ids])}:{},...imageMaterial?{imageMaterial}:{}})
 }else{
  if(!canonicalStrokeCoverageMatches(rasterProfile,coverageProfile))return fail()
  if(native.kind==='defaultAuto'){if(coverageProfile==='scalar-bionic-f64-fma-v1')return fail();source=canonicalDefaultAutoSourcePin({kind:'defaultAuto',...identity,coverageProfile,...canonicalDefaultAutoStatic(native,data.brush.scale,data.brush.angle)})}
  else if(native.kind==='gaussianAuto'){if(coverageProfile==='scalar-f64-fma-v1'||coverageProfile==='neon64-f32-fma-seeded-density-v1')return fail();source=canonicalGaussianAutoSourcePin({kind:'gaussianAuto',...identity,coverageProfile,...canonicalGaussianAutoStatic(native,data.brush.scale,data.brush.angle)})}
  else{if(coverageProfile==='scalar-bionic-f64-fma-v1'||coverageProfile==='neon64-f32-fma-seeded-density-v1'||data.compiled?.version!==2||!data.compiled.radialCurve)return fail();source=canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,...identity,coverageProfile,...canonicalSoftAutoStatic(native,data.brush.scale,data.brush.angle),reader:data.reader,compilerProfile:'eigen-5.0.1-mapped-arm64-f64-v3',buildId:data.compiled.buildId,radialCurve:data.compiled.radialCurve})}
 }
 if(assets.some(a=>a.id===c.patternAsset.id))return fail()
 assets.push(c.patternAsset)
 const textureGeometry=Object.freeze({kind:'canvasTexture' as const,asset:c.patternAsset.id,law:'pixel-texture-u8-v1' as const,mode:c.mode,soft:c.soft,width:c.patternAsset.width,height:c.patternAsset.height,periodX:c.patternAsset.width,periodY:c.patternAsset.height})
 return Object.freeze({kind:'pixel-texture-program-v1' as const,descriptorSha256,descriptor,data,source,assets:Object.freeze(assets),textureGeometry,phasePolicy:c.phasePolicy,strengthOption:c.strengthOption,composition:c.composition,foregroundOpacity,rasterProfile})
}
export type CanonicalPixelTextureSourceBinding=ReturnType<typeof canonicalPixelTextureSourceBinding>
/** Fixed axes are checked; random axes are sampled once by the stroke owner. */
export function canonicalPixelTextureMaterialContext(binding:CanonicalPixelTextureSourceBinding,savedPhase:CanonicalResolvedTexturePhase,budget:CanonicalMaterialContextV8['budget']):CanonicalMaterialContextV8{
 const coverage=binding.source.kind==='image'?'browser-number-coverage-v1':binding.source.coverageProfile
 const expected=canonicalPixelTextureSourceBinding(binding.descriptor,binding.descriptorSha256,binding.assets,coverage,binding.rasterProfile,binding.foregroundOpacity)
 if(canonicalBrushDescriptorJSON(expected)!==canonicalBrushDescriptorJSON(binding))throw new TypeError('Pixel texture original binding differs')
 const p=expected.phasePolicy,phase=canonicalResolvedTexturePhase(savedPhase,p.width,p.height),fixed=resolveCanonicalTexturePhase(p,()=>0)
 if(!p.randomX&&phase.x!==fixed.x||!p.randomY&&phase.y!==fixed.y)throw new TypeError('Pixel texture fixed phase differs')
 return canonicalPrimaryGrainMaterialContext({version:8,assets:expected.assets,primarySource:expected.source,primaryTexture:{...expected.textureGeometry,phase,strength:'recorded-grain-v1'},...hasActiveSourceMaterialOptions(expected.data)?{materialParams:'source-material-parameters-v1'}:{},...hasActiveSourceColorOptions(expected.data)?{colorParams:'source-pigment-rgb8-v1'}:{},budget})
}
