/** Existing legacy canvas feedback; Overlay belongs ONLY to foreground Color Rate. */
export function hasLegacyColorSmudgeOverlay154Scope(v:unknown):boolean{
 const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
 if(!obj(v)||!obj(v.mixer)||!obj(v.behavior)||!obj(v.tip))return false
 const m=v.mixer,b=v.behavior,t=v.tip,r=b.rendering
 if(!Number.isInteger(v.version)||Number(v.version)<154||v.model!=='mixer'||v.paperInteraction!==0||['wet','texture','scatter','spray','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].some(k=>v[k]!==undefined))return false
 if((m.source!=='previousCanvas'&&!(Number(v.version)>=178&&m.source==='projectionCanvas'&&m.sampling===undefined))||m.colorRateComposite!=='overlay'||m.load!==0||m.initialLoad!==0||Object.keys(m).some(k=>!['load','pickup','strength','initialLoad','smearAlpha','source','pickupDynamics','sampling','foreground','colorRateComposite'].includes(k)))return false
 if(obj(m.foreground)&&'gradient'in m.foreground)return false
 if(m.sampling!==undefined&&(!obj(m.sampling)||!['adaptiveMean','uniformMean'].includes(String(m.sampling.mode))))return false
 if(!['round','bitmap','procedural'].includes(String(t.kind))||['color','material','imageSampling','animation','autoNoise','autoShape'].some(k=>t[k]!==undefined))return false
 if(b.version!==2||Object.keys(b).some(k=>!['version','rendering','spacing','rotation','mirror','dynamics','modulations','strokeInput','speedInput','colorAdjustment','softness','falloff'].includes(k)))return false
 return obj(r)&&r.mode==='buildUp'&&r.blendMode==='normal'&&r.accumulation===undefined&&(r.wetEdges??0)===0&&(r.burntEdges??0)===0&&!r.gammaCorrect&&!r.luminance
}
