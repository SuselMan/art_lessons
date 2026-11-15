import {isStationary195Structure,type BrushStructurePolicy} from './brushStructurePolicy.js'
import {isBrushBehavior} from './brushBehavior.js'
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const keys=(v:Record<string,unknown>,names:readonly string[])=>Object.keys(v).every(k=>names.includes(k))
export const INDEPENDENT_MASK190_MODES=['multiply','darken','overlay','colorDodge','colorBurn','linearBurn','add','hardMixPhotoshopAlpha','hardMixSofterPhotoshop','subtract'] as const
const otherEngines=['mixer','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'] as const
/** Inspect only this component's behavior; dual children have their own admission.
 * Never scan descriptor resources, numeric arrays or unrelated metadata. */
export function usesNativeMask190Controls(value:unknown):boolean {
 const seen=new Set<object>()
 const visit=(v:unknown):boolean=>{if(!record(v)&&!Array.isArray(v)||seen.has(v as object))return false;seen.add(v as object);if(record(v)&&(v.control==='pressureIn'||v.control==='perspective'))return true;return Object.entries(v).some(([k,child])=>k!=='dual'&&visit(child))}
 return visit(value)
}
/** Native Pixel mask components only. Asset references/planes/profile parameters
 * are validated by the full library validator; this establishes execution role,
 * not an alternative permissive schema or a version-downgrade proxy. */
export function nativeMaskComponentStructure(value:unknown,root:boolean,revision:190|191|195=190,policy?:BrushStructurePolicy):value is Record<string,unknown>{
 const stationary=isStationary195Structure(value,policy)
 if(revision===195&&!stationary)return false
 if(!record(value)||value.version!==revision||value.model!=='stamp'||!record(value.tip)||!record(value.behavior)||otherEngines.some(k=>value[k]!==undefined))return false
 const tip=value.tip,b=value.behavior
 // Canvas texture materials with masking have a separate feedback contract.
 // Tip Lightness/Gradient resources below remain ordinary mask resources.
 if(revision===190&&root&&record(value.texture)&&value.texture.material!==undefined)return false
 if(typeof tip.kind!=='string'||!['round','procedural','bitmap'].includes(tip.kind)||!stationary&&record(tip.profile)&&tip.profile.kind==='circleBand')return false
 if(!isBrushBehavior(b))return false
 if(root){if(revision===190&&(!record(b.dual)||b.dual.sampling!=='independent'))return false}
 else {
  if(value.texture!==undefined||value.wet!==undefined||value.paperInteraction!==0)return false
  if(!keys(b,['version','rendering','spacing','rotation','strokeInput','speedInput','sequentialRandom','clockRead','dynamics','modulations','mirror','scatter','softness','falloff','erase']))return false
  if(b.dual!==undefined||b.timing!==undefined||b.erase===true)return false
  for(const k of ['dynamics','modulations'])if(record(b[k])&&!keys(b[k],['size','angle','roundness','scatter','flow','opacity']))return false
 }
 const strictControls=(v:unknown):boolean=>{
  if(Array.isArray(v))return v.every(strictControls)
  if(!record(v))return true
  if('control'in v&&typeof v.control!=='string')return false
  return Object.entries(v).every(([key,child])=>key==='dual'||strictControls(child))
 }
 if(!strictControls(b))return false
 return true
}
/** Whole native190 pair. No orphan190 or other paint engine gains admission.
 * Existing <=189 descriptor and sensor laws remain versioned separately. */
export function hasIndependentMask190Scope(value:unknown):boolean {
 if(!nativeMaskComponentStructure(value,true)||!record(value.behavior)||!record(value.behavior.dual))return false
 const dual=value.behavior.dual
 if(!nativeMaskComponentStructure(dual.brush,false)||typeof dual.blendMode!=='string'||!(INDEPENDENT_MASK190_MODES as readonly string[]).includes(dual.blendMode))return false
 return true
}
/** Private validator/engine role proof: actual node identity under a valid root,
 * never a cloned descriptor, permissive public child scope or mutable cache. */
export function isIndependentMask190Component(root:unknown,node:unknown):boolean {
 return hasIndependentMask190Scope(root)&&record(root)&&record(root.behavior)&&record(root.behavior.dual)&&(node===root||node===root.behavior.dual.brush)
}
