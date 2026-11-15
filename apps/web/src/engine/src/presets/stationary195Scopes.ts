import{
 STATIONARY195_STRUCTURE,type BrushDescriptor,isMyPaintDescriptor as mypaintDescriptor,
 hasLegacyColorSmudgeOverlay154Scope as overlay,hasLegacyColorSmudgeMinMax172Scope as minmax,hasLegacyColorSmudgeArithmetic175Scope as arithmetic,hasLegacyColorSmudgeDodgeBurn176Scope as dodgeBurn,hasSpraySource146Scope as spraySource,hasSprayWash133Scope as sprayWash,
 hasBristleWash135Scope as bristleWash,hasBristleSoak139Scope as bristleSoak,hasBristleInitializationScope as bristleInit,hasBristleSource143Scope as bristleSource,hasBristleNativePointCoverage as bristlePoint,
 hasParticleWash134Scope as particleWash,hasTangentNormalWash136Scope as tangentWash,hasExperimentCurrentPattern158Scope as experimentPattern,
 hasCloneProjection149Scope as cloneProjection,hasCloneHealing152Scope as cloneHealing,hasDeformOldData145Scope as deformOld,hasMyPaintTimer177Scope as mypaintTimer,
 hasGridWash137Scope as gridWash,bristleInitializationSourceSide as bristleSide,hasFilterSmudge147Scope as filterSmudge,hasFilterGaussian153Scope as filterGaussian,hasFilterUnsharp159Scope as filterUnsharp,hasFilterBitmapMaskScope as filterBitmap,hasFilterMask192Scope as filterMask,
}from'@grafetto/shared'
// These bridges select existing structural implementations AFTER whole-root
// admission at the public preparation/paint boundary. No descriptor projection,
// synthetic revision, mutable cache or per-stamp whole-root validation.
const native=(b:unknown):b is BrushDescriptor=>!!b&&typeof b==='object'&&'version'in b&&b.version===195
const policy=(b:unknown)=>native(b)?STATIONARY195_STRUCTURE:undefined
export const hasBristleWash135Scope=(b:unknown)=>bristleWash(b,policy(b))
export const hasBristleSoak139Scope=(b:unknown)=>bristleSoak(b,policy(b))
export const hasBristleInitializationScope=(b:unknown)=>bristleInit(b,policy(b))
export const hasBristleSource143Scope=(b:unknown)=>bristleSource(b,policy(b))
export const hasBristleNativePointCoverage=(b:unknown)=>native(b)?b.bristle?.version===1&&b.bristle.antialias===true&&b.bristle.compositing===true&&bristleInit(b,policy(b)):bristlePoint(b)
export const hasParticleWash134Scope=(b:unknown)=>particleWash(b,policy(b))
export const hasTangentNormalWash136Scope=(b:unknown)=>tangentWash(b,policy(b))
export const hasExperimentCurrentPattern158Scope=(b:unknown)=>experimentPattern(b,policy(b))
export const hasCloneProjection149Scope=(b:unknown)=>cloneProjection(b,policy(b))
export const hasCloneHealing152Scope=(b:unknown)=>cloneHealing(b,policy(b))
export const hasDeformOldData145Scope=(b:unknown)=>deformOld(b,policy(b))
export const hasMyPaintTimer177Scope=(b:unknown)=>native(b)?!!b.mypaint&&!!b.behavior?.timing:mypaintTimer(b)
export const hasFilterMask192Scope=(b:unknown)=>native(b)?!!b.filter&&'maskPolicy'in b.filter&&b.filter.maskPolicy==='native-dab-v1':filterMask(b)
export const hasFilterSmudge147Scope=(b:unknown)=>native(b)?!!b.filter&&'smudgeMode'in b.filter:filterSmudge(b)
export const hasFilterGaussian153Scope=(b:unknown)=>native(b)?b.filter?.kind==='gaussian':filterGaussian(b)
export const hasFilterUnsharp159Scope=(b:unknown)=>native(b)?b.filter?.kind==='unsharp':filterUnsharp(b)
export const hasFilterBitmapMaskScope=(b:unknown)=>native(b)?!!b.filter&&b.tip.kind==='bitmap':filterBitmap(b)

export const hasGridWash137Scope=(b:unknown)=>native(b)?b.grid?.sourcePolicy==='canonical-begin-v1':gridWash(b)
export const bristleInitializationSourceSide=(b:BrushDescriptor)=>native(b)?b.bristle?.version===1?b.bristle.initialization?.sourceSide:b.bristle?.soak?.initialSide:bristleSide(b)

export const isMyPaintDescriptor=(b:Record<string,unknown>)=>mypaintDescriptor(b,policy(b))
export const hasLegacyColorSmudgeOverlay154Scope=(b:unknown)=>native(b)?b.mixer?.colorRateComposite==='overlay':overlay(b)
export const hasLegacyColorSmudgeMinMax172Scope=(b:unknown)=>native(b)?['darken','lighten'].includes(b.mixer?.colorRateComposite??''):minmax(b)
export const hasLegacyColorSmudgeArithmetic175Scope=(b:unknown)=>native(b)?['add','subtract'].includes(b.mixer?.colorRateComposite??''):arithmetic(b)
export const hasLegacyColorSmudgeDodgeBurn176Scope=(b:unknown)=>native(b)?['dodge','burn'].includes(b.mixer?.colorRateComposite??''):dodgeBurn(b)
export const hasSpraySource146Scope=(b:unknown)=>native(b)?b.spray?.color.sourcePolicy==='canonical-begin-v1':spraySource(b)
export const hasSprayWash133Scope=(b:unknown)=>native(b)?!!b.spray&&b.behavior?.rendering?.accumulation==='alphaDarken':sprayWash(b)
