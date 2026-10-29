import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { BlitPasses } from './blitPasses'
import type { Matrix3 } from './matrix'

/** Allocation plan is bounded by ONE canonical tile, never canvas dimensions.
 * Each reduction is a 2x2 PM box: straight taps are premultiplied before mixing.
 * Odd sizes stop reduction rather than silently inventing edge coverage. */
export function planStraightPresentation(width: number, height: number, scaleX: number, scaleY: number): ReadonlyArray<Readonly<{ width: number; height: number }>> {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 1048576) throw new RangeError('Presentation tile exceeds bounds')
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) throw new RangeError('Invalid presentation scale')
  const levels: Array<Readonly<{ width: number; height: number }>> = []
  let scale = Math.max(scaleX, scaleY)
  do {
    const reduce = scale < 0.5 && width > 1 && height > 1 && width % 2 === 0 && height % 2 === 0
    if (reduce) { width /= 2; height /= 2; scale *= 2 }
    levels.push(Object.freeze({ width, height }))
    if (!reduce) break
  } while (scale < 0.5 && width > 1 && height > 1 && width % 2 === 0 && height % 2 === 0)
  return Object.freeze(levels)
}

/** Derived presentation only. No canonical writes, retained mirror, mipmaps,
 * hidden queue or second scratch pool. The engine owner must reserve the total
 * plan against its global LIVE+IDLE budget before any GL allocation. */
export class StraightLayerPresentation {
  private busy = false
  private readonly pool: RibbonScratchPool
  private readonly passes: BlitPasses
  private readonly reserveTransient: (bytes: number) => (() => void)
  constructor(pool: RibbonScratchPool, passes: BlitPasses, reserveTransient: (bytes: number) => (() => void)) {
    this.pool = pool
    this.passes = passes
    this.reserveTransient = reserveTransient
  }

  /** The PM result is borrowed only for this synchronous callback. */
  withTile<T>(source: AccumulationBuffer, scaleX: number, scaleY: number, draw: (buffer: AccumulationBuffer) => T): T {
    if (source.pixelEncoding !== 'straight-rgba8') throw new TypeError('Expected straight canonical tile')
    if (this.busy) throw new Error('Presentation is already active')
    const plan = planStraightPresentation(source.width, source.height, scaleX, scaleY)
    const releaseReservation = this.reserveTransient(plan.reduce((bytes, level) => bytes + level.width * level.height * 4, 0))
    if (typeof releaseReservation !== 'function') throw new TypeError('Missing presentation reservation release')
    this.busy = true
    let borrowed: AccumulationBuffer | undefined
    try {
      // Capture before acquire: allocation itself changes texture/FBO bindings.
      this.passes.withPresentationState(() => {
        let input = source
        for (const level of plan) {
          const next = this.pool.acquire(level.width, level.height, 'premultiplied-rgba8', 'linear')
          try {
            next.beginReplaceDraw()
            const matrix: Matrix3 = [input.width / level.width, 0, 0, 0, input.height / level.height, 0, 0, 0, 1]
            this.passes.transform(input, matrix, level.width, level.height, next.fbo, 'replace')
          } catch (error) { this.pool.release(next); throw error }
          if (borrowed) this.pool.release(borrowed)
          borrowed = next
          input = next
        }
      })
      // Original scissor/viewport/FBO are restored before the visible draw.
      return draw(borrowed!)
    } finally {
      if (borrowed) this.pool.release(borrowed)
      this.busy = false
      releaseReservation()
    }
  }
}
