import { BrushMipCache } from './BrushMipCache'
import { prepareSourceSoftCircleProgram, type SourceSoftCircleProgram, type SourceSoftCircleTip } from '../presets/sourceSoftCircleDab'
import type { SourceCurvePolynomial } from '../presets/sourceCurve'

/** One immutable bound source, sharing the existing CPU brush allowance.
 * These charges estimate reachable arrays/metadata, not actual JS heap size or
 * GC reclamation. The table allowance includes number-array growth; metadata
 * covers the copied knots, coefficient tuples and continuation objects. */
export class CanonicalSoftCircleProgramOwner {
  readonly estimatedCpuBytes: number
  private preparation?: ReturnType<typeof prepareSourceSoftCircleProgram>
  private releaseCpu?: () => void
  private retired = false
  private leases = 0
  private readonly cpu:BrushMipCache

  constructor(cpu: BrushMipCache, tip: SourceSoftCircleTip, curve: SourceCurvePolynomial, maxTableValues: number) {
    this.cpu=cpu
    if (!Number.isSafeInteger(maxTableValues) || maxTableValues < 2 || maxTableValues > 16384
      || !Array.isArray(curve.points) || !Array.isArray(curve.coefficients)
      || curve.points.length < 1 || curve.points.length > 256 || curve.coefficients.length > 256)
      throw new RangeError('Invalid bound soft-circle source budget')
    this.estimatedCpuBytes = 16 * maxTableValues + 512 + 1024 + 128 * (curve.points.length + curve.coefficients.length)
    // Admission must precede snapshots, staging allocation and table work.
    this.releaseCpu = cpu.reserve(this.estimatedCpuBytes)
    try { this.preparation = prepareSourceSoftCircleProgram(tip, curve, maxTableValues) }
    catch (error) { this.retireAfterFailure(error) }
  }

  get done(): boolean { return !this.retired && !!this.preparation?.done }
  sharesCpuOwner(cpu:BrushMipCache):boolean { return this.cpu===cpu }
  get completedValues(): number { return this.preparation?.completedValues ?? 0 }

  advance(maxValues: number): { written: number; done: boolean } {
    if (this.retired || !this.preparation) throw new Error('Bound soft-circle source retired')
    try { return this.preparation.advance(maxValues) }
    catch (error) { return this.retireAfterFailure(error) }
  }

  /** Retain until the consuming evaluator completes or is cancelled. Immutable
   * program references are trusted borrows: JS cannot revoke an escaped reference.
   * The caller must stop using it before release, including after owner retirement. */
  acquire(): { readonly program: SourceSoftCircleProgram; release(): void } {
    if (this.retired || !this.preparation) throw new Error('Bound soft-circle source retired')
    if (!this.preparation.done) throw new Error('Bound soft-circle source incomplete')
    let program: SourceSoftCircleProgram
    try { program = this.preparation.finish() }
    catch (error) { return this.retireAfterFailure(error) }
    this.leases++
    let released = false
    return Object.freeze({
      program,
      release: () => {
        if (released) return
        released = true
        this.leases--
        if (this.retired && this.leases === 0) this.releaseStorage()
      },
    })
  }

  /** Stop future work/borrows; existing evaluators retain their reservation. */
  retire(): void {
    if (this.retired) return
    this.retired = true
    try { this.preparation?.cancel() }
    finally { if (this.leases === 0) this.releaseStorage() }
  }

  private releaseStorage(): void {
    const release = this.releaseCpu
    this.releaseCpu = undefined
    this.preparation = undefined
    release?.()
  }

  private retireAfterFailure(error: unknown): never {
    try { this.retire() } catch { /* Preserve the original preparation failure. */ }
    throw error
  }
}
