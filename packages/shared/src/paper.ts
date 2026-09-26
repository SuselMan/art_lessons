// Paper is one axis: how coarse the stock is. It was briefly a grid — a
// coarseness axis crossed with a "character" axis (fbm/capsules/streak) —
// back when the grain was generated procedurally and a second axis cost
// nothing but a few noise parameters (#300). Every one of those nine came
// from the same synthetic fBm, and none of them read as paper; the whole
// grid was replaced by three bakes of one photographed sheet at three
// magnifications (#333), which is what these three names now mean. A future
// second sheet is a new *stock*, not a second axis — it gets its own entry
// here, the way real paper is sold.
export const PAPER_COARSENESS = ['coarse', 'medium', 'fine'] as const
export type PaperCoarseness = typeof PAPER_COARSENESS[number]

// `flat` is deliberately not on this axis — it has no grain to be coarse or
// fine, so it is its own single type rather than three identical ones.
export type PaperGrainType = PaperCoarseness
export type PaperType = PaperGrainType | 'flat'

export const PAPER_GRAIN_TYPES: readonly PaperGrainType[] = PAPER_COARSENESS

export const PAPER_TYPES: readonly PaperType[] = [...PAPER_GRAIN_TYPES, 'flat']

/** Rooms created before the current set existed. A translation rather than a
 *  database migration: it costs a few lines, needs no downtime, and cannot
 *  half-apply. Two generations to carry now — the original three names, and
 *  the nine grid names, whose coarseness half survives verbatim (see
 *  normalizePaperType, which reads it straight off the prefix). */
const LEGACY_PAPER_TYPES: Record<string, PaperType> = {
  rough:   'coarse',
  smooth:  'medium',
  bristol: 'fine',
}

export function isPaperType(value: string): value is PaperType {
  return (PAPER_TYPES as readonly string[]).includes(value)
}

/** Accepts anything the database might hold — a current type, a legacy name,
 *  a grid name like `medium-capsules`, or a value from a newer build that
 *  this one doesn't know — and always answers with something renderable. */
export function normalizePaperType(value: string | null | undefined): PaperType {
  if (!value) return 'coarse'
  if (isPaperType(value)) return value
  if (value in LEGACY_PAPER_TYPES) return LEGACY_PAPER_TYPES[value]
  // A grid name: the character half no longer exists, but the coarseness
  // half is exactly what it always meant, so an old room keeps the grain
  // size it was drawn at.
  return paperCoarsenessOf(value) ?? 'coarse'
}

// Validates rather than casts: this is reached with whatever string the
// database holds (a legacy name, or a type from a build newer than this
// one), and silently returning an invalid key produced `undefined` lookups
// deep in the engine and the sound synth rather than an obvious failure.
// `null` means "no grain axis" — which is exactly how `flat` behaves too.
export function paperCoarsenessOf(type: string): PaperCoarseness | null {
  const head = type.split('-')[0]
  return (PAPER_COARSENESS as readonly string[]).includes(head) ? head as PaperCoarseness : null
}

// Default background color per paper texture (hex, sRGB) — the engine's
// PAPER_BLEND_FRAG uniform falls back to this when a room has no explicit
// `Room.paperColor` (rooms created before that field existed, or a creator
// who never opened the color picker). Lives here rather than only in
// engine/index.ts so CreateRoom's paper-color picker can default/preview
// against the exact same values the engine will actually render.
// (#300) Keyed by coarseness rather than by full type: the default tint
// tracks how coarse the stock is (coarser paper reads warmer and slightly
// darker), which has nothing to do with its fibre character. These are the
// same three values the old rough/smooth/bristol carried.
// (#426) Lifted towards white and roughly halved in warmth. The old values
// were picked while the app only had a dark theme, and against near-black they
// read as neutral stock; with a light interface around them the same warmth
// reads as yellow, which is simultaneous contrast doing what it does — the
// paper never changed, its surround did. Since the light theme is now a first
// class option, the tint is set so the stock reads as paper in both surrounds
// rather than as neutral in one and yellow in the other.
// The ramp itself is unchanged in shape and has to stay that way: coarser
// stock is warmer *and* slightly darker than finer stock. Moving one of these
// three without the others inverts that ordering.
const DEFAULT_PAPER_COLOR_BY_COARSENESS: Record<PaperCoarseness, string> = {
  coarse: '#faf8f4',
  medium: '#fcfbf9',
  fine:   '#fdfdfc',
}

export function defaultPaperColor(type: PaperType): string {
  const coarseness = paperCoarsenessOf(type)
  // Flat has no grain at all, so it gets the cleanest of the three.
  return coarseness ? DEFAULT_PAPER_COLOR_BY_COARSENESS[coarseness] : '#fcfcfa'
}

export const DEFAULT_PAPER_COLORS: Record<PaperType, string> =
  Object.fromEntries(PAPER_TYPES.map(t => [t, defaultPaperColor(t)])) as Record<PaperType, string>

// Shown in the paper picker.
export const PAPER_COARSENESS_LABELS: Record<PaperCoarseness, string> = {
  coarse: 'Coarse',
  medium: 'Medium',
  fine:   'Fine',
}

export function paperTypeLabel(type: PaperType): string {
  if (type === 'flat') return 'Flat'
  return PAPER_COARSENESS_LABELS[type]
}

export type CanvasSize = {
  width: number
  height: number
  label: string // 'A4' | 'A3' | 'A2' | 'Square' | '16:9' | 'Custom'
}
