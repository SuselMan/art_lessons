import {hasActiveSourceMaterialOptions,hasActiveSourceColorOptions} from './sourceStampData.js'
import type {BrushDescriptor} from './brushes.js'
import {canonicalBrushDescriptorJSON} from './canonicalBrushDescriptor.js'
import {extractCanonicalColorImageSourceData,extractCanonicalLightnessImageSourceData} from './canonicalBrushCapability.js'
import {buildCanonicalMaterial,type CanonicalMaterialContextV2,type CanonicalMaterialImageSource} from './canonicalMaterialCodec.js'

/** Original alpha + adjusted-gray CAS pairing. No bitmap reads or authority. */
export function canonicalLightnessImageSourceBinding(descriptor:BrushDescriptor,descriptorSha256:string,available:readonly Readonly<{id:string;size:number}>[],foregroundAlpha:number){
 if(!/^[a-f0-9]{64}$/.test(descriptorSha256)||!Number.isFinite(foregroundAlpha)||foregroundAlpha<0||foregroundAlpha>1)throw new TypeError('Invalid lightness image binding')
 const c=extractCanonicalLightnessImageSourceData(descriptor,available)
 if(!c.supported)throw new TypeError(c.reasons.join(','))
 const imageMaterial=Object.freeze({kind:'lightness-map-v1' as const,grayAsset:c.grayAsset.id,strength:c.strength,foregroundAlpha})
 const source:CanonicalMaterialImageSource=Object.freeze({kind:'image',asset:c.asset.id,brushScale:c.data.brush.scale,brushAngle:c.data.brush.angle,imageMaterial})
 return Object.freeze({kind:'lightness-image-program-v1' as const,descriptorSha256,descriptor:c.descriptor,data:c.data,source,assets:Object.freeze([c.asset,c.grayAsset]),imageMaterial})
}
export type CanonicalLightnessImageBinding=ReturnType<typeof canonicalLightnessImageSourceBinding>
export function canonicalLightnessImageMaterialContext(binding:CanonicalLightnessImageBinding,budget:CanonicalMaterialContextV2['budget']):CanonicalMaterialContextV2{
 const expected=canonicalLightnessImageSourceBinding(binding.descriptor,binding.descriptorSha256,binding.assets,binding.imageMaterial.foregroundAlpha)
 if(canonicalBrushDescriptorJSON(expected)!==canonicalBrushDescriptorJSON(binding))throw new TypeError('Lightness original binding mismatch')
 const context=Object.freeze({version:2 as const,...hasActiveSourceColorOptions(expected.data)?{colorParams:'source-pigment-rgb8-v1' as const}:{},...hasActiveSourceMaterialOptions(expected.data)?{materialParams:'source-material-parameters-v1' as const}:{},assets:expected.assets,primarySource:expected.source,budget:Object.freeze({...budget})})
 buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},context)
 return context
}

export function canonicalColorImageSourceBinding(descriptor:BrushDescriptor,descriptorSha256:string,available:readonly Readonly<{id:string;size:number}>[],foregroundOpacity:number){
 if(!/^[a-f0-9]{64}$/.test(descriptorSha256)||!Number.isFinite(foregroundOpacity)||foregroundOpacity<0||foregroundOpacity>1)throw new TypeError('Invalid color image binding')
 const c=extractCanonicalColorImageSourceData(descriptor,available);if(!c.supported)throw new TypeError(c.reasons.join(','))
 const imageMaterial=Object.freeze({kind:'color-stamp-v1' as const,channels:Object.freeze([c.channels[0].id,c.channels[1].id,c.channels[2].id] as const),foregroundOpacity})
 const source:CanonicalMaterialImageSource=Object.freeze({kind:'image',asset:c.asset.id,brushScale:c.data.brush.scale,brushAngle:c.data.brush.angle,imageMaterial})
 return Object.freeze({kind:'color-image-program-v1' as const,descriptorSha256,descriptor:c.descriptor,data:c.data,source,assets:Object.freeze([c.asset,...c.channels]),imageMaterial})
}
export type CanonicalColorImageBinding=ReturnType<typeof canonicalColorImageSourceBinding>
export type CanonicalImageMaterialBinding=CanonicalLightnessImageBinding|CanonicalColorImageBinding
export function canonicalColorImageMaterialContext(binding:CanonicalColorImageBinding,budget:CanonicalMaterialContextV2['budget']):CanonicalMaterialContextV2{
 const expected=canonicalColorImageSourceBinding(binding.descriptor,binding.descriptorSha256,binding.assets,binding.imageMaterial.foregroundOpacity)
 if(canonicalBrushDescriptorJSON(expected)!==canonicalBrushDescriptorJSON(binding))throw new TypeError('Color original binding mismatch')
 const context=Object.freeze({version:2 as const,...hasActiveSourceColorOptions(expected.data)?{colorParams:'source-pigment-rgb8-v1' as const}:{},...hasActiveSourceMaterialOptions(expected.data)?{materialParams:'source-material-parameters-v1' as const}:{},assets:expected.assets,primarySource:expected.source,budget:Object.freeze({...budget})})
 buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},context)
 return context
}
