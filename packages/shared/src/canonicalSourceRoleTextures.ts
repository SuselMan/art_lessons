import {isCanonicalMaskingBlendMode} from './canonicalMaskingBlend.js'
import {canonicalTextureGradientRGBA,canonicalPixelPrimaryTexturePin,canonicalPixelColorTexturePin,type CanonicalPixelPrimaryTexturePin,type CanonicalPixelColorTexturePin,type CanonicalResolvedTexturePhase,type CanonicalTextureGradientRGBA} from './canonicalPrimaryTexture.js'
import type {CanonicalMaterialAsset} from './canonicalMaterialCodec.js'
export type CanonicalSourceRoleTexturePin=CanonicalPixelPrimaryTexturePin|CanonicalPixelColorTexturePin
export interface CanonicalSourceRoleTextures {readonly primary:CanonicalSourceRoleTexturePin|null;readonly mask?:CanonicalSourceRoleTexturePin|null}
/** START input is phase/provider DATA only. Original descriptors choose all laws,
 * assets and geometry; no caller pin is an execution/source grant. */
export interface CanonicalSourceRoleTextureInput {readonly phase:CanonicalResolvedTexturePhase;readonly textureGradient?:CanonicalTextureGradientRGBA}
export interface CanonicalSourceRoleTexturesInput {readonly primary:CanonicalSourceRoleTextureInput|null;readonly mask?:CanonicalSourceRoleTextureInput|null}
const fail=():never=>{throw new TypeError('Invalid source role texture DATA')}
function data(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return fail();const keys=Reflect.ownKeys(value);if(keys.some(k=>typeof k!=='string'||!required.includes(k)&&!optional.includes(k)))return fail();const out:Record<string,unknown>=Object.create(null);for(const key of [...required,...optional]){const d=Object.getOwnPropertyDescriptor(value,key);if(!d){if(required.includes(key))return fail();continue}if(!Object.hasOwn(d,'value'))return fail();out[key]=d.value}return out}
/** Strict capture only; immutable original-role binding remains mandatory. */
export function canonicalSourceRoleTextures(value:unknown,assets:readonly CanonicalMaterialAsset[],hasMask:boolean):Readonly<CanonicalSourceRoleTextures>{
 const fields=canonicalSourceRoleTexturesData(value);if(fields.mask!==undefined&&!hasMask)return fail()
 const pin=(value:unknown):CanonicalSourceRoleTexturePin|null=>{if(value===null)return null;if(!value||typeof value!=='object')return fail();const id=Object.getOwnPropertyDescriptor(value,'asset'),law=Object.getOwnPropertyDescriptor(value,'law');if(!id||!Object.hasOwn(id,'value')||!law||!Object.hasOwn(law,'value'))return fail();const gray=assets.find(a=>a.id===id.value);if(!gray)return fail();if(law.value==='pixel-texture-u8-v1')return canonicalPixelPrimaryTexturePin(value,gray);if(law.value!=='pixel-color-texture-v1')return fail();const alpha=Object.getOwnPropertyDescriptor(value,'alphaAsset');if(!alpha||!Object.hasOwn(alpha,'value'))return fail();const asset=assets.find(a=>a.id===alpha.value);if(!asset)return fail();return canonicalPixelColorTexturePin(value,gray,asset)}
 const primary=pin(fields.primary),mask=fields.mask===undefined?undefined:pin(fields.mask);if(!primary&&!mask)return fail();return Object.freeze({primary,...mask!==undefined?{mask}:{}})
}

