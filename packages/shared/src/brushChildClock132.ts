/** Child clock READ authority; never creates a child timing producer. */
const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v)
const finite=(v:unknown,lo:number,hi:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi
export function hasTimeControl132(value:unknown,depth=0):boolean {
  if(depth>12)return false
  if(Array.isArray(value))return value.slice(0,64).some(v=>hasTimeControl132(v,depth+1))
  return record(value)&&(value.control==='time'||Object.entries(value).some(([k,v])=>k!=='brush'&&hasTimeControl132(v,depth+1)))
}
export function isPrimaryClockRead132Marker(value:unknown):boolean{return record(value)&&Object.keys(value).length===2&&value.version===1&&value.source==='primary'}
/** Called only in addition to ordinary complete descriptor/asset validation. */
export function isIndependentChildClock132Pair(value:unknown):boolean {
  if(!record(value)||!record(value.behavior)||!record(value.behavior.dual))return false
  const b=value.behavior,dual=b.dual as Record<string,unknown>,child=dual.brush
  if(!record(child)||!record(child.behavior)||!record(child.tip)||!record(value.tip))return false
  const c=child.behavior,tip=child.tip,rootTip=value.tip,clock=c.clockRead
  if(!isPrimaryClockRead132Marker(clock)||b.clockRead!==undefined||dual.sampling!=='independent'||!['multiply','subtract','darken'].includes(String(dual.blendMode)))return false
  const special=['mixer','wet','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal']
  for(const d of[value,child])if(d.model!=='stamp'||!finite(d.version,132,10000)||!Number.isInteger(d.version)||d.paperInteraction!==0||special.some(k=>d[k]!==undefined))return false
  if(tip.kind!=='bitmap'||!['bitmap','round','procedural'].includes(String(rootTip.kind))||['animation','material','color','autoShape','alphaThreshold'].some(k=>rootTip[k]!==undefined||tip[k]!==undefined)||tip.profile!==undefined||tip.autoNoise!==undefined)return false
  if(rootTip.profile!==undefined&&(!record(rootTip.profile)||rootTip.profile.kind!=='standard'))return false
  if(child.texture!==undefined||c.timing!==undefined||c.dual!==undefined||c.strokeInput!==undefined||c.sequentialRandom!==undefined||c.colorAdjustment!==undefined||c.wetMix!==undefined||c.edgeBleed!==undefined||c.taper!==undefined)return false
  for(const behavior of[b,c]){
    if(behavior.version!==2||behavior.erase===true||behavior.wetMix!==undefined||!record(behavior.rendering))return false
    const render=behavior.rendering
    if(render.mode!=='buildUp'||render.blendMode!=='normal'||!['directOver','alphaDarken'].includes(String(render.accumulation))||Number(render.wetEdges??0)!==0||Number(render.burntEdges??0)!==0)return false
  }
  const timing=b.timing
  if(!record(timing)||timing.version!==1||!finite(timing.rate,0,1000)||typeof timing.ignoreDistanceSpacing!=='boolean')return false
  if(b.strokeInput!==undefined||b.sequentialRandom!==undefined||b.edgeBleed!==undefined||b.taper!==undefined)return false
  const mods=record(c.modulations)?c.modulations:{},dyn=record(c.dynamics)?c.dynamics:{}
  if(!hasTimeControl132(mods.size)&&!hasTimeControl132(dyn.size))return false
  for(const [key,v]of Object.entries(c)){
    if(key==='modulations'||key==='dynamics'){if(!record(v)||Object.entries(v).some(([target,controls])=>target!=='size'&&hasTimeControl132(controls)))return false}
    else if(hasTimeControl132(v))return false
  }
  return true
}
