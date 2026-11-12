import{hasStaticPixelAlphaDual168Scope}from'./brushDualMaskOrdinary.js'
import{hasAnimatedAlphaChild184Scope}from'./brushAnimatedAlphaChild184.js'
export function hasPixelAlphaDual168Scope(v:unknown):boolean{return hasStaticPixelAlphaDual168Scope(v)||((v as {behavior?:{dual?:{blendMode?:unknown}}}|null)?.behavior?.dual?.blendMode==='hardMixSofterPhotoshop'&&hasAnimatedAlphaChild184Scope(v))}
/** Scope check before resource ownership, not a shader selector fallback. */
export function assertPixelAlphaDual168Scope(v:unknown):boolean{const dual=(v as {behavior?:{dual?:{blendMode?:unknown}}}|null)?.behavior?.dual;if(dual?.blendMode!=='hardMixSofterPhotoshop')return false;if(!hasPixelAlphaDual168Scope(v))throw Error('Invalid Pixel ALPHAMASK dual168 scope');return true}
