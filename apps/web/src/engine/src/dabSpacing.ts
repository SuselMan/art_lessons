import type { ToolType } from '@grafetto/shared'

// How far apart consecutive dabs sit along a stroke (#478).
//
// The rule used to live as a single expression inside DabSystem._splineDabs:
//
//   spacing = baseSize * spacingFactor          // spacingFactor = 0.22
//
// and `baseSize` there is the *nominal* brush size — the number in the size
// slider. The mark a dab actually leaves is smaller than that in two
// independent ways, and neither of them was in the step:
//
//   diameter = baseSize * shaping.size(pressure, tilt) * preset.sizeMultiplier
//
//  - `shaping.size` is 0.3..1.4 (dabShaping.ts: `0.3 + 0.7·pressure`, scaled by
//    the tilt curve's own width factor), so a light touch draws a mark a third
//    of the nominal width;
//  - `preset.sizeMultiplier` is applied at *render* time only (index.ts paints
//    at `d.size * 0.5 * preset.sizeMultiplier`), and for graphite it spans 0.5
//    at 6H to 1.43 at 6B.
//
// Multiply those out for a hard pencil and the step lands at ~0.58 of the
// dab's own short diameter: consecutive dabs stop overlapping, and since a 6H
// dab is also the hardest-edged one the engine draws (hardness 0.95 puts
// DAB_FRAG's falloff at 0.81..1.0 of the radius — a plateau with a cliff), the
// stroke reads as a row of separate stamps. Tilted, they are separate
// *ellipses*, which is how #478 was reported. Soft grades were fine for the
// same reason in reverse: a bigger, softer dab at the same step overlaps
// heavily and blends.
//
// Measured against an offline replay of the dab geometry (same presets, same
// tilt curve, same DAB_FRAG falloff), as ripple — the peak-to-peak swing of
// coverage along a straight stroke, in units of its own mean:
//
//     grade   step/diameter   ripple
//     6H          0.58         36.5%
//     4H          0.49         42.0%
//     2H          0.38         18.2%
//     HB          0.29          0.2%
//     6B          0.20          0.6%
//
// Sweeping (edge hardness × step/diameter) puts the safe boundary at 0.22:
// at or below it ripple stays under ~3% at every hardness, and above 0.30 it
// climbs the faster the harder the edge. 0.22 is exactly `spacingFactor` —
// the constant was never wrong, it was being applied to the wrong size.

/** Smallest step between two dabs, canvas px.
 *
 *  Load-bearing at small brush sizes rather than merely defensive: the
 *  footprint rule below is a fraction of a fraction of `baseSize`, so a 4px
 *  brush at low pressure would otherwise ask for a step of a quarter pixel and
 *  stack a few hundred dabs into one mark for no visible gain. Was an inline
 *  `Math.max(1, ...)` in _splineDabs before this module existed; same value. */
export const MIN_DAB_SPACING_PX = 1

/** The pre-#478 rule: a fraction of the brush's nominal size, ignoring what
 *  the dab actually covers. Still the *upper* bound on every step — see
 *  footprintDabSpacing for why the footprint rule may only tighten it. */
export function nominalDabSpacing(baseSize: number, spacingFactor: number): number {
  return Math.max(MIN_DAB_SPACING_PX, baseSize * spacingFactor)
}

/**
 * The step after a dab of this size, given the tool's render-time size scale.
 *
 * `dabSize` is `Dab.size` — already through the pressure/tilt response — and
 * `sizeScale` is the multiplier the renderer applies on top of it
 * (`preset.sizeMultiplier`, or 1 for a tool that paints at face value, e.g.
 * the eraser). Their product is the mark's actual short-axis diameter, which
 * is the quantity the step has to track: elongation (`Dab.aspectRatio`)
 * deliberately does *not* enter here, because a dab elongated across the
 * direction of travel advances the mark by its short axis alone — the worst
 * case, and the one that has to stay covered.
 *
 * The `min` against the nominal rule is the whole safety argument for #478:
 * every tool keeps at least today's dab density, so no existing mark can get
 * *sparser* than it is now. Only the under-sampled cases move, and they only
 * ever move toward more dabs.
 *
 * `hardness` gates the whole thing, and #483 is why. See
 * footprintSpacingStrength: a soft-edged dab was never the problem, and
 * re-spacing it changed a mark nobody had complained about.
 */
