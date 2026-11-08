/** Clone reads the frozen pre-stroke layer. External source coordinates live
 * in the immutable gesture context, never in the reusable preset. */
export interface BrushClone {version:1;moveSourcePoint:boolean;source?:'projectionCanvas';sourcePolicy?:'canonical-begin-v1';healing?:'lab-ratio-v1'}
export function isCloneDescriptor(d:Record<string,unknown>):boolean{
 if(d.clone===undefined)return true
 if(d.clone&&typeof d.clone==='object'&&'healing'in d.clone)return hasCloneHealing152Scope(d)
 const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v),c=d.clone,b=d.behavior
 const projection=record(c)&&(c.source!==undefined||c.sourcePolicy!==undefined)
 return record(c)&&Object.keys(c).length===(projection?4:2)&&Object.keys(c).every(k=>['version','moveSourcePoint',...(projection?['source','sourcePolicy']:[])].includes(k))&&c.version===1&&typeof c.moveSourcePoint==='boolean'
  &&(!projection||typeof d.version==='number'&&Number.isInteger(d.version)&&d.version>=149&&c.source==='projectionCanvas'&&c.sourcePolicy==='canonical-begin-v1'&&record(b)&&b.erase!==true&&record(d.tip)&&['color','material','imageSampling','animation','autoNoise'].every(k=>(d.tip as Record<string,unknown>)[k]===undefined)&&['mypaint','tangentNormal'].every(k=>d[k]===undefined))
  &&d.model==='stamp'&&d.paperInteraction===0&&d.mixer===undefined
  &&['filter','deform','experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','scatter','texture','wet'].every(k=>d[k]===undefined)
  &&record(b)&&b.version===2&&b.dual===undefined&&b.timing===undefined&&b.wetMix===undefined&&b.taper===undefined
  &&record(b.rendering)&&b.rendering.accumulation==='directOver'&&b.rendering.blendMode==='normal'&&b.rendering.wetEdges===0&&b.rendering.burntEdges===0
}

/** Immutable merged source admitted only through the canonical-BEGIN runtime. */
export function hasCloneProjection149Scope(value:unknown):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const d=value as Record<string,unknown>,c=d.clone
 return !!c&&typeof c==='object'&&!Array.isArray(c)&&(c as Record<string,unknown>).healing===undefined&&(c as Record<string,unknown>).source==='projectionCanvas'&&isCloneDescriptor(d)
}

/** One immutable local/merged BEGIN source; one whole-request Lab ratio solve. */
export function hasCloneHealing152Scope(v:unknown):boolean{
 const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
 if(!obj(v)||!obj(v.clone)||!obj(v.behavior)||!obj(v.tip))return false
 const c=v.clone,b=v.behavior,t=v.tip,r=b.rendering
 if(Object.keys(c).length!==(c.source===undefined?4:5)||Object.keys(c).some(k=>!['version','moveSourcePoint','sourcePolicy','healing','source'].includes(k))||c.version!==1||typeof c.moveSourcePoint!=='boolean'||c.healing!=='lab-ratio-v1'||c.sourcePolicy!=='canonical-begin-v1'||c.source!==undefined&&c.source!=='projectionCanvas')return false
 if(!Number.isInteger(v.version)||Number(v.version)<152||v.model!=='stamp'||v.paperInteraction!==0||['mixer','scatter','texture','wet','filter','deform','experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','mypaint','tangentNormal'].some(k=>v[k]!==undefined))return false
 if(!['round','bitmap','procedural'].includes(String(t.kind))||['color','material','imageSampling','animation','autoNoise','autoShape'].some(k=>t[k]!==undefined))return false
 if(b.version!==2||Object.keys(b).some(k=>!['version','rendering','spacing','rotation','mirror','dynamics','modulations','strokeInput','speedInput','falloff','softness'].includes(k)))return false
 if(['dynamics','modulations'].some(k=>{const x=b[k];return obj(x)&&['hue','saturation','brightness','lightnessStrength'].some(h=>x[h]!==undefined)}))return false
 return obj(r)&&r.mode==='buildUp'&&r.accumulation==='directOver'&&r.blendMode==='normal'&&(r.wetEdges??0)===0&&(r.burntEdges??0)===0&&!r.luminance&&!r.gammaCorrect
}
