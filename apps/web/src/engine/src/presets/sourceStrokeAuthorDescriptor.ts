import { isSourceStampData, type BrushDescriptor, type SourceStampCurveData } from '@grafetto/shared'
import { sourceCurveIsIdentity, type SourceCurvePolynomial } from './sourceCurve'
import { compileSourceOptionProgram, type SourceOptionProgramInput } from './sourceOptionProgram'
import { SourceStrokeAuthor, type SourceAuthorRoleProgram, type SourceStrokeAuthorProgram } from './sourceStrokeAuthor'

/** No XML parsing, asset loading, stock table, or approximate curve solver here. */
export interface SourceAuthorDescriptorContext {
  readonly colorIdentity: string
  readonly lodScale: number
  /** Native effective brush scale captured at pen-down, if user changed size. */
  readonly scale?: number
  readonly asset: { readonly id: string; readonly size: number }
  /** Explicit compiler capability; absence rejects nonidentity curves.
   * Caller must bind its result to these exact points/corners/source reader. */
  readonly compileCurve?: (curve: SourceStampCurveData) => { readonly version: 'native-sparselu-v1'; readonly coefficients: SourceCurvePolynomial['coefficients'] } | undefined
}
export type SourceAuthorDescriptorResult = { readonly supported: true; readonly program: SourceStrokeAuthorProgram }
  | { readonly supported: false; readonly reasons: readonly string[] }
export function sourceStrokeAuthorDescriptor(descriptor: BrushDescriptor, context: SourceAuthorDescriptorContext): SourceAuthorDescriptorResult {
  const data=descriptor.sourceStamp
  const reject=(reason:string):SourceAuthorDescriptorResult=>({supported:false,reasons:[reason]})
  if (data === undefined) return reject('legacy-descriptor-no-source-data')
  if (!isSourceStampData(data)) return reject('invalid-source-data')
  if (data.unsupported.length) return {supported:false,reasons:[...data.unsupported]}
  if (data.role !== 'primary' || descriptor.behavior?.dual) return reject('mask-master-size-unresolved')
  if (descriptor.model !== 'stamp' || descriptor.tip.kind !== 'bitmap' || descriptor.tip.animation || descriptor.tip.material) return reject('unsupported-source-material')
  const sampling=descriptor.tip.imageSampling
  if (!sampling || sampling.kind !== 'integer-pyramid' || sampling.signal !== 'inverse-gray' || descriptor.tip.mask !== context.asset.id
    || sampling.sourceRect.width !== data.brush.width || sampling.sourceRect.height !== data.brush.height
    || !Object.values(sampling.sourceRect).every(v=>Number.isInteger(v) && v>=0)
    || !Number.isInteger(context.asset.size) || context.asset.size < 2 || context.asset.size > 2048
    || sampling.sourceRect.x < 0 || sampling.sourceRect.y < 0 || sampling.sourceRect.x+data.brush.width > context.asset.size || sampling.sourceRect.y+data.brush.height > context.asset.size) return reject('native-cas-source-grid-unavailable')
  if (!data.flags.materialFixed1 || data.flags.textureEnabled || descriptor.behavior?.colorAdjustment) return reject('unsupported-material-consumer')
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
      materialPolicy:'png-fixed1-rng-free',lodScale:context.lodScale,
      scatterX:data.flags.scatterX,scatterY:data.flags.scatterY,mirrorX:data.flags.mirrorX,mirrorY:data.flags.mirrorY,indirectPainting:data.flags.indirectPainting,
      spacing:data.spacing,timing:data.timing,fanStepDegrees:fan?.fanStep,spacingRefreshMs:50,timingRefreshMs:50,
      material:{brushIdentity:descriptor.tip.mask!,color:context.colorIdentity,softness:1,lightness:1,
        precisionLevel:data.precision.level,autoPrecision:data.precision.automatic,
        imprecisePosition:programs.Mirror.checked || programs.Scatter.checked || programs.Rotation.checked || data.timing.enabled,
        disableSubpixel:false,supportsCaching:true,solidColor:true,textureEnabled:false,sharpnessChecked:false}}
    const program={id:descriptor.id+':'+descriptor.version,roles:[role]}
    // Same owner preflight as the eventual caller; no RNG/state mutation.
    new SourceStrokeAuthor(program)
    return {supported:true,program}
  } catch(error) { return reject(error instanceof Error ? error.message : 'unsupported-native-author-program') }
}
