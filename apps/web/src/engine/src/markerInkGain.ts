import { nibMeanChord, type NibGeometry } from './markerRibbon'

// #559 — why a small chisel marker drew a "holey" ribbon, and the one number
// that closes it.
//
// The marker's silhouette is exact geometry (markerRibbon.ts) and was never
// the problem: coverage came back solid at every size. What was not solid was
// the *ink*. The ink pass lays `opacity * segmentLength * 0.5` per nib stamp
// (ADR 004 "Ревизия v1.5" §2, distance-normalized) and the same again per band,
// and the composite (DAB_FRAG's u_inkMode=2 branch) turns the accumulated
// inkLoad into a film that saturates at MARKER_LAYER1_INK = 0.6. A pixel on the
// path is covered by `chord / spacing` consecutive stamps, where `chord` is how
// far the nib extends *along the direction of travel* through that pixel — so
// the ink it collects is roughly `opacity * 0.5 * chord` from the stamps plus
// `opacity * 0.5 * spacing` from the one band it lies in. Per unit length of
// travel, in other words, but *times the nib's own depth along the travel*.
//
// For a bullet nib that depth is the diameter and the film saturates from about
// 6px up. For a chisel held broad-side to the stroke — which is how a chisel is
// used — it is the nib's *short* axis, a fifth of the toolbar number: at size 8
// that is 1.6px, one stamp per pixel, and the accumulated ink lands at ~0.5,
// under the first layer's knee. The film then reproduces the overlap count of
// the stamps directly, and the overlap count of a row of thin slats is a
// lattice. Measured on the real engine (darkness of a horizontal stroke in
// canvas px at zoom 1; a saturated ribbon reads ~171):
//
//     chisel 8, nib across the travel (90°)   mean 127   min  20   ripple 64
//     chisel 8, nib at 45°                    mean 144   min 124   ripple 21
//     chisel 8, nib along the travel (0°)     mean 171   min 164   ripple 12
//     chisel 30 / 50, bullet 6..12            mean 170   min 161   ripple 13-19
//
// Lowering the shader's own knee to 0.15 as an experiment made the same size-8
// stroke read 169 with a ripple of 12 — which is what pinned the cause on the
// deposit rather than on the geometry.
//
// The fix scales the deposit up by `ref / chord` whenever the chord is shorter
// than a reference, and leaves it exactly alone otherwise. A floor of 1 rather
// than a full per-area normalization (which is what watercolor does, see
// RibbonProfile.normalizeDeposit) on purpose: every stroke that saturated
// before still gets the identical deposit, bit for bit, so nothing that already
// looked right can move — only the marks that were visibly broken change, and
// they only change toward the tone the wider nib already had.
//
// The reference is the chord at which today's deposit already saturates with
// margin. Bullet 6 (mean chord 4.7px) reads fully solid and is left untouched;
// bullet 4 (chord 3.1) already sat slightly under. A chisel drawn broad-side
// saturates from roughly size 25 on its own and every size below now lands at
// the same level as above it.
export const MARKER_INK_REF_CHORD_PX = 4.5

/**
 * Multiplier for this dab's (or band's) ink deposit, >= 1. `dx, dy` is the
 * direction the nib is being dragged in — from the previous dab, or along the
 * band — and need not be normalized.
 *
 * A zero vector (the first dab of a stroke, a tap, a dwell tick stamped in
 * place) has no direction to measure a chord along and gets exactly 1: the
 * legacy deposit, untouched. Not a look-ahead to the next dab, because the
 * next dab is not always there yet — a live stroke's first batch can be one
 * sample long while the replay of the same operation has the whole stroke in
 * hand, and the two would then ink the first stamp differently. What that
 * costs is one under-inked stamp at the very start of a thin stroke, under the
 * band and the gained stamp that follow it within a chord's length.
 *
 * Pure in the dabs and the profile otherwise, so live paint and replay agree:
 * a peer folding the same operation computes the same directions from the same
 * recorded positions.
 */
export function markerThinNibInkGain(nib: NibGeometry, dx: number, dy: number, refChordPx: number): number {
  if (refChordPx <= 0) return 1
  const len = Math.hypot(dx, dy)
  if (len <= 1e-6) return 1
  const chord = nibMeanChord(nib, dx / len, dy / len)
  if (chord <= 1e-6) return 1 // degenerate nib; the draw path drops these anyway
  return Math.max(1, refChordPx / chord)
}
