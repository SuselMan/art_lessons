import {isBrushBehavior,type BrushDynamic} from './brushBehavior.js'
/** Connections between canonical author input points within one gesture. */
export interface BrushSketch {
 version:1
 mode:'simple'|'mask'
 maskSize?:readonly[number,number]
 width:number
 offset:number
 probability:number
 connect:boolean
 magnetify:boolean
 randomRGB:boolean
 randomOpacity:boolean
 distanceDensity:boolean
 distanceOpacity:boolean
 /** Explicit functional policy for negative rectangular-mask corners. */
 distanceOpacityPolicy?:'generic-clamp-v1'
 antialias:boolean
 dynamics?:{width?:BrushDynamic[];offset?:BrushDynamic[];probability?:BrushDynamic[]}
}
export function isBrushSketch(value:unknown):value is BrushSketch{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>,number=(x:unknown,lo:number,hi:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=lo&&x<=hi
 if(Object.keys(v).some(k=>!['version','mode','width','offset','probability','connect','magnetify','randomRGB','randomOpacity','distanceDensity','distanceOpacity','antialias','dynamics','maskSize','distanceOpacityPolicy'].includes(k)))return false
 if(v.version!==1||(v.mode!=='simple'&&v.mode!=='mask')||!number(v.width,.01,1000)||!number(v.offset,-10,10)||!number(v.probability,0,1)||!['connect','magnetify','randomRGB','randomOpacity','distanceDensity','distanceOpacity','antialias'].every(k=>typeof v[k]==='boolean'))return false
 if(v.mode==='simple'?v.maskSize!==undefined:!Array.isArray(v.maskSize)||v.maskSize.length!==2||!v.maskSize.every(n=>number(n,1,256)&&Number.isInteger(n)) )return false
 if(v.mode==='mask'&&v.distanceOpacity?v.distanceOpacityPolicy!=='generic-clamp-v1':v.distanceOpacityPolicy!==undefined)return false
 if(v.dynamics!==undefined){
  if(!v.dynamics||typeof v.dynamics!=='object'||Array.isArray(v.dynamics))return false
  for(const [key,controls]of Object.entries(v.dynamics))if(!['width','offset','probability'].includes(key)||!isBrushBehavior({version:2,modulations:{size:controls}}))return false
 }
 return true
}

/** Closed static-rate simple Sketch author timer; no replay resampling. */
export function hasSketchTimer161Scope(value:unknown):boolean{
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!obj(value)||!obj(value.tip)||!obj(value.behavior)||!isBrushSketch(value.sketch)||value.sketch.mode!=='simple')return false
 const t=value.tip,b=value.behavior,r=b.rendering,c=b.timing
 const one=(v:unknown)=>Array.isArray(v)&&v.length>=2&&v.every(p=>Array.isArray(p)&&p.length===2&&typeof p[0]==='number'&&Number.isFinite(p[0])&&p[0]>=0&&p[0]<=1&&p[1]===1)
 return Number.isInteger(value.version)&&Number(value.version)>=161&&value.model==='stamp'&&value.paperInteraction===0&&value.flow===1&&value.flowPer==='stamp'&&one(value.flowByPressure)
 &&['mixer','spray','bristle','particle','curveTrace','hatching','grid','experiment','deform','filter','clone','mypaint','tangentNormal','scatter','texture','wet','screentonePx'].every(k=>value[k]===undefined)
 &&t.kind==='round'&&t.aspect===1&&t.hardness===1&&t.rotation==='fixed'&&t.angle===0&&Object.keys(t).every(k=>['kind','hardness','aspect','rotation','angle'].includes(k))
 &&b.version===2&&Object.keys(b).every(k=>['version','rendering','timing','speedInput'].includes(k))&&(b.speedInput===undefined||obj(b.speedInput)&&Object.keys(b.speedInput).length===4&&b.speedInput.version===1&&b.speedInput.space==='view'&&b.speedInput.maximum===30&&b.speedInput.estimator==='grafettoEMA30ms')&&obj(r)&&r.mode==='buildUp'&&r.blendMode==='normal'&&r.accumulation==='directOver'&&(r.wetEdges??0)===0&&(r.burntEdges??0)===0&&!r.gammaCorrect&&!r.luminance
 &&obj(c)&&Object.keys(c).every(k=>['version','rate','ignoreDistanceSpacing'].includes(k))&&c.version===1&&typeof c.rate==='number'&&Number.isFinite(c.rate)&&c.rate>0&&c.rate<=1000&&c.ignoreDistanceSpacing===false
}
