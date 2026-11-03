import {captureOriginalPixelImageSource} from './canonicalPixelImageSourceCapture.js'
import {captureCanonicalSourceScaleOptions,type CanonicalSourceScaleOptions} from './canonicalSourceScale.js'
import type {BrushDescriptor} from './brushes.js'
import {canonicalBrushDescriptorJSON} from './canonicalBrushDescriptor.js'
import {extractCanonicalPixelDualSourceData} from './canonicalBrushCapability.js'
import {canonicalMaskedSourceMaterialContext,type CanonicalMaterialContextV2} from './canonicalMaterialCodec.js'

/** Original descriptor pairing only, not verified CAS or room/BEGIN authority. */
export function canonicalPixelDualSourceBinding(original:BrushDescriptor,descriptorSha256:string,material:CanonicalMaterialContextV2,options?:CanonicalSourceScaleOptions){
 const fail=():never=>{throw new TypeError('Invalid original Pixel dual binding')}
 if(typeof descriptorSha256!=='string'||!/^[a-f0-9]{64}$/.test(descriptorSha256))return fail()
 const context=canonicalMaskedSourceMaterialContext(material)
 const scaleOptions=captureCanonicalSourceScaleOptions(options===undefined&&context.scaledSource?{sourceScale:context.primarySource.brushScale}:options)
 if((scaleOptions.sourceScale!==undefined)!==!!context.scaledSource)return fail()
 const data=extractCanonicalPixelDualSourceData(original,context.assets.map(a=>({id:a.id,size:a.size})),scaleOptions)
 if(!data.supported||data.blendMode!==context.maskingBlend)return fail()
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
   for(const asset of image.assets){const actual=context.assets.find(a=>a.id===asset.id);if(!actual||canonicalBrushDescriptorJSON(actual)!==canonicalBrushDescriptorJSON(asset))return fail();const prior=imageAssets.get(asset.id);if(prior&&canonicalBrushDescriptorJSON(prior)!==canonicalBrushDescriptorJSON(asset))return fail();imageAssets.set(asset.id,asset)}
   return Object.freeze({...role,imageSource:pin,imageAssets:Object.freeze(image.assets)})
  }
  if(source.version!==2||source.source.kind!==pin.kind||pin.descriptorId!==role.descriptor.id||pin.descriptorVersion!==role.descriptor.version||pin.descriptorSha256!==descriptorSha256||canonicalBrushDescriptorJSON(pin.source)!==canonicalBrushDescriptorJSON(source.source))return fail()
  return role
 }
 const primary=bindRole(data.primary,context.primarySource),mask=bindRole(data.mask,context.maskSource)
 if(imageAssets.size!==context.assets.length)return fail()
 return Object.freeze({kind:'pixel-dual-source-binding-v1' as const,...scaleOptions,descriptorSha256,descriptor:data.descriptor,primary,mask,material:context,maskingBlend:context.maskingBlend,masterSizePolicy:data.masterSizePolicy})
}
export type CanonicalPixelDualSourceBinding=ReturnType<typeof canonicalPixelDualSourceBinding>
