/** Constant-work scope check only, for already prepared logical-dab consumers.
 * Does NOT validate inventory rows, refs, padding or unequal dimensions.
 * Actual preparation must run isOriginalRgbaGih119 before mutable paint state. */
export function hasOriginalRgbaGih119Scope(value:unknown):boolean{
 const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!record(value)||typeof value.version!=='number'||!Number.isInteger(value.version)||value.version<119||value.model!=='stamp'||value.paperInteraction!==0||!record(value.tip)||!record(value.behavior))return false
 const d=value,t=d.tip as Record<string,unknown>,b=d.behavior as Record<string,unknown>,a=t.animation,c=t.color
 if(t.kind!=='bitmap'||!record(a)||!['angular','xtilt','ytilt','dimensions'].includes(String(a.mode))||!Array.isArray(a.frames)||a.frames.length<2||a.frames.length>256||!record(a.geometry)||a.geometry.version!==1||!Array.isArray(a.geometry.frames)||a.geometry.frames.length!==a.frames.length||!record(c)||Object.keys(c).length!==2||Object.keys(c).some(k=>k!=='planes'&&k!=='frames'))return false
 if(['profile','autoNoise','autoShape','imageSampling','material'].some(k=>t[k]!==undefined)||['mixer','wet','texture','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].some(k=>d[k]!==undefined)||record(d.scatter)&&Number(d.scatter.radius)>0)return false
 if(b.version!==2||['dual','timing','sequentialRandom','wetMix','edgeBleed','colorAdjustment'].some(k=>b[k]!==undefined)||b.erase===true||record(b.strokeInput)&&b.strokeInput.fanCorners!==undefined||!record(b.rendering)||b.rendering.blendMode!=='normal'||b.rendering.accumulation!=='directOver'||Number(b.rendering.wetEdges??0)!==0||Number(b.rendering.burntEdges??0)!==0)return false
 return !['dynamics','modulations'].some(section=>record(b[section])&&['hue','saturation','brightness','sharpness'].some(k=>(b[section] as Record<string,unknown>)[k]!==undefined))
}

/** Full bounded metadata eligibility, used by shared admission and actual
 * prepareVariableGih before paint state/resources. No pixel reads or cache. */
export function isOriginalRgbaGih119(value:unknown):boolean{
 if(!hasOriginalRgbaGih119Scope(value))return false
 const d=value as Record<string,unknown>,t=d.tip as Record<string,unknown>,a=t.animation as Record<string,unknown>,c=t.color as Record<string,unknown>
 const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 const ref=(v:unknown)=>typeof v==='string'&&/^asset:[a-f0-9]{64}$/.test(v),tuple=(v:unknown):v is string[]=>Array.isArray(v)&&v.length===3&&v.every(ref)
 const rgb=c.frames,rows=(a.geometry as Record<string,unknown>).frames as unknown[]
 if(!(a.frames as unknown[]).every(ref)||!tuple(c.planes)||!Array.isArray(rgb)||rgb.length!==(a.frames as unknown[]).length||!rgb.every(tuple)||rgb[0].some((v,i)=>v!==(c.planes as string[])[i]))return false
 if(!rows.every(v=>record(v)&&Number.isInteger(v.sourceWidth)&&Number(v.sourceWidth)>=1&&Number(v.sourceWidth)<=2048&&Number.isInteger(v.sourceHeight)&&Number(v.sourceHeight)>=1&&Number(v.sourceHeight)<=2048&&record(v.maskBounds)))return false
 const first=rows[0] as Record<string,unknown>
 if(!rows.some(v=>(v as Record<string,unknown>).sourceWidth!==first.sourceWidth||(v as Record<string,unknown>).sourceHeight!==first.sourceHeight))return false
 return true
}
