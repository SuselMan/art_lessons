import {isStationary195Structure,type BrushStructurePolicy} from './brushStructurePolicy.js'
import{legacySmudgeTimingCore}from'./legacySmudgeTiming129.js'
import{isBrushBehavior}from'./brushBehavior.js'
import{nativeMaskComponentStructure,INDEPENDENT_MASK190_MODES}from'./independentMask190.js'
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const own=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).every(k=>keys.includes(k))
const asset=(v:unknown)=>typeof v==='string'&&/^asset:[a-f0-9]{64}$/.test(v)
const unit=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1
export const TEXTURE191_APPLICATIONS=['multiply','subtract','darken','overlay','linearDodge','linearBurn','colorDodge','colorBurn','hardMixPhotoshop','hardMixSofterPhotoshop','height','linearHeight','heightPhotoshop','linearHeightPhotoshop'] as const
/** Actual source-free mixer execution strategies, not a permissive mixer catchall.
 * Legacy static ordinary tips and modern existing static/equal-frame strategies
 * remain distinct. No new unequal GIH or child/mask smudge engine is introduced.
 * Full library validation still checks every numeric primitive and source plane. */
export function texture191SmudgeCore(v:unknown,policy?:BrushStructurePolicy):boolean{
 const stationary=isStationary195Structure(v,policy)
 if(!obj(v)||v.version!==(stationary?195:191)||v.model!=='mixer'||!obj(v.mixer)||!obj(v.tip)||!obj(v.behavior)||v.paperInteraction!==0||v.wet!==undefined)return false
 const m=v.mixer,t=v.tip,b=v.behavior
 if(m.load!==0||m.initialLoad!==0||b.wetMix!==undefined)return false
 if(m.colorRateComposite!==undefined&&(!obj(b.rendering)||b.rendering.blendMode!=='normal'))return false
 if(m.colorRateComposite==='erase'&&(b.erase!==true||m.load!==0||m.initialLoad!==0||m.strength!==1||m.paintThickness!==undefined))return false
 if(b.erase===true&&m.colorRateComposite!=='erase')return false
 if(!isBrushBehavior(b)||b.dual!==undefined||!['previousCanvas','projectionCanvas'].includes(String(m.source))||typeof m.source!=='string')return false
 if(!own(m,['load','pickup','strength','initialLoad','smearAlpha','source','pickupDynamics','sampling','foreground','colorRateComposite','algorithm','paintThickness']))return false
 if(!['load','pickup','strength'].every(k=>unit(m[k]))||m.initialLoad!==undefined&&!unit(m.initialLoad)||m.smearAlpha!==undefined&&typeof m.smearAlpha!=='boolean')return false
 if(m.algorithm===undefined){
  if(!stationary&&(t.animation!==undefined||b.timing!==undefined))return legacySmudgeTimingCore(v,b.timing!==undefined,true)
  if(!['round','procedural','bitmap'].includes(String(t.kind))||typeof t.kind!=='string'||['color','material',...(!stationary?['imageSampling','animation','autoNoise','autoShape']:[])].some(k=>t[k]!==undefined)||m.paintThickness!==undefined)return false
  if(m.colorRateComposite!==undefined&&(typeof m.colorRateComposite!=='string'||!['multiply','screen','overlay','darken','lighten','add','subtract','dodge','burn','erase'].includes(m.colorRateComposite)))return false
  if(m.colorRateComposite!==undefined&&!['multiply','screen','erase'].includes(String(m.colorRateComposite))&&(m.load!==0||m.initialLoad!==0))return false
  if(m.source==='projectionCanvas'&&m.sampling!==undefined)return false
 }else{
  const seen=new Set<object>()
  const clock=(x:unknown):boolean=>{if(!obj(x)&&!Array.isArray(x)||seen.has(x as object))return false;seen.add(x as object);return obj(x)&&(x.control==='time'||obj(x.randomSource)&&x.randomSource.kind==='grafettoSourceTime-v1')||Object.values(x).some(clock)}
  if(!stationary&&(b.timing!==undefined||clock(b)||clock(m)))return false
  if(t.animation!==undefined&&(!obj(t.animation)||!own(t.animation,['mode','frames'])||typeof t.animation.mode!=='string'||!['random','incremental'].includes(t.animation.mode)||!Array.isArray(t.animation.frames)||t.animation.frames.length<2||t.animation.frames.length>256))return false
  if(typeof m.algorithm!=='string'||!['krita-mask','krita-stamp'].includes(m.algorithm)||(stationary?!['round','procedural','bitmap'].includes(String(t.kind)):t.kind!=='bitmap'))return false
  if(obj(t.animation)&&t.animation.geometry!==undefined)return false
  if(m.colorRateComposite!==undefined&&(typeof m.colorRateComposite!=='string'||!['hardMixPhotoshop','grainMerge','grainExtract','negation','erase'].includes(m.colorRateComposite)))return false
 }
 return true
}
export function nativeTexture191Structure(v:unknown):boolean{
 if(!obj(v)||!asset(v.id)||!unit(v.strength)||typeof v.periodPx!=='number'||!Number.isFinite(v.periodPx)||v.periodPx<1||v.periodPx>8192||!obj(v.patternSize))return false
 const ps=v.patternSize
 if(!['width','height'].every(k=>Number.isInteger(ps[k])&&Number(ps[k])>=1&&Number(ps[k])<=2048))return false
 if(v.material!==undefined){
  if(!obj(v.material)||!own(v.material,['kind','alpha','eraseAlpha'])||typeof v.material.kind!=='string'||!['lightness','gradient'].includes(v.material.kind)||!asset(v.material.alpha)||v.application!==undefined)return false
  if((v.eraseId===undefined)!==(v.material.eraseAlpha===undefined)||v.eraseId!==undefined&&(!asset(v.eraseId)||!asset(v.material.eraseAlpha)))return false
 }else if(!obj(v.application)||!own(v.application,['mode','soft'])||typeof v.application.mode!=='string'||!(TEXTURE191_APPLICATIONS as readonly string[]).includes(v.application.mode)||typeof v.application.soft!=='boolean'||v.eraseId!==undefined&&!asset(v.eraseId))return false
 return true
}
/** Whole root only. Bare191 children cannot acquire an execution capability. */
export function isTextureCombinations191Scope(v:unknown):boolean{
 if(!obj(v)||v.version!==191||!obj(v.behavior)||!isBrushBehavior(v.behavior)||!nativeTexture191Structure(v.texture))return false
 if(['spray','bristle','sketch','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].some(k=>v[k]!==undefined))return false
 if(v.model==='mixer')return !obj(v.texture)||v.texture.material===undefined?texture191SmudgeCore(v):false
 if(v.paperInteraction!==0||v.wet!==undefined||!nativeMaskComponentStructure(v,true,191))return false
 const d=v.behavior.dual
 if(d===undefined)return true
 if(!obj(d)||!own(d,['brush','blendMode','sampling','sizePolicy'])||d.sampling!=='independent'||typeof d.blendMode!=='string'||!(INDEPENDENT_MASK190_MODES as readonly string[]).includes(d.blendMode)||!nativeMaskComponentStructure(d.brush,false,191))return false
 if(d.sizePolicy!==undefined&&(!obj(d.sizePolicy)||!own(d.sizePolicy,['kind','diameter'])||d.sizePolicy.kind!=='resource'||typeof d.sizePolicy.diameter!=='number'||!Number.isFinite(d.sizePolicy.diameter)||d.sizePolicy.diameter<.01||d.sizePolicy.diameter>10000))return false
 return true
}
export function isTextureCombinations191MaskScope(v:unknown):boolean{return isTextureCombinations191Scope(v)&&obj(v)&&v.model==='stamp'&&obj(v.behavior)&&obj(v.behavior.dual)}
/** Identity under the actual validated root; never a descriptor clone/proxy. */
export function isTextureCombinations191Component(root:unknown,node:unknown):boolean{return isTextureCombinations191Scope(root)&&obj(root)&&(node===root||obj(root.behavior)&&obj(root.behavior.dual)&&node===root.behavior.dual.brush)}
