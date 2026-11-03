import type {CanonicalMaterialParameters} from '@grafetto/shared'
import { planSourceDab, sourceDabMaskExtent, sourceMirror, type SourceDabGeometry, type SourceDabBrushMetrics, type SourceDabCacheRequest, type SourceDabCacheResult, type SourceDabCacheState, type SourceMirrorBits } from './sourceDabCache'
import { sourceScatter } from './sourceScatter'
import { sourceOptionComponents, sourceRotationLike, sourceSizeLike, sourceStandardOption, type SourceOption, type SourceOptionContext } from './sourceOption'

export type SourceStampOptionId = 'Size' | 'Rotation' | 'Ratio' | 'Scatter' | 'Opacity' | 'Flow' | 'Mirror' | 'Spacing' | 'Rate'
export interface SourceStampInfo {
  readonly x: number
  readonly y: number
  readonly drawingAngle: number
  readonly canvasRotation: number
  readonly mirroredH: boolean
  readonly mirroredV: boolean
}
/** Internal CPU query stream only. No new persisted/wire event format. */
export interface SourceStampEvent {
  readonly stage?: 'material' | 'spacing'
  readonly option: SourceStampOptionId|'Softness'|'LightnessStrength'|'Sharpness'
  readonly value: number
  readonly drawsBefore: number
  readonly drawsAfter: number
}
export interface SourceStampOptions {
  readonly Size: SourceOption
  readonly Rotation: SourceOption
  readonly Ratio: SourceOption
  readonly Scatter: SourceOption
  readonly Opacity: SourceOption
  readonly Flow: SourceOption
  readonly Mirror: SourceOption
  readonly Spacing: SourceOption
  readonly Rate: SourceOption
}
/** Geometry/material are deliberately explicit source boundaries. Their laws
 * must be supplied from the same source plan, never guessed from dab diameter. */
export interface SourceStampBoundary {
  readonly canPaint: boolean
  readonly lodScale: number
  readonly scatterX: boolean
  readonly scatterY: boolean
  readonly indirectPainting: boolean
  readonly mirrorX: boolean
  readonly mirrorY: boolean
  checkSizeTooSmall?(scale: number): boolean
  maskExtent?(scale: number, ratio: number, rotation: number): readonly [number, number]
  /** Called in native addDab position; material source consumers share context. */
  readonly sourceCache?: {
    readonly brush: SourceDabBrushMetrics
    readonly geometry?: SourceDabGeometry
    readonly state: SourceDabCacheState
    readonly sourceColor?:()=>readonly[number,number,number]|readonly[number,number,number,number]|undefined
    readonly materialOptions?:Readonly<{Softness:SourceOption;LightnessStrength:SourceOption;Sharpness:SourceOption;sharpnessAlign:boolean;sharpnessSoftness:number}>
    readonly request: Omit<SourceDabCacheRequest, 'x' | 'y' | 'shape'>
  }
  material?(context: SourceOptionContext): void
}
export interface SourceStampResult {
  readonly sourcePigmentRGBA?:readonly[number,number,number,number]
  readonly sourcePigmentRGB?:readonly[number,number,number]
  readonly materialParams?:CanonicalMaterialParameters
  readonly painted: boolean
  readonly events: readonly SourceStampEvent[]
  readonly scale?: number
  readonly rotation?: number
  readonly ratio?: number
  readonly x?: number
  readonly y?: number
  readonly opacity?: number
  readonly flow?: number
  readonly spacing?: number
  readonly rate?: number
  readonly material?: SourceDabCacheResult
  readonly spacingMirror?: SourceMirrorBits
}

/** Shared context is intentional: refresh and paint use the very same stream.
 * Parent/child callers choose the native source ownership before constructing
 * this executor. It never creates a coordinate-hashed substitute source. */
export class SourceStampQueryExecutor {
  private readonly options: SourceStampOptions
  private readonly context: SourceOptionContext
  constructor(options: SourceStampOptions, context: SourceOptionContext) {
    this.options = options
    this.context = context
  }

