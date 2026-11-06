import{MYPAINT_SCHEMA}from'./mypaintSchema.js'
export interface BrushMyPaint{version:1;kernel:'libmypaint-1.6.1';settings:{id:number;base:number;inputs:{id:number;points:[number,number][]}[]}[];baseRadius:number;erase:boolean}
export function isMyPaintDescriptor(d:Record<string,unknown>):boolean{
 if(d.mypaint===undefined)return true
 const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v),m=d.mypaint,b=d.behavior
 if(!object(m)||Object.keys(m).some(k=>!['version','kernel','settings','baseRadius','erase'].includes(k))||m.version!==1||m.kernel!=='libmypaint-1.6.1'||typeof m.baseRadius!=='number'||!Number.isFinite(m.baseRadius)||m.baseRadius<=0||m.baseRadius>800||typeof m.erase!=='boolean'||!Array.isArray(m.settings)||m.settings.length>64)return false
 const ids=new Set<number>();let points=0
 for(const setting of m.settings){
  if(!object(setting)||Object.keys(setting).length!==3||!Number.isInteger(setting.id)||typeof setting.id!=='number'||setting.id<0||setting.id>=MYPAINT_SCHEMA.settings.length||ids.has(setting.id))return false
  ids.add(setting.id);const meta=MYPAINT_SCHEMA.settings[setting.id]
  if(typeof setting.base!=='number'||!Number.isFinite(setting.base)||setting.base<meta.min||setting.base>meta.max||!Array.isArray(setting.inputs)||setting.inputs.length>MYPAINT_SCHEMA.inputs.length)return false
  // v1 native surface, recorded contact input only. Reject unsupported modes.
  if(meta.name==='paint_mode'&&(setting.base!==0||setting.inputs.length))return false
  const inputs=new Set<number>()
  for(const input of setting.inputs){
   if(!object(input)||Object.keys(input).length!==2||typeof input.id!=='number'||!Number.isInteger(input.id)||input.id<0||input.id>=MYPAINT_SCHEMA.inputs.length||inputs.has(input.id)||meta.constant||!Array.isArray(input.points)||input.points.length===1||input.points.length>64)return false
   inputs.add(input.id);let previous=-Infinity
   for(const p of input.points){if(!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e6)||p[0]<previous)return false;previous=p[0];points++}
  }
 }
 return points<=4096&&d.model==='stamp'&&d.paperInteraction===0&&d.mixer===undefined&&['clone','filter','deform','experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','scatter','texture','wet'].every(k=>d[k]===undefined)&&object(b)&&b.version===2&&b.dual===undefined&&(b.timing===undefined||object(b.timing)&&Object.keys(b.timing).length===3&&b.timing.version===1&&b.timing.rate===60&&b.timing.ignoreDistanceSpacing===false)&&b.wetMix===undefined&&b.taper===undefined
}
