export interface BrushExperiment{version:1;displaceEnabled:boolean;displace:number;speedEnabled:boolean;speed:number;smoothingEnabled:boolean;smoothing:number;winding:boolean;hardEdge:boolean;fill?:'canvasPattern';patternPolicy?:'captured-world-repeat-v1'}
export function isBrushExperiment(value:unknown):value is BrushExperiment{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>,n=(x:unknown,a:number,b:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b
 return Object.keys(v).every(k=>['version','displaceEnabled','displace','speedEnabled','speed','smoothingEnabled','smoothing','winding','hardEdge','fill','patternPolicy'].includes(k))&&((v.fill===undefined&&v.patternPolicy===undefined)||(v.fill==='canvasPattern'&&v.patternPolicy==='captured-world-repeat-v1'))&&v.version===1&&n(v.displace,0,100)&&n(v.speed,0,100)&&n(v.smoothing,0,1000)&&['displaceEnabled','speedEnabled','smoothingEnabled','winding','hardEdge'].every(k=>typeof v[k]==='boolean')
}
export function isExperimentDescriptor(d:Record<string,unknown>):boolean{
 if(d.experiment===undefined)return true
 const b=d.behavior,t=d.tip,record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 return isBrushExperiment(d.experiment)&&(d.experiment.fill===undefined||typeof d.version==='number'&&d.version>=158)&&d.model==='stamp'&&['mixer','particle','grid','hatching','sketch','spray','bristle','curveTrace','scatter','texture','wet'].every(k=>d[k]===undefined)&&d.paperInteraction===0&&record(t)&&t.kind==='round'&&t.aspect===1&&t.profile===undefined&&record(b)&&b.version===2&&b.dual===undefined&&b.timing===undefined&&b.wetMix===undefined&&b.taper===undefined&&record(b.rendering)&&b.rendering.accumulation==='directOver'&&b.rendering.blendMode==='normal'
}

export function hasExperimentCurrentPattern158Scope(value:unknown):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const d=value as Record<string,unknown>
 return ['mixer','particle','grid','hatching','sketch','spray','bristle','curveTrace','scatter','texture','wet','deform','filter','clone','mypaint','tangentNormal'].every(k=>d[k]===undefined)&&isExperimentDescriptor(d)&&d.behavior!==null&&typeof d.behavior==='object'&&Object.keys(d.behavior).every(k=>['version','rendering'].includes(k))&&!!(d.behavior as Record<string,unknown>).rendering&&Object.entries((d.behavior as {rendering:Record<string,unknown>}).rendering).every(([k,v])=>k!=='wetEdges'&&k!=='burntEdges'||v===0)&&isBrushExperiment(d.experiment)&&d.experiment.fill==='canvasPattern'&&d.experiment.patternPolicy==='captured-world-repeat-v1'&&Number(d.version)>=158
}
