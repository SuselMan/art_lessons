import type { BoundedGlTiming } from '../diagnostics/BoundedGlTiming'
import { prepareRibbonHalo } from './ribbonHalo'
import { prepareRibbonGestureScalars } from './ribbonGestureScalars'
import { prepareDrawableRibbonDabs, noteRibbonWetContacts } from './ribbonDrawable'
import { prepareRibbonDelivery } from './ribbonDelivery'
import type { CanonicalPreparedDeliveryInput } from './canonicalStrokeChunk'
import { canonicalMajorRadius } from '../watercolor/canonicalRadius'
import { selectedForeignWaterSources } from '../watercolor/foreignWater'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { Dab } from '@grafetto/shared'
import { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import { RibbonStrokeScratch, type RibbonFinishMetadata } from '../buffers/RibbonStrokeScratch'

import { type PencilPreset } from '../presets/pencilPresets'
import { type BrushDescriptor, type BrushPressureSettings } from '../presets/digitalBrushPresets'
import { buildRibbonBands } from '../dabs/markerRibbon'
import { buildRibbonBandBatch } from './ribbonBandBatch'
import { wetAt, wetPeak } from '../paper/paperWetness'
import { pigmentAbsorption } from '../watercolor/pigmentOptics'
import { WATERCOLOR_SPREAD, ribbonProfileFor, type RibbonProfile } from '../dabs/ribbonProfile'
import { WC_FILM_DOSE, watercolorHalo, WATERCOLOR_HALO_PAST_BLOOM, WATERCOLOR_HALO_DRAWN, watercolorTravelRadius } from '../presets/watercolorPresets'
import type { ILayerBuffer, PaintTarget } from '../buffers/ILayerBuffer'
import { EMPTY_BANDS, rectOnTile, ribbonBandPieceCost, ribbonBandPieces, ribbonBristleCombs, ribbonWaterDelivery } from './ribbonStrokeMath'

/** Opt-in preparation seam; the owning engine must provide epoch/FIFO and presentation. */
export interface PreparedRibbonMaterial {
  readonly presentationDabs: readonly Dab[]
  readonly metadata: RibbonFinishMetadata
  execute(): Generator<number, void, void>
  cancel(contextLost?: boolean): void
}

export type RibbonLiveComposite = {
    scratch: RibbonStrokeScratch
    preset: PencilPreset
    profile: RibbonProfile
    color: [number, number, number]
    opacity: number
    fieldSeed: [number, number]
    spreadPx: number
    fringeWater: number
    migratePx: number
    inkSmoothPx: number
    strokeDir: [number, number]
    bristleRadiusPx: number
  }

/** Synchronous observer after the single logical delivery advance, before tile GPU phases.
 * Build commands immediately from this recipe; do not retain mutable scratch/dab maps.
 * Observing does not route source ownership or skip legacy GPU work. */
export interface PreparedRibbonCpuDelivery {
 auxiliary?:{recipient:RibbonStrokeScratch;gesture:string}
 input:Omit<CanonicalPreparedDeliveryInput,'tile'>
 targets:readonly PaintTarget[]|null
 scratch:RibbonStrokeScratch
 bounds:{minX:number;minY:number;maxX:number;maxY:number}
 compositeBounds:{minX:number;minY:number;maxX:number;maxY:number}
 landedWet:number;wetPeak:number;strokeDir:[number,number]
}
export interface RibbonStrokePainterContext {
  onPreparedWatercolorDelivery?(request:PreparedRibbonCpuDelivery):void
  /** DEV executor ownership, only canonical watercolor; default delegates to GL. */
  nativeWatercolorRouting?():boolean
  routePreparedWatercolorDelivery?(request:PreparedRibbonCpuDelivery,target:ILayerBuffer):boolean
  importNativeForeignWater?(recipient:RibbonStrokeScratch,target:ILayerBuffer,gesture:string):void
  dabPool(): WeakMap<Dab, number>
  scratchPool(): RibbonScratchPool
  resolveWaterPreset(name: string): PencilPreset
  infinite(): boolean
  minmaxExt(): { MAX_EXT: number } | null
  setLiveComposite(value: RibbonLiveComposite | null): void
  dabWorldHalfExtents(d: Dab, erasing: boolean, preset: PencilPreset, wicking?: boolean): { hx: number; hy: number }
  drawRibbonBands(dest: AccumulationBuffer, tile: PaintTarget, bands: Float32Array, mode: 'coverage' | 'ink' | 'ink-max', aaPx: number, cloud?: number, gran?: number, mottleSeed?: [number, number], washWater?: number, waterRetain?: number, bristleCombs?: number, bristleInk?: number, depthTau?: readonly [number, number, number] | null, poolBlot?: number, availableWater?: AccumulationBuffer | null): void
  drawRibbonCompositeRect(tile: PaintTarget, bounds: { minX: number; minY: number; maxX: number; maxY: number }, preset: PencilPreset, profile: RibbonProfile, original: AccumulationBuffer, coverage: AccumulationBuffer, inkLoad: AccumulationBuffer | null, inkColor: AccumulationBuffer | null, color: [number, number, number], opacity: number, fieldSeed: [number, number], spreadPx: number, water: number, migratePx: number, inkSmoothPx: number, strokeDir: [number, number], bristleRadiusPx?: number): void
  drawRibbonNibPass(dest: AccumulationBuffer, tile: PaintTarget, dab: Dab, preset: PencilPreset, profile: RibbonProfile, inkMode: 6 | 7 | 10, opacity: number, ownTarget?: boolean, inkWater?: number, acrossLocal?: [number, number], paperWet?: number, inkStrength?: number, mottleSeed?: [number, number], clipTo?: AccumulationBuffer | null, bristleCombs?: number, bristleInk?: number, depthTau?: readonly [number, number, number] | null, puddle?: number, poolBlot?: number): void
  fieldOp(out: AccumulationBuffer, a: AccumulationBuffer, b: AccumulationBuffer, mode: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20, k: number, opts?: { c?: AccumulationBuffer; scissor?: [number, number, number, number]; dir?: [number, number]; d?: AccumulationBuffer; origin?: [number, number]; band?: [number, number]; size?: [number, number]; tau?: [number, number, number]; world?: [number, number, number] }): void
  markPaperDamage(b: { minX: number; minY: number; maxX: number; maxY: number }): void
  markerSegmentLength(dab: Dab, prevDab: Dab | undefined, radius: number): number
  nibDrawCost(tile: PaintTarget, dab: Dab, preset: PencilPreset): number
  nibTouchesTile(tile: PaintTarget, dab: Dab, preset: PencilPreset): boolean
  pageSize(): { w: number; h: number }
  paintBrushStroke(target: ILayerBuffer, dabs: Dab[], preset: PencilPreset, stamp: { brush: BrushDescriptor; pressure: BrushPressureSettings }, color: [number, number, number], scratch: RibbonStrokeScratch, prevDab: Dab | undefined): void
  resolveWithinSheet(target: ILayerBuffer, r: { minX: number; minY: number; maxX: number; maxY: number }): PaintTarget[]
  revealAfterBatch(tile: PaintTarget, bounds: { minX: number; minY: number; maxX: number; maxY: number }, prev: AccumulationBuffer | null): void
  revealBeforeBatch(tile: PaintTarget, bounds: { minX: number; minY: number; maxX: number; maxY: number }): AccumulationBuffer | null
  revealRect(tile: PaintTarget, bounds: { minX: number; minY: number; maxX: number; maxY: number }): [number, number, number, number] | null
  wcSheetClamp(r: { minX: number; minY: number; maxX: number; maxY: number }): { minX: number; minY: number; maxX: number; maxY: number }
}

/** Builds and deposits one ribbon batch; GPU draw primitives and frame scheduling
 * are supplied by the engine without changing the order of rendering. */
export class RibbonStrokePainter {
  private readonly ctx: RibbonStrokePainterContext
  /** Water is deposited before pigment on each segment, including replay. */
  diagnosticSegmentDelivery: false | 'combined' | 'explicit' = 'combined'
  diagnosticPigmentRecord = true
  diagnosticSharedFluid = true
  diagnosticLandingReservoir = true
  diagnosticWaterPolicy: 'legacy' | 'finite' | 'bottomless' = 'bottomless'
  diagnosticForeignSolvent = true
  diagnosticSolventField = true
  /** CPU-only geometry reuse; material doubles and draw order stay unchanged. */
  diagnosticBandBatch = false
  /** Diagnostic scheduling only: account for source copies in sliced work. */
  diagnosticSourceCopySlices = false
  /** Solver uniforms use the radius recoverable from the recorded dabs. */
  diagnosticCanonicalSettleRadius = true
  diagnosticLandingPolicy: 'dry' | 'fluid' = 'fluid'
  private readonly auxiliaryWater = new Set<RibbonStrokeScratch>()

  releaseWaterSources(contextLost = false): void {
    for (const scratch of this.auxiliaryWater) { if (contextLost) scratch.forget(); else scratch.destroy() }
    this.auxiliaryWater.clear()
  }
  diagnosticTrace: { before: number; after: number; water: number; dose: number }[] = []
  diagnosticTiming: BoundedGlTiming | null = null
  constructor(ctx: RibbonStrokePainterContext) {
    this.ctx = ctx
  }


  /** #330 — the marker's rasterizer: the stroke as one connected swept figure.
   *
   *  Three fields (coverage / inkLoad / composite, see RibbonStrokeScratch):
   *
   *  - **coverage** is plain geometry, not an accumulation of soft profiles: a
   *    nib stamp at every sample (DAB_FRAG's u_inkMode=6, an analytic in-pixel
   *    distance to the nib's outline) plus the bands between consecutive
   *    samples (markerRibbon.ts + RIBBON_FRAG). Both resolve their edge over a
   *    fixed ~1 canvas px ramp, so the mark's edge no longer widens with the
   *    brush — the complaint that started all of this. Their union is exact:
   *    for a convex nib, sweeping it along a segment is precisely the convex
   *    hull of its two endpoint copies, which stamp+band+stamp reproduces with
   *    nothing missing and nothing extra (see markerRibbon.ts, including what
   *    it does when the nib also turns between samples).
   *  - **inkLoad** rides the *same* geometry, both the stamps (u_inkMode=7) and
   *    the ribbon (RIBBON_FRAG's ink mode), each carrying half the deposit.
   *    Splatting it only at the stamps is what left rounded white notches on
   *    turns: between stamps the ribbon still made the mark opaque, but with no
   *    ink there the composite multiplied by nothing and the paper showed
   *    through.
   *  - **composite** runs *once per batch* over the batch's own dirty rect
   *    rather than once per dab. It was always a pure recomputation from
   *    (original, coverage, inkLoad); with coverage now coming from geometry
   *    that reaches between the dabs, a per-dab quad would no longer cover
   *    everything the other two passes just wrote.
   *
   *  Blending for coverage stays the ordinary saturating "over" rather than
   *  needing EXT_blend_minmax: interior coverage here is a flat 1.0, and
   *  over(x, 1) == 1, so a stamp's antialiased rim landing inside a band (or
   *  vice versa) resolves to solid either way. The two only ever meet at a
   *  tangent point, where both are ramping, and the difference between max and
   *  over there is a fraction of one pixel. */
  private *importForeignWater(target: ILayerBuffer, scratch: RibbonStrokeScratch, dabs: Dab[], preset: PencilPreset, wetProfile?: string, sources = scratch.foreignSources ?? [], forgetOnExit?: () => boolean): Generator<number, void, void> {
    const start = this.diagnosticTiming?.begin() ?? null
    try {
      const contacts = dabs.flatMap((d, i) => wetAt(wetProfile, i) > 0
        ? [{ x: d.x, y: d.y, radius: d.size * 0.5 * preset.sizeMultiplier, aspect: Math.max(1, d.aspectRatio), angle: d.angle }] : [])
      const native=this.ctx.nativeWatercolorRouting?.()===true
      const pool = this.ctx.scratchPool()
      for (const source of selectedForeignWaterSources(sources, contacts)) {
        if (scratch.foreignImportedGestures.has(source.gesture) || !source.chunks?.length) continue
        const unique = [...new Map(source.chunks.map(chunk => [chunk.id, chunk])).values()]
        const first = unique[0], sourcePreset = this.ctx.resolveWaterPreset(first.preset)
        const sourceProfile = ribbonProfileFor('watercolor', first.preset, wetAt(first.wet, 0))
        const aux = new RibbonStrokeScratch(pool, false, false)
        this.auxiliaryWater.add(aux)
        try {
          // Preserve the engine's recorded chunk film transitions exactly.
          // MAX is within a film; newFilm adds the next chunk to its saved base.
          for (const chunk of unique) {
            if(native)yield* this.paint(target, chunk.dabs, sourcePreset, first.preset, sourceProfile, chunk.color, aux, undefined, chunk.wet, chunk.seed, false, 256,{waterOnly:true,segmented:false,auxiliary:{recipient:scratch,gesture:source.gesture}})
            else yield* this.paintWaterSource(target, chunk.dabs, sourcePreset, first.preset, sourceProfile, chunk.color, aux, undefined, chunk.wet, chunk.seed, false, 256)
            aux.releaseFilm()
            aux.newFilm()
          }
          if(native){if(!this.ctx.importNativeForeignWater)throw new Error('Native foreign-water merge owner missing');this.ctx.importNativeForeignWater(scratch,target,source.gesture)}
          for (const [tile, donor] of aux.tileEntries()) {
            const recipient = scratch.getOrCreate(tile), temp = pool.acquire(tile.width, tile.height)
            try {
              this.ctx.fieldOp(temp, recipient.coverage, donor.coverage, 20, 0)
              temp.copyTo(recipient.coverage)
              if (donor.solventLoad) {
                if (!recipient.foreignSolventLoad) { recipient.foreignSolventLoad = pool.acquire(tile.width, tile.height); recipient.foreignSolventLoad.clear() }
                this.ctx.fieldOp(temp, recipient.foreignSolventLoad, donor.solventLoad, 1, 1)
                temp.copyTo(recipient.foreignSolventLoad)
              }
            } finally { pool.release(temp) }
          }
          scratch.foreignImportedGestures.add(source.gesture)
        } finally { this.auxiliaryWater.delete(aux); if (forgetOnExit?.()) aux.forget(); else aux.destroy() }
      }
    } finally { this.diagnosticTiming?.end('foreign-water-import', start) }
  }

  /** Logical delivery is evaluated at input time, never when a queued GPU film lands.
   * This extraction preserves immediate execution; deferred ownership is not enabled. */
  private prepareDelivery(
    drawable: Dab[], prevDab: Dab | undefined, preset: PencilPreset, profile: RibbonProfile,
    scratch: RibbonStrokeScratch, wetOf: (dab: Dab) => number, landedWet: number,
    segmentMode: false | 'combined' | 'explicit', segmented: boolean, film: boolean,
  ) {
    return prepareRibbonDelivery(drawable, prevDab, preset, profile, scratch, wetOf, landedWet,
      segmentMode, segmented, film, {
        markerSegmentLength: (dab, previous, radius) => this.ctx.markerSegmentLength(dab, previous, radius),
        dabPool: () => this.ctx.dabPool(),
      }, this)
  }

  *paintWaterSource(...args: Parameters<RibbonStrokePainter['paint']>): Generator<number, void, void> {
    // Invocation-local: a suspended auxiliary generator must not change
    // another paint's pigment/segmentation policy on this shared painter.
    args[12] = { waterOnly: true, segmented: false }
    yield* this.paint(...args)
  }

  *paint(
    target: ILayerBuffer, dabs: Dab[], preset: PencilPreset, presetName: string, profile: RibbonProfile,
    color: [number, number, number], scratch: RibbonStrokeScratch, prevDab: Dab | undefined,
    /** (#536) One hex digit per dab of `dabs`, saying how wet the paper each
     *  landed on already was — see paperWetness.ts. Sliced to this call's own
     *  dabs by the caller, so index 0 is dabs[0] on every path. */
    wetProfile?: string,
    strokeSeed?: [number, number],
    /** (#536, §17.22) See _paintRibbonDabs: the live gesture's composite waits for the frame. */
    deferComposite = false,
    /** (§17.70) See _ribbonDabsWork. */
    pieceTris = 0,
    mode: Readonly<{ waterOnly: boolean; segmented: boolean; sourceCopySlices?: boolean; auxiliary?:{recipient:RibbonStrokeScratch;gesture:string}; deferMaterial?: (request: PreparedRibbonMaterial) => void }> = { waterOnly: false, segmented: false },
  ): Generator<number, void, void> {
    if (this.diagnosticTiming) scratch.diagnosticTiming = this.diagnosticTiming
    const sourceCopySlices = pieceTris > 0 && (mode.sourceCopySlices ?? this.diagnosticSourceCopySlices)
    if (mode.deferMaterial) {
      if (!profile.normalizeDeposit || mode.waterOnly) throw new Error('Deferred source prototype is watercolor-only')
      preset = { ...preset }; profile = { ...profile }; color = [...color]
      strokeSeed = strokeSeed ? [...strokeSeed] : undefined
    }
    const immutable = (v: unknown): unknown => {
      if (v instanceof Float32Array) return v.slice()
      if (Array.isArray(v)) return v.slice()
      if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
        const copy = { ...v } as Record<string, unknown>
        for (const k of Object.keys(copy)) if (Array.isArray(copy[k])) copy[k] = (copy[k] as unknown[]).slice()
        return copy
      }
      return v
    }
    const sourceNib = (...args: Parameters<RibbonStrokePainterContext['drawRibbonNibPass']>): void => {
      if (scratch.trackRunningSource) {
        const saved = args.map(immutable) as typeof args
        scratch.runningSourceCommands.push(() => {
          if (saved[5] === 7) {
            const minmax = this.ctx.minmaxExt()
            if (minmax) saved[0].beginMaxDraw(minmax)
            else saved[0].beginAdditiveDraw()
          }
          this.ctx.drawRibbonNibPass(...saved)
          if (saved[5] === 7) saved[0].endDraw()
        })
      }
      this.ctx.drawRibbonNibPass(...args)
      if (args[5] === 7 && args[6] > 0 && (args[11] ?? 0) > 0) this.diagnosticTiming?.firstPigment()
    }
    const sourceBands = (...args: Parameters<RibbonStrokePainterContext['drawRibbonBands']>): void => {
      if (scratch.trackRunningSource) {
        const saved = args.map(immutable) as typeof args
        scratch.runningSourceCommands.push(() => this.ctx.drawRibbonBands(...saved))
      }
      this.ctx.drawRibbonBands(...args)
    }
    const sourceField = (...args: Parameters<RibbonStrokePainterContext['fieldOp']>): void => {
      if (scratch.trackRunningSource) {
        const saved = args.map(immutable) as typeof args
        scratch.runningSourceCommands.push(() => this.ctx.fieldOp(...saved))
      }
      this.ctx.fieldOp(...args)
    }
    const segmentMode = profile.normalizeDeposit ? this.diagnosticSegmentDelivery : false
    if (!mode.waterOnly && (!segmentMode || !this.diagnosticPigmentRecord || profile.pigmentStrength > 0)) scratch.pigmentInputsKnownZero = false
    if (segmentMode && dabs.length > 1 && !mode.segmented) {
      scratch.standing.clear()
      for (let i = 0; i < dabs.length; i++) {
        yield* this.paint(target, [dabs[i]], preset, presetName, profile, color, scratch,
            i === 0 ? prevDab : scratch.lastKept, wetProfile?.slice(i, i + 1), strokeSeed, deferComposite, pieceTris, { ...mode, segmented: true, sourceCopySlices })
      }
      return
    }
    const importForeign = segmentMode && this.diagnosticForeignSolvent && this.diagnosticSolventField && !mode.waterOnly
    const nativeRoute=profile.normalizeDeposit&&this.ctx.nativeWatercolorRouting?.()===true
    if (importForeign && !mode.deferMaterial) {
      yield* this.importForeignWater(target, scratch, dabs, preset, wetProfile)
    }
    if (segmentMode && this.diagnosticSharedFluid) profile = { ...profile, diagnosticReadFluid: true }
    // Two different treatments of a dab too thin to resolve, and which one a
    // tool gets is the whole of RibbonProfile.minHalfWidthPx (#454). The
    // marker drops it: a sub-half-pixel marker dab is degenerate. The brush
    // pen widens it to the floor instead, because for a tool whose width
    // floor is 0.15 of a size the user may set to 3px, "drop it" means
    // deleting the thin end of every stroke — the first thing ADR 009 asks
    // the tool to be able to draw.
    //
    // Copies rather than mutating: these Dab objects are the ones recorded on
    // the StrokeOperation and streamed to peers, and a draw-time clamp must
    // not rewrite what the operation says. Being a pure function of dab.size,
    // it lands identically on every replay anyway.
    const preparedDabs = prepareDrawableRibbonDabs(dabs, prevDab, preset, profile, scratch, wetProfile)
    let drawable = preparedDabs.drawable
    prevDab = preparedDabs.previous
    const { wetIndex, wetOf } = preparedDabs
    const film = profile.normalizeDeposit && !!this.ctx.minmaxExt() && !!scratch
    if (!drawable.length) return
    // #573 — a digital brush on the stamp model keeps this machinery's scratch
    // (the frozen layer, the stroke's coverage) and nothing else of it.
    if (profile.brushStamp) {
      this.ctx.paintBrushStroke(target, drawable, preset, profile.brushStamp, color, scratch, prevDab)
      return
    }

    const { nibShape, cornerFraction } = profile

    // One bounds box for the whole batch: the tiles to paint, and the rect the
    // single composite pass covers. Padded per dab by the same half-extents the
    // ordinary graphite path uses, so a chisel nib's 5x reach is accounted for.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    // (#536) …and by the halo a wet-paper dab lays around itself, at the widest
    // it can be for that wetness — this is a bound, and erring outward is the
    // cheap direction. See watercolorHalo.
    const haloBound = (d: Dab): number =>
      profile.normalizeDeposit ? watercolorHalo(wetOf(d), 1).scale : 1
    // …and the reach the halo is allowed past the bloom, at the cap: the
    // gesture's own spread is not resolved until further down, and this is a
    // bound, so the ceiling stands in.
    const haloPast = (d: Dab): number =>
      profile.normalizeDeposit && wetOf(d) > 0
        ? WATERCOLOR_HALO_PAST_BLOOM * WATERCOLOR_SPREAD.cap : 0
    // (§17.46) Two rects. The REACH (halo bound included) is what the gesture
    // hands its settle as the window the wet-in-wet may move paint in - cut
    // to the dabs, the settle's field ended at the brush's own footprint and
    // left hard straight edges through the wash (replay of HcpkzwNX). The
    // PAINT rect - tiles, film rebuild, live composite - only needs what is
    // actually laid, and with the halo stamp off (WATERCOLOR_HALO_DRAWN) that
    // is the dabs: the reach made a big brush in its own wet wash repaint and
    // recomposite three to four times the area every frame, the tablet's one
    // dropped frame in six.
    let rMinX = Infinity, rMinY = Infinity, rMaxX = -Infinity, rMaxY = -Infinity
    // (#536, §17.65) A dab whose reach misses the sheet adds nothing to either
    // rect. Judged per dab, so how the gesture was cut into batches cannot
    // matter: a live batch off the sheet contributed nothing (it paints
    // nothing), while a replay's one batch stretched its rect - and the settle
    // window after it - over the whole off-sheet run. A tail drawn down past
    // the sheet's right edge pulled the window 900 px lower, past the field's
    // cap, and the crop left the wash's own top out of the dry tide.
    const sheet = profile.normalizeDeposit && !this.ctx.infinite() ? this.ctx.pageSize() : null
    for (const d of prevDab ? [prevDab, ...drawable] : drawable) {
      const { hx, hy } = this.ctx.dabWorldHalfExtents(d, false, preset)
      const g = haloBound(d), past = haloPast(d)
      if (sheet && (d.x + hx * g + past <= 0 || d.y + hy * g + past <= 0
        || d.x - hx * g - past >= sheet.w || d.y - hy * g - past >= sheet.h)) continue
      rMinX = Math.min(rMinX, d.x - hx * g - past); rMaxX = Math.max(rMaxX, d.x + hx * g + past)
      rMinY = Math.min(rMinY, d.y - hy * g - past); rMaxY = Math.max(rMaxY, d.y + hy * g + past)
      const pg = WATERCOLOR_HALO_DRAWN ? g : 1, pp = WATERCOLOR_HALO_DRAWN ? past : 0
      minX = Math.min(minX, d.x - hx * pg - pp); maxX = Math.max(maxX, d.x + hx * pg + pp)
      minY = Math.min(minY, d.y - hy * pg - pp); maxY = Math.max(maxY, d.y + hy * pg + pp)
    }
    const bounds = { minX, minY, maxX, maxY }
    // The tiles over the REACH, as before: a tile the settle is to spread
    // into needs its wash entry, and the paint rect alone left a drop across
    // the bounded room's x=1024 seam unable to run into the next tile. Per
    // tile, the film rebuild and composite are cut to the paint rect.
    const reachRect = { minX: rMinX, minY: rMinY, maxX: rMaxX, maxY: rMaxY }
    const targets = mode.deferMaterial ? null : this.ctx.resolveWithinSheet(target, profile.normalizeDeposit ? this.ctx.wcSheetClamp(reachRect) : reachRect)
    // (#536, §17.63) Not yet: a batch with nothing on the sheet still spends
    // the gesture's brush - see the return after the deposit loop.

    // (#468 v2/v4, ADR 011 §3.5) The stroke's typical radius decides how far its
    // water carries. Mean rather than max: one heavy dab at the end of an
    // otherwise light stroke should not widen the whole mark's boundary
    // treatment.
    // (#468 v6) The deposit's ripple has exactly the dab spacing for a period,
    // so that is what it must be read back over. The first attempt guessed it
    // from the first dab's radius and landed at a quarter of the true value —
    // the ring came out 3.8px wide against a 15.4px period and cancelled
    // essentially nothing, which is why the circles survived the first fix.
    const firstGap = drawable.length >= 2
      ? Math.hypot(drawable[1].x - drawable[0].x, drawable[1].y - drawable[0].y)
      : (prevDab ? Math.hypot(drawable[0].x - prevDab.x, drawable[0].y - prevDab.y) : 0)
    const dabSpacing = scratch.noteDabSpacing(firstGap)
    const dirFrom = drawable.length >= 2 ? drawable[0] : prevDab
    const dirTo = drawable.length >= 2 ? drawable[1] : drawable[0]
    const strokeDir = scratch.noteDirection(
      dirFrom ? dirTo.x - dirFrom.x : 0, dirFrom ? dirTo.y - dirFrom.y : 0,
    )
    // (#536) How wet the paper was where this gesture came down. Read once,
    // above everything that needs it — the composite's cached scalars want it
    // as much as the deposit does.
    // Landing belongs to the gesture, not to the next pointer batch.
    const landedWet = scratch.finishContext?.landedWet ?? wetAt(wetProfile, 0)
    const wetPeakHere = wetPeak(wetProfile)
    noteRibbonWetContacts(scratch, drawable, preset, wetOf)
    const gestureScalars = scratch.compositeScalars(() => prepareRibbonGestureScalars(drawable[0], preset, profile, presetName))
    const { spreadPx, water: fringeWater, migratePx, fieldSeed, bristleRadiusPx } = gestureScalars

    // (#468 v4, ADR 011 §4.4) The composite rect a *live* batch redraws, padded
    // past the dabs it just painted.
    //
    // v2 and v3 ran the spread and the tideline only at pen-up, because both
    // read a neighbourhood the moving brush front has not finished writing. The
    // cost was a visible jump: the artist drew one shape and watched it become
    // another the instant the stylus lifted. Correct by the model, and bad —
    // real paint keeps moving, it does not swap geometry in a single frame.
    //
    // The fix is that both terms are *local*: they reach at most spread +
    // tideline radius from any pixel. So a batch that recomposites its own
    // dabs plus that much margin fixes up everything the previous batch could
    // only guess at, and the only region still provisional is the margin around
    // the live front — which is where the brush is, and which the next batch
    // corrects. The settle pass at pen-up then has nothing left to do but the
    // final margin, so the mark barely changes when the pen comes up.
    //
    // Costs a larger rect per batch. Bounded by the padding, not by the stroke:
    // this stays proportional to what the batch painted, unlike recompositing
    // the whole stroke every event, which is what made deferral necessary in
    // the first place.
    // The pad has to cover *everything that can still change this pixel*, and
    // that is not just how far the composite reaches sideways — it is also how
    // long the brush keeps depositing into a pixel it has already passed.
    //
    // Ink and coverage keep arriving until the nib has travelled a full radius
    // beyond a spot. Pad by less than that and a live batch composites from an
    // inkLoad that is still missing the dabs behind the front, and no later
    // batch's rect ever reaches back to correct it. Replay, which composites
    // once with the whole stroke in the buffers, has no such gap — so the two
    // disagreed, and a reload silently redrew the stroke differently. Measured
    // at 26% of the mark's area before this, 9% of it strongly.
    //
    // That is a determinism bug, not a cosmetic one: two people in one room
    // were looking at different pictures.
    let maxRadius = 0
    // #489: the nib's *reach*, not its short axis — this term is a bound, and a
    // flat nib deposits a long semi-axis past a spot rather than a short one.
    // Erring outward costs a slightly larger rect; erring inward composites
    // from buffers that are still filling, which is the determinism bug this
    // whole block exists to prevent.
    // (§17.23) …and the nib's own radius, without the halo's bound: what the
    // rim is scaled by.
    let nibRadius = 0
    for (const d of drawable) {
      const minor = d.size * 0.5 * preset.sizeMultiplier
      maxRadius = Math.max(maxRadius, minor * Math.max(d.aspectRatio, 1) * haloBound(d) + haloPast(d))
      nibRadius = Math.max(nibRadius, this.diagnosticCanonicalSettleRadius
        ? canonicalMajorRadius(d.size, d.aspectRatio, preset.sizeMultiplier)
        : minor * Math.max(d.aspectRatio, 1))
    }
    // Everything that can still change this pixel, **summed** rather than
    // maxed — each term is a separate hop outward and they compose:
    //
    //   maxRadius   the nib keeps depositing into a spot until it has travelled
    //               its own radius past it;
    //   spreadPx    the boundary is decided from a blur of coverage that far away;
    //   wetEdge     the tideline reads the same blur;
    //   dabSpacing  the deposit is read back averaged over one spacing, so a
    //               pixel's value depends on its neighbours' deposits too;
    //   migratePx   (#468 v11) pigment is exchanged with a ring that far out,
    //               so a pixel's tone depends on deposits that far away — and
    //               unlike the terms above this one is symmetric, since paint
    //               arriving is as much a change as paint leaving.
    //
    // Getting this wrong does not merely blur something: a live batch then
    // composites from buffers that are still filling, no later batch's rect
    // reaches back to correct it, and the mark ends up different from what a
    // replay of the same operation produces.
    // (#536) Twice the reach, because the mark can end up that much wider than
    // the brush: the re-threshold displaces the boundary outward by about
    // 2 * reach * push, and push is capped at WC_WET_PUSH, which is 0.5. Under-
    // padding here does not soften a mark, it cuts it off square at the rect's
    // edge — so this is a bound, not an estimate.
    //
    // It used to pad for the bloom multiplied into the *radius*. That factor is
    // gone (see the reach's own note in DAB_FRAG: an eighty-pixel radius on a
    // twelve-tap ring is not a blur), and padding for it was costing two and a
    // half times the composite fill it needed.
    // (#536, §17.22) No maxRadius here any more: `bounds` is built from the
    // dabs' world half-extents (and the previous dab's), so the nib's own
    // radius is already inside it, and adding it again put a 400 px brush's
    // rect at 1136 px a side where 740 would do — 2.4 times the fill. The
    // pad is the composite's READ reach only, plus the stamps' edge AA.
    const compositePad = spreadPx > 0
      ? Math.ceil(
        spreadPx * 2 + profile.wetEdgeRadiusPx + dabSpacing + migratePx + profile.aaPx,
      ) + 1
      : 0
    const compositeBounds = compositePad > 0
      ? {
        minX: bounds.minX - compositePad, minY: bounds.minY - compositePad,
        maxX: bounds.maxX + compositePad, maxY: bounds.maxY + compositePad,
      }
      : bounds
    const reachBounds = {
      minX: rMinX - compositePad, minY: rMinY - compositePad,
      maxX: rMaxX + compositePad, maxY: rMaxY + compositePad,
    }

    // (#468 v3, ADR 011 §3.8) Every dab's ink deposit, resolved once for the
    // batch — *before* the tile loop, because the depletion clock must advance
    // once per batch and not once per tile a batch happens to straddle.
    //
    // Two things happen here that did not before, both watercolor-only:
    //
    //  - the deposit is divided by the dab's own radius, turning it from a
    //    quantity per unit *length* into one per unit *area*. Unnormalized it
    //    scaled with brush size and saturated the 8-bit inkLoad buffer on the
    //    first dab of any real wash, which pinned the composite's saturation
    //    curve at 1 and made `density` dead code (see normalizeDeposit);
    //  - it decays as the brush unloads along the stroke, which is only
    //    expressible *because* of the normalization above.
    //
    // The marker takes neither and must not: its strokes are permanent and its
    // constants were calibrated against the old scale. What it does take
    // (#559) is a gain of >= 1 on that same legacy deposit wherever the nib is
    // too thin along the travel to have reached the film's knee at all — see
    // markerInkGain.ts. Exactly 1 for every nib that saturated already.
    // (#468 v4, ADR 011 §4) Water and pigment run down at *different* rates,
    // and that difference is the whole behaviour: water soaks away fast while
    // pigment stays on the hairs, so one long stroke walks itself from a wet
    // saturated start, through an ordinary middle, to a dry but still strongly
    // coloured end — and finally to a broken dry-brush tail. A single "wetness"
    // scalar cannot produce that arc at all.
    const inkStrength = profile.normalizeDeposit ? profile.pigmentStrength : 1
    const mottleSeed = strokeSeed ?? [0, 0]
    const delivery = this.prepareDelivery(drawable, prevDab, preset, profile, scratch, wetOf, landedWet, segmentMode, mode.segmented, film)
    const { deposits, waterByDab, pigmentByDab, acrossByDab, movingByDab,
      paperWetByDab, pigmentPoolByDab, excessByDab, puddleByDab, thinNibGain } = delivery
    if ((this.ctx.onPreparedWatercolorDelivery||this.ctx.routePreparedWatercolorDelivery) && profile.normalizeDeposit && !profile.stampFlow && !profile.brushStamp && profile.coverageInkMode === 6) {
      const prepared:PreparedRibbonCpuDelivery={auxiliary:mode.auxiliary,
        input:{preset,presetName,profile,color,wetProfile,strokeSeed,film,segmentMode,segmented:mode.segmented,waterOnly:mode.waterOnly,
          drawable,previous:prevDab,wetOf,delivery,scalars:gestureScalars,
          materialEnabled:mode.deferMaterial?Number.isFinite(reachRect.minX):!!targets?.length,
          options:{diagnosticWaterPolicy:this.diagnosticWaterPolicy,diagnosticSharedFluid:this.diagnosticSharedFluid,diagnosticLandingReservoir:this.diagnosticLandingReservoir,
            diagnosticLandingPolicy:this.diagnosticLandingPolicy,diagnosticCanonicalSettleRadius:this.diagnosticCanonicalSettleRadius,diagnosticSolventField:this.diagnosticSolventField,diagnosticPigmentRecord:this.diagnosticPigmentRecord}},
        targets,scratch,bounds:{...bounds},compositeBounds:{...compositeBounds},landedWet,wetPeak:wetPeakHere,strokeDir,
      }
      this.ctx.onPreparedWatercolorDelivery?.(prepared)
      if(nativeRoute){
        if(!this.ctx.routePreparedWatercolorDelivery?.(prepared,target))throw new Error('Native watercolor routing must consume prepared source; no GL fallback')
        if(mode.waterOnly||!prepared.input.materialEnabled)return
        scratch.paints.add(color.join(','))
        scratch.noteFinish({target,preset,profile,color,opacity:drawable[0].opacity,bounds:reachBounds,fieldSeed,landedWet,wetPeak:wetPeakHere,radiusPx:nibRadius,dwellMs:scratch.dwellMs})
        scratch.diffusePending=true
        target.markContentPainted(compositeBounds)
        return
      }
    }
    // (#536, §17.63) Only now. Everything above is the gesture's bookkeeping -
    // the brush's water and pigment clocks, the landing and its dwell, the dab
    // spacing, the direction, the composite's scalars from the first dab - and
    // it has to advance per dab whether or not the batch lands on the sheet.
    // Returning before it made the result depend on how the gesture was cut
    // into batches: the author's live batches off the sheet spent nothing, and
    // the brush came onto the paper fully loaded; a replay paints the operation
    // as one batch that does reach the sheet, and it came on already spent -
    // 30-40 % lighter over the whole mark (a V begun off the page at 32 %).
    if (mode.deferMaterial ? !Number.isFinite(reachRect.minX) : !targets!.length) return

    // (#536, ADR 011 §17.10) The halo: a second, wider, weaker stamp for every
    // dab that landed on wet paper, into the same coverage and deposit buffers.
    // This is where wet-in-wet growth lives now, and the reason it lives here
    // rather than in the composite is spelled out at watercolorHalo. Grown
    // copies carry over every per-dab reading of the original, so the bands
    // and stamps of the halo agree with the mark's own about water, hair
    // direction and paper.
    const haloProfile: RibbonProfile = { ...profile, inkEdgeFalloff: 1 }
    const { haloDabs, haloDoseByDab, haloShedByDab, anyHalo } = prepareRibbonHalo(drawable, spreadPx, profile.normalizeDeposit, {
      waterByDab, pigmentByDab, pigmentPoolByDab, excessByDab, puddleByDab, paperWetByDab, acrossByDab,
    })

    // Bands share the stamps' scale, or they would swamp it: the two overlap
    // almost everywhere and each carries half a dose, so a band still on the
    // legacy scale would drown whatever the normalized stamps expressed.
    // Omitting the callback leaves buildRibbonBands' own formula untouched,
    // which is what the brush pen gets. The marker (#559) passes that same
    // formula back in with the thin-nib gain on it, so its bands and stamps
    // stay on one scale — a gain of 1 reproduces the omitted case exactly.
    const inkFor = profile.thinNibInkRefPx > 0 && !profile.normalizeDeposit
      ? (d0: Dab, d1: Dab, travel: number): { ink: number; water: number; paperWet: number; strength: number; puddle: number; pigmentPool?: number } => ({
        ink: d1.opacity * travel * 0.5 * thinNibGain(d1, d0.x, d0.y),
        water: 0, paperWet: 0, strength: 0, puddle: 1,
      })
      : profile.normalizeDeposit
      ? (d0: Dab, d1: Dab, travel: number): { ink: number; water: number; paperWet: number; strength: number; puddle: number; pigmentPool?: number } => {
        // #489: same measure the stamps use, and it has to be the same one —
        // the bands overlap the stamps almost everywhere, so two different
        // readings of "how far in nib units" would show up as a seam.
        const minor = d1.size * 0.5 * preset.sizeMultiplier
        const bdx = d1.x - d0.x
        const bdy = d1.y - d0.y
        const bandAngle = Math.hypot(bdx, bdy) > 0.01 ? Math.atan2(bdy, bdx) : null
        const radius = Math.max(watercolorTravelRadius(
          minor * Math.max(d1.aspectRatio, 1), minor, d1.angle, bandAngle,
        ), 0.5)
        // Per segment, not per batch: the water weighting rides the vertex now
        // (markerRibbon.ts's FLOATS_PER_VERTEX) precisely so that how the
        // stroke was cut into pointer events cannot change the result.
        return {
          ink: (film
            ? (profile.depositPerRadius * 0.5) * WC_FILM_DOSE * 2
            : (profile.depositPerRadius * 0.5) * (travel / radius) * 0.5 * ((1 - profile.stampInkShare) * 2))
            * (pigmentByDab.get(d1) ?? 1)
            * (excessByDab.get(d1) ?? 1)
            // (#536) …less what this dab shed into standing water — see the
            // halo, which is made of exactly this share.
            * (1 - (haloShedByDab.get(d1) ?? 0)),
          water: waterByDab.get(d1) ?? 0,
          paperWet: paperWetByDab.get(d1) ?? 0,
          // (#680, s17.84) Negative on a segment the brush barely moved
          // along: its direction jitters, and the coverage pass leaves the
          // pool mark (.g) off there - see movingByDab. The ink pass reads
          // the magnitude.
          strength: Math.hypot(bdx, bdy) > 0.2 * minor ? inkStrength : -inkStrength,
          puddle: puddleByDab.get(d1) ?? 1,
          pigmentPool: pigmentPoolByDab.get(d1) ?? 0.5,
        }
      }
      : undefined
    // #547 — not merely unused for a stamps-only tool but not built at all:
    // the band builder walks every consecutive pair and allocates a vertex
    // buffer per segment, which on a densely-spaced brush stroke is the larger
    // half of the CPU work in this method.
    const bandBatch = this.diagnosticBandBatch && segmentMode && inkFor && this.diagnosticSolventField && !profile.stampsOnly
      ? buildRibbonBandBatch(drawable, preset.sizeMultiplier, prevDab, nibShape, cornerFraction, profile.aaPx, [
          inkFor,
          (d0, d1, travel) => ({ ...inkFor(d0, d1, travel), paperWet: wetOf(d1) }),
          (_d0, d1) => ({ ink: (waterByDab.get(d1) ?? 0) / 4, water: 1, paperWet: 0, strength: 0, puddle: 0, pigmentPool: 0 }),
        ], film)
      : null
    const bands = bandBatch?.[0] ?? (profile.stampsOnly ? EMPTY_BANDS : buildRibbonBands(
      drawable, preset.sizeMultiplier, prevDab, nibShape, cornerFraction, profile.aaPx, inkFor, film,
    ))

    // The water phase keeps contact-before metadata; pigment bands sample
    // after-delivery fluid. They share geometry and immutable source dose.
    const waterBands = bandBatch?.[1] ?? (segmentMode && inkFor && !profile.stampsOnly
      ? buildRibbonBands(drawable, preset.sizeMultiplier, prevDab, nibShape, cornerFraction, profile.aaPx,
          (d0, d1, travel) => ({ ...inkFor(d0, d1, travel), paperWet: wetOf(d1) }), film)
      : bands)
    const solventBands = bandBatch?.[2] ?? (segmentMode && this.diagnosticSolventField && !profile.stampsOnly
      ? buildRibbonBands(drawable, preset.sizeMultiplier, prevDab, nibShape, cornerFraction, profile.aaPx,
          (_d0, d1) => ({ ink: (waterByDab.get(d1) ?? 0) / 4, water: 1, paperWet: 0,
            strength: 0, puddle: 0, pigmentPool: 0 }), film)
      : EMPTY_BANDS)

    // (#536, s17.13) The hairs' bundle count, for the ink pass below and the
    // composite alike - see ribbonBristleCombs.
    const combs = ribbonBristleCombs(profile, bristleRadiusPx)
    // (#536, §17.19) This stroke's paint as absorption, for the colour record.
    const tau = pigmentAbsorption(color)
    scratch.paints.add(color.join(','))

    // #547 — flow, normalized against how far the brush travelled between
    // stamps, computed once for the batch rather than per tile.
    //
    // Why it has to be normalized at all, and this is the correction to the
    // first version: the coverage buffer accumulates as plain "over", and the
    // stamps of this tool are spaced a *twentieth* of the footprint apart. A
    // pixel is therefore under ~20 of them in a single pass, so even a flow of
    // 0.12 reaches 1 - 0.88^20 = 0.92 — and every brush, at every pressure, came
    // out at full density. The setting existed and could not be seen ("нажим
    // меняет плотность вообще не работает, всё время максимальная плотность").
    //
    // The fix makes `flow` mean what a painter means by it: **how much one full
    // pass of the brush lays down**, rather than how much one stamp does. Per
    // stamp that is
    //
    //     f' = 1 - (1 - f) ^ (travel / diameter)
    //
    // so that after travelling one diameter — i.e. after the ~diameter/travel
    // stamps that cover a given pixel — the accumulated coverage is exactly f,
    // whatever the spacing. Two consequences worth naming: the density stops
    // depending on how fast the stroke was drawn (fast strokes used to be
    // sparser and therefore paler), and it stops depending on the brush's
    // authored spacing, which is now free to be chosen for smoothness alone.
    const stampFlows = profile.stampFlow
      ? drawable.map((dab, i) => {
        const prevOne = i === 0 ? prevDab : drawable[i - 1]
        const diameter = Math.max(dab.size * preset.sizeMultiplier, 0.5)
        const travel = this.ctx.markerSegmentLength(dab, prevOne, diameter * 0.5)
        const full = profile.stampFlow!(dab.pressure)
        if (full >= 1) return 1
        return Math.max(0, Math.min(1, 1 - Math.pow(1 - full, Math.min(travel / diameter, 1))))
      })
      : null



    if (mode.deferMaterial) {
      // Preserve original Dab keys in standing/dabPool for the input caller.
      // Only the queued GPU geometry receives owned copies after logical preparation.
      drawable = drawable.map(original => {
        const copy = { ...original }
        // Coverage still reads the recorded contact through wetOf, whose
        // index is keyed by Dab identity. The owned geometry must keep that
        // index too; a missing clone key would silently turn wet contact dry.
        const contactIndex = wetIndex.get(original)
        if (contactIndex !== undefined) wetIndex.set(copy, contactIndex)
        for (const values of [waterByDab, pigmentByDab, paperWetByDab, pigmentPoolByDab, excessByDab, puddleByDab]) {
          const value = values.get(original)
          if (value !== undefined) values.set(copy, value)
        }
        const across = acrossByDab.get(original)
        if (across) acrossByDab.set(copy, [...across])
        if (movingByDab.has(original)) movingByDab.add(copy)
        return copy
      })
      dabs = dabs.map(d => ({ ...d }))
      prevDab = prevDab ? { ...prevDab } : undefined
    }
    const noteFinish = (): void => scratch.noteFinish({
      target, preset, profile, color, opacity: drawable[0].opacity,
      bounds: reachBounds, fieldSeed, landedWet, wetPeak: wetPeakHere, radiusPx: nibRadius, dwellMs: scratch.dwellMs,
    })
    const materialGesture = scratch.gesture
    let captured: RibbonFinishMetadata | undefined
    let cancelledLost = false
    const material = function* (this: RibbonStrokePainter): Generator<number, void, void> {
      if (mode.deferMaterial) {
        scratch.activateMaterialFilm(materialGesture)
        if (importForeign) yield* this.importForeignWater(target, scratch, dabs, preset, wetProfile, captured!.foreignSources ?? [], () => cancelledLost)
      }
      const materialTargets = targets ?? this.ctx.resolveWithinSheet(target, profile.normalizeDeposit ? this.ctx.wcSheetClamp(reachRect) : reachRect)
      for (const tile of materialTargets) {
        const { original, coverage, inkLoad, inkColor } = scratch.getOrCreate(tile.buffer)

        // #547, ADR 013 §3 — the stamp's own `opacity` argument is this dab's
        // **flow** for the digital brush, and a plain 0 for the three tools whose
        // coverage pass only needs a silhouette (their mode-6 branch ignores it).
        // (#536, s17.11) For the watercolor the recorded paper wetness rides
        // along into the coverage stamp too: its .b is the standing-water
        // record the diffusion pass gates on. See u_washWater.
        const waterPhase = function* (this: RibbonStrokePainter): Generator<number, void, void> {
        scratch.runningCoverage(tile.buffer)
        for (let i = 0; i < drawable.length; i++) {
          const dab = drawable[i]
          if (!this.ctx.nibTouchesTile(tile, dab, preset)) continue // (§17.70)
          sourceNib(
            coverage, tile, dab, preset, profile, profile.coverageInkMode,
            stampFlows ? stampFlows[i] : 0, true, waterByDab.get(dab) ?? 0, acrossByDab.get(dab) ?? [0, 1],
            wetOf(dab), 1, [0, 0], null, combs, 0, null, puddleByDab.get(dab) ?? 1,
            // (s17.84) ...and the pool share into the coverage's .g - where
            // the brush was moving: a standing dab has no direction to comb
            // along (its across is the default, not the travel's).
            profile.waterDepletion && movingByDab.has(dab) ? 1 : 0,
          )
          yield pieceTris ? this.ctx.nibDrawCost(tile, dab, preset) : 0
        }
        // #547 — a brush's mark is a repeated stamp, not a swept smear, so the
        // bands that fill between samples are switched off for it (ADR 013 §4).
        // The three older tools keep them: on a turn the bands reach places the
        // stamps miss, and with nothing there the composite paints bare paper.
        if (!profile.stampsOnly && waterBands.length) {
          for (const piece of ribbonBandPieces(waterBands, pieceTris)) {
            const px = pieceTris ? ribbonBandPieceCost(piece, tile) : 0
            if (pieceTris && !px) continue // (§17.70) nothing of it on this tile
            sourceBands(
              coverage, tile, piece, 'coverage', profile.aaPx, 0, 0, [0, 0],
              ribbonWaterDelivery(profile).water, ribbonWaterDelivery(profile).retain,
              combs, 0, null, profile.waterDepletion ? 1 : 0,
            )
            yield px
          }
        }

        if (segmentMode && this.diagnosticSolventField) {
          // Water has its OWN film/base. MAX water and MAX pigment envelopes
          // must not compete in one record or compress each other's headroom.
          const solvent = scratch.solventFilm(tile.buffer)
          const solventProfile = { ...profile, diagnosticReadFluid: false, inkEdgeFalloff: 1, cloud: 0, granulation: 0, bristleInk: 0 }
          for (const dab of drawable) {
            if (!this.ctx.nibTouchesTile(tile, dab, preset)) continue
            if (film) solvent.film.beginMaxDraw(this.ctx.minmaxExt()!); else solvent.film.beginAdditiveDraw()
            sourceNib(solvent.film, tile, dab, preset, solventProfile, 7,
              (waterByDab.get(dab) ?? 0) / 4, false, 1, acrossByDab.get(dab) ?? [0, 1],
              0, 0, mottleSeed, coverage, combs, 0, null, 0, 0)
            solvent.film.endDraw()
            yield pieceTris ? this.ctx.nibDrawCost(tile, dab, preset) : 0
          }
          for (const piece of ribbonBandPieces(solventBands, pieceTris)) {
            sourceBands(solvent.film, tile, piece, film ? 'ink-max' : 'ink', profile.aaPx, 0, 0, mottleSeed,
              0, 0, combs, 0, null, 0)
            yield pieceTris ? ribbonBandPieceCost(piece, tile) : 0
          }
          // Independent V cap4 is an explicit reservoir limit. It cannot
          // rescale the material P/C records; source P still uses the old film.
          const solventRect = this.ctx.revealRect(tile, compositeBounds)
          if (solventRect) {
            sourceField(solvent.load, solvent.base, solvent.film, 1, 1, { scissor: solventRect })
            if (sourceCopySlices) yield solventRect[2] * solventRect[3]
          }
        }

        }.bind(this)

        // Ink follows the *same* figure as the silhouette. Depositing it only at
        // the sample stamps is what produced the rounded white notches on turns:
        // between stamps the ribbon still made the mark fully opaque, but with an
        // ink load of zero the composite multiplies by nothing and the paper
        // shows straight through. Both halves carry half a dose each (see
        // buildRibbonBands) so their overlap sums to the calibrated amount.
        //
        // Skipped entirely for a covering ink, which has no such quantity — see
        // RibbonProfile.ink.
        // (§17.28) With the film on, the stamps and bands go into the gesture's
        // own buffers under MAX and inkLoad/inkColor are rebuilt as base + film
        // over the batch's rect; without it, straight into inkLoad additively.
        const fb = film && inkLoad ? scratch.filmBuffers(tile.buffer) : null
        const inkDest = fb ? fb.strokeInk : inkLoad
        const colorDest = fb ? fb.strokeColor : inkColor
        const beginInk = (buf: AccumulationBuffer): void => { if (fb) buf.beginMaxDraw(this.ctx.minmaxExt()!); else buf.beginAdditiveDraw() }
        const bandMode = fb ? 'ink-max' as const : 'ink' as const
        // (#680, s17.79) The watercolor's surplus lies in blots — see wcPoolBlot.
        const poolBlot = profile.waterDepletion ? 1 : 0
        const pigmentPhase = function* (this: RibbonStrokePainter): Generator<number, void, void> {
        if (mode.waterOnly) return
        if (inkDest && (!segmentMode || !this.diagnosticPigmentRecord || inkStrength > 0)) {
          for (let i = 0; i < drawable.length; i++) {
            if (!this.ctx.nibTouchesTile(tile, drawable[i], preset)) continue // (§17.70)
            beginInk(inkDest)
            sourceNib(
              inkDest, tile, drawable[i], preset, profile, 7,
              deposits[i] * (1 - (haloShedByDab.get(drawable[i]) ?? 0)), false,
              waterByDab.get(drawable[i]) ?? 0, acrossByDab.get(drawable[i]) ?? [0, 1],
              paperWetByDab.get(drawable[i]) ?? 0, inkStrength, mottleSeed, segmentMode && this.diagnosticSharedFluid ? coverage : null, combs, profile.bristleInk,
              null, pigmentPoolByDab.get(drawable[i]) ?? 0.5, poolBlot,
            )
            inkDest.endDraw()
            yield pieceTris ? this.ctx.nibDrawCost(tile, drawable[i], preset) : 0
          }
          if (bands.length) {
            for (const piece of ribbonBandPieces(bands, pieceTris)) {
              const px = pieceTris ? ribbonBandPieceCost(piece, tile) : 0
              if (pieceTris && !px) continue
              sourceBands(
                inkDest, tile, piece, bandMode, profile.aaPx, profile.cloud, profile.granulation, mottleSeed,
                0, 0, combs, profile.bristleInk, null, poolBlot, segmentMode && this.diagnosticSharedFluid ? coverage : null,
              )
              yield px
            }
          }
          // (#536, §17.19) …and the same figure once more, into the colour
          // record: the paint's optical depth per texel. Same dose, same hairs,
          // same mottling, so depth and deposit agree to the texel.
          if (colorDest) {
            for (let i = 0; i < drawable.length; i++) {
              if (!this.ctx.nibTouchesTile(tile, drawable[i], preset)) continue // (§17.70)
              beginInk(colorDest)
              sourceNib(
                colorDest, tile, drawable[i], preset, profile, 7,
                deposits[i] * (1 - (haloShedByDab.get(drawable[i]) ?? 0)), false,
                waterByDab.get(drawable[i]) ?? 0, acrossByDab.get(drawable[i]) ?? [0, 1],
                paperWetByDab.get(drawable[i]) ?? 0, inkStrength, mottleSeed, segmentMode && this.diagnosticSharedFluid ? coverage : null, combs, profile.bristleInk, tau,
                pigmentPoolByDab.get(drawable[i]) ?? 0, poolBlot,
              )
              colorDest.endDraw()
              yield pieceTris ? this.ctx.nibDrawCost(tile, drawable[i], preset) : 0
            }
            if (bands.length) {
              for (const piece of ribbonBandPieces(bands, pieceTris)) {
                const px = pieceTris ? ribbonBandPieceCost(piece, tile) : 0
                if (pieceTris && !px) continue
                sourceBands(
                  colorDest, tile, piece, bandMode, profile.aaPx, profile.cloud, profile.granulation, mottleSeed,
                  0, 0, combs, profile.bristleInk, tau, poolBlot, segmentMode && this.diagnosticSharedFluid ? coverage : null,
                )
                yield px
              }
            }
          }
        }

        }.bind(this)
        if (segmentMode === 'explicit') {
          // Explicit independent contribution events on THIS segment.
          yield* waterPhase()
          yield* pigmentPhase()
        } else {
          // Combined brush input expands to the same water -> pigment protocol.
          const contribution = { water: waterPhase, pigment: pigmentPhase }
          yield* contribution.water()
          yield* contribution.pigment()
        }
        if (mode.waterOnly) continue
        if (import.meta.env.DEV && segmentMode && this.diagnosticTrace.length < 4096) this.diagnosticTrace.push({
          before: wetOf(drawable[0]), after: paperWetByDab.get(drawable[0]) ?? 0,
          water: waterByDab.get(drawable[0]) ?? 0, dose: deposits[0] * inkStrength,
        })

        if (inkLoad && profile.normalizeDeposit && !mode.deferMaterial) scratch.diffusePending = true
        // (#536, ADR 011 §17.10) The halo, after the mark itself: ink only, and
        // only where the wash already has coverage. The pigment a wet-in-wet dab
        // sheds travels as far as the standing water and no further, and the
        // water is this wash's own silhouette — the puddle is a stroke of the
        // same wash — so clipping the stamp by the coverage buffer is what keeps
        // a halo from ever leaving the puddle ("пигмент за пределы лужи может
        // уйти, такого быть не может"). No coverage stamp for the halo for the
        // same reason: it must not grow the silhouette. Skipped outright on dry
        // paper: no wet dab, no second pass, no cost.
        if (anyHalo && inkDest) {
          for (let i = 0; i < haloDabs.length; i++) {
            const dose = haloDoseByDab.get(haloDabs[i]) ?? 0
            if (dose <= 0 || !this.ctx.nibTouchesTile(tile, haloDabs[i], preset)) continue // (§17.70)
            beginInk(inkDest)
            sourceNib(
              inkDest, tile, haloDabs[i], preset, haloProfile, 7, deposits[i] * dose, false,
              waterByDab.get(haloDabs[i]) ?? 0, acrossByDab.get(haloDabs[i]) ?? [0, 1],
              paperWetByDab.get(haloDabs[i]) ?? 0, inkStrength, mottleSeed, coverage, combs, profile.bristleInk,
            )
            inkDest.endDraw()
            yield pieceTris ? this.ctx.nibDrawCost(tile, haloDabs[i], preset) : 0
          }
        }
        // (§17.28) The deposit the composite and the settle read: the wash as it
        // stood before this gesture plus the gesture's film, over this batch's
        // rect (the film outside it is unchanged since the last batch).
        let sourceCopyCost = 0
        if (fb && inkLoad) {
          const rect = this.ctx.revealRect(tile, compositeBounds)
          if (rect) {
            sourceField(inkLoad, fb.inkBase, fb.strokeInk, 1, 1, { scissor: rect })
            const hasColor = !!(inkColor && fb.strokeColor && fb.colorBase)
            if (hasColor) sourceField(inkColor!, fb.colorBase!, fb.strokeColor!, 1, 1, { scissor: rect })
            // P/C are one indivisible material pair. Never yield between them.
            sourceCopyCost = rect[2] * rect[3] * (hasColor ? 2 : 1)
          }
        }

        // `drawable[0].opacity` rather than a per-dab value: only a tool whose
        // dabs all share one opacity can be composited from a coverage buffer at
        // all, which for the brush pen is guaranteed by _bakeDabOpacity (ADR 009
        // §9 — pressure drives width, never alpha). The marker's branch ignores
        // this argument entirely and reads its own inkLoad texture instead.
        if (deferComposite) {
          // (#536, §17.22) The live gesture: the rect joins this frame's union
          // and the composite runs once, in _display, before the frame is drawn.
          const pending = scratch.pendingComposite.get(tile.buffer)
          if (pending) {
            pending.bounds.minX = Math.min(pending.bounds.minX, compositeBounds.minX)
            pending.bounds.minY = Math.min(pending.bounds.minY, compositeBounds.minY)
            pending.bounds.maxX = Math.max(pending.bounds.maxX, compositeBounds.maxX)
            pending.bounds.maxY = Math.max(pending.bounds.maxY, compositeBounds.maxY)
          } else {
            scratch.pendingComposite.set(tile.buffer, { tile, bounds: { ...compositeBounds } })
          }
          // Every coalesced batch grows both the layer and paper damage, even
          // when this tile already has a pending composite for the frame.
          this.ctx.markPaperDamage(compositeBounds)
          this.ctx.setLiveComposite({
            scratch, preset, profile, color, opacity: drawable[0].opacity, fieldSeed, spreadPx, fringeWater, migratePx,
            inkSmoothPx: profile.normalizeDeposit ? dabSpacing : 0, strokeDir, bristleRadiusPx,
          })
          if (sourceCopySlices && sourceCopyCost) yield sourceCopyCost
          continue
        }
        if (sourceCopySlices && sourceCopyCost) yield sourceCopyCost
        const revealPrev = this.ctx.revealBeforeBatch(tile, compositeBounds)
        this.ctx.drawRibbonCompositeRect(
          tile, compositeBounds, preset, profile, original, coverage, inkLoad, inkColor, color, drawable[0].opacity,
          fieldSeed, spreadPx, fringeWater, migratePx,
          profile.normalizeDeposit ? dabSpacing : 0, strokeDir, bristleRadiusPx,
        )
        this.ctx.revealAfterBatch(tile, compositeBounds, revealPrev)
        yield pieceTris ? rectOnTile(tile, compositeBounds) : 0
      }

      if (mode.waterOnly) return
      if (!mode.deferMaterial) noteFinish()
      target.markContentPainted(compositeBounds)
    }
    if (mode.deferMaterial) {
      // Logical finish ownership is captured before these GPU commands run.
      // Execution must not overwrite a newer input film's pending flag.
      scratch.diffusePending = true
      noteFinish()
      captured = scratch.captureFinishMetadata()
      let used = false, cancelled = false
      let work: Generator<number, void, void> | undefined
      const owner = this
      mode.deferMaterial({
        metadata: captured,
        presentationDabs: drawable.map(d => ({ ...d })),
        execute: function* () {
          if (used) throw new Error('Prepared material is single-use')
          used = true
          work = material.call(owner)
          while (!cancelled) {
            const step = work.next()
            if (step.done) return
            yield step.value
          }
        },
        cancel: (contextLost = false) => { cancelled = true; cancelledLost ||= contextLost; work?.return() },
      })
      return
    }
    yield* material.call(this)
  }
}
