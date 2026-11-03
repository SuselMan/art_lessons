import {canonicalTextureGradientRGBA} from './canonicalPrimaryTexture.js'

/** Captured application gradient for the image tip, independent of texture
 * gradients. This DATA object does not grant source or execution authority. */
export interface CanonicalSourceTipGradient {
  readonly kind:'captured-tip-gradient-rgba8-v1'
  readonly rgba:readonly number[]
}
export function canonicalSourceTipGradient(value:unknown):Readonly<CanonicalSourceTipGradient>{
  const fail=():never=>{throw new TypeError('Invalid captured tip gradient')}
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return fail()
  const keys=Reflect.ownKeys(value)
  if(keys.length!==2||keys.some(k=>k!=='kind'&&k!=='rgba'))return fail()
  const kind=Object.getOwnPropertyDescriptor(value,'kind'),rgba=Object.getOwnPropertyDescriptor(value,'rgba')
  if(!kind||!rgba||!Object.hasOwn(kind,'value')||!Object.hasOwn(rgba,'value')||kind.value!=='captured-tip-gradient-rgba8-v1')return fail()
  const captured=canonicalTextureGradientRGBA({kind:'captured-texture-gradient-rgba8-v1',rgba:rgba.value})
  return Object.freeze({kind:'captured-tip-gradient-rgba8-v1',rgba:captured.rgba})
}