/** START phase/resources only. Full pins are reconstructed from original roles. */
export function canonicalSourceRoleTexturesInput(value:unknown):CanonicalSourceRoleTexturesInput{
 const fields=data(value,['primary'],['mask']);if(Object.hasOwn(fields,'mask')&&fields.mask===undefined)return fail()
 const input=(value:unknown):CanonicalSourceRoleTextureInput|null=>{
  if(value===null)return null
  const p=data(value,['phase'],['textureGradient']),phase=data(p.phase,['kind','x','y'])
  const coordinate=(n:unknown):number=>{if(typeof n!=='number'||!Number.isInteger(n)||n<0||n>0x7fffffff||Object.is(n,-0))return fail();return n}
  if(phase.kind!=='resolved-stroke-phase-v1')return fail()
  return Object.freeze({phase:Object.freeze({kind:'resolved-stroke-phase-v1' as const,x:coordinate(phase.x),y:coordinate(phase.y)}),...Object.hasOwn(p,'textureGradient')?{textureGradient:canonicalTextureGradientRGBA(p.textureGradient)}:{}})
 }
 const primary=input(fields.primary),mask=fields.mask===undefined?undefined:input(fields.mask)
 if(!primary&&!mask)return fail()
 return Object.freeze({primary,...mask!==undefined?{mask}:{}})
}
export function sourceRoleTextureInputsFromPins(value:CanonicalSourceRoleTextures):CanonicalSourceRoleTexturesInput{
 const fields=data(value,['primary'],['mask']);if(Object.hasOwn(fields,'mask')&&fields.mask===undefined)return fail()
 const input=(pin:unknown)=>{if(pin===null)return null;if(!pin||typeof pin!=='object')return fail();const phase=Object.getOwnPropertyDescriptor(pin,'phase'),gradient=Object.getOwnPropertyDescriptor(pin,'gradient');if(!phase||!Object.hasOwn(phase,'value')||gradient&&!Object.hasOwn(gradient,'value'))return fail();return{phase:phase.value,...gradient?{textureGradient:gradient.value}:{}}}
 return canonicalSourceRoleTexturesInput({primary:input(fields.primary),...fields.mask!==undefined?{mask:input(fields.mask)}:{}})
}

/** Full pin DATA capture only; no synthetic asset metadata or CAS authority. */
export function canonicalSourceRoleTexturesData(value:unknown):CanonicalSourceRoleTextures{
 const fields=data(value,['primary'],['mask']);if(Object.hasOwn(fields,'mask')&&fields.mask===undefined)return fail()
 const integer=(v:unknown,min:number,max:number):number=>{if(typeof v!=='number'||!Number.isInteger(v)||v<min||v>max||Object.is(v,-0))return fail();return v}
 const cas=(v:unknown):string=>{if(typeof v!=='string'||!/^asset:[a-f0-9]{64}$/.test(v))return fail();return v}
 const pin=(v:unknown):CanonicalSourceRoleTexturePin|null=>{
  if(v===null)return null
  if(!v||typeof v!=='object')return fail()
  const law=Object.getOwnPropertyDescriptor(v,'law'),mode=Object.getOwnPropertyDescriptor(v,'mode')
  if(!law||!Object.hasOwn(law,'value')||!mode||!Object.hasOwn(mode,'value'))return fail()
  if(law.value!=='pixel-texture-u8-v1'&&law.value!=='pixel-color-texture-v1')return fail()
  const p=data(v,['kind','asset','law','mode','width','height','periodX','periodY','phase','strength',...law.value==='pixel-texture-u8-v1'?['soft']:['alphaAsset',...mode.value==='gradient'?['gradient']:[]]])
  const width=integer(p.width,1,4096),height=integer(p.height,1,4096),phase=data(p.phase,['kind','x','y'])
  if(p.kind!=='canvasTexture'||p.strength!=='recorded-grain-v1'||width*height>1048576||p.periodX!==width||p.periodY!==height)return fail()
  if(phase.kind!=='resolved-stroke-phase-v1')return fail()
  const common={kind:'canvasTexture' as const,asset:cas(p.asset),width,height,periodX:width,periodY:height,phase:Object.freeze({kind:'resolved-stroke-phase-v1' as const,x:integer(phase.x,0,width-1),y:integer(phase.y,0,height-1)}),strength:'recorded-grain-v1' as const}
  if(law.value==='pixel-texture-u8-v1'){if(!isCanonicalMaskingBlendMode(p.mode)||typeof p.soft!=='boolean')return fail();return Object.freeze({...common,law:'pixel-texture-u8-v1',mode:p.mode,soft:p.soft})}
  if(p.mode!=='lightness'&&p.mode!=='gradient')return fail()
  return Object.freeze({...common,law:'pixel-color-texture-v1',mode:p.mode,alphaAsset:cas(p.alphaAsset),...p.mode==='gradient'?{gradient:canonicalTextureGradientRGBA(p.gradient)}:{}})
 }
 const primary=pin(fields.primary),mask=fields.mask===undefined?undefined:pin(fields.mask)
 if(!primary&&!mask)return fail()
 return Object.freeze({primary,...mask!==undefined?{mask}:{}})
}
