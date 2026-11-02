import type {BrushDescriptor} from './brushes.js'
import {extractCanonicalTexturedAutoProgramData,canonicalSourceComposition} from './canonicalBrushCapability.js'
import {canonicalDefaultAutoSourcePin,canonicalDefaultAutoStatic,canonicalGaussianAutoSourcePin,canonicalGaussianAutoStatic} from './canonicalDefaultAutoMaterial.js'
import {canonicalSoftAutoSourcePin,canonicalSoftAutoStatic} from './canonicalSoftAutoMaterial.js'
import {canonicalStrokeRasterContract,canonicalStrokeCoverageMatches,type CanonicalStrokeRasterProfile} from './canonicalStrokeFrame.js'
import {canonicalTexturedAutoMaterialContext,type CanonicalMaterialContextV7,type CanonicalTexturedAutoSource} from './canonicalMaterialCodec.js'
import {resolveCanonicalTexturePhase} from './canonicalPrimaryTexture.js'
import {canonicalBrushDescriptorJSON} from './canonicalBrushDescriptor.js'
export type CanonicalTexturedAutoProgramData=Extract<ReturnType<typeof extractCanonicalTexturedAutoProgramData>,{supported:true}>
export interface CanonicalTexturedAutoProgramBinding {
 readonly kind:'textured-auto-program-v1';readonly descriptorSha256:string
 readonly source:CanonicalTexturedAutoSource;readonly patternAsset:CanonicalTexturedAutoProgramData['patternAsset']
 readonly textureGeometry:Readonly<{kind:'canvasTexture';asset:string;law:'subtract-u8-v1';width:number;height:number;periodX:number;periodY:number}>
 readonly phasePolicy:Readonly<{width:number;height:number;offsetX:number;offsetY:number;randomX:boolean;randomY:boolean}>
 readonly strengthProgram:CanonicalTexturedAutoProgramData['program']
}
/** Bounded ownDATA snapshot; not original descriptor/program authority. */
export function captureTexturedAutoProgramBinding(value:unknown):CanonicalTexturedAutoProgramBinding {
 let nodes=0,chars=0
 const copy=(v:unknown,depth:number):unknown=>{
  if(++nodes>4096||depth>16)throw new TypeError('Textured Auto binding bound')
  if(typeof v==='string'){chars+=v.length;if(chars>131072)throw new TypeError('Textured Auto binding text bound');return v}
  if(v===null||typeof v==='number'||typeof v==='boolean')return v
  if(!v||typeof v!=='object')throw new TypeError('Textured Auto binding data')
  const array=Array.isArray(v),proto=Object.getPrototypeOf(v)
  if(array?proto!==Array.prototype:proto!==Object.prototype&&proto!==null)throw new TypeError('Textured Auto binding prototype')
  const keys=Reflect.ownKeys(v),out:Record<string,unknown>|unknown[]=array?[]:Object.create(null)
  if(keys.length>(array?257:64))throw new TypeError('Textured Auto binding keys')
  for(const k of keys){if(typeof k!=='string'||k.length>128)throw new TypeError('Textured Auto binding key');chars+=k.length;if(chars>131072)throw new TypeError('Textured Auto binding text bound');if(k==='length'&&array)continue;const d=Object.getOwnPropertyDescriptor(v,k);if(!d||!Object.hasOwn(d,'value'))throw new TypeError('Textured Auto binding accessor');Object.defineProperty(out,k,{value:copy(d.value,depth+1),enumerable:true})}
  if(array&&(out as unknown[]).length!==(v as unknown[]).length)throw new TypeError('Textured Auto binding sparse array')
  return Object.freeze(out)
 }
 const captured=copy(value,0) as CanonicalTexturedAutoProgramBinding
 if(Object.keys(captured).sort().join('|')!==['kind','descriptorSha256','source','patternAsset','textureGeometry','phasePolicy','strengthProgram'].sort().join('|')||captured.kind!=='textured-auto-program-v1')throw new TypeError('Textured Auto binding fields')
 return captured
}
/** Descriptor/coverage attestation only. Verified caller owns exact SHA/CAS provenance. */
export function canonicalTexturedAutoProgramBinding(descriptor:BrushDescriptor,descriptorSha256:string,coverageProfile:CanonicalTexturedAutoSource['coverageProfile'],pattern:Readonly<{id:string;size:number}>,rasterProfile:CanonicalStrokeRasterProfile):CanonicalTexturedAutoProgramBinding {
 const result=extractCanonicalTexturedAutoProgramData(descriptor,{pattern})
 if(!result.supported||result.data.version!==2||typeof descriptorSha256!=='string'||!/^[a-f0-9]{64}$/.test(descriptorSha256)||!canonicalSourceComposition(descriptor,rasterProfile)||!canonicalStrokeRasterContract(rasterProfile).genericSC||!canonicalStrokeCoverageMatches(rasterProfile,coverageProfile)||coverageProfile==='neon64-f32-fma-seeded-density-v1')throw new TypeError('Textured Auto original program unavailable')
 const d=result.data,source=d.source;let pin:CanonicalTexturedAutoSource
 const identity={descriptorId:descriptor.id,descriptorVersion:descriptor.version,descriptorSha256,coverageProfile}
 if(source.kind==='defaultAuto'){if(coverageProfile==='scalar-bionic-f64-fma-v1')throw new TypeError('Default numeric profile');pin=canonicalDefaultAutoSourcePin({kind:'defaultAuto',...identity,coverageProfile,...canonicalDefaultAutoStatic(source,d.brush.scale,d.brush.angle)})}
 else if(source.kind==='gaussianAuto'){if(coverageProfile==='scalar-f64-fma-v1')throw new TypeError('Gaussian numeric profile');pin=canonicalGaussianAutoSourcePin({kind:'gaussianAuto',...identity,coverageProfile,...canonicalGaussianAutoStatic(source,d.brush.scale,d.brush.angle)})}
 else if(source.kind==='softAuto'){if(coverageProfile==='scalar-bionic-f64-fma-v1'||d.compiled?.version!==4)throw new TypeError('Soft numeric/program profile');pin=canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,...identity,coverageProfile,...canonicalSoftAutoStatic(source,d.brush.scale,d.brush.angle),reader:d.reader,compilerProfile:'eigen-5.0.1-mapped-arm64-f64-v3',buildId:result.program.buildId,radialCurve:d.compiled.radialCurve})}
 else throw new TypeError('Textured Auto family')
 const a=result.patternAsset,t=descriptor.texture!,offset=t.offset!
 const phasePolicy=Object.freeze({width:a.width,height:a.height,offsetX:offset.x,offsetY:offset.y,randomX:offset.randomX,randomY:offset.randomY})
 // Validate original fixed offsets and random policy without choosing entropy.
 resolveCanonicalTexturePhase(phasePolicy,()=>0)
 return Object.freeze({kind:'textured-auto-program-v1',descriptorSha256,source:pin,patternAsset:a,textureGeometry:Object.freeze({kind:'canvasTexture',asset:a.id,law:'subtract-u8-v1',width:a.width,height:a.height,periodX:a.width,periodY:a.height}),phasePolicy,strengthProgram:result.program})
}
/** No room/source grant. Same captured source/pattern and saved fixed/random phase. */
export function assertTexturedAutoProgramContext(binding:CanonicalTexturedAutoProgramBinding,value:unknown):CanonicalMaterialContextV7 {
 binding=captureTexturedAutoProgramBinding(binding)
 const c=canonicalTexturedAutoMaterialContext(value),t=c.primaryTexture,g=binding.textureGeometry,p=binding.phasePolicy
 if(binding.kind!=='textured-auto-program-v1'||binding.descriptorSha256!==c.primarySource.descriptorSha256||p.width!==g.width||p.height!==g.height||canonicalBrushDescriptorJSON(c.primarySource)!==canonicalBrushDescriptorJSON(binding.source)||canonicalBrushDescriptorJSON(c.assets[0])!==canonicalBrushDescriptorJSON(binding.patternAsset)||Object.keys(g).sort().join('|')!==['kind','asset','law','width','height','periodX','periodY'].sort().join('|')||!Object.keys(g).every(k=>Object.is(Reflect.get(g,k),Reflect.get(t,k))))throw new TypeError('Textured Auto context source differs')
 const fixed=resolveCanonicalTexturePhase(p,()=>0)
 if(!p.randomX&&t.phase.x!==fixed.x||!p.randomY&&t.phase.y!==fixed.y)throw new TypeError('Textured Auto fixed phase differs')
 return c
}
