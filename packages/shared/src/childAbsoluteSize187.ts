import{isBrushBehavior}from'./brushBehavior.js'
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Record<string,unknown>,names:readonly string[])=>Object.keys(v).every(k=>names.includes(k))
const ordinary=(tip:unknown):boolean=>object(tip)&&typeof tip.kind==='string'&&['round','bitmap','procedural'].includes(tip.kind)&&!['animation','color','material','imageSampling','autoNoise','autoShape'].some(k=>tip[k]!==undefined)&&(tip.profile===undefined||object(tip.profile)&&tip.profile.kind==='standard'&&typeof tip.profile.shape==='string'&&['ellipse','rectangle'].includes(tip.profile.shape))
/** This canonical shape is emitted ONLY by the native identity bypass. Other sparse curves are not187. */
export function isAbsoluteSize187IdentityCurve(v:unknown):boolean{return Array.isArray(v)&&v.length===2&&Array.isArray(v[0])&&v[0].length===2&&v[0][0]===0&&v[0][1]===0&&Array.isArray(v[1])&&v[1].length===2&&v[1][0]===1&&v[1][1]===1}
function childAbsoluteSizeControl(value:unknown,locked:boolean):boolean{
 if(!object(value)||value.model!=='stamp'||!ordinary(value.tip)||!object(value.behavior))return false
 const b=value.behavior,m=b.modulations
 if(!exact(b,['version','rendering','rotation','strokeInput','speedInput','spacing','modulations'])||!object(m)||Object.keys(m).length!==1||!Array.isArray(m.size)||m.size.length!==1||!object(m.size[0]))return false
 const control=m.size[0],c=control.combine
 if(!exact(control,['control','minimum','jitter','combine'])||control.control!=='off'||control.minimum!==0||control.jitter!==0)return false
 if(!object(c)||!exact(c,['mode','scaling','additive','constant','absolute'])||c.mode!=='product'||!Array.isArray(c.scaling)||c.scaling.length>1||!Array.isArray(c.additive)||c.additive.length||!object(c.absolute)||c.absolute.locked!==locked)return false
 if(c.scaling.some(v=>!object(v)||typeof v.control!=='string'||!['pressure','off'].includes(v.control)||v.randomSource!==undefined||v.period!==undefined||v.combine!==undefined||v.jitter!==0||(v.curve!==undefined&&!isAbsoluteSize187IdentityCurve(v.curve)&&(!object(v.curve)||v.curve.kind!=='uniform'))))return false
 const curve=c.absolute.curve
 if(!isAbsoluteSize187IdentityCurve(curve)&&(!object(curve)||curve.kind!=='uniform'))return false
 return isBrushBehavior(b)
}
/** New exact187 static ALPHA pair; the existing full120 pair validator checks all remaining structure. */
function childAbsoluteSizeScope(value:unknown,version:187|189,locked:boolean):boolean{
 if(!object(value)||value.version!==version||value.model!=='stamp'||!ordinary(value.tip)||!object(value.behavior)||!object(value.behavior.dual))return false
 const dual=value.behavior.dual,child=dual.brush
 const component=(d:Record<string,unknown>,root:boolean):boolean=>{
  if(d.version!==version||d.model!=='stamp'||d.paperInteraction!==0||!ordinary(d.tip)||['mixer','wet','texture','scatter','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].some(k=>d[k]!==undefined)||!object(d.behavior))return false
  const b=d.behavior,r=b.rotation,i=b.strokeInput,render=b.rendering
  if(!exact(b,['version','rendering','rotation','strokeInput','speedInput','spacing',...(root?['dual']:['modulations'])])||!object(r)||Object.keys(r).length!==2||r.follow!==1||r.random!=='none'||!object(i)||Object.keys(i).length!==2||i.version!==1||i.initialDirection!=='cursorHistory'||!object(render)||render.mode!=='buildUp'||render.blendMode!=='normal'||(root?render.accumulation!=='directOver':!['directOver','alphaDarken'].includes(String(render.accumulation)))||Number(render.wetEdges??0)!==0||Number(render.burntEdges??0)!==0)return false
  if(object(b.spacing)&&Array.isArray(b.spacing.dynamics)&&b.spacing.dynamics.length)return false
  return isBrushBehavior(b)
 }
 return dual.sampling==='independent'&&dual.blendMode==='multiply'&&component(value,true)&&object(child)&&component(child,false)&&childAbsoluteSizeControl(child,locked)
}

/** Serialized187 remains exactly the unlocked-only domain. */
export function hasChildAbsoluteSize187Control(value:unknown):boolean{return childAbsoluteSizeControl(value,false)}
export function hasIndependentChildAbsoluteSize187Scope(value:unknown):boolean{return childAbsoluteSizeScope(value,187,false)}
/** Locked Size only; rotation/source cursor still use the old120 unlocked policy. */
export function hasLockedChildAbsoluteSize189Scope(value:unknown):boolean{return childAbsoluteSizeScope(value,189,true)}
