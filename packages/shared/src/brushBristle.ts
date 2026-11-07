import type {AssetId} from './brushes.js'

/** Compiler-produced LE bytes in the existing square raw CAS plane.
 * This declaration alone does not enable saturation library admission. */
export interface BrushBristleSaturationLookup {
 version:1
 encoding:'bristle-saturation-functional-v1-le'
 asset:AssetId
 profileSha256:string
 byteLength:number
}
/** A fixed set of mask-derived hairs follows canonical author input knots. */
export interface BrushBristleInk {
 depletion:readonly number[]
 useOpacity:boolean
 useSaturation:boolean
 useWeights:boolean
 pressureWeight:number
 bristleLengthWeight:number
 bristleInkAmountWeight:number
 inkDepletionWeight:number
}
interface BristleGeometry {
 hairs:[number,number,number][]
 scale:number
 shear:number
 random:number
 mousePressure:boolean
 threshold:boolean
 connected:boolean
 antialias:boolean
 compositing:boolean
}
export type BrushBristle=BristleGeometry&({version:1;ink?:never;saturationLookup?:never}|{version:2;ink:BrushBristleInk;saturationLookup?:BrushBristleSaturationLookup})
export function isBrushBristle(value:unknown):value is BrushBristle{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>,n=(x:unknown,a:number,b:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b
 return Object.keys(v).every(k=>['version','hairs','scale','shear','random','mousePressure','threshold','connected','antialias','compositing','ink','saturationLookup'].includes(k))&&((v.version===1&&v.ink===undefined&&v.saturationLookup===undefined)||(v.version===2&&isBristleInk(v.ink)&&(v.saturationLookup===undefined||v.ink.useSaturation&&isBristleSaturationLookup(v.saturationLookup))))&&n(v.scale,0,10)&&n(v.shear,-10,10)&&n(v.random,0,100)&&['mousePressure','threshold','connected','antialias','compositing'].every(k=>typeof v[k]==='boolean')&&Array.isArray(v.hairs)&&v.hairs.length>0&&v.hairs.length<=4096&&v.hairs.every(h=>Array.isArray(h)&&h.length===3&&n(h[0],-.5,.5)&&n(h[1],-.5,.5)&&n(h[2],0,1))
}

export function isBristleSaturationLookup(value:unknown):value is BrushBristleSaturationLookup {
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>
 return Object.keys(v).length===5&&Object.keys(v).every(k=>['version','encoding','asset','profileSha256','byteLength'].includes(k))
  &&v.version===1&&v.encoding==='bristle-saturation-functional-v1-le'
  &&typeof v.asset==='string'&&/^asset:[a-f0-9]{64}$/.test(v.asset)
  &&typeof v.profileSha256==='string'&&/^[a-f0-9]{64}$/.test(v.profileSha256)
  &&typeof v.byteLength==='number'&&Number.isInteger(v.byteLength)&&v.byteLength>=64&&v.byteLength<=524288
}

export function isBristleInk(value:unknown):value is BrushBristleInk {
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>,unit=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1
 return Object.keys(v).length===8&&Object.keys(v).every(k=>['depletion','useOpacity','useSaturation','useWeights','pressureWeight','bristleLengthWeight','bristleInkAmountWeight','inkDepletionWeight'].includes(k))
  &&Array.isArray(v.depletion)&&v.depletion.length>=1&&v.depletion.length<=65536&&v.depletion.every(unit)
  &&['useOpacity','useSaturation','useWeights'].every(k=>typeof v[k]==='boolean')
  &&[v.pressureWeight,v.bristleLengthWeight,v.bristleInkAmountWeight].every(unit)
  &&typeof v.inkDepletionWeight==='number'&&Number.isFinite(v.inkDepletionWeight)&&v.inkDepletionWeight>=0&&v.inkDepletionWeight<=100
}
