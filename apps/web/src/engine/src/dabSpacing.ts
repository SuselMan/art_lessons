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
 * *sparser* than it is now. Only the under-sampled cases — hard graphite,
 * light pressure, charcoal on its edge — move, and they only ever move toward
 * more dabs. A rule without the min would also be defensible (it is the same
 * 0.22 either way) but it would quietly re-space soft grades that already look
 * right, which is not this fix's business.
 */
export function footprintDabSpacing(
  dabSize: number, sizeScale: number, baseSize: number, spacingFactor: number,
): number {
  const nominal = nominalDabSpacing(baseSize, spacingFactor)
  return Math.max(MIN_DAB_SPACING_PX, Math.min(nominal, dabSize * sizeScale * spacingFactor))
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
  dabSize: number, sizeScale: number, baseSize: number, spacingFactor: number,
): number {
  return footprintDabSpacing(dabSize, sizeScale, baseSize, spacingFactor)
    / nominalDabSpacing(baseSize, spacingFactor)
}

/**
 * Whether this tool's dab spacing follows the footprint rule at all.
 *
 * True for the tools whose mark is literally the union of independent dab
 * stamps composited by plain "over" — a gap between two of them is a hole in
 * the mark, and the deposit is linear in per-dab opacity so the tone can be
 * held by dabDepositScale. That is graphite, the eraser (same shader path,
 * same shaping profile, and its `sizeScale` is 1 — only the pressure response
 * under-samples it, at ~0.59 of a diameter at a feather touch) and charcoal
 * (whose `widthMax` of 0.5 halves the short axis on the stick's edge, landing
 * it at ~0.56 with the same result).
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
