import type {BrushDescriptor} from './brushes.js'
import {extractCanonicalPrimaryGrainImageAuthorData} from './canonicalBrushCapability.js'
import {canonicalPrimaryGrainMaterialContext,type CanonicalMaterialContextV8,type CanonicalPrimaryGrainImageSource,type CanonicalMaterialAsset} from './canonicalMaterialCodec.js'
import {canonicalResolvedTexturePhase,resolveCanonicalTexturePhase,canonicalMultiplyTextureStrengthU8,type CanonicalResolvedTexturePhase} from './canonicalPrimaryTexture.js'
import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,type CanonicalStrokeRasterProfile} from './canonicalStrokeFrame.js'
import type {SourceStampData} from './sourceStampData.js'
export interface CanonicalPrimaryGrainImageBinding {
 readonly kind:'primary-grain-image-program-v1';readonly descriptorSha256:string
 readonly descriptor:Readonly<BrushDescriptor>;readonly data:SourceStampData
 readonly source:CanonicalPrimaryGrainImageSource;readonly assets:readonly CanonicalMaterialAsset[]
 readonly textureGeometry:Readonly<{kind:'canvasTexture';asset:string;law:'hard-multiply-u8-native-v1';width:number;height:number;periodX:number;periodY:number}>
 readonly phasePolicy:Readonly<{width:number;height:number;offsetX:number;offsetY:number;randomX:false;randomY:false}>
 readonly strengthPolicy:'pressure-identity-half-up-u8-v1'
 readonly composition:Readonly<{mode:'buildup';outerBlend:'over'}>
}
const fail=():never=>{throw new TypeError('Invalid primary-grain image binding')}
function own(value:unknown,names:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==names.length)return fail()
 const out:Record<string,unknown>=Object.create(null)
 for(const key of names){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))return fail();out[key]=d.value}return out
}
/** Original SHA/CAS bytes and permission remain the caller's authority. */
export function canonicalPrimaryGrainImageSourceBinding(descriptor:unknown,descriptorSha256:string,assets:Readonly<{primary:Readonly<{id:string;size:number}>;pattern:Readonly<{id:string;size:number}>}>,rasterProfile:CanonicalStrokeRasterProfile):CanonicalPrimaryGrainImageBinding {
 if(rasterProfile!==CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE||typeof descriptorSha256!=='string'||!/^[a-f0-9]{64}$/.test(descriptorSha256))return fail()
 const result=extractCanonicalPrimaryGrainImageAuthorData(descriptor,assets)
 if(!result.supported)return fail()
 const image=result.image,a=result.patternAsset
 const source=Object.freeze({kind:'image' as const,asset:image.asset.id,brushScale:image.brushScale,brushAngle:image.brushAngle,descriptorId:result.descriptor.id,descriptorVersion:result.descriptor.version,descriptorSha256})
 return Object.freeze({kind:'primary-grain-image-program-v1',descriptorSha256,descriptor:result.descriptor,data:result.data,source,assets:Object.freeze([image.asset,a]),textureGeometry:Object.freeze({kind:'canvasTexture',asset:a.id,law:'hard-multiply-u8-native-v1',width:a.width,height:a.height,periodX:a.width,periodY:a.height}),phasePolicy:result.phasePolicy,strengthPolicy:result.strengthPolicy,composition:Object.freeze({mode:'buildup',outerBlend:'over'})})
}
/** Saved fixed phase is compared, never resampled from RNG on replay. */
export function canonicalPrimaryGrainImageMaterialContext(binding:CanonicalPrimaryGrainImageBinding,savedPhase:CanonicalResolvedTexturePhase,budget:CanonicalMaterialContextV8['budget']):CanonicalMaterialContextV8 {
 const b=own(binding,['kind','descriptorSha256','descriptor','data','source','assets','textureGeometry','phasePolicy','strengthPolicy','composition'])
 if(b.kind!=='primary-grain-image-program-v1'||b.strengthPolicy!=='pressure-identity-half-up-u8-v1')return fail()
 const g=own(b.textureGeometry,['kind','asset','law','width','height','periodX','periodY'])
 if(typeof g.width!=='number'||typeof g.height!=='number')return fail()
 const policy=own(b.phasePolicy,['width','height','offsetX','offsetY','randomX','randomY'])
 if(policy.width!==g.width||policy.height!==g.height||policy.randomX!==false||policy.randomY!==false)return fail()
 const expected=resolveCanonicalTexturePhase(policy,()=>{throw new TypeError('Unexpected primary-grain entropy')}),phase=canonicalResolvedTexturePhase(savedPhase,g.width,g.height)
 if(phase.x!==expected.x||phase.y!==expected.y)return fail()
 const c=canonicalPrimaryGrainMaterialContext({version:8,assets:b.assets,primarySource:b.source,primaryTexture:{...g,phase,strength:'recorded-grain-v1'},budget})
 if(c.primarySource.descriptorSha256!==b.descriptorSha256)return fail()
 const composition=own(b.composition,['mode','outerBlend']);if(composition.mode!=='buildup'||composition.outerBlend!=='over')return fail()
 return c
}
/** Author calls once per emitted actual paint event, then stores this byte.
 * Encoder/Copy/checkpoint/replay must carry it unchanged, never call this again. */
export function canonicalPrimaryGrainImagePressureStrengthU8(binding:CanonicalPrimaryGrainImageBinding,pressure:number):number {
 const policy=Object.getOwnPropertyDescriptor(binding,'strengthPolicy'),kind=Object.getOwnPropertyDescriptor(binding,'kind')
 if(!policy||!Object.hasOwn(policy,'value')||policy.value!=='pressure-identity-half-up-u8-v1'||!kind||!Object.hasOwn(kind,'value')||kind.value!=='primary-grain-image-program-v1')return fail()
 return canonicalMultiplyTextureStrengthU8(pressure)
}