  execute(kind: 'paint' | 'spacing' | 'timing', info: SourceStampInfo, boundary: SourceStampBoundary): SourceStampResult {
    if (boundary.sourceCache && boundary.material) throw new RangeError('Ambiguous source material boundary')
    const events: SourceStampEvent[] = []
    let spacingMirror: SourceMirrorBits | undefined
    let material: SourceDabCacheResult | undefined
    const evaluate = (id: SourceStampOptionId, compute?: () => number): number => {
      const before = this.context.random.snapshot().draws
      const value = compute ? compute() : sourceStandardOption(this.options[id], this.context)
      events.push({ option: id, value, drawsBefore: before, drawsAfter: this.context.random.snapshot().draws })
      return value
    }
    const rate = (): number => evaluate('Rate')
    if (kind === 'timing') return { painted: false, events, rate: rate() }
    // KisPaintOp::paintAt wrapper still calls updateTimingImpl after paintAt returns early.
    if (kind === 'paint' && !boundary.canPaint) return { painted: false, events, rate: rate() }
    const scale = evaluate('Size') * boundary.lodScale
    const tiny = boundary.sourceCache
      ? (scale * boundary.sourceCache.brush.scale) * boundary.sourceCache.brush.width < .01 || (scale * boundary.sourceCache.brush.scale) * boundary.sourceCache.brush.height < .01
      : boundary.checkSizeTooSmall?.(scale)
    if (tiny === undefined) throw new RangeError('Missing native size predicate')
    if (kind === 'paint' && tiny) return { painted: false, events, scale, rate: rate() }
    const rotation = evaluate('Rotation', () => {
      const option = this.options.Rotation
      if (!option.checked) return info.canvasRotation * Math.PI / 180
      const c = sourceOptionComponents(option, this.context)
      const value = sourceRotationLike(c, -info.canvasRotation / 360, info.mirroredH !== info.mirroredV, -1, this.context.hover)
      let angle = (1 - value) * Math.PI
      // normalizeAngle's nonnegative source branch: inputs here are [0, 2*pi].
      if (angle < 0) angle = 2 * Math.PI + angle % (2 * Math.PI)
      if (angle >= 2 * Math.PI) angle %= 2 * Math.PI
      return angle
    })
    const spacing = (): number => {
      const before = this.context.random.snapshot().draws
      spacingMirror = sourceMirror(this.options.Mirror, this.context,
        { canvasH: info.mirroredH, canvasV: info.mirroredV, enableH: boundary.mirrorX, enableV: boundary.mirrorY }, value => {
          events.push({ option: 'Mirror', value, drawsBefore: before, drawsAfter: this.context.random.snapshot().draws, ...(boundary.sourceCache ? { stage: 'spacing' as const } : {}) })
        })
      return evaluate('Spacing')
    }
    if (kind === 'spacing') return { painted: false, events, scale, rotation, spacing: spacing(), spacingMirror }
    const ratio = evaluate('Ratio')
    const extent = boundary.sourceCache
      ? sourceDabMaskExtent(boundary.sourceCache.brush, { scale, ratio, rotation }, 0, 0, boundary.sourceCache.geometry)
      : boundary.maskExtent?.(scale, ratio, rotation)
    if (!extent) throw new RangeError('Missing native mask geometry')
    const [width, height] = extent
    const [x, y] = sourceScatter({
      x: info.x, y: info.y, angle: info.drawingAngle, width, height,
      checked: this.options.Scatter.checked, axisX: boundary.scatterX, axisY: boundary.scatterY,
    }, this.context.random, () => evaluate('Scatter'))
    const opacity = evaluate('Opacity', () => this.options.Opacity.checked
      ? sourceSizeLike(sourceOptionComponents(this.options.Opacity, this.context, !boundary.indirectPainting)) : 1)
    const flow = evaluate('Flow')
    let sourcePigmentRGB:readonly[number,number,number]|undefined
    let sourcePigmentRGBA:readonly[number,number,number,number]|undefined
    let materialParams:CanonicalMaterialParameters|undefined
    if (boundary.sourceCache) {
      const options=boundary.sourceCache.materialOptions
      const apply=(id:'Softness'|'LightnessStrength'|'Sharpness')=>{if(!options)throw new RangeError('Missing material option');const before=this.context.random.snapshot().draws,value=sourceStandardOption(options[id],this.context);events.push({option:id,stage:'material',value,drawsBefore:before,drawsAfter:this.context.random.snapshot().draws});return value}
      const softness=options?apply('Softness'):boundary.sourceCache.request.softness
      const lightness=options?apply('LightnessStrength'):boundary.sourceCache.request.lightness
      const pigment=boundary.sourceCache.sourceColor?.()
      if(pigment?.length===4)sourcePigmentRGBA=pigment;else sourcePigmentRGB=pigment
      let sharpnessAlignValue=0
      const before = this.context.random.snapshot().draws
      material = planSourceDab(boundary.sourceCache.brush,
        { ...boundary.sourceCache.request,...sourcePigmentRGBA?{color:'rgba8:'+sourcePigmentRGBA.join(',')}:sourcePigmentRGB?{color:'rgb8:'+sourcePigmentRGB.join(',')}:{},softness,lightness,...options?{sharpnessChecked:options.Sharpness.checked,sharpness:0,sharpnessAlign:options.sharpnessAlign,sharpnessStrength:options.Sharpness.strength}:{}, x, y, shape: { scale, ratio, rotation } }, boundary.sourceCache.state,
        this.options.Mirror, this.context, { canvasH: info.mirroredH, canvasV: info.mirroredV, enableH: boundary.mirrorX, enableV: boundary.mirrorY }, boundary.sourceCache.geometry,options?{sharpnessAlign:()=>sharpnessAlignValue=apply('Sharpness')}:undefined)
      if (material.mirrorValue !== undefined) events.push({ option: 'Mirror', stage: 'material', value: material.mirrorValue,
        drawsBefore: material.mirrorDrawsBefore ?? before, drawsAfter: this.context.random.snapshot().draws })
      if(options)materialParams={softness:material.resolvedSource.key.softness,lightnessStrength:material.resolvedSource.key.lightness,sharpnessAlignValue,sharpnessThreshold:options.Sharpness.checked?apply('Sharpness'):0,sharpnessSoftness:options.sharpnessSoftness,sharpnessChecked:options.Sharpness.checked,sharpnessAlign:options.sharpnessAlign}
    } else boundary.material?.(this.context)
    const spacingValue = spacing()
    return { painted: true,...sourcePigmentRGBA?{sourcePigmentRGBA}:{},...sourcePigmentRGB?{sourcePigmentRGB}:{},...materialParams?{materialParams}:{}, events, scale, rotation, ratio, x, y, opacity, flow, spacing: spacingValue, rate: rate(), spacingMirror, ...(material ? { material } : {}) }
  }
}
