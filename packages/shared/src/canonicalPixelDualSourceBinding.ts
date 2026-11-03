import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE} from './canonicalStrokeFrame.js'
import {brushAssetIds} from './brushes.js'
import {canonicalPixelPrimaryTexturePin,canonicalPixelColorTexturePin,canonicalResolvedTexturePhase,resolveCanonicalTexturePhase} from './canonicalPrimaryTexture.js'
import {canonicalSourceRoleTexturesInput,sourceRoleTextureInputsFromPins,type CanonicalSourceRoleTexturesInput,type CanonicalSourceRoleTexturePin} from './canonicalSourceRoleTextures.js'
import type {CanonicalPixelRoleTextureSource} from './canonicalBrushCapability.js'
import {captureOriginalPixelImageSource} from './canonicalPixelImageSourceCapture.js'
import {captureCanonicalSourceScaleOptions,type CanonicalSourceScaleOptions} from './canonicalSourceScale.js'
import type {BrushDescriptor} from './brushes.js'
import {canonicalBrushDescriptorJSON} from './canonicalBrushDescriptor.js'
import {canonicalPixelSourceComposition,extractCanonicalPixelDualSourceData} from './canonicalBrushCapability.js'
import {canonicalSourceMaterialContext,canonicalMaskedSourceMaterialContext,type CanonicalMaterialContextV2} from './canonicalMaterialCodec.js'

/** Original descriptor pairing only, not verified CAS or room/BEGIN authority. */
export function canonicalPixelDualSourceBinding(original:BrushDescriptor,descriptorSha256:string,material:CanonicalMaterialContextV2,options?:CanonicalSourceScaleOptions,available?:readonly Readonly<{id:string;size:number}>[]){
 const fail=():never=>{throw new TypeError('Invalid original Pixel dual binding')}
 if(typeof descriptorSha256!=='string'||!/^[a-f0-9]{64}$/.test(descriptorSha256))return fail()
 const context=canonicalMaskedSourceMaterialContext(material)
 const scaleOptions=captureCanonicalSourceScaleOptions(options===undefined&&context.scaledSource?{sourceScale:context.primarySource.brushScale}:options)
 if((scaleOptions.sourceScale!==undefined)!==!!context.scaledSource)return fail()
 const data=extractCanonicalPixelDualSourceData(original,available??context.assets.map(a=>({id:a.id,size:a.size})),scaleOptions)
 if(!data.supported||data.blendMode!==context.maskingBlend)return fail()
 const composition=canonicalPixelSourceComposition(data.descriptor,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)
 if(!composition||context.outerCompositionLaw!==undefined&&composition.outerBlend!=='colorHsyBrowser')return fail()
 const imageAssets=new Map<string,CanonicalMaterialContextV2['assets'][number]>()
 const bindRole=(role:typeof data.primary,pin:CanonicalMaterialContextV2['primarySource'])=>{
  const source=role.data
  if(pin.brushScale!==role.effectiveBrushScale||pin.brushAngle!==source.brush.angle)return fail()
  if(pin.kind==='image'){
   if(source.version===2&&source.source.kind!=='image'||!context.imageFrameIndices&&(pin.frames||pin.imageMaterial))return fail()
   const foreground=pin.imageMaterial?.kind==='lightness-map-v1'?pin.imageMaterial.foregroundAlpha:pin.imageMaterial?.kind==='color-stamp-v1'?pin.imageMaterial.foregroundOpacity:1
   const image=captureOriginalPixelImageSource(role.descriptor,source,descriptorSha256,context.assets,foreground,role.effectiveBrushScale)
   const {descriptorId:_id,descriptorVersion:_version,descriptorSha256:_sha,...expected}=image.source
   if(canonicalBrushDescriptorJSON(expected)!==canonicalBrushDescriptorJSON(pin))return fail()
   for(const asset of image.assets){const actual=context.assets.find(a=>a.id===asset.id);if(!actual||actual.size!==asset.size||!pin.frameBounds&&canonicalBrushDescriptorJSON(actual)!==canonicalBrushDescriptorJSON(asset))return fail();const prior=imageAssets.get(asset.id);if(prior&&prior.size!==asset.size)return fail();imageAssets.set(asset.id,actual)}
   return Object.freeze({...role,imageSource:pin,imageAssets:Object.freeze(image.assets)})
  }
  if(source.version!==2||source.source.kind!==pin.kind||pin.descriptorId!==role.descriptor.id||pin.descriptorVersion!==role.descriptor.version||pin.descriptorSha256!==descriptorSha256||canonicalBrushDescriptorJSON(pin.source)!==canonicalBrushDescriptorJSON(source.source))return fail()
  return role
 }
 const primary=bindRole(data.primary,context.primarySource),mask=bindRole(data.mask,context.maskSource)
 if(context.roleTextures){const expected=captureOriginalRoleTextures(data.primary.textureSource,data.mask.textureSource,sourceRoleTextureInputsFromPins(context.roleTextures));if(canonicalBrushDescriptorJSON(expected.roleTextures)!==canonicalBrushDescriptorJSON(context.roleTextures))return fail();for(const asset of expected.assets){const actual=context.assets.find(a=>a.id===asset.id);if(!actual||actual.size!==asset.size)return fail();imageAssets.set(asset.id,actual)}}
 if(context.sourceColorFields)for(const field of [context.sourceColorFields.primary,context.sourceColorFields.mask])if(field&&field.kind!=='total-random-rgb8-hash-v1')for(const id of [...field.resource.channels,field.resource.alphaAsset]){const actual=context.assets.find(a=>a.id===id);if(!actual)return fail();imageAssets.set(id,actual)}
 if(imageAssets.size!==context.assets.length)return fail()
 const refs=data.primary.textureSource||data.mask.textureSource?brushAssetIds(data.descriptor):undefined
 if(refs&&refs.length>2048)return fail()
 const originalAssets=refs?Object.freeze(refs.map(id=>{const a=(available??context.assets).find(a=>a.id===id);if(!a)return fail();return Object.freeze({id:a.id,size:a.size})})):undefined
 return Object.freeze({kind:'pixel-dual-source-binding-v1' as const,...scaleOptions,...originalAssets?{originalAssets}:{},descriptorSha256,descriptor:data.descriptor,composition,primary,mask,material:context,maskingBlend:context.maskingBlend,masterSizePolicy:data.masterSizePolicy})
}
export type CanonicalPixelDualSourceBinding=ReturnType<typeof canonicalPixelDualSourceBinding>

