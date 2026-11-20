/** Closed captured foreground-erase capability. Full schema/CAS checks stay with their owners. */
export function hasSmudgeTextureErase131Scope(value:unknown,requireVersion=true):boolean {
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!obj(value))return false
 const d=value,t=d.tip,m=d.mixer,b=d.behavior,x=d.texture
 if(requireVersion&&(typeof d.version!=='number'||!Number.isInteger(d.version)||d.version<131))return false
 if(d.model!=='mixer'||d.paperInteraction!==0||!obj(t)||!obj(m)||!obj(b)||!obj(x))return false
 if(t.kind!=='bitmap'||['animation','color','material','imageSampling','profile','autoNoise','autoShape'].some(k=>k in t))return false
 if(['wet','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].some(k=>k in d)||['dual','timing','sequentialRandom','strokeInput','wetMix','taper','colorAdjustment','edgeBleed','grain'].some(k=>k in b))return false
 if(b.erase!==true||m.algorithm!=='krita-mask'||m.source!=='previousCanvas'||m.colorRateComposite!=='erase'||m.load!==0||m.initialLoad!==0||m.strength!==1||'paintThickness'in m)return false
 if(Object.keys(m).some(k=>!['load','initialLoad','pickup','strength','smearAlpha','source','algorithm','colorRateComposite','foreground','sampling','pickupDynamics'].includes(k)))return false
 if('foreground'in m&&(!obj(m.foreground)||'gradient'in m.foreground))return false
 if('sampling'in m&&(!obj(m.sampling)||m.sampling.mode!=='maskMean'))return false
 const render=b.rendering,a=x.application
 if(!obj(render)||render.mode!=='buildUp'||render.blendMode!=='normal'||render.wetEdges!==0||render.burntEdges!==0||'accumulation'in render)return false
 if('material'in x||typeof x.eraseId!=='string'||typeof x.id!=='string'||!obj(a)||!['multiply','subtract'].includes(String(a.mode))||typeof a.soft!=='boolean'||Object.keys(a).some(k=>!['mode','soft'].includes(k)))return false
 return true
}
