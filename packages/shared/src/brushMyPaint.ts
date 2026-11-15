import {isStationary195Structure,type BrushStructurePolicy} from './brushStructurePolicy.js'
import{MYPAINT_SCHEMA}from'./mypaintSchema.js'
export interface BrushMyPaint{version:1;kernel:'libmypaint-1.6.1';surfacePolicy?:'krita-legacy-v1';settings:{id:number;base:number;inputs:{id:number;points:[number,number][]}[]}[];baseRadius:number;erase:boolean}
export function isMyPaintDescriptor(d:Record<string,unknown>,policy?:BrushStructurePolicy):boolean{
 const stationary=isStationary195Structure(d,policy)
 if(d.mypaint===undefined)return true
 const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v),m=d.mypaint,b=d.behavior
 if(!object(m)||Object.keys(m).some(k=>!['version','kernel','settings','baseRadius','erase','surfacePolicy'].includes(k))||m.version!==1||m.kernel!=='libmypaint-1.6.1'||typeof m.baseRadius!=='number'||!Number.isFinite(m.baseRadius)||m.baseRadius<=0||m.baseRadius>800||typeof m.erase!=='boolean'||!Array.isArray(m.settings)||m.settings.length>64)return false
 const timer177=isMyPaintTimer177Header(d,policy),legacy156=(d.version===156||stationary)&&m.surfacePolicy==='krita-legacy-v1'
 if(d.version===177&&!timer177)return false
 if(m.surfacePolicy!==undefined&&!legacy156&&!timer177||d.version===156&&!legacy156)return false
 const ids=new Set<number>();let points=0
 for(const setting of m.settings){
  if(!object(setting)||Object.keys(setting).length!==3||!Number.isInteger(setting.id)||typeof setting.id!=='number'||setting.id<0||setting.id>=MYPAINT_SCHEMA.settings.length||ids.has(setting.id))return false
  ids.add(setting.id);const meta=MYPAINT_SCHEMA.settings[setting.id]
  if(typeof setting.base!=='number'||!Number.isFinite(setting.base)||setting.base<meta.min||setting.base>meta.max||!Array.isArray(setting.inputs)||setting.inputs.length>MYPAINT_SCHEMA.inputs.length)return false
  // v1 native surface, recorded contact input only. Reject unsupported modes.
  if(!legacy156&&!timer177&&meta.name==='paint_mode'&&(setting.base!==0||setting.inputs.length))return false
  const inputs=new Set<number>()
  for(const input of setting.inputs){
   if(!object(input)||Object.keys(input).length!==2||typeof input.id!=='number'||!Number.isInteger(input.id)||input.id<0||input.id>=MYPAINT_SCHEMA.inputs.length||inputs.has(input.id)||meta.constant||!Array.isArray(input.points)||input.points.length===1||input.points.length>64)return false
   inputs.add(input.id);let previous=-Infinity
   for(const p of input.points){if(!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e6)||p[0]<previous)return false;previous=p[0];points++}
  }
 }
 return points<=4096&&d.model==='stamp'&&d.paperInteraction===0&&d.mixer===undefined&&['clone','filter','deform','experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','scatter','texture','wet'].every(k=>d[k]===undefined)&&object(b)&&b.version===2&&b.dual===undefined&&(stationary||timer177||b.timing===undefined||object(b.timing)&&Object.keys(b.timing).length===3&&b.timing.version===1&&b.timing.rate===60&&b.timing.ignoreDistanceSpacing===false)&&b.wetMix===undefined&&b.taper===undefined
}

/**177 is ONLY the nativeKPP host clock; libmypaint's internal rate is separate. */
function isMyPaintTimer177Header(value:unknown,policy?:BrushStructurePolicy):boolean {
 const stationary=isStationary195Structure(value,policy)
 const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
 if(!obj(value)||value.version!==177||value.model!=='stamp'||value.paperInteraction!==0||!obj(value.mypaint)||value.mypaint.surfacePolicy!=='krita-legacy-v1'||!obj(value.behavior)||!obj(value.tip))return false
 const b=value.behavior,t=b.timing,s=b.spacing,tip=value.tip
 if(b.version!==2||Object.keys(b).some(k=>!['version',...(stationary?['timing']:[]),'rendering','timing','spacing'].includes(k))||!obj(t)||Object.keys(t).length!==3||t.version!==1||typeof t.rate!=='number'||!Number.isFinite(t.rate)||t.rate<0||t.rate>1000||typeof t.ignoreDistanceSpacing!=='boolean')return false
 if(!obj(s)||Object.keys(s).length!==3||s.mode!=='kritaAuto'||s.coefficient!==1||s.isotropic!==false)return false
 const render=b.rendering
 if(!obj(render)||render.mode!=='buildUp'||render.blendMode!=='normal'||render.accumulation!=='directOver'||(render.wetEdges??0)!==0||(render.burntEdges??0)!==0||render.gammaCorrect||render.luminance)return false
 if(tip.kind!=='round'||tip.aspect!==1||['mask','color','profile','material','imageSampling','animation','autoNoise','autoShape'].some(k=>tip[k]!==undefined))return false
 const identity=(x:unknown):boolean=>Array.isArray(x)&&x.length===2&&x.every((v,i)=>Array.isArray(v)&&v.length===2&&v[0]===i&&v[1]===1)
 return identity(value.sizeByPressure)&&identity(value.opacityByPressure)&&identity(value.flowByPressure)
}
export function hasMyPaintTimer177Scope(value:unknown,policy?:BrushStructurePolicy):boolean {
 const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
 return obj(value)&&isMyPaintTimer177Header(value,policy)&&isMyPaintDescriptor(value,policy)
}
