import type { PencilPreset } from './pencilPresets'

// Charcoal (#304, ADR 005) — a loose carbon stick, deliberately NOT modeled as
// "a very soft black pencil". Turning PENCIL_PRESETS' own opacity up gives a
// dark *pencil*: the line stays even, the edge stays smooth, and the paper
// reaction stays graphite's. Of the five properties that actually distinguish
// charcoal (matte, friable, high covering power, poorly fixed, coarse
// particle), only covering power is expressible as a hardness grade — so
// charcoal gets its own preset shape with three extra fields graphite has no
// use for, plus its own DAB_FRAG branch (u_inkMode=5).
//
// Matte-vs-glossy isn't in here at all: this engine has no specular model, so
// graphite is already matte and the difference is unexpressible. What actually
// reads as "charcoal, not pencil" is the velvet density plus the ragged edge —
// see ADR 005's own "Что в движке уже подходит".

/** Real charcoal types an artist picks between at the easel, ordered
 *  loose/light -> dense/black. Modeled as *presets* (one toolbar slot with a
 *  type selector), not three separate tools — same tradeoff PENCIL_GRADES
 *  already makes for 6H-6B, and for the same manifesto reason (ADR 005 §1). */
export const CHARCOAL_TYPES = ['vine', 'willow', 'compressed'] as const

export type CharcoalType = (typeof CHARCOAL_TYPES)[number]

export interface CharcoalPreset extends PencilPreset {
  /** Contrast expansion applied to the baked paperCatch around its own 0.5
   *  midpoint (DAB_FRAG's charcoal branch, ADR 005 §4). >1 pulls the paper's
   *  peaks toward full deposit and its valleys toward none, so the stick
   *  visibly rides the tooth instead of filling it evenly the way graphite
   *  does. Every charcoal type is >1 — any charcoal feels paper more than any
   *  graphite — but it *falls* toward compressed, which is pressed hard
   *  enough to reach into the valleys. */
  tooth: number
  /** How much the mark breaks up: low-frequency dropouts (where the stick
   *  simply didn't touch) plus fine grit on top. Falls toward compressed —
   *  a pressed stick holds together better than vine (ADR 005 §5). */
  crumble: number
  /** Strength of the faint speckled dust ring just inside the dab's rim
   *  (ADR 005 §6) — loose particles that didn't stick, not a physical
   *  shedding simulation. */
  dust: number
  /** Which of DAB_FRAG's own computeGrain variants supplies this material's
   *  mark texture (ADR 005 §5.1) — the same 0-10 set the dev-only
   *  "grain variant" setting selects between (0 = fine per-pixel dither,
   *  10 = no stroke-side texture at all; see GRAPHITE_GRAIN_LABELS).
   *
   *  Charcoal owns this per type rather than sharing graphite's own
   *  GRAPHITE_GRAIN_DEFAULT because the two materials have no reason to want
   *  the same dither — and after Ilya's pick they genuinely don't: graphite is
   *  10 ("Solid", no stroke-side texture at all), charcoal is 3 ("Streaky",
   *  tilt-aligned). Each has its own dev selector for auditioning the rest
   *  (see featureFlags.ts). */
  grain: number
}

/** computeGrain's "Streaky (tilt-aligned)" variant — noise stretched along the
 *  dab's own tilt direction. Ilya's pick for charcoal after comparing the
 *  candidates side by side (see ADR 005 §5.1): it clumps into long passages
 *  broken by light gaps, which is exactly how a dragged stick behaves, and
 *  being tilt-aligned it turns with the hand rather than sitting as a fixed
 *  screen-space pattern.
 *
 *  All three types share it for now — the *variant* is a property of "charcoal
 *  on paper", while how strongly it shows is already per-type through `crumble`
 *  (which scales the grain's amplitude in DAB_FRAG). Kept as a per-type field
 *  anyway so a future pick can differ between vine and compressed without a
 *  structural change. */
export const CHARCOAL_GRAIN_STREAKY = 3

// First-pass, NOT calibrated against a real device — the same caveat
// PENCIL_PRESETS' own interpolation comment, LINER_PRESET and every marker
// constant already carry. The progression is monotonic in every single field
// on purpose (ADR 005 §8): the three types must read as one axis
// "loose/light -> dense/black", not as three unrelated bundles of numbers.
//
// Hand-listed rather than interpolated between anchors the way PENCIL_PRESETS
// is: three points is not a scale worth fitting a curve through, and unlike
// pencil's 14 grades there is no expectation of ever filling in intermediate
// values (real charcoal has three named types, not a continuum).
export const CHARCOAL_PRESETS: Record<CharcoalType, CharcoalPreset> = {
  // Vine: light grey, barely saturates however long you work it, lifts almost
  // completely. Rides only the very peaks of the tooth (highest `tooth`) and
  // crumbles the most.
  vine:       { opacity: 0.32, hardness: 0.26, sizeMultiplier: 1.10, tooth: 3.0, crumble: 0.90, dust: 0.35, grain: CHARCOAL_GRAIN_STREAKY },
  // Willow: the classic artist's charcoal and the sensible default — the
  // working middle of all six fields.
  willow:     { opacity: 0.58, hardness: 0.36, sizeMultiplier: 1.15, tooth: 2.5, crumble: 0.70, dust: 0.30, grain: CHARCOAL_GRAIN_STREAKY },
  // Compressed: near-black in one pass at full pressure, denser and more even
  // than the other two, crisper edge. `hardness` rises with density (the edge
  // of a pressed stick genuinely is sharper) — note the *fluff* comes from
  // `crumble`, not from a low hardness: softening the edge by lowering
  // hardness would dilute charcoal's dense core too, and raggedness is edge
  // noise, not softness.
  compressed: { opacity: 0.88, hardness: 0.46, sizeMultiplier: 1.20, tooth: 1.8, crumble: 0.45, dust: 0.22, grain: CHARCOAL_GRAIN_STREAKY },
}

const TYPE_SET = new Set<string>(CHARCOAL_TYPES)

/** Type guard for narrowing an arbitrary string (a stored setting, a replayed
 *  StrokeOperation.preset) to a known charcoal type. */
export function isCharcoalType(v: string): v is CharcoalType {
  return TYPE_SET.has(v)
}

export const DEFAULT_CHARCOAL_TYPE: CharcoalType = 'willow'

/** Resolves a StrokeOperation.preset to its charcoal preset, falling back to
 *  willow (the middle type) for anything unrecognized — same
 *  fallback-to-a-sane-default spirit as _resolvePreset's own
 *  PENCIL_PRESETS['HB'] for pencil, so a stroke recorded by a future client
 *  with a type this build doesn't know still renders as charcoal rather than
 *  silently as an HB pencil. */
export function charcoalPresetFor(presetName: string): CharcoalPreset {
  return isCharcoalType(presetName) ? CHARCOAL_PRESETS[presetName] : CHARCOAL_PRESETS[DEFAULT_CHARCOAL_TYPE]
}
