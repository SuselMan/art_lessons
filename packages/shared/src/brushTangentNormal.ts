/** RGB normal-vector encoding over the ordinary brush mask. */
export interface BrushTangentNormal {
  version:1
  direction:'tilt'|'direction'|'mix'
  channels:[number,number,number]
  elevationSensitivity:number
  mix:number
}
export function isTangentNormalDescriptor(d:Record<string,unknown>):boolean {
  if(d.tangentNormal===undefined)return true
  const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
  const t=d.tangentNormal,b=d.behavior
  return record(t)&&Object.keys(t).length===5&&t.version===1&&['tilt','direction','mix'].includes(String(t.direction))
    &&Array.isArray(t.channels)&&t.channels.length===3&&t.channels.every(x=>Number.isInteger(x)&&x>=0&&x<=5)
    &&typeof t.elevationSensitivity==='number'&&Number.isFinite(t.elevationSensitivity)&&t.elevationSensitivity>=0&&t.elevationSensitivity<=1
    &&typeof t.mix==='number'&&Number.isFinite(t.mix)&&t.mix>=0&&t.mix<=1
    &&d.model==='stamp'&&d.paperInteraction===0
    &&['mypaint','clone','filter','deform','experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','mixer','wet'].every(k=>d[k]===undefined)
    &&record(d.tip)&&d.tip.color===undefined&&d.tip.material===undefined
    &&record(b)&&b.version===2&&b.dual===undefined&&b.wetMix===undefined&&b.colorAdjustment===undefined
    &&['hue','saturation','brightness'].every(k=>!record(b.dynamics)||b.dynamics[k]===undefined)
    &&['hue','saturation','brightness'].every(k=>!record(b.modulations)||b.modulations[k]===undefined)
    &&record(b.rendering)&&b.rendering.accumulation==='directOver'
}
