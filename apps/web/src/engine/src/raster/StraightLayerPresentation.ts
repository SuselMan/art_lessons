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
 * hidden queue or second scratch pool. The SAME pool claims reusable storage
 * and reserves only missing physical bytes before any GL allocation. */
export class StraightLayerPresentation {
  private busy = false
  private _cleanupFailure: unknown
  /** Cleanup error retained from the latest call; never replaces a primary draw error. */
  get cleanupFailure(): unknown { return this._cleanupFailure }
  private readonly pool: RibbonScratchPool
  private readonly passes: BlitPasses
  constructor(pool: RibbonScratchPool, passes: BlitPasses) {
    this.pool = pool
    this.passes = passes
  }

  /** The PM result is borrowed only for this synchronous callback. */
  withTile<T>(source: AccumulationBuffer, scaleX: number, scaleY: number, draw: (buffer: AccumulationBuffer) => T): T {
    if (source.pixelEncoding !== 'straight-rgba8') throw new TypeError('Expected straight canonical tile')
    if (this.busy) throw new Error('Presentation is already active')
    const plan = planStraightPresentation(source.width, source.height, scaleX, scaleY)
    const acquisition = this.pool.prepareAcquisition(plan.map(level => ({ ...level, pixelEncoding: 'premultiplied-rgba8', filter: 'linear' })))
    this.busy = true
    this._cleanupFailure = undefined
    let failed = false, failure: unknown
    let cleanupFailed = false, cleanupError: unknown
    let result: T | undefined
    let borrowed: AccumulationBuffer | undefined
    try {
      // Capture before acquire: allocation itself changes texture/FBO bindings.
      this.passes.withPresentationState(() => {
        let input = source
        for (let index = 0; index < plan.length; index++) {
          const level = plan[index]
          const next = acquisition.take(index)
          try {
            next.beginReplaceDraw()
            const matrix: Matrix3 = [input.width / level.width, 0, 0, 0, input.height / level.height, 0, 0, 0, 1]
            this.passes.transform(input, matrix, level.width, level.height, next.fbo, 'replace')
          } catch (error) {
            try { this.pool.release(next) } catch (cleanup) { this._cleanupFailure = cleanup }
            throw error
          }
          const previous = borrowed
          borrowed = next
          input = next
          if (previous) {
            try { this.pool.release(previous) }
            catch (error) { this._cleanupFailure = error; throw error }
          }
        }
      })
      // Original scissor/viewport/FBO are restored before the visible draw.
      result = draw(borrowed!)
    } catch (error) {
      failed = true
      failure = error
    } finally {
      try { if (borrowed) this.pool.release(borrowed) }
      catch (error) { cleanupFailed = true; cleanupError = error }
      // A pool error (including an epoch reset during draw) must not strand
      // the reservation or keep this synchronous service permanently busy.
      this.busy = false
      try { acquisition.close() }
      catch (error) { if (!cleanupFailed) { cleanupFailed = true; cleanupError = error } }
      if (cleanupFailed) this._cleanupFailure = cleanupError
    }
    if (failed) throw failure
    if (cleanupFailed) throw cleanupError
    return result as T
  }
}
