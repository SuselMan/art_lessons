import {isStationary195Structure,type BrushStructurePolicy} from './brushStructurePolicy.js'
/** RGB normal-vector encoding over the ordinary brush mask. */
export interface BrushTangentNormal {
  version:1
  direction:'tilt'|'direction'|'mix'
  channels:[number,number,number]
  elevationSensitivity:number
  mix:number
  /** Native checked option retained by whole root195; allocation selects the1x1 shortcut. */
  sharpnessChecked?:boolean
}
export function isTangentNormalDescriptor(d:Record<string,unknown>,policy?:BrushStructurePolicy):boolean {
 const stationary=isStationary195Structure(d,policy)
  if(d.tangentNormal===undefined)return true
  const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
  const t=d.tangentNormal,b=d.behavior
  return isTangentNormalOptions(t,stationary)    &&d.model==='stamp'&&d.paperInteraction===0
    &&['mypaint','clone','filter','deform','experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','mixer','wet'].every(k=>d[k]===undefined)
    &&record(d.tip)&&d.tip.color===undefined&&d.tip.material===undefined
    &&record(b)&&b.version===2&&b.dual===undefined&&b.wetMix===undefined&&b.colorAdjustment===undefined
    &&['hue','saturation','brightness'].every(k=>!record(b.dynamics)||b.dynamics[k]===undefined)
    &&['hue','saturation','brightness'].every(k=>!record(b.modulations)||b.modulations[k]===undefined)
    &&record(b.rendering)&&(b.rendering.accumulation==='directOver'||hasTangentNormalWash136Scope(d,policy))
}

function isTangentNormalOptions(t:unknown,stationary=false):boolean {
 const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 return record(t)&&Object.keys(t).every(k=>['version','direction','channels','elevationSensitivity','mix',...(stationary?['sharpnessChecked']:[])].includes(k))&&Object.keys(t).length===(stationary?6:5)&&(!stationary||typeof t.sharpnessChecked==='boolean')&&t.version===1&&['tilt','direction','mix'].includes(String(t.direction))
    &&Array.isArray(t.channels)&&t.channels.length===3&&t.channels.every(x=>Number.isInteger(x)&&x>=0&&x<=5)
    &&typeof t.elevationSensitivity==='number'&&Number.isFinite(t.elevationSensitivity)&&t.elevationSensitivity>=0&&t.elevationSensitivity<=1
    &&typeof t.mix==='number'&&Number.isFinite(t.mix)&&t.mix>=0&&t.mix<=1

}

/** Closed new native Wash. Existing56 directOver is never reinterpreted. */
export function hasTangentNormalWash136Scope(value:unknown,policy?:BrushStructurePolicy):boolean {
 const stationary=isStationary195Structure(value,policy)
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v),n=(v:unknown,a:number,b:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b
 if(!obj(value)||!obj(value.tip)||!obj(value.behavior)||!obj(value.tangentNormal)||typeof value.tangentNormal.direction!=='string'||!isTangentNormalOptions(value.tangentNormal,stationary))return false
 const t=value.tip,b=value.behavior,g=t.profile,r=b.rendering
 const bitmap=value.version===207
 const maskOk=bitmap?t.kind==='bitmap'&&typeof t.mask==='string'&&obj(t.maskBounds)&&obj(t.imageSampling)&&t.imageSampling.kind==='integer-pyramid'&&t.imageSampling.signal==='inverse-gray'&&Object.keys(t).every(k=>['kind','aspect','hardness','rotation','angle','mask','maskBounds','imageSampling'].includes(k)):t.kind==='procedural'&&obj(g)&&Object.keys(g).every(k=>['kind','shape','horizontalFade','verticalFade','antialias'].includes(k))&&g.kind==='standard'&&g.shape==='ellipse'&&n(g.horizontalFade,0,1)&&n(g.verticalFade,0,1)&&typeof g.antialias==='boolean'&&Object.keys(t).every(k=>['kind','aspect','hardness','rotation','angle','profile'].includes(k))
 const one=(v:unknown)=>Array.isArray(v)&&v.length>=2&&v.every(p=>Array.isArray(p)&&p.length===2&&n(p[0],0,1)&&p[1]===1)
 return Number.isInteger(value.version)&&Number(value.version)>=136&&value.model==='stamp'&&value.paperInteraction===0&&value.flow===1&&one(value.flowByPressure)
 &&['mypaint','clone','filter','deform','experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','mixer','wet','texture','scatter'].every(k=>value[k]===undefined)
 &&maskOk&&([206,207].includes(Number(value.version))?n(t.aspect,1,16):t.aspect===1)&&n(t.hardness,0,1)&&t.rotation==='fixed'&&typeof t.angle==='number'&&Number.isFinite(t.angle)
 &&b.version===2&&Object.keys(b).every(k=>['version',...(stationary?['timing']:[]),'speedInput','rendering','spacing','rotation','modulations','dynamics','strokeInput'].includes(k))
 &&(b.modulations===undefined||obj(b.modulations)&&Object.keys(b.modulations).every(k=>['size','opacity','angle'].includes(k)))
 &&(b.dynamics===undefined||obj(b.dynamics)&&Object.keys(b.dynamics).every(k=>['size','opacity','angle'].includes(k)))
 &&(b.strokeInput===undefined||obj(b.strokeInput)&&b.strokeInput.fanCorners===undefined)
 &&obj(r)&&r.mode==='buildUp'&&r.blendMode==='normal'&&r.accumulation==='alphaDarken'&&(r.wetEdges??0)===0&&(r.burntEdges??0)===0&&!r.gammaCorrect&&!r.luminance
}
