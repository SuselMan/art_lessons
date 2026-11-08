/** Closed source-time129 capability, not a full descriptor or loaded-CAS validator. */
export function hasLegacySmudgeTiming129Scope(value:unknown,requireTiming=true):boolean {
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!obj(value))return false
 const d=value,t=d.tip,m=d.mixer,b=d.behavior
 if(d.paperInteraction!==0||d.model!=='mixer'||!obj(t)||!obj(m)||!obj(b)||m.source!=='previousCanvas'||m.load!==0||m.initialLoad!==0||m.strength!==1)return false
 if(['wet','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].some(k=>k in d)||['dual','erase','wetMix','taper','sequentialRandom','strokeInput','colorAdjustment','edgeBleed','grain'].some(k=>k in b))return false
 if(Object.keys(m).some(k=>!['load','initialLoad','pickup','strength','smearAlpha','source','pickupDynamics'].includes(k))||t.kind!=='bitmap'||['color','material','imageSampling','profile','autoNoise','autoShape'].some(k=>k in t))return false
 const render=b.rendering
 if(!obj(render)||render.mode!=='buildUp'||render.wetEdges!==0||render.burntEdges!==0||render.blendMode!=='normal'||render.accumulation!==undefined)return false
 const texture=d.texture
 if(texture!==undefined&&(!obj(texture)||'material'in texture||'eraseId'in texture||!obj(texture.application)||texture.application.mode!=='multiply'||texture.application.soft!==false))return false
 const a=t.animation
 if(a!==undefined&&(!obj(a)||!['random','incremental'].includes(String(a.mode))||!Array.isArray(a.frames)||a.frames.length<2||a.frames.length>256||Object.keys(a).some(k=>!['mode','frames'].includes(k))))return false
 const pickup=m.pickupDynamics
 if(pickup!==undefined&&(!Array.isArray(pickup)||pickup.length>4||pickup.some(c=>!obj(c)||!['pressure','off'].includes(String(c.control))||'combine'in c||'randomSource'in c)))return false
 if(requireTiming){const timing=b.timing;if(typeof d.version!=='number'||!Number.isInteger(d.version)||d.version<129||!obj(timing)||timing.version!==1||typeof timing.rate!=='number'||!Number.isFinite(timing.rate)||timing.rate<0||timing.rate>1000||timing.ignoreDistanceSpacing!==false||Object.keys(timing).some(k=>!['version','rate','ignoreDistanceSpacing'].includes(k)))return false}
 return true
}
