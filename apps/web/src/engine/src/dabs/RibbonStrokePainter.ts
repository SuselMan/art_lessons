import { canonicalMinorRadius, canonicalMajorRadius } from '../watercolor/canonicalRadius'
import { advanceSolventSource } from '../watercolor/solventSource'
import { selectedForeignWaterSources } from '../watercolor/foreignWater'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { Dab } from '@grafetto/shared'
import { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import { RibbonStrokeScratch, type RibbonFinishMetadata } from '../buffers/RibbonStrokeScratch'

import { type PencilPreset } from '../presets/pencilPresets'
import { type BrushDescriptor, type BrushPressureSettings } from '../presets/digitalBrushPresets'
import { buildRibbonBands, nibGeometry } from '../dabs/markerRibbon'
import { markerThinNibInkGain } from '../dabs/markerInkGain'
import { wetAt, wetPeak } from '../paper/paperWetness'
import { pigmentAbsorption } from '../watercolor/pigmentOptics'
import { WATERCOLOR_MIGRATION, WATERCOLOR_SPREAD, ribbonProfileFor, type RibbonProfile } from '../dabs/ribbonProfile'
import { watercolorFerrulePx, watercolorStandingWater, watercolorWetPull, watercolorPuddleDepth, watercolorTravelQuantum, WC_FILM_DOSE, watercolorDwellWater, watercolorDwellPigment, WC_DWELL_RADIUS, watercolorTrailDwell, WC_DWELL_FLOOR_MS, WC_TRAIL_LEN, watercolorSurplus, watercolorExcessFromSurplus, watercolorPuddleFromSurplus, watercolorSlowdown, watercolorBrakeSurplus, WC_SLOW_GAIN, WC_SPEED_TAU_MS, WC_PEAK_FADE_MS, WC_START_EXCESS_RADII, WC_PUDDLE_RADII, watercolorPigmentLoad, watercolorPigmentRate, watercolorHalo, WATERCOLOR_HALO_PAST_BLOOM, WATERCOLOR_HALO_DRAWN, watercolorTravelRadius, watercolorSpreadRadius } from '../presets/watercolorPresets'
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

export interface RibbonStrokePainterContext {
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
  /** Solver uniforms use the radius recoverable from the recorded dabs. */
  diagnosticCanonicalSettleRadius = true
  diagnosticLandingPolicy: 'dry' | 'fluid' = 'fluid'
  private readonly auxiliaryWater = new Set<RibbonStrokeScratch>()

  releaseWaterSources(contextLost = false): void {
    for (const scratch of this.auxiliaryWater) { if (contextLost) scratch.forget(); else scratch.destroy() }
    this.auxiliaryWater.clear()
  }
  diagnosticTrace: { before: number; after: number; water: number; dose: number }[] = []
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
    const contacts = dabs.flatMap((d, i) => wetAt(wetProfile, i) > 0
      ? [{ x: d.x, y: d.y, radius: d.size * 0.5 * preset.sizeMultiplier, aspect: Math.max(1, d.aspectRatio), angle: d.angle }] : [])
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
          yield* this.paintWaterSource(target, chunk.dabs, sourcePreset, first.preset, sourceProfile, chunk.color, aux, undefined, chunk.wet, chunk.seed, false, 256)
          aux.releaseFilm()
          aux.newFilm()
        }
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
  }

  /** Logical delivery is evaluated at input time, never when a queued GPU film lands.
   * This extraction preserves immediate execution; deferred ownership is not enabled. */
  private prepareDelivery(
    drawable: Dab[], prevDab: Dab | undefined, preset: PencilPreset, profile: RibbonProfile,
    scratch: RibbonStrokeScratch, wetOf: (dab: Dab) => number, landedWet: number,
    segmentMode: false | 'combined' | 'explicit', segmented: boolean, film: boolean,
  ) {
    const { nibShape, cornerFraction } = profile
    const deposits: number[] = []
    const waterByDab = new Map<Dab, number>()
    const pigmentByDab = new Map<Dab, number>()
    const delivery = ribbonWaterDelivery(profile)
    if (!segmentMode || !segmented) scratch.standing.clear()
    // (#536) Which way "across the brush" points for each dab, in the nib's own
    // local axes — the stamps' half of the hair comb. Filled in the same loop
    // that already resolves each dab's travel direction, so there is exactly
    // one reading of it and the stamps cannot disagree with the bands.
    const acrossByDab = new Map<Dab, [number, number]>()
    // (#680, s17.84) The dabs whose direction is the travel's - see below.
    const movingByDab = new Set<Dab>()
    // (#536) …and how wet the paper under each dab already was. Straight out of
    // the recorded profile, indexed by position within this call's own dabs —
    // which is why the profile is one digit per dab and why every place a
    // gesture is cut takes its own substring (paperWetness.ts).
    const paperWetByDab = new Map<Dab, number>()
    // (#536) The touch-down surplus, per dab — see watercolorStartExcess. Gated
    // by the wetness under the gesture's *landing point*, not per dab: a brush
    // dumps its load when it is set down, so what matters is what was under it
    // then, not what it has run over since.
    // (#536) How strong this stroke's paint is, on the deposit rather than on
    // the composite's single opacity — see _bakeDabOpacity's own note.
    const pigmentPoolByDab = new Map<Dab, number>()
    const excessByDab = new Map<Dab, number>()
    const puddleByDab = new Map<Dab, number>()
    // #559 — how much to raise this dab's deposit for being dragged thin-side
    // first. Shared by the stamps and the bands, which must agree: the two
    // overlap almost everywhere, and a band on a different scale from the
    // stamps it connects would show as a seam at every sample.
    const thinNibGain = (dab: Dab, fromX: number, fromY: number): number => profile.thinNibInkRefPx > 0
      ? markerThinNibInkGain(
        nibGeometry(dab, preset.sizeMultiplier, nibShape, cornerFraction),
        dab.x - fromX, dab.y - fromY, profile.thinNibInkRefPx,
      )
      : 1
    {
      let prev = prevDab
      let used = scratch.waterUsed
      let pigUsed = scratch.pigmentUsed
      for (const dab of drawable) {
        const wetHere = wetOf(dab)
        paperWetByDab.set(dab, wetHere)
        // #489: travel measured in *this* nib's units, which for a flat one
        // depends on which way it is being dragged (watercolorTravelRadius).
        // `prev` is undefined on the stroke's first dab and sits at the same
        // point for a dwell tick — both are "no direction", and both are what
        // the null branch answers.
        const minor = dab.size * 0.5 * preset.sizeMultiplier
        // (§17.37) The landing dwell: the time the nib has stayed within
        // WC_DWELL_RADIUS of where it came down, on the dabs' own clock.
        // Read per dab as it stands so far, so a live stroke's landing
        // dabs and a replay's see the same values in the same order.
        if (!scratch.landing) scratch.landing = { x: dab.x, y: dab.y, r: minor * Math.max(dab.aspectRatio, 1), t: dab.t }
        else if (!scratch.dwellDone) {
          const L = scratch.landing
          if (Math.hypot(dab.x - L.x, dab.y - L.y) <= WC_DWELL_RADIUS * L.r) scratch.dwellMs = Math.max(scratch.dwellMs, dab.t - L.t)
          else scratch.dwellDone = true
        }
        const dx = prev ? dab.x - prev.x : 0
        const dy = prev ? dab.y - prev.y : 0
        const travelAngle = Math.hypot(dx, dy) > 0.01 ? Math.atan2(dy, dx) : null
        const radius = Math.max(watercolorTravelRadius(
          minor * Math.max(dab.aspectRatio, 1), minor, dab.angle, travelAngle,
        ), 0.5)
        // (#680, s17.84) A dab that really moved (a fifth of its radius): its
        // direction is the travel's. The last dabs before a lift move by a
        // pixel or less and their direction jitters - combed along it, the
        // pool's streaks came out as arcs and waves at every stroke's end.
        if (Math.hypot(dx, dy) > 0.2 * minor) movingByDab.add(dab)
        if (travelAngle !== null) {
          // Perpendicular of travel, rotated out of world space into the nib's
          // frame. Null travel is a tap or a dwell tick with no direction to
          // speak of; the minor axis is the isotropic answer and is what the
          // uniform already defaults to.
          const la = travelAngle + Math.PI / 2 - dab.angle
          acrossByDab.set(dab, [Math.cos(la), Math.sin(la)])
        }
        const seg = this.ctx.markerSegmentLength(dab, prev, radius)
        const source = advanceSolventSource(
          { waterUsed: used, pigmentUsed: pigUsed }, profile, seg, radius,
          wetHere, !!segmentMode, this.diagnosticWaterPolicy,
        )
        used = source.waterUsed
        pigUsed = source.pigmentUsed
        const { load, water } = source
        // (#536, §17.14) …by the brush's water: a wet brush spends the same
        // finite budget further along the path. See PIGMENT_RUN_DRY_RADII.
        // (§17.26) …and a wet sheet pulls more of it out (watercolorWetPull).
        // Pickup above used contact-before. Newly delivered standing water
        // is available to pigment here, without refilling the brush clock.
        const availableHere = segmentMode && this.diagnosticSharedFluid
          ? Math.max(wetHere, watercolorStandingWater(delivery.water, delivery.retain, wetHere, load))
          : wetHere
        if (segmentMode) paperWetByDab.set(dab, availableHere)
        const pigmentLeft = profile.waterDepletion
          ? watercolorPigmentLoad(pigUsed, profile.waterLevel) * watercolorPigmentRate(profile.waterLevel) * watercolorWetPull(availableHere)
          : 1
        // The gesture's own travel clock, carried on the scratch, so this decays
        // from the *stroke's* start rather than from each batch's. The pigment
        // one: a brush that drank from a puddle halfway along has not gone back
        // to being freshly set down, and the touch-down surplus is about the
        // moment of landing.
        // (#680, §17.74) The dwell at THIS dab, not only at the landing: a
        // stop, a sharp turn, a turn-back unload the reservoir the same way,
        // and the surplus is spent over the travel after it.
        const tau = Math.max(0, watercolorTrailDwell(scratch.trail, dab.x, dab.y, dab.t, WC_DWELL_RADIUS * minor * Math.max(dab.aspectRatio, 1)) - WC_DWELL_FLOOR_MS)
        const gateHere = 1 - Math.min(Math.max(wetHere, 0), 1)
        const pigmentGate = 0.45 + 0.55 * (1 - Math.min(Math.max(availableHere, 0), 1))
        // …and the slowdown relative to this stroke's own pace (watercolorSlowdown).
        const last = scratch.trail.length ? scratch.trail[scratch.trail.length - 1] : null
        let slow = 0
        let speedElapsed = 0
        if (scratch.speedAt < 0) scratch.speedAt = dab.t
        if (last) {
          scratch.speedTravel += Math.hypot(dab.x - last.x, dab.y - last.y)
          const dt = dab.t - scratch.speedAt
          if (dt > 0) {
            // One pointer batch gives several dabs the same timestamp. Keep
            // their travel until the next real time interval; dt=1 invented
            // high speeds and a braking pool at the next batch boundary.
            const v = scratch.speedTravel / dt
            const a = 1 - Math.exp(-dt / WC_SPEED_TAU_MS)
            scratch.speed += (v - scratch.speed) * a
            scratch.speedPeak = Math.max(scratch.speed, scratch.speedPeak * Math.exp(-dt / WC_PEAK_FADE_MS))
            scratch.speedAt = dab.t
            scratch.speedTravel = 0
            speedElapsed = dt
          }
          slow = watercolorSlowdown(scratch.speed, scratch.speedPeak)
        }
        const spent = pigUsed - scratch.surplusAt
        // Two reservoirs, spent at their own lengths: a stop's (the dwell) lays
        // the landing's long pool, a braking's a compact one (WC_SLOW_RUN_RADII).
        scratch.surplusPigment = watercolorSurplus(scratch.surplusPigment, spent, watercolorDwellPigment(tau) * pigmentGate, WC_START_EXCESS_RADII)
        scratch.surplusWater = watercolorSurplus(scratch.surplusWater, spent, watercolorDwellWater(tau) * gateHere, WC_PUDDLE_RADII)
        scratch.brakePigment = watercolorBrakeSurplus(scratch.brakePigment, spent, WC_SLOW_GAIN * slow * pigmentGate, speedElapsed)
        scratch.turnOffset[0] += dx; scratch.turnOffset[1] += dy
        if (Math.hypot(...scratch.turnOffset) >= Math.max(1.5, minor * 0.12)) {
          // Tight curvature unloads the carried pigment reservoir. A wide
          // smooth bend spends the angle through its travelled chord.
          const direction = scratch.turnOffset
          const priorTurnDirection = scratch.turnDirection
          if (priorTurnDirection && Math.hypot(priorTurnDirection[0], priorTurnDirection[1]) > 0.01) {
            const turnAngle = Math.abs(Math.atan2(priorTurnDirection[0] * direction[1] - priorTurnDirection[1] * direction[0], priorTurnDirection[0] * direction[0] + priorTurnDirection[1] * direction[1]))
            const normalizedChord = Math.hypot(direction[0], direction[1]) / Math.max(minor, 0.5)
            const angularPigmentImpulse = Math.max(turnAngle - 1.0 * normalizedChord, 0.0) / Math.PI
            scratch.brakePigment = Math.min(0.6, scratch.brakePigment + 0.3 * angularPigmentImpulse * pigmentGate)
          }
          scratch.turnDirection = [...direction]
          scratch.turnOffset = [0, 0]
        }
        scratch.surplusAt = pigUsed
        scratch.trail.push({ x: dab.x, y: dab.y, t: dab.t })
        if (scratch.trail.length > WC_TRAIL_LEN) scratch.trail.shift()
        const landingWet = segmentMode && this.diagnosticLandingReservoir
          ? this.diagnosticLandingPolicy === 'fluid'
            ? Math.max(landedWet, watercolorStandingWater(delivery.water, delivery.retain, landedWet, 1)) : 0
          : landedWet
        const excess = profile.waterDepletion ? watercolorExcessFromSurplus(pigUsed, landingWet, Math.max(scratch.surplusPigment, scratch.brakePigment)) : 1
        excessByDab.set(dab, excess)
        // (#680, s17.79) ...and the landing's own surplus, which needs no dwell:
        // the touch-down's pool is a pool too, broken into blots like the others.
        const landingPool = (1 - Math.min(Math.max(landedWet, 0), 1)) * Math.exp(-pigUsed / WC_START_EXCESS_RADII)
        // Braking pigment is not extra water: a sharp turn must not invent a
        // deep visible puddle merely because it unloads a little more colour.
        // The pool multiplier affects only surplus pigment. Braking does
        // not add standing water or turn a corner into a deep puddle.
        pigmentPoolByDab.set(dab, Math.max(0, excess - 1) / Math.max(excess, 1))
        const waterPool = Math.max(scratch.surplusWater, landingPool)
        puddleByDab.set(dab, profile.waterDepletion ? watercolorPuddleFromSurplus(waterPool, wetHere) : watercolorPuddleDepth(pigUsed, landedWet, wetHere, scratch.dwellMs))
        if (profile.waterDepletion) this.ctx.dabPool().set(dab, Math.min(waterPool, 1))
        if (profile.normalizeDeposit && Math.hypot(dx, dy) > 0.01 && profile.waterLevel > 0) scratch.brushTravel.push({
          x: dab.x, y: dab.y, radius: minor, aspect: Math.max(1, dab.aspectRatio), angle: dab.angle, dx, dy, water: profile.waterLevel,
          ...(this.diagnosticCanonicalSettleRadius ? { settleRadius: canonicalMinorRadius(dab.size, preset.sizeMultiplier) } : {}),
        })
        waterByDab.set(dab, water)
        pigmentByDab.set(dab, pigmentLeft)
        if (profile.normalizeDeposit) scratch.standing.set(dab, watercolorStandingWater(delivery.water, delivery.retain, wetHere, load))
        // The stamps' share of the dose, doubled back up because the legacy
        // formula's 0.5 assumed an even split with the bands.
        const stampShare = profile.stampInkShare > 0 ? profile.stampInkShare * 2 : 1
        // (§17.28) Under MAX the stamp's value IS the film: spacing-free.
        // Store half the physical dose: RGBA8 then has headroom for two
        // overlapping loads. The watercolor passes decode this scale.
        deposits.push(profile.normalizeDeposit
          ? (film
            ? (profile.depositPerRadius * 0.5) * WC_FILM_DOSE * pigmentLeft * excess
            : (profile.depositPerRadius * 0.5) * (seg / radius) * 0.5 * stampShare * pigmentLeft * excess)
          : dab.opacity * seg * 0.5 * thinNibGain(dab, prev?.x ?? dab.x, prev?.y ?? dab.y))
        prev = dab
      }
      scratch.advanceWater(used, pigUsed)
    }
    return { deposits, waterByDab, pigmentByDab, acrossByDab, movingByDab,
      paperWetByDab, pigmentPoolByDab, excessByDab, puddleByDab, thinNibGain }
  }

  /** Same original water source, without any pigment or target write. */
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
    mode: Readonly<{ waterOnly: boolean; segmented: boolean; deferMaterial?: (request: PreparedRibbonMaterial) => void }> = { waterOnly: false, segmented: false },
  ): Generator<number, void, void> {
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
          if (saved[5] === 7) saved[0].beginMaxDraw(this.ctx.minmaxExt()!)
          this.ctx.drawRibbonNibPass(...saved)
          if (saved[5] === 7) saved[0].endDraw()
        })
      }
      this.ctx.drawRibbonNibPass(...args)
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
            i === 0 ? prevDab : scratch.lastKept, wetProfile?.slice(i, i + 1), strokeSeed, deferComposite, pieceTris, { ...mode, segmented: true })
      }
      return
    }
    const importForeign = segmentMode && this.diagnosticForeignSolvent && this.diagnosticSolventField && !mode.waterOnly
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
    const floorPx = profile.minHalfWidthPx
    // (#536, §17.64) Each dab's place in `dabs`, which is what the recorded
    // wet profile is indexed by - one digit per dab of the operation (or of
    // the live batch's slice). The filters below drop dabs, and reading the
    // profile by position in what is left shifted every digit after the first
    // one dropped - by how many were dropped before it in THIS call, so a live
    // stroke and its one-batch replay read different paper under the same dab.
    const wetIndex = new Map<Dab, number>()
    let drawable = floorPx === null
      ? dabs.filter((d, i) => { wetIndex.set(d, i); return d.size * 0.5 * preset.sizeMultiplier >= 0.5 })
      : dabs.map((d, i) => {
        const half = d.size * 0.5 * preset.sizeMultiplier
        const out = half >= floorPx ? d : { ...d, size: (floorPx * 2) / preset.sizeMultiplier }
        wetIndex.set(out, i)
        return out
      })
    // -1 for a dab not of this call (the bridging prevDab), as the loop below read it.
    const wetOf = (d: Dab): number => wetAt(wetProfile, wetIndex.get(d) ?? -1)
    // (§17.28) The deposit as a FILM under MAX blending - see RibbonTileScratch.strokeInk.
    const film = profile.normalizeDeposit && !!this.ctx.minmaxExt() && !!scratch
    // (§17.28) Only the dabs that MOVED deposit - see watercolorTravelQuantum.
    // The anchor is the last dab kept, carried on the scratch across the
    // gesture's batches so a live stroke and its replay keep the same dabs.
    if (profile.normalizeDeposit && scratch) {
      // …and the ribbon bridges from the last kept dab, never from a dropped
      // one, so the bands' geometry is the same set of dabs live and replayed.
      if (scratch.lastKept) prevDab = scratch.lastKept
      const kept: Dab[] = []
      let anchor = prevDab
      for (const d of drawable) {
        const q = watercolorTravelQuantum(d.size * 0.5 * preset.sizeMultiplier)
        if (!anchor || Math.hypot(d.x - anchor.x, d.y - anchor.y) >= q) { kept.push(d); anchor = d }
      }
      if (kept.length) scratch.lastKept = kept[kept.length - 1]
      drawable = kept
    }
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
    for (const d of drawable) if (wetOf(d) >= 0.3) scratch.wetContacts.push({
      x: d.x, y: d.y, radius: d.size * 0.5 * preset.sizeMultiplier,
      aspect: Math.max(1, d.aspectRatio), angle: d.angle,
    })
    const { spreadPx, water: fringeWater, migratePx, fieldSeed, bristleRadiusPx } = scratch.compositeScalars(() => {
      // #489: the bloom is isotropic, so a nib that is not round is measured by
      // the circle with its area rather than by either axis. Identical to the
      // old `size * 0.5` for a round nib.
      const first = drawable[0]
      const firstMinor = first.size * 0.5 * preset.sizeMultiplier
      const firstRadius = Math.max(
        watercolorSpreadRadius(firstMinor * Math.max(first.aspectRatio, 1), firstMinor), 0.5,
      )
      return {
        // (#536) No longer gated by the wetness under the landing point, and
        // that gate was the single worst thing about wet-in-wet.
        //
        // The bloom used to be baked into this gesture-wide number out of the
        // one digit under the first dab. So a brush set down *in* a puddle
        // spread three times as far for the whole of its travel, including the
        // dry paper it went on to cross, and a brush that started on dry paper
        // and ran through the puddle got no bloom anywhere — "если веду с
        // сухого через лужу на сухое, штрих ложится полностью сухим". Worse, at
        // a 16 px cell the first dab landing in a wet cell or a dry one near the
        // edge is close to a coin toss, which is the "иногда" in every one of
        // those reports.
        //
        // The bloom is now applied per pixel in the composite, off the deposit's
        // own record of what the paper under it was carrying (DAB_FRAG's
        // paperWetHere). This stays the *dry* reach, i.e. the ceiling the
        // shader scales up from where the paper was actually wet — so a stroke
        // blooms in the puddle and stays tight either side of it, inside one
        // mark.
        spreadPx: profile.spreadPx > 0 && profile.spreadOfRadius > 0
          ? Math.min(
            profile.spreadPx,
            Math.max(WATERCOLOR_SPREAD.min, firstRadius * profile.spreadOfRadius),
          )
          : 0,
        inkSmoothPx: 0, // resolved separately, see noteDabSpacing
        // (#468 v11) How far one exchange moves pigment. A constant of the
        // gesture for exactly the reason every other scalar here is one: the
        // composite recomputes whole rects, so whichever batch wrote a pixel
        // last would otherwise decide how far its paint had travelled.
        migratePx: profile.migrate > 0 && profile.migrateOfRadius > 0
          ? Math.min(
            WATERCOLOR_MIGRATION.maxPx,
            Math.max(WATERCOLOR_MIGRATION.minPx, firstRadius * profile.migrateOfRadius),
          )
          : 0,
        // The fallback the composite uses outside the mark, where there is no
        // deposit to read a per-pixel level from. The stroke's starting load,
        // not its current one, for the same no-seams reason.
        water: profile.waterLevel,
        fieldSeed: [drawable[0].x, drawable[0].y],
        // (#536) A constant of the gesture like every other scalar here, so
        // the hair does not change frequency between a live batch and the
        // final recomposite.
        // The nib's *long* axis, not the equal-area radius. A flat brush is a
        // row of hairs held in a ferrule, and the ferrule's width is the long
        // axis: measured by area it came out as a couple of bundles and read
        // as broad waves rather than as hair, which is what "на chisel не вижу
        // щетинки" was. For a round nib the two are the same number.
        //
        // (#536) …and the ferrule, not this footprint: the first dab of a
        // gesture carries both the pressure it was begun with and the head
        // taper, and on a small brush those two together cost most of the hair.
        // See watercolorFerrulePx.
        bristleRadiusPx: watercolorFerrulePx(
          firstMinor, first.aspectRatio, first.pressure, presetName,
        ),
      }
    })

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
    const { deposits, waterByDab, pigmentByDab, acrossByDab, movingByDab,
      paperWetByDab, pigmentPoolByDab, excessByDab, puddleByDab, thinNibGain } = this.prepareDelivery(
      drawable, prevDab, preset, profile, scratch, wetOf, landedWet, segmentMode, mode.segmented, film,
    )
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
    const haloDabs: Dab[] = []
    const haloDoseByDab = new Map<Dab, number>()
    /** What each ORIGINAL dab gave up to its halo, so the core is laid lighter
     *  by exactly that share — conservation, and the "dissolves in water" feel. */
    const haloShedByDab = new Map<Dab, number>()
    let anyHalo = false
    // A flat disc, not the tool's cone. The ink stamp is a cone that is zero at
    // the nib's rim (inkEdgeFalloff 0 — see the shader's mix(u_inkEdge, 1, depth)),
    // so a stamp merely made wider puts only the cone's outer slope over the
    // ring that is the halo: measured on a replay of Ilya's own stroke through
    // the density view, a halo 2.9x wider at nearly full dose registered at a
    // few per cent of the core. The halo is a plateau of migrated pigment, and
    // a plateau is what this profile lays.
    const haloProfile: RibbonProfile = { ...profile, inkEdgeFalloff: 1 }
    if (profile.normalizeDeposit) {
      for (const dab of drawable) {
        const { scale, shed, wet } = watercolorHalo(paperWetByDab.get(dab) ?? 0, waterByDab.get(dab) ?? 0)
        // Past the composite's bloom, not merely past the dab — see
        // WATERCOLOR_HALO_PAST_BLOOM. spreadPx is the gesture's reach in world
        // px and dab.size is a diameter, hence the factor of two.
        const grown: Dab = { ...dab, size: dab.size * scale + 2 * WATERCOLOR_HALO_PAST_BLOOM * spreadPx * wet }
        haloDabs.push(grown)
        // The shed share as the halo stamp's dose, un-compensated for the wider
        // radius on purpose — see watercolorHalo on why per pixel it comes out
        // as shed / scale, a ring's worth rather than a disc's.
        haloDoseByDab.set(grown, shed)
        haloShedByDab.set(dab, shed)
        if (shed > 0) anyHalo = true
        const across = acrossByDab.get(dab)
        if (across) acrossByDab.set(grown, across)
        waterByDab.set(grown, waterByDab.get(dab) ?? 0)
        pigmentByDab.set(grown, pigmentByDab.get(dab) ?? 1)
        pigmentPoolByDab.set(grown, pigmentPoolByDab.get(dab) ?? 0.5)
        excessByDab.set(grown, excessByDab.get(dab) ?? 1)
        puddleByDab.set(grown, puddleByDab.get(dab) ?? 1)
        paperWetByDab.set(grown, paperWetByDab.get(dab) ?? 0)
      }
    }

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
    const bands = profile.stampsOnly ? EMPTY_BANDS : buildRibbonBands(
      drawable, preset.sizeMultiplier, prevDab, nibShape, cornerFraction, profile.aaPx, inkFor, film,
    )

    // The water phase keeps contact-before metadata; pigment bands sample
    // after-delivery fluid. They share geometry and immutable source dose.
    const waterBands = segmentMode && inkFor && !profile.stampsOnly
      ? buildRibbonBands(drawable, preset.sizeMultiplier, prevDab, nibShape, cornerFraction, profile.aaPx,
          (d0, d1, travel) => ({ ...inkFor(d0, d1, travel), paperWet: wetOf(d1) }), film)
      : bands
    const solventBands = segmentMode && this.diagnosticSolventField && !profile.stampsOnly
      ? buildRibbonBands(drawable, preset.sizeMultiplier, prevDab, nibShape, cornerFraction, profile.aaPx,
          (_d0, d1) => ({ ink: (waterByDab.get(d1) ?? 0) / 4, water: 1, paperWet: 0,
            strength: 0, puddle: 0, pigmentPool: 0 }), film)
      : EMPTY_BANDS

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
          if (solventRect) sourceField(solvent.load, solvent.base, solvent.film, 1, 1, { scissor: solventRect })
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
        if (fb && inkLoad) {
          const rect = this.ctx.revealRect(tile, compositeBounds)
          if (rect) {
            sourceField(inkLoad, fb.inkBase, fb.strokeInk, 1, 1, { scissor: rect })
            if (inkColor && fb.strokeColor && fb.colorBase) sourceField(inkColor, fb.colorBase, fb.strokeColor, 1, 1, { scissor: rect })
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
          continue
        }
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
