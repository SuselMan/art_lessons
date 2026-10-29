import {
  buildCanonicalMaterial, canonicalMaterialGeometryCost, CANONICAL_STROKE_RASTER_PROFILE,
  decodeCanonicalStrokeFrame, type CanonicalStrokeFrameContext,
} from '@grafetto/shared'
import { advanceSourcePrimaryComposition, createSourcePrimaryComposition, type SourcePrimaryCompositionState } from './sourcePrimaryComposition'
import type { SourceStrokeMaterialContext } from './sourceStrokeMaterialAdapter'

export type SourceCanonicalStrokeContext = Omit<CanonicalStrokeFrameContext, 'frameOrdinal' | 'material'> & {
  readonly material: SourceStrokeMaterialContext
}
export type SourceCanonicalEncodedFrame = ReturnType<typeof decodeCanonicalStrokeFrame>

/** Author-side bridge from adapter.flush().packed to the SAME shared decoder
 * used by transport. Call at any accepted author yield, not only on pen-up.
 * No queue, RNG, sensor evaluation or GPU work. Returned frame, never the raw
 * author result, is the local renderer's input. No active engine hooks yet.
 *
 * The caller obtains this pinned context from the descriptor/room capability.
 * This class is not a server authorization mechanism or native SIMD attestation.
 */
export class SourceCanonicalFrameEncoder {
  private readonly context: Omit<CanonicalStrokeFrameContext, 'frameOrdinal'>
  private state: SourcePrimaryCompositionState

  constructor(context: SourceCanonicalStrokeContext) {
    // Do not keep mutable UI colour/composition/CAS arrays or accept a weaker
    // preflight callback. Exact recipes/cold-chunk budgets have one owner.
    this.context = {
      brush: context.brush, strokeId: context.strokeId,
      pigmentRgb8: Object.freeze([...context.pigmentRgb8] as [number, number, number]),
      composition: Object.freeze({ ...context.composition }),
      material: {
        assets: structuredClone(context.material.assets), primaryAsset: context.material.primaryAsset,
        maskAsset: context.material.maskAsset, budget: { ...context.material.budget },
        preflightDefinition: canonicalMaterialGeometryCost,
      },
    }
    this.state = createSourcePrimaryComposition(this.context.composition).state
    // Validate identity, RGB and trusted material domain through the actual
    // shared boundary before any author input is consumed. This empty probe is
    // NOT an emitted frame and does not reserve an ordinal or start a gesture.
    const probe = buildCanonicalMaterial({ masked: false, entry: { phase: 'between' }, draws: [], fences: [] }, this.context.material)
    decodeCanonicalStrokeFrame(this.envelope(probe.packed), { ...this.context, frameOrdinal: 0 })
  }

  get nextFrameOrdinal(): number { return this.state.nextFrameOrdinal }
  get ended(): boolean { return this.state.ended }

  /** One packed chunk per call; caller keeps the returned immutable bytes for
   * live send/log/retry. A failed call leaves ordinal and fence history intact.
   * Empty structural/final chunks must be passed too. No implicit pen-up/reset.
   */
  encode(materialPacked: string): SourceCanonicalEncodedFrame {
    if (this.state.ended) throw new Error('Canonical source gesture has ended')
    const accepted = decodeCanonicalStrokeFrame(this.envelope(materialPacked), { ...this.context, frameOrdinal: this.nextFrameOrdinal })
    // Primary-only execution capability/order is checked on decoded values.
    // In particular a structural dual-brush packet cannot enter this profile.
    const next = advanceSourcePrimaryComposition(this.state, { ordinal: this.nextFrameOrdinal, frame: accepted.frame }).state
    this.state = next
    return accepted
  }

  private envelope(materialPacked: string) {
    return {
      version: 1, rasterProfile: CANONICAL_STROKE_RASTER_PROFILE,
      brush: this.context.brush, strokeId: this.context.strokeId, frameOrdinal: this.nextFrameOrdinal,
      pigmentRgb8: this.context.pigmentRgb8, composition: this.context.composition, materialPacked,
    }
  }
}
