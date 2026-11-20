import {isBrushBehavior} from './brushBehavior.js'
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const keys=(v:Record<string,unknown>,allowed:readonly string[])=>Object.keys(v).every(k=>allowed.includes(k))
/** Inspect one behavior control graph, excluding dual descriptors. Children are
 * validated separately by the existing recursive library/portable walker. */
export function usesRecordedPen188Controls(value:unknown):boolean{
 const seen=new Set<object>();const visit=(v:unknown):boolean=>{if(!v||typeof v!=='object'||seen.has(v))return false;seen.add(v);if(obj(v)&&(v.control==='barrelRotation'||v.control==='tangentialPressure'))return true;return Object.entries(v).some(([key,child])=>key!=='dual'&&visit(child))};return visit(value)
}
/** Exact root Pixel first slice; no implied admission for other engines/children. */
export function hasRecordedPen188Scope(value:unknown):boolean{
 if(!obj(value)||value.version!==188||value.model!=='stamp'||value.paperInteraction!==0||!obj(value.tip)||!obj(value.behavior)||!usesRecordedPen188Controls(value.behavior))return false
 if(['mixer','wet','texture','scatter','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'].some(k=>value[k]!==undefined))return false
 const tip=value.tip,b=value.behavior,r=b.rendering
 if(!['round','procedural','bitmap'].includes(typeof tip.kind==='string'?tip.kind:'')||['animation','color','material','imageSampling','autoNoise','autoShape','alphaThreshold'].some(k=>tip[k]!==undefined))return false
 if(tip.profile!==undefined&&(!obj(tip.profile)||tip.profile.kind!=='standard'||tip.profile.shape!=='ellipse'))return false
 if(!keys(b,['version','rendering','spacing','rotation','modulations','speedInput'])||!obj(r)||!keys(r,['mode','accumulation','blendMode','wetEdges','burntEdges','burntEdgesMode','opacityCeiling'])||r.mode!=='buildUp'||r.accumulation!=='directOver'||r.blendMode!=='normal'||(r.wetEdges??0)!==0||(r.burntEdges??0)!==0||(r.burntEdgesMode??'multiply')!=='multiply'||r.opacityCeiling!==undefined&&r.opacityCeiling!=='uniform')return false
 if(b.speedInput!==undefined&&(!obj(b.speedInput)||!keys(b.speedInput,['version','space','maximum','estimator'])||b.speedInput.version!==1||b.speedInput.space!=='view'||b.speedInput.maximum!==30||b.speedInput.estimator!=='grafettoEMA30ms'))return false
 const leaf=(v:unknown,additive:boolean):boolean=>obj(v)&&keys(v,['control','minimum','jitter','curve'])&&v.minimum===0&&v.jitter===0&&typeof v.control==='string'&&(additive?v.control==='barrelRotation':['pressure','off','tangentialPressure'].includes(v.control))&&isBrushBehavior({version:2,dynamics:{size:v}})
 const response=(v:unknown):boolean=>{if(!obj(v))return false;if(v.combine===undefined)return leaf(v,false);const c=v.combine;return keys(v,['control','minimum','jitter','combine'])&&v.control==='off'&&v.minimum===0&&v.jitter===0&&obj(c)&&keys(c,['mode','scaling','additive','constant'])&&typeof c.mode==='string'&&['product','sum','max','min','difference'].includes(c.mode)&&Array.isArray(c.scaling)&&Array.isArray(c.additive)&&c.scaling.length+c.additive.length>=1&&c.scaling.length+c.additive.length<=3&&c.scaling.every(x=>leaf(x,false))&&c.additive.every(x=>leaf(x,true))&&(c.constant===undefined||typeof c.constant==='number'&&Number.isFinite(c.constant)&&c.constant>=0&&c.constant<=1)}
 if(b.spacing!==undefined&&(!obj(b.spacing)||b.spacing.dynamics!==undefined))return false
 if(b.modulations!==undefined&&(!obj(b.modulations)||!keys(b.modulations,['size','opacity'])||!Object.values(b.modulations).every(v=>Array.isArray(v)&&v.length>=1&&v.length<=3&&v.every(response))))return false
 if(b.rotation!==undefined){const rot=b.rotation;if(!obj(rot)||!keys(rot,['follow','random','composition'])||rot.follow!==0||rot.random!=='none')return false;if(rot.composition!==undefined){const c=rot.composition;if(!obj(c)||!keys(c,['strength','additive','scaling','scalingMode'])||!Array.isArray(c.additive)||!c.additive.every(x=>leaf(x,true))||c.scaling!==undefined&&(!Array.isArray(c.scaling)||!c.scaling.every(x=>leaf(x,false))))return false}}
 return isBrushBehavior(b)
}
