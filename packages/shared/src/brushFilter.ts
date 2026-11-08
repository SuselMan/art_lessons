export interface SpatialBrushFilter{version:1;kind:'gaussian'|'unsharp';radiusX:number;radiusY:number;amount:number;threshold:number;lightnessOnly:boolean}
export interface FilterSmudge147 {smudgeMode:true;sourcePolicy:'canonical-begin-v1'}
type PointwiseBrushFilter={version:2;kind:'invert'}|{version:2;kind:'desaturate';type:0|1|2|3|4|5}|{version:2;kind:'posterize';steps:number}
export type BrushFilter=SpatialBrushFilter|PointwiseBrushFilter|(PointwiseBrushFilter&FilterSmudge147)
export function isPosterizeBrushFilter(value:unknown):value is Extract<BrushFilter,{kind:'posterize'}>{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>
 return (Object.keys(v).length===3&&Object.keys(v).every(k=>k==='version'||k==='kind'||k==='steps')||v.smudgeMode===true&&v.sourcePolicy==='canonical-begin-v1'&&Object.keys(v).length===5&&Object.keys(v).every(k=>['version','kind','steps','smudgeMode','sourcePolicy'].includes(k)))&&v.version===2&&v.kind==='posterize'&&typeof v.steps==='number'&&Number.isInteger(v.steps)&&v.steps>=2&&v.steps<=128
}
export function isFilterDescriptor(d:Record<string,unknown>):boolean{
 if(d.filter===undefined)return true
 const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v),f=d.filter,b=d.behavior,m=d.mixer,n=(v:unknown,a:number,z:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=z
 const smudge=record(f)&&f.smudgeMode===true&&f.sourcePolicy==='canonical-begin-v1',extra=smudge?2:0
 const shape=record(f)&&((Object.keys(f).every(k=>['version','kind','radiusX','radiusY','amount','threshold','lightnessOnly'].includes(k))&&f.version===1&&['gaussian','unsharp'].includes(String(f.kind))&&n(f.radiusX,0,16)&&n(f.radiusY,0,16)&&n(f.amount,0,5)&&n(f.threshold,0,255)&&typeof f.lightnessOnly==='boolean')||(f.version===2&&f.kind==='invert'&&Object.keys(f).length===2+extra&&Object.keys(f).every(k=>k==='version'||k==='kind'||smudge&&(k==='smudgeMode'||k==='sourcePolicy'))&&typeof d.version==='number'&&Number.isInteger(d.version)&&d.version>=95)||(f.version===2&&f.kind==='desaturate'&&Object.keys(f).length===3+extra&&Object.keys(f).every(k=>k==='version'||k==='kind'||k==='type'||smudge&&(k==='smudgeMode'||k==='sourcePolicy'))&&typeof f.type==='number'&&Number.isInteger(f.type)&&f.type>=0&&f.type<=5&&typeof d.version==='number'&&Number.isInteger(d.version)&&d.version>=99)||(isPosterizeBrushFilter(f)&&typeof d.version==='number'&&Number.isInteger(d.version)&&d.version>=117))
 const smudgeScope=!record(f)||f.smudgeMode===undefined&&f.sourcePolicy===undefined||smudge&&typeof d.version==='number'&&Number.isInteger(d.version)&&d.version>=147&&['invert','desaturate','posterize'].includes(String(f.kind))&&record(d.tip)&&((d.tip.kind==='round'&&d.tip.profile===undefined)||(d.tip.kind==='procedural'&&record(d.tip.profile)&&d.tip.profile.kind==='standard'&&d.tip.profile.shape==='ellipse'))&&['animation','color','material','imageSampling','autoShape','autoNoise'].every(k=>d.tip&&record(d.tip)&&d.tip[k]===undefined)&&record(b)&&b.erase!==true&&b.colorAdjustment===undefined&&b.scatter===undefined&&['clone','mypaint','tangentNormal'].every(k=>d[k]===undefined)
 return smudgeScope&&shape&&d.model==='mixer'&&record(m)&&m.source==='previousCanvas'&&m.algorithm===undefined&&m.foreground===undefined&&m.sampling===undefined&&m.paintThickness===undefined&&['deform','experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','scatter','texture','wet'].every(k=>d[k]===undefined)&&d.paperInteraction===0&&record(b)&&b.version===2&&b.dual===undefined&&b.timing===undefined&&b.wetMix===undefined&&b.taper===undefined&&(!record(f)||f.kind!=='posterize'||b.erase!==true)&&(!record(f)||f.kind!=='posterize'||['clone','mypaint','tangentNormal'].every(k=>d[k]===undefined))&&record(b.rendering)&&b.rendering.accumulation==='directOver'&&b.rendering.blendMode==='normal'&&b.rendering.wetEdges===0&&b.rendering.burntEdges===0
}

/** Exact pointwise carried filter device, not a translated smudge imprint. */
export function hasFilterSmudge147Scope(value:unknown):boolean {
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const d=value as Record<string,unknown>,f=d.filter
 return !!f&&typeof f==='object'&&!Array.isArray(f)&&(f as Record<string,unknown>).smudgeMode===true&&isFilterDescriptor(d)
}