function captureOriginalRoleTextures(primary:CanonicalPixelRoleTextureSource|undefined,mask:CanonicalPixelRoleTextureSource|undefined,value:unknown){
 const inputs=canonicalSourceRoleTexturesInput(value),assets:CanonicalMaterialContextV2['assets'][number][]=[]
 const pin=(source:CanonicalPixelRoleTextureSource|undefined,input:typeof inputs.primary):CanonicalSourceRoleTexturePin|null=>{
  if(!source){if(input!==null)throw new TypeError('Unexpected texture input on inactive source role');return null}
  if(!input)throw new TypeError('Missing original role texture START input')
  const geometry=source.textureGeometry,policy=source.phasePolicy,phase=canonicalResolvedTexturePhase(input.phase,policy.width,policy.height),fixed=resolveCanonicalTexturePhase(policy,()=>0)
  if(!policy.randomX&&phase.x!==fixed.x||!policy.randomY&&phase.y!==fixed.y)throw new TypeError('Original role fixed texture phase differs')
  assets.push(source.patternAsset);if(source.alphaAsset)assets.push(source.alphaAsset)
  if(geometry.law==='pixel-texture-u8-v1'){if(input.textureGradient!==undefined)throw new TypeError('Unexpected role texture gradient');return canonicalPixelPrimaryTexturePin({...geometry,phase,strength:'recorded-grain-v1'},source.patternAsset)}
  if(geometry.mode==='gradient'?!input.textureGradient:input.textureGradient!==undefined)throw new TypeError('Original role gradient resource mismatch')
  if(!source.alphaAsset)throw new TypeError('Missing original role texture alpha')
  return canonicalPixelColorTexturePin({...geometry,phase,strength:'recorded-grain-v1',...geometry.mode==='gradient'?{gradient:input.textureGradient}:{}},source.patternAsset,source.alphaAsset)
 }
 if(inputs.mask===undefined)throw new TypeError('Dual texture inputs require both role entries')
 return{roleTextures:Object.freeze({primary:pin(primary,inputs.primary),mask:pin(mask,inputs.mask)}),assets}
}
/** Reconstruct selected original role pins from START inputs, never caller pins. */
export function canonicalPixelDualSourceMaterialContext(binding:CanonicalPixelDualSourceBinding,inputs?:CanonicalSourceRoleTexturesInput):CanonicalMaterialContextV2{
 const expected=canonicalPixelDualSourceBinding(binding.descriptor,binding.descriptorSha256,binding.material,binding.sourceScale!==undefined?{sourceScale:binding.sourceScale}:undefined,binding.originalAssets)
 if(canonicalBrushDescriptorJSON(expected)!==canonicalBrushDescriptorJSON(binding))throw new TypeError('Dual source original binding differs')
 const material=canonicalSourceMaterialContext({...expected.material,...expected.composition.outerBlend==='colorHsyBrowser'?{outerCompositionLaw:'browser-hsy-rgba8-functional-v1'}:{}})
 if(!expected.primary.textureSource&&!expected.mask.textureSource){if(inputs!==undefined)throw new TypeError('Unexpected dual texture START inputs');return material}
 const captured=captureOriginalRoleTextures(expected.primary.textureSource,expected.mask.textureSource,inputs),assets=[...material.assets]
 for(const a of captured.assets){const old=assets.find(p=>p.id===a.id);if(old){if(old.size!==a.size)throw new TypeError('Original role texture storage collision')}else assets.push(a)}
 return canonicalSourceMaterialContext({...material,assets,roleTextures:captured.roleTextures})
}
