/** Closed local legacy smearing: min/max belongs ONLY to foreground Color Rate. */
import{isBrushBehavior}from'./brushBehavior.js'
export function hasLegacyColorSmudgeMinMax172Scope(v:unknown):boolean{
 const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
 if(!obj(v)||!obj(v.mixer)||!obj(v.behavior)||!obj(v.tip))return false
 const m=v.mixer,b=v.behavior,t=v.tip,r=b.rendering
 const finite=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1
 const controls=(x:unknown,depth=0):boolean=>depth<=12&&(Array.isArray(x)?x.every(v=>controls(v,depth+1)):obj(x)?(!('control'in x)||typeof x.control==='string')&&Object.values(x).every(v=>controls(v,depth+1)):true)
 if(!finite(m.pickup)||!finite(m.strength)||!controls(b)||!controls(m))return false
 if(!Number.isInteger(v.version)||Number(v.version)<172||v.model!=='mixer'||v.paperInteraction!==0||['wet','texture','scatter','spray','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].some(k=>v[k]!==undefined))return false
 if((m.source!=='previousCanvas'&&!(Number(v.version)>=178&&m.source==='projectionCanvas'&&m.sampling===undefined))||(typeof m.colorRateComposite!=='string'||!['darken','lighten'].includes(m.colorRateComposite))||m.load!==0||m.initialLoad!==0||Object.keys(m).some(k=>!['load','pickup','strength','initialLoad','smearAlpha','source','pickupDynamics','sampling','foreground','colorRateComposite'].includes(k)))return false
 if(m.smearAlpha!==undefined&&typeof m.smearAlpha!=='boolean')return false
 if(m.foreground!==undefined&&(!obj(m.foreground)||Object.keys(m.foreground).some(k=>!['rate','dynamics'].includes(k))||typeof m.foreground.rate!=='number'||!Number.isFinite(m.foreground.rate)||m.foreground.rate<0||m.foreground.rate>1||m.foreground.dynamics!==undefined&&!isBrushBehavior({version:2,modulations:{flow:m.foreground.dynamics}})))return false
 if(m.pickupDynamics!==undefined&&!isBrushBehavior({version:2,modulations:{flow:m.pickupDynamics}}))return false
 if(m.sampling!==undefined)return false
 if(typeof t.kind!=='string'||!['round','bitmap','procedural'].includes(t.kind)||['color','material','imageSampling','animation','autoNoise','autoShape'].some(k=>t[k]!==undefined))return false
 if(b.version!==2||!isBrushBehavior(b)||Object.keys(b).some(k=>!['version','rendering','spacing','rotation','mirror','dynamics','modulations','strokeInput','speedInput','colorAdjustment','softness','falloff'].includes(k)))return false
 return obj(r)&&r.mode==='buildUp'&&r.blendMode==='normal'&&r.accumulation===undefined&&(r.wetEdges??0)===0&&(r.burntEdges??0)===0&&!r.gammaCorrect&&!r.luminance
}
