// Standard graphite hardness range, from hardest to softest. Includes 'F'
// ("fine point") between H and HB, per real drafting-pencil sets — see #86.
export const PENCIL_GRADES = [
  '6H', '5H', '4H', '3H', '2H', 'H', 'F', 'HB', 'B', '2B', '3B', '4B', '5B', '6B',
] as const

export type PencilGradeName = (typeof PENCIL_GRADES)[number]

export interface PencilPreset { opacity: number; hardness: number; sizeMultiplier: number }

const GRADE_SET = new Set<string>(PENCIL_GRADES)

/** Type guard for narrowing an arbitrary string (e.g. engine option input) to a known grade. */
export function isPencilGrade(v: string): v is PencilGradeName {
  return GRADE_SET.has(v)
}

// ─── Interpolation ───────────────────────────────────────────────────────────
//
// PENCIL_PRESETS used to hand-list only H / HB / 2B, hand-tuned by feel (#72).
// This is a first-pass extrapolation to fill in the rest of the standard 6H–6B
// range so every button-exposed grade has a real, distinct entry — it is
// explicitly NOT final tuning. Per-grade feel is refined later from manual
// feedback on real hardware (#72); this pass only guarantees the progression
// is smooth, monotonic, and free of silent fallbacks.
//
// Each grade sits at a numeric position on the standard scale (HB = 0, each
// H-step is -1, each B-step is +1; F sits half a step above H). The three
// calibrated anchors (H, HB, 2B) are kept byte-for-byte — interpolation
// between them passes exactly through the calibrated values, and the range
// beyond H (toward 6H) and beyond 2B (toward 6B) is extrapolated using the
// *average* slope across the full calibrated span (H → 2B). That's gentler
// than either local segment slope, so the hard/soft tails don't collapse onto
// the clamp bounds within just a grade or two. Values are then clamped to a
// sane range so 6H/6B never come out nonsensical.

const GRADE_INDEX: Record<PencilGradeName, number> = {
  '6H': -6, '5H': -5, '4H': -4, '3H': -3, '2H': -2, 'H': -1, 'F': -0.5,
  'HB': 0, 'B': 1, '2B': 2, '3B': 3, '4B': 4, '5B': 5, '6B': 6,
}

const ANCHOR_H:  PencilPreset = { opacity: 0.32, hardness: 0.55, sizeMultiplier: 0.85 }
const ANCHOR_HB: PencilPreset = { opacity: 0.48, hardness: 0.38, sizeMultiplier: 1.00 }
const ANCHOR_2B: PencilPreset = { opacity: 0.65, hardness: 0.25, sizeMultiplier: 1.10 }

const ANCHOR_H_X  = -1
const ANCHOR_HB_X = 0
const ANCHOR_2B_X = 2

const BOUNDS: Record<keyof PencilPreset, readonly [number, number]> = {
  opacity:        [0.08, 0.95],
  hardness:       [0.05, 0.95],
  sizeMultiplier: [0.5, 1.6],
}

function clamp(v: number, [lo, hi]: readonly [number, number]): number {
  return Math.min(hi, Math.max(lo, v))
}

function interpolate(x: number, key: keyof PencilPreset): number {
  const h  = ANCHOR_H[key]
  const hb = ANCHOR_HB[key]
  const b2 = ANCHOR_2B[key]
  const globalSlope = (b2 - h) / (ANCHOR_2B_X - ANCHOR_H_X)

  let raw: number
  if (x <= ANCHOR_H_X) {
    raw = h + globalSlope * (x - ANCHOR_H_X)
  } else if (x < ANCHOR_HB_X) {
    const slope = (hb - h) / (ANCHOR_HB_X - ANCHOR_H_X)
    raw = h + slope * (x - ANCHOR_H_X)
  } else if (x <= ANCHOR_2B_X) {
    const slope = (b2 - hb) / (ANCHOR_2B_X - ANCHOR_HB_X)
    raw = hb + slope * (x - ANCHOR_HB_X)
  } else {
    raw = b2 + globalSlope * (x - ANCHOR_2B_X)
  }
  return clamp(raw, BOUNDS[key])
}

function buildPresets(): Record<PencilGradeName, PencilPreset> {
  const presets = {} as Record<PencilGradeName, PencilPreset>
  for (const grade of PENCIL_GRADES) {
    const x = GRADE_INDEX[grade]
    presets[grade] = {
      opacity:        interpolate(x, 'opacity'),
      hardness:       interpolate(x, 'hardness'),
      sizeMultiplier: interpolate(x, 'sizeMultiplier'),
    }
  }
  return presets
}

export const PENCIL_PRESETS: Record<PencilGradeName, PencilPreset> = buildPresets()