export interface DabFootprint {
  /** `Dab.size` — already through the pressure/tilt response. */
  size: number
  /** `Dab.aspectRatio`, 1 = round. */
  aspectRatio: number
  /** The renderer's own multiplier on top of `size` (`preset.sizeMultiplier`,
   *  or 1 for a tool that paints Dab.size at face value, e.g. the eraser). */
  sizeScale: number
  /** The edge softness DAB_FRAG will draw this dab with. */
  hardness: number
}

export function footprintDabSpacing(
  dab: DabFootprint, baseSize: number, spacingFactor: number,
): number {
  const nominal = nominalDabSpacing(baseSize, spacingFactor)
  const strength = footprintSpacingStrength(dab.hardness)
  // Exactly the pre-#478 step, bit for bit, and that identity is the point:
  // for a soft grade nothing about the mark may move, including the arc-length
  // bookkeeping that decides where its dabs land.
  if (strength <= 0) return nominal
  const bound = Math.min(dab.size * dab.sizeScale * spacingFactor, scallopSpacingLimit(dab))
  return Math.max(MIN_DAB_SPACING_PX, Math.min(nominal, nominal + (bound - nominal) * strength))
}


// #485 — the second bound on the step, and the one that actually closes the
// bug #478 was filed for.
//
// #478's rule is a fraction of the dab's own diameter, so it is scale-free: a
// 600px brush and a 60px brush come out with the same *relative* geometry. But
// what a hand sees is not relative. The mark's outer boundary is the union of
// overlapping ellipses, and between two consecutive ones it dips by the
// ellipse's sagitta over that step — an absolute number of canvas pixels that
// grows linearly with the brush.
//
// Measured on the real engine, 6H at full pressure and 45 degrees, both at the
// same 0.220 of their own diameter:
//
//     brush 160   step 21.6px   scallop  3.9px
//     brush 600   step 80.8px   scallop 14.5px
//
// 14px of scalloped edge on a hard-edged mark is exactly the "row of ellipses"
// Ilya kept reporting after #478 said it was fixed — and it is why he saw it
// with a large brush while every measurement here, taken at 120-160, sat at the
// paper's own noise floor. The relative rule was never wrong; it was just not
// the binding constraint at the sizes he draws at.
//
// Worst case on purpose: the dab is taken as elongated *across* the direction
// of travel, so the along-travel semi-axis is the short one (r) and the
// silhouette that scallops is the long one (r * aspect). Elongated along travel
// the same geometry gives ~30x less dip, so assuming the bad orientation costs
// some dabs on a stroke drawn the other way and never under-samples one.
//
//     depth = b - b*sqrt(1 - (s/2a)^2) ~= b*s^2/(8a^2) = aspect*s^2/(8r)
//     depth <= tol   ->   s <= sqrt(8*tol*r/aspect)
//
// Same sagitta argument, and the same shape of answer, as DabSystem's own
// _curvatureSpacingLimit — which bounds the marker's chord error against a
// tolerance in canvas px for the identical reason. This is that idea applied
// to the gap between two stamps rather than to the chord between two samples.
const MAX_SCALLOP_PX = 1

/** Largest step whose silhouette scallop stays within MAX_SCALLOP_PX.
 *  Infinity for a round dab, which has no long axis to dip. */
export function scallopSpacingLimit(dab: DabFootprint): number {
  const r = dab.size * 0.5 * dab.sizeScale
  const aspect = Math.max(1, dab.aspectRatio)
  if (r <= 0) return Infinity
  return Math.sqrt((8 * MAX_SCALLOP_PX * r) / aspect)
}

