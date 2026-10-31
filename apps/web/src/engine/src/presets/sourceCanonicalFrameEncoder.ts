import {
  buildCanonicalMaterial, CANONICAL_STROKE_RASTER_PROFILE,
  decodeCanonicalStrokeFrame, type CanonicalStrokeFrameContext, type CanonicalStrokeFrameContextV2, type CanonicalMaterialFrameV2,
} from '@grafetto/shared'
import { advanceSourcePrimaryComposition, createSourcePrimaryComposition, type SourcePrimaryCompositionState } from './sourcePrimaryComposition'
import { copySourceMaterialContext, pinSourceMaterialTargets, assertSourceMaterialTargets, type SourceStrokeMaterialContext, type SourceStrokeMaterialContextV2, type SourceMaterialTargetGeometry } from './sourceStrokeMaterialAdapter'

export type SourceCanonicalStrokeContext = Omit<CanonicalStrokeFrameContext, 'frameOrdinal' | 'material'> & {
  readonly material: SourceStrokeMaterialContext
}
export type SourceCanonicalStrokeContextV2 = Omit<CanonicalStrokeFrameContextV2, 'frameOrdinal' | 'material'> & {readonly material:SourceStrokeMaterialContextV2}
type AnyContext=SourceCanonicalStrokeContext|SourceCanonicalStrokeContextV2
type EncodedFor<C> = C extends SourceCanonicalStrokeContextV2 ? {readonly envelope:SourceCanonicalEncodedFrame['envelope'];readonly frame:CanonicalMaterialFrameV2} : SourceCanonicalEncodedFrame
export type SourceCanonicalEncodedFrame = ReturnType<typeof decodeCanonicalStrokeFrame>

/** Author-side bridge from adapter.flush().packed to the SAME shared decoder
 * used by transport. Call at any accepted author yield, not only on pen-up.
 * No queue, RNG, sensor evaluation or GPU work. Returned frame, never the raw
 * author result, is the local renderer's input. No active engine hooks yet.
 *
 * The caller obtains this pinned context from the descriptor/room capability.
 * This class is not a server authorization mechanism or native SIMD attestation.
 */
export class SourceCanonicalFrameEncoder<C extends AnyContext=SourceCanonicalStrokeContext> {
  private readonly context: Omit<CanonicalStrokeFrameContext, 'frameOrdinal'>|Omit<CanonicalStrokeFrameContextV2, 'frameOrdinal'>
  private readonly targets:Readonly<SourceMaterialTargetGeometry>|undefined
  private state: SourcePrimaryCompositionState

  constructor(context:C) {
    this.targets=pinSourceMaterialTargets(context.material.targetGeometry)
    const material=copySourceMaterialContext(context.material)
    const common={brush:context.brush,strokeId:context.strokeId,rasterProfile:context.rasterProfile === undefined ? CANONICAL_STROKE_RASTER_PROFILE : context.rasterProfile,
      pigmentRgb8:Object.freeze([...context.pigmentRgb8] as [number,number,number]),
      composition:Object.freeze({...context.composition})}
    this.context='version' in material?{...common,material}:{...common,material}
    this.state = createSourcePrimaryComposition(this.context.composition).state
    // Validate identity, RGB and trusted material domain through the actual
    // shared boundary before any author input is consumed. This empty probe is
    // NOT an emitted frame and does not reserve an ordinal or start a gesture.
    const probe = buildCanonicalMaterial({ masked: false, entry: { phase: 'between' }, draws: [], fences: [] }, this.context.material)
    this.decode(probe.packed,0)
  }

  get nextFrameOrdinal(): number { return this.state.nextFrameOrdinal }
  get ended(): boolean { return this.state.ended }

  /** One packed chunk per call; caller keeps the returned immutable bytes for
   * live send/log/retry. A failed call leaves ordinal and fence history intact.
   * Empty structural/final chunks must be passed too. No implicit pen-up/reset.
   */
  encode(materialPacked: string): EncodedFor<C> {
    if (this.state.ended) throw new Error('Canonical source gesture has ended')
    const accepted = this.decode(materialPacked,this.nextFrameOrdinal)
    assertSourceMaterialTargets(accepted.frame,this.targets)
    // Primary-only execution capability/order is checked on decoded values.
    // In particular a structural dual-brush packet cannot enter this profile.
    const next = advanceSourcePrimaryComposition(this.state, { ordinal: this.nextFrameOrdinal, frame: accepted.frame }).state
    this.state = next
    return accepted as EncodedFor<C>
  }

  private decode(packed:string,ordinal:number) {
    const context=this.context
    return 'version' in context.material
      ? decodeCanonicalStrokeFrame(this.envelope(packed),{...context,material:context.material,frameOrdinal:ordinal})
      : decodeCanonicalStrokeFrame(this.envelope(packed),{...context,material:context.material,frameOrdinal:ordinal})
  }

  private envelope(materialPacked: string) {
    const rasterProfile=this.context.rasterProfile === undefined ? CANONICAL_STROKE_RASTER_PROFILE : this.context.rasterProfile
    return {
      version: rasterProfile===CANONICAL_STROKE_RASTER_PROFILE?1:2, rasterProfile,
      brush: this.context.brush, strokeId: this.context.strokeId, frameOrdinal: this.nextFrameOrdinal,
      pigmentRgb8: this.context.pigmentRgb8, composition: this.context.composition, materialPacked,
    }
  }
}
