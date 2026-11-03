import type {BrushDescriptor} from './brushes.js'
import {canonicalBrushDescriptorJSON} from './canonicalBrushDescriptor.js'
import {extractCanonicalPixelDualSourceData} from './canonicalBrushCapability.js'
import {canonicalMaskedSourceMaterialContext,type CanonicalMaterialContextV2} from './canonicalMaterialCodec.js'

/** Original descriptor pairing only, not verified CAS or room/BEGIN authority. */
export function canonicalPixelDualSourceBinding(original:BrushDescriptor,descriptorSha256:string,material:CanonicalMaterialContextV2){
 const fail=():never=>{throw new TypeError('Invalid original Pixel dual binding')}
 if(typeof descriptorSha256!=='string'||!/^[a-f0-9]{64}$/.test(descriptorSha256))return fail()
 const context=canonicalMaskedSourceMaterialContext(material)
 const data=extractCanonicalPixelDualSourceData(original,context.assets.map(a=>({id:a.id,size:a.size})))
 if(!data.supported||data.blendMode!==context.maskingBlend)return fail()
 for(const [role,pin] of [[data.primary,context.primarySource],[data.mask,context.maskSource]] as const){
  const source=role.data
  if(pin.brushScale!==role.effectiveBrushScale||pin.brushAngle!==source.brush.angle)return fail()
  if(pin.kind==='image'){
   if(source.version===2&&source.source.kind!=='image'||!('capability'in role.material)||role.material.capability.asset.id!==pin.asset)return fail()
   const expected=role.material.capability.asset,actual=context.assets.find(a=>a.id===pin.asset)
   if(!actual||canonicalBrushDescriptorJSON(actual)!==canonicalBrushDescriptorJSON(expected))return fail()
  }else{
   if(source.version!==2||source.source.kind!==pin.kind||pin.descriptorId!==role.descriptor.id||pin.descriptorVersion!==role.descriptor.version||pin.descriptorSha256!==descriptorSha256||canonicalBrushDescriptorJSON(pin.source)!==canonicalBrushDescriptorJSON(source.source))return fail()
  }
 }
 return Object.freeze({kind:'pixel-dual-source-binding-v1' as const,descriptorSha256,descriptor:data.descriptor,primary:data.primary,mask:data.mask,material:context,maskingBlend:context.maskingBlend,masterSizePolicy:data.masterSizePolicy})
}
export type CanonicalPixelDualSourceBinding=ReturnType<typeof canonicalPixelDualSourceBinding>