// #483 — where the footprint rule fades in, in units of DAB_FRAG's own
// `u_hardness`, and both numbers are measured rather than chosen.
//
// #478 applied the rule to every graphite grade, on the reasoning that a step
// wider than the dab is under-sampling wherever it happens. That is true, and
// it is also not the whole story: a *soft* dab's gaps are filled by its own
// falloff, so the under-sampling never surfaces, and re-spacing it only
// changed the pitch of a structure the mark already had. Ilya's report was
// that soft grades came out flatter and harder after #478 — tone and paper
// grain both measured identical, to 0.1%, but every soft row's pixels changed:
// the stroke's own longitudinal structure went from a ~26px undulation to a
// ~20px one, and that is what a hand reads as "it no longer sits on the paper".
//
// The boundary is the same on-GPU ripple measurement #478 used, run across the
// whole ladder at a fixed grip (coarse paper, 45 degrees, pressure 0.45), on
// the pre-#478 engine:
//
//     6H .95  53.7%     H  .55  11.2%      2B .25   7.2%
//     5H .95  46.7%     F  .47   7.5%      3B .15   6.9%
//     4H .85  42.5%     HB .38   7.7%      4B .05   6.9%
//     3H .75  31.6%     B  .32   8.0%      6B .05   8.0%
//     2H .65  17.9%
//
// Everything from F down sits flat on a ~7% floor, which is the paper's own
// grain and not scalloping at all. The defect appears at H and is unmistakable
// from 2H. So: off at or below F's hardness, fully on at or above 2H's, linear
// between — which leaves HB and every softer grade byte-for-byte as they were
// before #478, and that identity is asserted in index.dabSpacing.test.ts.
//
// In units of hardness rather than of grade on purpose: the quantity that
// makes a gap visible is the edge, not the label. Charcoal (0.26-0.46) falls
// below the floor by the same measurement and is therefore left alone too,
// where #478 had re-spaced it on an argument rather than a number.
//
// What this deliberately does *not* try to fix: a hard grade at a feather
// touch now deposits under 1/255 per dab and can round away to nothing in the
// RGBA8 layer buffer. That was raised as a candidate regression and Ilya's
// answer was that it is correct — the hardest pencil making the faintest mark
// is the point of it (22.08). Left as is rather than floored.
export const FOOTPRINT_SPACING_SOFT_HARDNESS = 0.47
export const FOOTPRINT_SPACING_HARD_HARDNESS = 0.65

/** 0 where the dab's edge is soft enough that a gap never shows, 1 where it is
 *  hard enough to read as a stamped outline. See the constants above. */
export function footprintSpacingStrength(hardness: number): number {
  const span = FOOTPRINT_SPACING_HARD_HARDNESS - FOOTPRINT_SPACING_SOFT_HARDNESS
  return Math.max(0, Math.min(1, (hardness - FOOTPRINT_SPACING_SOFT_HARDNESS) / span))
}

/**
 * How much of a nominal step this dab is responsible for, in (0, 1].
 *
 * Halving the step doubles how many dabs land on any given pixel, and for
 * every tool this applies to the deposit is *linear* in `Dab.opacity`
 * (DAB_FRAG: graphite's `v_pressure * v_opacity * effectiveCatch * shape`,
 * charcoal's `core`/`dust`, the eraser's `v_pressure * v_opacity * shape`) and
 * is normalized by nothing else on the way — unlike the marker, which already
 * multiplies its deposit by the segment length it covers, or smudge, whose
 * rates are per brush-radius travelled. So denser dabs would simply paint a
 * darker mark, and the tone of every hard grade would change out from under
 * the user as a side effect of a geometry fix.
 *
 * Scaling `Dab.opacity` by this ratio holds the mark's tone where it is. The
 * exact invariant for stacked "over" deposits is `a' = 1 - (1 - a)^ratio`, and
 * this linear form is its first-order term — which is not a shortcut but the
 * accurate branch: it is the *light* marks that get re-spaced, and a small `a`
 * is exactly where the two agree. Worked through at the extremes, comparing
 * the accumulated alpha over one dab-diameter of overlap before and after:
 * 6H (deposit 0.018/dab) matches to 4 decimals, HB (0.108/dab, and only a
 * 1.33x density change) to within 1%.
 *
 * Note this is only the true ratio for a tool with no curvature spacing limit
 * (DabSystem.curvatureTolerancePx), since that limit can tighten the step
 * further without the engine seeing it. Which is not a caveat in practice —
 * the tools below are exactly the ones that never set one.
 */
export function dabDepositScale(
  dab: DabFootprint, baseSize: number, spacingFactor: number,
  bounds: DabSpacingBounds = FOOTPRINT_BOUNDS_ONLY,
): number {
  const nominal = nominalDabSpacing(baseSize, spacingFactor)
  return boundedDabSpacing(dab, baseSize, spacingFactor, nominal, bounds) / nominal
}

