// #536, ADR 011 §17.19: what colour a MIXTURE of paints is.
//
// A wash used to carry one colour, a scalar of the composite taken from its
// first dab, and the colour was part of the wash's signature — so a second
// paint opened a second wash and glazed over the first once it dried. Blue
// over dried yellow already greened, by the transmit blend; blue INTO a wet
// yellow puddle could not, because the two never met in one accumulation.
// Ilya: "из синего и жёлтого надо бы получить зелёный".
//
// The document coordinate for colour is OPTICAL DEPTH, per texel, per
// channel: D = Σ m_p · τ_p over every pass that laid paint here, where m_p is
// the pigment mass a pass delivered and τ_p = −ln(T_p) the absorption of that
// pigment, T_p its transmittance. Depths ADD — exactly like everything else in
// the deposit — and adding depths is what a stack of dye films does to light
// (Beer–Lambert): the film's transmittance is exp(−D). Two paints in one
// texel therefore mix subtractively, as paints do: ultramarine (0.16, 0.23,
// 0.59) and a warm yellow (1.0, 0.9, 0.1) in equal mass give
// exp(−(τ_b + τ_y)/2) = (0.40, 0.46, 0.24), a dull green — which is what the
// two make on paper. An average of the two RGBs is (0.58, 0.56, 0.35), a grey.
//
// Not Kubelka–Munk: no scattering term, and the RGB a preset carries is a
// display colour, not a spectrum, so τ from it is a deterministic rendering
// rule rather than a measurement. Each pigment gets its own absorption
// triple, generated from its colour here and open to hand correction there
// (watercolorPigments.ts) when a particular pair mixes wrong.
//
// The composite reads the mixture's own colour back as exp(−D / m), the
// geometric mean of the transmittances weighted by mass — and keeps its
// existing density curve on the mass. For one pigment that is exactly the
// colour the preset carries, so a single paint renders as it always did; the
// design thread argued for rendering exp(−D) directly and folding the
// strength into the mass, which is the cleaner model and the larger change,
// and is where this goes once the mixture is proved on screen (§17.19).

/** The smallest transmittance a pigment channel may claim. A channel at
 *  zero would be infinite depth — one dab would blacken any mixture for
 *  ever — so the deepest paint is capped: −ln(0.02) ≈ 3.9. */
export const PIGMENT_T_MIN = 0.02

/** How the depth is scaled into an eight-bit channel: D / PIGMENT_DEPTH_SCALE
 *  is what the buffer holds, so one code is DEPTH_SCALE / 255 of depth. The
 *  scale is a measured choice (pigmentOptics.test.ts, the quantisation study):
 *  large enough that the deepest working depths do not clip, small enough that
 *  a weak glaze does not vanish into a code. */
export const PIGMENT_DEPTH_SCALE = 4

export type Rgb = readonly [number, number, number]

/** The absorption of a paint from its colour: τ = −ln(T), per channel. */
export function pigmentAbsorption(color: Rgb): [number, number, number] {
  return [
    -Math.log(Math.min(1, Math.max(PIGMENT_T_MIN, color[0]))),
    -Math.log(Math.min(1, Math.max(PIGMENT_T_MIN, color[1]))),
    -Math.log(Math.min(1, Math.max(PIGMENT_T_MIN, color[2]))),
  ]
}

/** What a texel's mixture looks like: the mass-weighted geometric mean of its
 *  pigments' transmittances, exp(−D / m). With no mass there is no mixture
 *  and the caller's own colour stands in. */
export function mixtureColor(depth: Rgb, mass: number, fallback: Rgb): [number, number, number] {
  if (mass <= 1e-6) return [fallback[0], fallback[1], fallback[2]]
  return [
    Math.exp(-depth[0] / mass),
    Math.exp(-depth[1] / mass),
    Math.exp(-depth[2] / mass),
  ]
}

/** The film's own transmittance, exp(−D) — what the light that went through
 *  it is left with. The model the composite converges on (see the header). */
export function filmTransmittance(depth: Rgb): [number, number, number] {
  return [Math.exp(-depth[0]), Math.exp(-depth[1]), Math.exp(-depth[2])]
}

/** One eight-bit store-and-load of a depth value at the given scale: what the
 *  GPU does between two passes. The oracle's quantisation study runs the CPU
 *  model through this to measure what the format costs before it is chosen. */
export function quantizeDepth(value: number, scale = PIGMENT_DEPTH_SCALE): number {
  const code = Math.round(Math.min(Math.max(value / scale, 0), 1) * 255)
  return (code / 255) * scale
}

/** Hue in degrees of a linear RGB triple, for the tests' "is this green". */
export function hueOf(c: Rgb): number {
  const [r, g, b] = c
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  if (d < 1e-9) return 0
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  return h < 0 ? h + 360 : h
}
