import {isBrushBehavior,type BrushDynamic}from'./brushBehavior.js'
/** History-derived quadratic/cubic paths, distinct from scalar sensor curves. */
export interface BrushCurveTrace {
 version:1|2
 history:number
 smoothing:boolean
 connect:boolean
 opacity:number
 dynamics?:{width?:BrushDynamic[];opacity?:BrushDynamic[]}
}
export function isBrushCurveTrace(value:unknown):value is BrushCurveTrace{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>
 if(Object.keys(v).some(k=>!['version','history','smoothing','connect','opacity','dynamics'].includes(k))||(v.version!==1&&v.version!==2)||!Number.isInteger(v.history)||(v.history as number)<2||(v.history as number)>128||typeof v.smoothing!=='boolean'||typeof v.connect!=='boolean'||typeof v.opacity!=='number'||!Number.isFinite(v.opacity)||v.opacity<0||v.opacity>1)return false
 if(v.dynamics!==undefined){
  if(!v.dynamics||typeof v.dynamics!=='object'||Array.isArray(v.dynamics))return false
  for(const [key,controls]of Object.entries(v.dynamics))if(!['width','opacity'].includes(key)||!isBrushBehavior({version:2,modulations:{size:controls}}))return false
 }
 return true
}

/** Native Curve consumes host callbacks, not effectiveTiming/checked Rate. */
export function hasCurveHostTimer167Scope(v:unknown):boolean{
 const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
 if(!obj(v)||!Number.isInteger(v.version)||Number(v.version)<167||v.model!=='stamp'||v.paperInteraction!==0||v.flow!==1||v.flowPer!=='stamp'||!obj(v.tip)||!obj(v.behavior)||!isBrushCurveTrace(v.curveTrace)||v.curveTrace.version!==2||v.curveTrace.dynamics!==undefined)return false
 const t=v.tip,b=v.behavior,c=b.timing,r=b.rendering
 const one=(x:unknown)=>Array.isArray(x)&&x.length>=2&&x.every(p=>Array.isArray(p)&&p.length===2&&typeof p[0]==='number'&&Number.isFinite(p[0])&&p[0]>=0&&p[0]<=1&&p[1]===1)
 return ['mixer','spray','bristle','sketch','particle','hatching','grid','experiment','deform','filter','clone','mypaint','tangentNormal','scatter','texture','wet'].every(k=>v[k]===undefined)&&one(v.sizeByPressure)&&one(v.flowByPressure)&&one(v.opacityByPressure)
 &&Object.keys(t).every(k=>['kind','hardness','aspect','rotation','angle'].includes(k))&&t.kind==='round'&&t.aspect===1&&t.hardness===1&&t.rotation==='fixed'&&t.angle===0
 &&b.version===2&&Object.keys(b).every(k=>['version','rendering','timing','speedInput'].includes(k))&&(b.speedInput===undefined||obj(b.speedInput)&&Object.keys(b.speedInput).length===4&&b.speedInput.version===1&&b.speedInput.space==='view'&&b.speedInput.maximum===30&&b.speedInput.estimator==='grafettoEMA30ms')&&obj(r)&&r.mode==='buildUp'&&r.blendMode==='normal'&&r.accumulation==='directOver'&&(r.wetEdges??0)===0&&(r.burntEdges??0)===0&&!r.gammaCorrect&&!r.luminance
 &&obj(c)&&Object.keys(c).length===3&&c.version===1&&c.ignoreDistanceSpacing===true&&typeof c.rate==='number'&&Number.isFinite(c.rate)&&c.rate>0&&c.rate<=1000&&1000/c.rate<=320000000000&&Math.abs(1000/c.rate-Math.round(1000/c.rate))<1e-7
}
export function curveHostInterval167(nativeRate:number):number{if(!Number.isFinite(nativeRate)||nativeRate<=0||nativeRate>1000)throw RangeError('Curve167 native rate');const interval=Math.max(1,Math.floor(500/nativeRate));if(!Number.isSafeInteger(interval)||interval>320000000000)throw RangeError('Curve167 interval outside existing81 clock bound');return interval}
