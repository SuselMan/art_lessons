import{hasPixelAlphaDual168Scope}from'./brushDualMask168.js'
/** New no-strength native mask-alpha operator. Global RGB Hard Mix remains forbidden in dual. */
export function hasPixelAlphaDual170Scope(v:unknown):boolean{
 const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
 if(!obj(v)||!Number.isInteger(v.version)||Number(v.version)<170||!obj(v.behavior)||!obj(v.behavior.dual)||v.behavior.dual.blendMode!=='hardMixPhotoshopAlpha')return false
 // Reuse the SAME closed ordinary mask/pressure-only pair authority. This
 // shallow metadata view changes only the discriminant, not children/resources.
 return hasPixelAlphaDual168Scope({...v,behavior:{...v.behavior,dual:{...v.behavior.dual,blendMode:'hardMixSofterPhotoshop'}}})
}
export function assertPixelAlphaDual170Scope(v:unknown):boolean{
 const mode=(v as {behavior?:{dual?:{blendMode?:unknown}}}|null)?.behavior?.dual?.blendMode
 if(mode!=='hardMixPhotoshopAlpha')return false
 if(!hasPixelAlphaDual170Scope(v))throw Error('Invalid Pixel ALPHAMASK dual170 scope')
 return true
}
