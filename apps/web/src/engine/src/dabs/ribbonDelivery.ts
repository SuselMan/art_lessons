import type { RibbonDrawableState } from './ribbonDrawable'
import type { Dab } from '@grafetto/shared'
import type { PencilPreset } from '../presets/pencilPresets'
import type { RibbonProfile } from './ribbonProfile'
import type { BrushTravel } from '../watercolor/brushDrag'
import { canonicalMinorRadius } from '../watercolor/canonicalRadius'
import { advanceSolventSource, type WaterPolicy } from '../watercolor/solventSource'
import { nibGeometry } from './markerRibbon'
import { markerThinNibInkGain } from './markerInkGain'
import { ribbonWaterDelivery } from './ribbonStrokeMath'
import { watercolorStandingWater, watercolorWetPull, watercolorPuddleDepth, WC_FILM_DOSE, watercolorDwellWater, watercolorDwellPigment, WC_DWELL_RADIUS, watercolorTrailDwell, WC_DWELL_FLOOR_MS, WC_TRAIL_LEN, watercolorSurplus, watercolorExcessFromSurplus, watercolorPuddleFromSurplus, watercolorSlowdown, watercolorBrakeSurplus, WC_SLOW_GAIN, WC_SPEED_TAU_MS, WC_PEAK_FADE_MS, WC_START_EXCESS_RADII, WC_PUDDLE_RADII, watercolorPigmentLoad, watercolorPigmentRate, watercolorTravelRadius, type WcTrailDab } from '../presets/watercolorPresets'

/** CPU gesture state only. No textures, buffer pools, GL context or tile ownership. */
export interface RibbonDeliveryState extends RibbonDrawableState {
  waterUsed: number; pigmentUsed: number
  standing: Map<Dab,number>
  landing: {x:number;y:number;r:number;t:number}|null
  dwellDone: boolean; dwellMs: number
  trail: WcTrailDab[]
  speed: number; speedPeak: number; speedAt: number; speedTravel: number
  brakePigment: number; surplusPigment: number; surplusWater: number; surplusAt: number
  turnOffset: [number,number]; turnDirection: [number,number]|null
  brushTravel: BrushTravel[]
  advanceWater(water:number,pigment:number):void
}
export interface RibbonDeliveryOptions {
  diagnosticWaterPolicy: WaterPolicy
  diagnosticSharedFluid: boolean
  diagnosticLandingReservoir: boolean
  diagnosticLandingPolicy: 'dry'|'fluid'
  diagnosticCanonicalSettleRadius: boolean
}
export interface RibbonDeliveryContext {
  markerSegmentLength(dab:Dab,previous:Dab|undefined,radius:number):number
  dabPool(): WeakMap<Dab,number>
}
export function createRibbonDeliveryState(): RibbonDeliveryState {
  return {lastKept:undefined,wetContacts:[],waterUsed:0,pigmentUsed:0,standing:new Map(),landing:null,dwellDone:false,dwellMs:0,
    trail:[],speed:0,speedPeak:0,speedAt:-1,speedTravel:0,brakePigment:0,surplusPigment:0,surplusWater:0,surplusAt:0,
    turnOffset:[0,0],turnDirection:null,brushTravel:[],advanceWater(water,pigment){this.waterUsed=water;this.pigmentUsed=pigment}}
}
/** Exact existing delivery algorithm; call in canonical dab order once, before any GPU work. */
export function prepareRibbonDelivery(
  drawable: Dab[], prevDab: Dab|undefined, preset: PencilPreset, profile: RibbonProfile,
  scratch: RibbonDeliveryState, wetOf:(dab:Dab)=>number, landedWet:number,
  segmentMode:false|'combined'|'explicit', segmented:boolean, film:boolean,
  context: RibbonDeliveryContext, options: RibbonDeliveryOptions,
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
        const seg = context.markerSegmentLength(dab, prev, radius)
        const source = advanceSolventSource(
          { waterUsed: used, pigmentUsed: pigUsed }, profile, seg, radius,
          wetHere, !!segmentMode, options.diagnosticWaterPolicy,
        )
        used = source.waterUsed
        pigUsed = source.pigmentUsed
        const { load, water } = source
        // (#536, §17.14) …by the brush's water: a wet brush spends the same
        // finite budget further along the path. See PIGMENT_RUN_DRY_RADII.
        // (§17.26) …and a wet sheet pulls more of it out (watercolorWetPull).
        // Pickup above used contact-before. Newly delivered standing water
        // is available to pigment here, without refilling the brush clock.
        const availableHere = segmentMode && options.diagnosticSharedFluid
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
        const landingWet = segmentMode && options.diagnosticLandingReservoir
          ? options.diagnosticLandingPolicy === 'fluid'
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
        if (profile.waterDepletion) context.dabPool().set(dab, Math.min(waterPool, 1))
        if (profile.normalizeDeposit && Math.hypot(dx, dy) > 0.01 && profile.waterLevel > 0) scratch.brushTravel.push({
          x: dab.x, y: dab.y, radius: minor, aspect: Math.max(1, dab.aspectRatio), angle: dab.angle, dx, dy, water: profile.waterLevel,
          ...(options.diagnosticCanonicalSettleRadius ? { settleRadius: canonicalMinorRadius(dab.size, preset.sizeMultiplier) } : {}),
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
