import { extractCanonicalSinglePngCapability, extractDefaultAutoSourceDataCapability, extractGaussianAutoSourceDataCapability, type BrushDescriptor, type SourceStampCurveData } from '@grafetto/shared'
import { sourceCurveIsIdentity, type SourceCurvePolynomial } from './sourceCurve'
import { compileSourceOptionProgram, type SourceOptionProgramInput } from './sourceOptionProgram'
import { SourceStrokeAuthor, type SourceAuthorRoleProgram, type SourceStrokeAuthorProgram } from './sourceStrokeAuthor'

/** No XML parsing, asset loading, stock table, or approximate curve solver here. */
export interface SourceAuthorDescriptorContext {
  readonly colorIdentity: string
  readonly lodScale: number
  /** Native effective brush scale captured at pen-down, if user changed size. */
  readonly scale?: number
  readonly coverageProfile?: 'scalar-f64-fma-v1' | 'scalar-bionic-f64-fma-v1' | 'neon64-f32-fma-v1'
  readonly asset?: { readonly id: string; readonly size: number }
  /** Explicit compiler capability; absence rejects nonidentity curves.
   * Caller must bind its result to these exact points/corners/source reader. */
  readonly compileCurve?: (curve: SourceStampCurveData) => { readonly version: 'native-sparselu-v1'; readonly coefficients: SourceCurvePolynomial['coefficients'] } | undefined
}
export type SourceAuthorDescriptorResult = { readonly supported: true; readonly program: SourceStrokeAuthorProgram }
  | { readonly supported: false; readonly reasons: readonly string[] }
export function sourceStrokeAuthorDescriptor(descriptor: BrushDescriptor, context: SourceAuthorDescriptorContext): SourceAuthorDescriptorResult {
  const data=descriptor.sourceStamp!
  const reject=(reason:string):SourceAuthorDescriptorResult=>({supported:false,reasons:[reason]})
  const gaussian=data?.version===2 && data.source?.kind==='gaussianAuto'
  const auto=data?.version===2 && (data.source?.kind==='defaultAuto'||gaussian)
  const material = gaussian ? extractGaussianAutoSourceDataCapability(descriptor) : auto ? extractDefaultAutoSourceDataCapability(descriptor)
    : context.asset ? extractCanonicalSinglePngCapability(descriptor, context.asset) : reject('image-source-asset-required')
  if (!material.supported) return material
  if(auto && !(gaussian?['scalar-bionic-f64-fma-v1','neon64-f32-fma-v1']:['scalar-f64-fma-v1','neon64-f32-fma-v1']).includes(context.coverageProfile??''))return reject('explicit-auto-coverage-profile-required')
  if (!Number.isFinite(context.lodScale) || context.lodScale <= 0 || typeof context.colorIdentity !== 'string' || !context.colorIdentity.length
    || context.scale !== undefined && (!Number.isFinite(context.scale) || context.scale <= 0)) return reject('invalid-author-context')
  const programs:Record<string,SourceOptionProgramInput>={}
  try {
    for (const option of data.options) {
      const sensors=option.sensors.map(sensor=>{
        const needed=option.checked && option.useCurve && !sourceCurveIsIdentity(sensor.curve.points)
        // Native apply guards skip unchecked/disabled curve consumers entirely.
        const saved=data.compiled?.curves.find(c=>c.source.text===sensor.curve.text)
        const compiled=needed ? context.compileCurve?.(sensor.curve) ?? (saved && {version:'native-sparselu-v1' as const,coefficients:saved.coefficients}) : undefined
        if (needed && (!compiled || compiled.version !== 'native-sparselu-v1')) throw new RangeError('native-curve-compiler-unavailable:'+option.id+':'+sensor.sourceSlot)
        return {id:sensor.id,length:sensor.length,periodic:sensor.periodic,angleOffset:sensor.angleOffset,lockedAngle:sensor.lockedAngle,
          curve:{points:sensor.curve.points,coefficients:compiled?.coefficients}}
      })
      const program={id:option.id,checked:option.checked,useCurve:option.useCurve,curveMode:option.curveMode,strength:option.strength,min:option.min,max:option.max,sensors}
      compileSourceOptionProgram(program)
      programs[option.id]=program
    }
    if (Object.keys(programs).length !== 9) return reject('native-option-program-unavailable')
    const rotation=data.options.find(o=>o.id==='Rotation')!
    const fan=rotation.checked && rotation.useCurve ? rotation.sensors.find(s=>s.id==='drawingAngle' && s.fanCorners) : undefined
    const brush={...data.brush,scale:context.scale ?? data.brush.scale}
    const role:SourceAuthorRoleProgram={id:'primary',options:programs as unknown as SourceAuthorRoleProgram['options'],brush,
      ...(data.version===2 && data.source.kind==='gaussianAuto'?{geometry:{kind:'gaussianAuto' as const,source:data.source,coverageProfile:context.coverageProfile as 'scalar-bionic-f64-fma-v1'|'neon64-f32-fma-v1'}}:data.version===2 && data.source.kind==='defaultAuto'?{geometry:{kind:'defaultAuto' as const,source:data.source,coverageProfile:context.coverageProfile as 'scalar-f64-fma-v1'|'neon64-f32-fma-v1'}}:data.version===2?{geometry:{kind:'image' as const}}:{}),
      materialPolicy:gaussian?'gaussian-auto-fixed1-rng-free':auto?'default-auto-fixed1-rng-free':'png-fixed1-rng-free',lodScale:context.lodScale,
      scatterX:data.flags.scatterX,scatterY:data.flags.scatterY,mirrorX:data.flags.mirrorX,mirrorY:data.flags.mirrorY,indirectPainting:data.flags.indirectPainting,
      spacing:data.spacing,timing:data.timing,fanStepDegrees:fan?.fanStep,spacingRefreshMs:50,timingRefreshMs:50,
      material:{brushIdentity:auto?descriptor.id+'@'+descriptor.version:descriptor.tip.mask!,color:context.colorIdentity,softness:1,lightness:1,
        precisionLevel:data.precision.level,autoPrecision:data.precision.automatic,
        imprecisePosition:programs.Mirror.checked || programs.Scatter.checked || programs.Rotation.checked || data.timing.enabled,
        disableSubpixel:false,supportsCaching:true,solidColor:true,textureEnabled:false,sharpnessChecked:false}}
    const program={id:descriptor.id+':'+descriptor.version,roles:[role]}
    // Same owner preflight as the eventual caller; no RNG/state mutation.
    new SourceStrokeAuthor(program)
    return {supported:true,program}
  } catch(error) { return reject(error instanceof Error ? error.message : 'unsupported-native-author-program') }
}
