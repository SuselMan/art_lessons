/** Constant-work scope check only, for already prepared logical-dab consumers.
 * Does NOT validate inventory rows, refs, padding or unequal dimensions.
 * Actual preparation must run isOriginalRgbaGih119 before mutable paint state. */
function hasOriginalSensorRgbaScope(value:unknown,minVersion:number,geometry:boolean,lightness=false):boolean{
 const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!record(value)||typeof value.version!=='number'||!Number.isInteger(value.version)||value.version<minVersion||value.model!=='stamp'||value.paperInteraction!==0||!record(value.tip)||!record(value.behavior))return false
 const d=value,t=d.tip as Record<string,unknown>,b=d.behavior as Record<string,unknown>,a=t.animation,c=t.color
 if(t.kind!=='bitmap'||!record(a)||!['angular','xtilt','ytilt','dimensions'].includes(String(a.mode))||!Array.isArray(a.frames)||a.frames.length<2||a.frames.length>256||!lightness&&(!record(c)||Object.keys(c).length!==2||Object.keys(c).some(k=>k!=='planes'&&k!=='frames')))return false
 const material=t.material
 if(lightness&&(t.color!==undefined||!record(material)||Object.keys(material).some(k=>!['kind','gray','grayFrames','strength'].includes(k))||material.kind!=='lightness'||!Array.isArray(material.grayFrames)||material.grayFrames.length!==a.frames.length))return false
 if(geometry?(!record(a.geometry)||a.geometry.version!==1||!Array.isArray(a.geometry.frames)||a.geometry.frames.length!==a.frames.length):a.geometry!==undefined)return false
 if(['profile','autoNoise','autoShape','imageSampling',...(lightness?[]:['material'])].some(k=>t[k]!==undefined)||['mixer','wet','texture','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].some(k=>d[k]!==undefined)||record(d.scatter)&&Number(d.scatter.radius)>0)return false
 if(b.version!==2||['dual','timing','sequentialRandom','wetMix','edgeBleed','colorAdjustment'].some(k=>b[k]!==undefined)||b.erase===true||record(b.strokeInput)&&b.strokeInput.fanCorners!==undefined||!record(b.rendering)||b.rendering.blendMode!=='normal'||b.rendering.accumulation!=='directOver'||Number(b.rendering.wetEdges??0)!==0||Number(b.rendering.burntEdges??0)!==0)return false
 return !['dynamics','modulations'].some(section=>record(b[section])&&['hue','saturation','brightness','sharpness'].some(k=>(b[section] as Record<string,unknown>)[k]!==undefined))
}

/** Scope only: constant work per logical dab; inventory validates in preparation. */
export function hasOriginalRgbaGih119Scope(value:unknown):boolean{return hasOriginalSensorRgbaScope(value,119,true)}
export function hasEqualOriginalRgbaGih121Scope(value:unknown):boolean{return hasOriginalSensorRgbaScope(value,121,false)}
function hasOriginalRgbInventory(a:Record<string,unknown>,c:Record<string,unknown>):boolean{
 const ref=(v:unknown)=>typeof v==='string'&&/^asset:[a-f0-9]{64}$/.test(v),tuple=(v:unknown):v is string[]=>Array.isArray(v)&&v.length===3&&v.every(ref)
 const rgb=c.frames
 if(!(a.frames as unknown[]).every(ref)||!tuple(c.planes)||!Array.isArray(rgb)||rgb.length!==(a.frames as unknown[]).length||!rgb.every(tuple)||rgb[0].some((v,i)=>v!==(c.planes as string[])[i]))return false
 return true
}
/** Equal121 metadata eligibility only. Equal physical CAS sides are checked by
 * library/portable admission and loaded preparation, not inferred from IDs. */
export function isEqualOriginalRgbaGih121(value:unknown):boolean{
 if(!hasEqualOriginalRgbaGih121Scope(value))return false
 const d=value as Record<string,unknown>,t=d.tip as Record<string,unknown>
 return hasEqualSensorPolicy(t,d.behavior as Record<string,unknown>)&&hasOriginalRgbInventory(t.animation as Record<string,unknown>,t.color as Record<string,unknown>)
}
/** Full bounded metadata eligibility, used by shared admission and actual
 * prepareVariableGih before paint state/resources. No pixel reads or cache. */
export function isOriginalRgbaGih119(value:unknown):boolean{
 if(!hasOriginalRgbaGih119Scope(value))return false
 const d=value as Record<string,unknown>,t=d.tip as Record<string,unknown>,a=t.animation as Record<string,unknown>,c=t.color as Record<string,unknown>
 const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!hasOriginalRgbInventory(a,c))return false
 const rows=(a.geometry as Record<string,unknown>).frames as unknown[]
 if(!rows.every(v=>record(v)&&Number.isInteger(v.sourceWidth)&&Number(v.sourceWidth)>=1&&Number(v.sourceWidth)<=2048&&Number.isInteger(v.sourceHeight)&&Number(v.sourceHeight)>=1&&Number(v.sourceHeight)<=2048&&record(v.maskBounds)))return false
 const first=rows[0] as Record<string,unknown>
 if(!rows.some(v=>(v as Record<string,unknown>).sourceWidth!==first.sourceWidth||(v as Record<string,unknown>).sourceHeight!==first.sourceHeight))return false
 return true
}