/**
 * Which of the two bounds this stroke's nib has opted into (#501).
 *
 * They were one rule until a tool wanted the second without the first
 * (watercolor's flat nib, #489) and then a tool wanted both (charcoal's chisel)
 * — see DabSystem's own `footprint` and `nibScallop` fields for what each one
 * argues and why neither implies the other.
 */
export interface DabSpacingBounds {
  /** #478's diameter rule, itself gated per dab by #483's hardness ramp. */
  footprint: boolean
  /** #485's absolute scallop bound, taken on its own. */
  scallop: boolean
}

/** The pre-#501 default — every caller that predates a second bound meant this
 *  one. A shared frozen value rather than an inline literal because this is on
 *  the per-dab path (dabDepositScale runs once per dab of every stroke) and an
 *  object literal in a default parameter allocates on each call. */
const FOOTPRINT_BOUNDS_ONLY: DabSpacingBounds = Object.freeze({ footprint: true, scallop: false })

/**
 * The step after this dab under whichever bounds apply, capped by `maxSpacing`
 * (the segment's own allowance — the nominal rule, tightened by a ribbon tool's
 * curvature limit where it has one).
 *
 * One expression rather than one per call site specifically because two of them
 * have to agree: DabSystem spaces the dabs by this, and _bakeDabOpacity divides
 * the deposit by the same number to hold the mark's tone (dabDepositScale right
 * above). A tool whose spacing tightened without its deposit following would
 * simply paint darker, which is the regression #478 was careful about and the
 * one a second, separately-derived copy of this rule would reintroduce.
 *
 * The clamps are ordered to reproduce the pre-#501 behaviour exactly in both
 * shipped configurations — footprint alone (graphite, eraser, charcoal) and
 * scallop alone (watercolor's flat) — so switching a tool's bounds on is the
 * only thing that can move a mark.
 */
export function boundedDabSpacing(
  dab: DabFootprint, baseSize: number, spacingFactor: number,
  maxSpacing: number, bounds: DabSpacingBounds,
): number {
  let step = maxSpacing
  if (bounds.footprint) step = Math.min(step, footprintDabSpacing(dab, baseSize, spacingFactor))
  if (bounds.scallop) step = Math.max(MIN_DAB_SPACING_PX, Math.min(step, scallopSpacingLimit(dab)))
  return step
}

/**
 * Whether this tool's dab spacing follows the footprint rule at all.
 *
 * True for the tools whose mark is literally the union of independent dab
 * stamps composited by plain "over" — a gap between two of them is a hole in
 * the mark, and the deposit is linear in per-dab opacity so the tone can be
 * held by dabDepositScale. That is graphite, the eraser (same shader path,
 * same shaping profile, and its `sizeScale` is 1) and charcoal.
 *
 * Being on this list is necessary, not sufficient: footprintSpacingStrength
 * then gates each individual stroke on how hard its dab's edge actually is,
 * and by that measurement charcoal's whole range and graphite's F-and-softer
 * half come out untouched (#483). The list stays as it is because it answers a
 * different question — "could this tool's deposit be re-normalized at all" —
 * and the answer for charcoal is still yes, for the day a harder charcoal
 * preset exists.
 *
 * False, and deliberately, for:
 *
 *  - **liner, marker, brushPen, watercolor** — the ribbon rasterizer fills the
 *    span *between* consecutive samples (markerRibbon.ts), so their silhouette
 *    has no gaps to open in the first place, and their deposit is already
 *    normalized by the distance each dab covers. Both halves of this change
 *    would be answering a question they don't ask.
 *  - **smudge** — no deposit of its own to hold: its pickup and transfer rates
 *    are already expressed per brush radius travelled (SMUDGE_PICKUP_RATE's
 *    own comment), which is the same normalization arrived at from the other
 *    direction. Re-spacing it would be fine; scaling its opacity by the same
 *    ratio afterwards would double-count.
 */
export function isFootprintSpacedTool(tool: ToolType): boolean {
  return tool === 'pencil' || tool === 'eraser' || tool === 'charcoal'
}
