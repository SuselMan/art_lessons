import{hasStaticPixelAlphaDual168Scope}from'./brushDualMaskOrdinary.js'
/** Equal ordinary ALPHAMASK frames selected on the independent child's own emitted requests. */
export function hasAnimatedAlphaChild184Scope(v:unknown):boolean{
 const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)
 if(!obj(v)||v.version!==184||!obj(v.behavior)||!obj(v.behavior.dual)||!obj(v.behavior.dual.brush)||!obj(v.behavior.dual.brush.tip))return false
 const dual=v.behavior.dual,child=v.behavior.dual.brush,tip=v.behavior.dual.brush.tip,animation=tip.animation
 if(!obj(animation)||!['multiply','subtract','darken','hardMixSofterPhotoshop','hardMixPhotoshopAlpha'].includes(String(dual.blendMode))||tip.kind!=='bitmap'||tip.imageSampling!==undefined||!['constant','incremental','pressure'].includes(String(animation.mode))||Object.keys(animation).some(k=>!['mode','frames','rank'].includes(k)))return false
 const frames=animation.frames
 if(!Array.isArray(frames)||frames.length<2||frames.length>256||frames[0]!==tip.mask||!frames.every(id=>typeof id==='string'&&/^asset:[a-f0-9]{64}$/.test(id)))return false
 if(animation.mode==='pressure'?(typeof animation.rank!=='number'||!Number.isSafeInteger(animation.rank)||animation.rank<1||animation.rank>2147483647):animation.rank!==undefined)return false
 const {animation:ignored,...staticTip}=tip;void ignored
 return hasStaticPixelAlphaDual168Scope({...v,behavior:{...v.behavior,dual:{...dual,blendMode:'hardMixSofterPhotoshop',brush:{...child,tip:staticTip}}}})
}
export function assertAnimatedAlphaChild184Scope(v:unknown):boolean{
 if((v as {version?:unknown}|null)?.version!==184)return false
 if(!hasAnimatedAlphaChild184Scope(v))throw Error('Invalid animated ALPHAMASK child184 scope')
 return true
}
