export interface BrushExperiment{version:1;displaceEnabled:boolean;displace:number;speedEnabled:boolean;speed:number;smoothingEnabled:boolean;smoothing:number;winding:boolean;hardEdge:boolean}
export function isBrushExperiment(value:unknown):value is BrushExperiment{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>,n=(x:unknown,a:number,b:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b
 return Object.keys(v).every(k=>['version','displaceEnabled','displace','speedEnabled','speed','smoothingEnabled','smoothing','winding','hardEdge'].includes(k))&&v.version===1&&n(v.displace,0,100)&&n(v.speed,0,100)&&n(v.smoothing,0,1000)&&['displaceEnabled','speedEnabled','smoothingEnabled','winding','hardEdge'].every(k=>typeof v[k]==='boolean')
}
export function isExperimentDescriptor(d:Record<string,unknown>):boolean{
 if(d.experiment===undefined)return true
 const b=d.behavior,t=d.tip,record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 return isBrushExperiment(d.experiment)&&d.model==='stamp'&&['mixer','particle','grid','hatching','sketch','spray','bristle','curveTrace','scatter','texture','wet'].every(k=>d[k]===undefined)&&d.paperInteraction===0&&record(t)&&t.kind==='round'&&t.aspect===1&&t.profile===undefined&&record(b)&&b.version===2&&b.dual===undefined&&b.timing===undefined&&b.wetMix===undefined&&b.taper===undefined&&record(b.rendering)&&b.rendering.accumulation==='directOver'&&b.rendering.blendMode==='normal'
}
