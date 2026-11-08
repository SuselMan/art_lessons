export interface BrushDeform{version:1;sourcePolicy?:'canonical-begin-v1';mode:1|2|3|4|5|6|7|8;amount:number;counter:boolean;bilinear:boolean;density:number;jitter:number;baseScale:number}
export function isBrushDeform(value:unknown):value is BrushDeform{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>,n=(x:unknown,a:number,b:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b
 return Object.keys(v).every(k=>['version','sourcePolicy','mode','amount','counter','bilinear','density','jitter','baseScale'].includes(k))&&v.version===1&&(v.sourcePolicy===undefined||v.sourcePolicy==='canonical-begin-v1')&&Number.isInteger(v.mode)&&n(v.mode,1,8)&&n(v.amount,0,1)&&n(v.density,0,1)&&n(v.jitter,0,10)&&n(v.baseScale,.01,10)&&typeof v.counter==='boolean'&&typeof v.bilinear==='boolean'
}
export function isDeformDescriptor(d:Record<string,unknown>):boolean{
 if(d.deform===undefined)return true
 const b=d.behavior,m=d.mixer,record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 return isBrushDeform(d.deform)&&(d.deform.sourcePolicy===undefined||d.version===145)&&d.model==='mixer'&&record(m)&&m.source==='previousCanvas'&&m.algorithm===undefined&&m.sampling===undefined&&m.foreground===undefined&&m.paintThickness===undefined&&['experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','scatter','texture','wet'].every(k=>d[k]===undefined)&&d.paperInteraction===0&&record(b)&&b.version===2&&(d.deform.sourcePolicy===undefined||b.erase===undefined)&&b.dual===undefined&&b.timing===undefined&&b.wetMix===undefined&&b.taper===undefined&&record(b.rendering)&&b.rendering.accumulation==='directOver'&&b.rendering.blendMode==='normal'&&b.rendering.wetEdges===0&&b.rendering.burntEdges===0
}

/** Transaction-source opt-in; old current-data Deform remains unchanged. */
export function hasDeformOldData145Scope(value:unknown):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const d=value as Record<string,unknown>
 return ['clone','mypaint','tangentNormal','filter'].every(k=>d[k]===undefined)&&d.version===145&&isDeformDescriptor(d)&&!!d.deform&&(d.deform as BrushDeform).sourcePolicy==='canonical-begin-v1'
}