/** Full policy checks are once per preflight, never per logical dab. */
function hasEqualSensorPolicy(t:Record<string,unknown>,b:Record<string,unknown>):boolean{
 const a=t.animation as Record<string,unknown>,frames=a.frames as unknown[]
 if(frames[0]!==t.mask||Object.keys(a).some(k=>!['mode','frames','rank','cursorPolicy','roundingPolicy','dimensions','randomPolicy'].includes(k)))return false
 const dims=a.mode==='dimensions'?a.dimensions:undefined,integerRank=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>=2&&v<=256
 if(a.mode==='dimensions'){
  if(a.rank!==undefined||!Array.isArray(dims)||dims.length<2||dims.length>4||!dims.every(v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===2&&['constant','pressure','velocity','angular','xtilt','ytilt','random','incremental'].includes(String(v.mode))&&integerRank(v.rank)))return false
  if(dims.every(v=>v.mode==='constant')||dims.reduce((n,v)=>n*Number(v.rank),1)>256||frames.length>dims.reduce((n,v)=>n*Number(v.rank),1))return false
 }else if(!integerRank(a.rank)||frames.length>Number(a.rank)||a.dimensions!==undefined||a.randomPolicy!==undefined)return false
 const uses=(mode:string)=>a.mode===mode||Array.isArray(dims)&&dims.some(v=>v.mode===mode),angular=uses('angular'),tilt=uses('xtilt')||uses('ytilt'),random=uses('random')
 if(angular?a.cursorPolicy!=='first-request-v1':a.cursorPolicy!==undefined)return false
 if(tilt?a.roundingPolicy!=='qt5-half-up-v1':a.roundingPolicy!==undefined)return false
 if(random?a.randomPolicy!=='grafetto-dim-stream-v1':a.randomPolicy!==undefined)return false
 if(angular){const input=b.strokeInput as Record<string,unknown>|undefined;if(!input||input.version!==1||input.initialDirection!=='cursorHistory')return false}
 if(uses('velocity')){const speed=b.speedInput as Record<string,unknown>|undefined;if(!speed||speed.version!==1||speed.space!=='view'||speed.maximum!==30||speed.estimator!=='grafettoEMA30ms')return false}
 return true
}
/** Fixed-scope123 only, not inventory/asset readiness authority. */
export function hasEqualLightnessGih123Scope(value:unknown):boolean{return hasOriginalSensorRgbaScope(value,123,false,true)}
export function isEqualLightnessGih123(value:unknown):boolean{
 if(!hasEqualLightnessGih123Scope(value))return false
 const d=value as Record<string,unknown>,t=d.tip as Record<string,unknown>,a=t.animation as Record<string,unknown>,m=t.material as Record<string,unknown>,frames=a.frames as unknown[],gray=m.grayFrames
 const ref=(v:unknown)=>typeof v==='string'&&/^asset:[a-f0-9]{64}$/.test(v)
 return hasEqualSensorPolicy(t,d.behavior as Record<string,unknown>)&&frames.every(ref)&&ref(m.gray)&&Array.isArray(gray)&&gray.length===frames.length&&gray.every(ref)&&gray[0]===m.gray&&typeof m.strength==='number'&&Number.isFinite(m.strength)&&m.strength>=0&&m.strength<=1
}
