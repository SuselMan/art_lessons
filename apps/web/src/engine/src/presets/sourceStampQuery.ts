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
  readonly option: SourceStampOptionId
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
  checkSizeTooSmall(scale: number): boolean
  maskExtent(scale: number, ratio: number, rotation: number): readonly [number, number]
  /** Called in native addDab position; material source consumers share context. */
  material?(context: SourceOptionContext): void
}
export interface SourceStampResult {
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
    const events: SourceStampEvent[] = []
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
    if (kind === 'paint' && boundary.checkSizeTooSmall(scale)) return { painted: false, events, scale, rate: rate() }
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
      if (this.options.Mirror.checked && (boundary.mirrorX || boundary.mirrorY)) evaluate('Mirror')
      return evaluate('Spacing')
    }
    if (kind === 'spacing') return { painted: false, events, scale, rotation, spacing: spacing() }
    const ratio = evaluate('Ratio')
    const [width, height] = boundary.maskExtent(scale, ratio, rotation)
    const [x, y] = sourceScatter({
      x: info.x, y: info.y, angle: info.drawingAngle, width, height,
      checked: this.options.Scatter.checked, axisX: boundary.scatterX, axisY: boundary.scatterY,
    }, this.context.random, () => evaluate('Scatter'))
    const opacity = evaluate('Opacity', () => this.options.Opacity.checked
      ? sourceSizeLike(sourceOptionComponents(this.options.Opacity, this.context, !boundary.indirectPainting)) : 1)
    const flow = evaluate('Flow')
    boundary.material?.(this.context)
    const spacingValue = spacing()
    return { painted: true, events, scale, rotation, ratio, x, y, opacity, flow, spacing: spacingValue, rate: rate() }
  }
}
