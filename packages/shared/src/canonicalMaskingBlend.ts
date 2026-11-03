import {canonicalPrimaryTextureMultiplyU8} from './canonicalPrimaryTexture.js'

/** Scalar alpha laws shared by brush masking and texture execution. RGB is
 * preserved by the caller. These are alpha operations, not layer RGB blends. */
export const canonicalMaskingBlendModes = Object.freeze([
  'multiply','darken','overlay','colorDodge','colorBurn','linearBurn','add',
  'hardMix','hardMixSofter','subtract','height','linearHeight',
  'heightPhotoshop','linearHeightPhotoshop',
] as const)
export type CanonicalMaskingBlendMode = typeof canonicalMaskingBlendModes[number]

export function isCanonicalMaskingBlendMode(value:unknown):value is CanonicalMaskingBlendMode {
  return typeof value==='string'&&canonicalMaskingBlendModes.some(mode=>mode===value)
}
const byte=(v:number)=>Number.isInteger(v)&&v>=0&&v<=255&&!Object.is(v,-0)
const clamp=(v:number)=>Math.max(0,Math.min(255,Math.round(v)))
const mul=(a:number,b:number)=>{const n=a*b+128;return Math.floor((n+Math.floor(n/256))/256)}
const union=(a:number,b:number)=>a+b-mul(a,b)
const dodge=(a:number,b:number)=>a===255?(b===0?0:255):Math.min(255,Math.floor(b*255/(255-a)))
const burn=(a:number,b:number)=>a===0?(b===255?255:0):255-Math.min(255,Math.floor((255-b)*255/a))

/** mask is the incoming source alpha; paint is the destination brush alpha.
 * An absent strength selects dual-brush masking. Texture strength is an already
 * captured byte: replay never reevaluates pressure or requantizes that byte. */
export function canonicalMaskingBlendU8(mode:CanonicalMaskingBlendMode,mask:number,paint:number,strengthU8?:number,soft=false):number {
  if(!isCanonicalMaskingBlendMode(mode)||!byte(mask)||!byte(paint)||typeof soft!=='boolean'||strengthU8!==undefined&&!byte(strengthU8))throw new TypeError('Invalid masking alpha operation')
  const strength=strengthU8
  if(mode==='multiply'&&strength!==undefined&&!soft)return canonicalPrimaryTextureMultiplyU8(paint,mask,strength)
  if(mode==='height'||mode==='linearHeight'||mode==='heightPhotoshop'||mode==='linearHeightPhotoshop'){
    if(strength===undefined)throw new TypeError('Height texture requires captured strength')
    const photoshop=mode==='heightPhotoshop'||mode==='linearHeightPhotoshop'
    const linear=mode==='linearHeight'||mode==='linearHeightPhotoshop'
    const s=photoshop?strength:Math.floor(.99*strength+.5),inverse=255-s
    const source=soft?mul(mask,s):mask
    const destination=photoshop
      ?paint*(soft?1+9*s/255:10*s/255)
      :Math.floor(paint*255/inverse)-(soft?0:inverse)
    const height=destination-source
    return clamp(linear?Math.max(destination*(255-source)/255,height):height)
  }
  let src=mask,dst=paint
  if(strength!==undefined){
    if(mode==='subtract')return Math.max(0,soft?paint-mul(mask,strength):paint-mask-(255-strength))
    if(soft){
      src=mode==='colorDodge'||mode==='add'||mode==='hardMixSofter'
        ?mul(mask,strength):union(mask,255-strength)
    }else dst=mul(paint,strength)
  }
  switch(mode){
    case 'multiply':return mul(src,dst)
    case 'darken':return Math.min(src,dst)
    case 'overlay':return dst<128?mul(2*dst,src):255-mul(2*(255-dst),255-src)
    case 'colorDodge':return dodge(src,dst)
    case 'colorBurn':return burn(src,dst)
    case 'linearBurn':return Math.max(0,src+dst-255)
    // Native masking addition cannot resurrect zero destination coverage.
    case 'add':return paint===0?0:Math.min(255,src+dst)
    case 'hardMix':{
      const result=src+dst<255?0:255
      return strength!==undefined&&soft?mul(result,union(paint,strength)):result
    }
    case 'hardMixSofter':return clamp(3*dst-2*(255-src))
    case 'subtract':return Math.max(0,dst-src)
  }
}
