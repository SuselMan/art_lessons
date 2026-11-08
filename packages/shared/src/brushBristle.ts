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

/** Native no-ink AA additive request, then common Wash. Whole-library validators
 * still validate dynamics, captured source policies and every ordinary field. */
export function hasBristleWash135Scope(value:unknown):boolean {
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!obj(value)||!obj(value.tip)||!obj(value.behavior)||!isBrushBristle(value.bristle))return false
 const t=value.tip,b=value.behavior,r=b.rendering,h=value.bristle
 const one=(v:unknown)=>Array.isArray(v)&&v.length>=2&&v.every(p=>Array.isArray(p)&&p.length===2&&typeof p[0]==='number'&&Number.isFinite(p[0])&&p[0]>=0&&p[0]<=1&&p[1]===1)
 return Number.isInteger(value.version)&&Number(value.version)>=135&&value.model==='stamp'&&value.paperInteraction===0&&value.flow===1&&one(value.flowByPressure)
 &&h.version===1&&h.antialias===true&&h.compositing===false
 &&['mixer','spray','particle','sketch','curveTrace','hatching','grid','experiment','deform','filter','clone','mypaint','tangentNormal','scatter','texture','wet','screentonePx','colorAdjustment'].every(k=>value[k]===undefined)
 &&t.kind==='round'&&t.aspect===1&&t.hardness===1&&t.rotation==='fixed'&&t.angle===0&&Object.keys(t).every(k=>['kind','hardness','aspect','rotation','angle'].includes(k))
 &&b.version===2&&Object.keys(b).every(k=>['version','rendering','modulations','rotation','strokeInput','speedInput'].includes(k))
 &&(b.speedInput===undefined||obj(b.speedInput)&&Object.keys(b.speedInput).length===4&&b.speedInput.version===1&&b.speedInput.space==='view'&&b.speedInput.maximum===30&&b.speedInput.estimator==='grafettoEMA30ms')
 &&(b.modulations===undefined||obj(b.modulations)&&Object.keys(b.modulations).every(k=>k==='size'||k==='rotation'))
 &&(b.strokeInput===undefined||obj(b.strokeInput)&&b.strokeInput.fanCorners===undefined)
 &&obj(r)&&r.mode==='buildUp'&&r.blendMode==='normal'&&r.accumulation==='alphaDarken'&&(r.wetEdges??0)===0&&(r.burntEdges??0)===0&&!r.gammaCorrect&&!r.luminance
}
