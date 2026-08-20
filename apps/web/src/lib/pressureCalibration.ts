import { clamp } from 'lodash-es'

// Per-device pressure calibration (#475).
//
// `PointerEvent.pressure` arrives already processed by somebody else: the
// digitizer maps its raw force to a range, the vendor driver applies its own
// curve on top (Wacom's "Tip feel", Huion/XP-Pen's equivalents), and on
// Windows the OS has a second one behind Windows Ink. Two people on identical
// tablets can therefore report wildly different numbers for the same push —
// which is exactly the report this exists for: a teacher pressing hard and
// getting a faint line, on a PC with a graphics tablet.
//
// That also settles the tempting alternative: a built-in table of
// device → curve. The dominant term is one person's driver setting, not the
// model, so such a table would be wrong more often than right (and the model
// isn't even readable on iPad, where Safari reports a Mac). #476 covers the
// honest replacement — watching what this pen actually reports over time.
//
// Two stages, in this order:
//
//   p₁ = clamp((raw − inMin) / (inMax − inMin), 0, 1)   ← the wizard's job
//   p₂ = curve(p₁)                                      ← the editor's job
//
// The split is deliberate. The range is *measured* — there is a right answer
// and the pen knows it. The curve is *taste* — how quickly the response should
// come on depends on the hand, exactly as #409 concluded for the tilt curve
// ("правильной кривой здесь нет"). Mixing them into one editable curve would
// make a measurement look like a preference and lose the ability to re-measure
// without throwing away someone's tuning.
//
// WHERE THIS IS APPLIED IS LOAD-BEARING: at the input, in PointerInput, before
// the value reaches anything else — never at paint time. `Dab.pressure` goes
// into the Operation Log and is replayed by every participant, so a
// calibration applied downstream would make the same stroke look one way to
// its author and another way to the student watching, and different again
// after a rejoin. A calibration describes the author's *hardware*, so it is
// consumed exactly once, at the moment of input, and everything downstream —
// dab geometry, opacity baking, the pencil sound, the brush cursor — sees a
// single already-corrected number.

export interface PressureCurvePoint {
  /** Position along the normalized input, 0..1. */
  x: number
  /** Output at that input, 0..1. */
  y: number
}

export interface PressureCalibration {
  /** Reported pressure that maps to 0 — the lightest contact this person
   *  makes on purpose. */
  inMin: number
  /** Reported pressure that maps to 1 — a firm press they can hold, NOT the
   *  hardest push the digitizer can register. Calibrating against a press
   *  nobody sustains reproduces the original complaint. */
  inMax: number
  /** Interior control points of the response curve, ascending in x. The
   *  endpoints (0,0) and (1,1) are implicit and not editable: the range stage
   *  above already decides what counts as "nothing" and "full", so letting the
   *  curve move the ends too would give two controls for one quantity. An
   *  empty array is a straight line, and is what a fresh calibration ships
   *  with. */
  points: PressureCurvePoint[]
}

/** No calibration at all: what every device starts on, and what "Reset"
 *  returns to. Passing this through `applyPressureCalibration` returns the
 *  input unchanged, which is the pre-#475 behaviour exactly. */
export const IDENTITY_PRESSURE_CALIBRATION: PressureCalibration = { inMin: 0, inMax: 1, points: [] }

/** How many interior points the editor offers. Three is enough to shape a
 *  response and few enough that every one of them is reachable with a finger
 *  on a tablet; a free-form spline with a dozen knots is a different product. */
export const MAX_CURVE_POINTS = 3

/** Narrower than this and the two ends of the measurement are the same number:
 *  either the pen reports no pressure at all (browsers send a constant 0.5 for
 *  such a stylus) or both strokes were drawn with the same force. Dividing by
 *  it would turn the pen into an on/off switch, so calibration is refused and
 *  the measured numbers are shown instead. */
export const MIN_USABLE_RANGE = 0.05

/** A firm, deliberate press reporting below this never reaches the top of the
 *  range the app assumes — the condition this feature exists to fix. Not an
 *  error: it is the finding, and the reason to apply the calibration. */
export const LOW_CEILING = 0.6

/** Below this a "stroke" is a tap or a slip, and its median means nothing. */
export const MIN_CALIBRATION_SAMPLES = 8

/** Fraction trimmed off each end of a measured stroke before taking its
 *  median. Pressure ramps up as the nib lands and decays as it lifts, and
 *  those ramps are not what the person was asked to demonstrate — they'd drag
 *  a light stroke's level toward zero and a heavy one's away from the top.
 *  Trimming both ends symmetrically and taking the median of what's left
 *  measures the level actually *held*, which is what a calibration wants. */
const RAMP_TRIM = 0.15

// ─── The curve ───────────────────────────────────────────────────────────────

/** Monotone cubic (Fritsch–Carlson) through the control points, compiled once.
 *
 *  Monotone rather than a plain Catmull-Rom for one reason: an ordinary cubic
 *  overshoots between knots, and an overshoot here means pressing *harder*
 *  briefly producing a *lighter* mark somewhere in the middle of the range —
 *  a curve the user drew as a smooth ramp behaving as if the tool glitched.
 *  Fritsch–Carlson cannot overshoot by construction, so whatever shape is
 *  dragged on screen is the shape the pen gets.
 *
 *  Compiled to a closure rather than evaluated point-by-point because this
 *  runs per pointer sample, and a stylus reporting at 360 Hz would otherwise
 *  rebuild the same slope table hundreds of times a second. */
export function compilePressureCurve(points: PressureCurvePoint[]): (t: number) => number {
  const knots = normalizeCurvePoints(points)
  if (knots.length === 2) return t => clamp(t, 0, 1)

  const n = knots.length
  const h: number[] = []
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) {
    h[i] = knots[i + 1].x - knots[i].x
    d[i] = (knots[i + 1].y - knots[i].y) / h[i]
  }

  const m: number[] = new Array(n)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) {
      // A local extremum: a zero slope here is what keeps the segments on
      // either side from bulging past the knot they meet at.
      m[i] = 0
    } else {
      const w1 = 2 * h[i] + h[i - 1]
      const w2 = h[i] + 2 * h[i - 1]
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    }
  }

  return (t: number) => {
    const x = clamp(t, 0, 1)
    let i = n - 2
    for (let k = 0; k < n - 1; k++) {
      if (x <= knots[k + 1].x) { i = k; break }
    }
    const s = (x - knots[i].x) / h[i]
    const s2 = s * s
    const s3 = s2 * s
    const y =
      (2 * s3 - 3 * s2 + 1) * knots[i].y +
      (s3 - 2 * s2 + s) * h[i] * m[i] +
      (-2 * s3 + 3 * s2) * knots[i + 1].y +
      (s3 - s2) * h[i] * m[i + 1]
    return clamp(y, 0, 1)
  }
}

/** The editable points plus the two implicit endpoints, sorted, clamped, and
 *  with any pair too close in x to divide by dropped. Exported for the editor,
 *  which draws the same knots it lets you drag. */
export function normalizeCurvePoints(points: PressureCurvePoint[]): PressureCurvePoint[] {
  const interior = points
    .map(p => ({ x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) }))
    .filter(p => p.x > 0.02 && p.x < 0.98)
    .sort((a, b) => a.x - b.x)
    .slice(0, MAX_CURVE_POINTS)

  const knots: PressureCurvePoint[] = [{ x: 0, y: 0 }]
  for (const p of interior) {
    if (p.x - knots[knots.length - 1].x < 0.02) continue
    knots.push(p)
  }
  knots.push({ x: 1, y: 1 })
  return knots
}

// ─── The whole mapping ───────────────────────────────────────────────────────

/** Compiles a calibration into the function PointerInput calls per sample.
 *
 *  A range narrower than `MIN_USABLE_RANGE` is passed through untouched rather
 *  than divided by: such a calibration should never have been stored, but one
 *  that arrives anyway (hand-edited localStorage, a future format change) must
 *  degrade to "no calibration", not to a pen that reports only 0 and 1. */
export function compilePressureCalibration(cal: PressureCalibration): (raw: number) => number {
  const span = cal.inMax - cal.inMin
  const usable = span >= MIN_USABLE_RANGE
  const curve = compilePressureCurve(cal.points)
  const flat = cal.points.length === 0

  if (!usable && flat) return raw => clamp(raw, 0, 1)

  return (raw: number) => {
    const t = usable ? clamp((raw - cal.inMin) / span, 0, 1) : clamp(raw, 0, 1)
    return flat ? t : curve(t)
  }
}

/** One-shot form, for tests and for previewing a draft calibration in the UI.
 *  The input path uses `compilePressureCalibration` instead — see its note on
 *  why the slope table must not be rebuilt per sample. */
export function applyPressureCalibration(cal: PressureCalibration, raw: number): number {
  return compilePressureCalibration(cal)(raw)
}

/** True when this calibration changes nothing — the state a device starts in
 *  and the one "Reset" returns to. Lets the UI say "not calibrated" without
 *  storing a separate flag that could disagree with the numbers. */
export function isIdentityCalibration(cal: PressureCalibration): boolean {
  return cal.inMin === 0 && cal.inMax === 1 && cal.points.length === 0
}

// ─── Measuring ───────────────────────────────────────────────────────────────

export type PressureVerdict =
  /** Usable: the two strokes differ enough to define a range. */
  | 'ok'
  /** One of the strokes is too short to have a meaningful level. */
  | 'tooFewSamples'
  /** The two levels are the same. Either the stylus reports no pressure (a
   *  constant 0.5 is what browsers send for one that can't), or both strokes
   *  were drawn with the same force. */
  | 'noRange'
  /** The "hard" stroke came out lighter than the "light" one — the two steps
   *  were done the wrong way round. Worth its own verdict rather than folding
   *  into `noRange`: it is a mistake with an obvious fix, and telling someone
   *  their pen is broken when they simply swapped the steps is a bad answer. */
  | 'reversed'

export interface PressureMeasurement {
  /** Level held during the light stroke, on the pen's own reported scale. */
  light: number
  /** Level held during the firm stroke, same scale. */
  heavy: number
  observedMin: number
  observedMax: number
  sampleCount: number
  verdict: PressureVerdict
  /** A firm press never approached the top of the reported range. Not a
   *  failure — the finding, and the thing calibration fixes. */
  lowCeiling: boolean
}

/** Turns the two recorded strokes into the numbers a calibration is built from.
 *
 *  Deliberately medians of the trimmed middle rather than min and max: the
 *  extremes of a stroke are its landing and its lift-off (see `RAMP_TRIM`), so
 *  min/max would measure the transitions instead of the two levels the person
 *  was asked to demonstrate — and a single spike would then define the whole
 *  range. */
export function measurePressure(light: number[], heavy: number[]): PressureMeasurement {
  const all = [...light, ...heavy]
  const lightLevel = sustainedLevel(light)
  const heavyLevel = sustainedLevel(heavy)
  const observedMin = all.length > 0 ? Math.min(...all) : 0
  const observedMax = all.length > 0 ? Math.max(...all) : 0

  const verdict: PressureVerdict =
    light.length < MIN_CALIBRATION_SAMPLES || heavy.length < MIN_CALIBRATION_SAMPLES
      ? 'tooFewSamples'
      : heavyLevel < lightLevel - MIN_USABLE_RANGE
        ? 'reversed'
        : heavyLevel - lightLevel < MIN_USABLE_RANGE
          ? 'noRange'
          : 'ok'

  return {
    light: lightLevel,
    heavy: heavyLevel,
    observedMin,
    observedMax,
    sampleCount: all.length,
    verdict,
    lowCeiling: observedMax < LOW_CEILING,
  }
}

/** The calibration a successful measurement implies, keeping whatever curve
 *  was already tuned: re-measuring the range is not a reason to throw away
 *  someone's response shape, and the two stages are independent by design. */
export function calibrationFromMeasurement(
  measurement: PressureMeasurement,
  points: PressureCurvePoint[] = [],
): PressureCalibration {
  return {
    inMin: clamp(measurement.light, 0, 1 - MIN_USABLE_RANGE),
    inMax: clamp(measurement.heavy, MIN_USABLE_RANGE, 1),
    points: normalizeCurvePoints(points).slice(1, -1),
  }
}

function sustainedLevel(samples: number[]): number {
  if (samples.length === 0) return 0
  const trim = Math.floor(samples.length * RAMP_TRIM)
  // A stroke short enough that trimming would empty it is already below
  // MIN_CALIBRATION_SAMPLES and will be rejected — but it still has to produce
  // a number for the diagnostic readout rather than NaN.
  const core = samples.length - 2 * trim >= 3 ? samples.slice(trim, samples.length - trim) : samples
  const sorted = [...core].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// ─── Curve presets ───────────────────────────────────────────────────────────

/** Starting shapes for the curve editor, not a closed set of choices: each one
 *  drops a single control point that the person then drags. The tilt setting
 *  (#409) ships three fixed responses because a tilt curve has no measurable
 *  right answer to depart from; here the range measurement supplies the
 *  skeleton, and the curve only bends it. */
export const PRESSURE_CURVE_PRESETS = ['softer', 'linear', 'firmer'] as const

export type PressureCurvePreset = (typeof PRESSURE_CURVE_PRESETS)[number]

export const PRESSURE_CURVE_PRESET_POINTS: Record<PressureCurvePreset, PressureCurvePoint[]> = {
  /** Mid-range presses deposit more than they otherwise would — a full mark
   *  without leaning on the pen. */
  softer: [{ x: 0.5, y: 0.68 }],
  linear: [],
  /** The opposite: light and mid presses stay faint, and the top of the range
   *  is reserved for a deliberate push. */
  firmer: [{ x: 0.5, y: 0.32 }],
}

/** Which preset (if any) these points still match exactly — so the editor can
 *  keep a preset highlighted until the first drag moves off it. */
export function matchingCurvePreset(points: PressureCurvePoint[]): PressureCurvePreset | null {
  for (const preset of PRESSURE_CURVE_PRESETS) {
    const ref = PRESSURE_CURVE_PRESET_POINTS[preset]
    if (ref.length !== points.length) continue
    if (ref.every((p, i) => Math.abs(p.x - points[i].x) < 1e-6 && Math.abs(p.y - points[i].y) < 1e-6)) {
      return preset
    }
  }
  return null
}

// ─── Storage ─────────────────────────────────────────────────────────────────

/** Validates a calibration parsed out of localStorage. Everything here is
 *  user-writable and survives across deploys, so a stored value is untrusted
 *  input: a NaN reaching the input path would silently blank every stroke's
 *  pressure, which is far worse than losing a calibration. */
export function isPressureCalibration(value: unknown): value is PressureCalibration {
  if (typeof value !== 'object' || value === null) return false
  const cal = value as Partial<PressureCalibration>
  if (!isUnitNumber(cal.inMin) || !isUnitNumber(cal.inMax)) return false
  if (cal.inMax <= cal.inMin) return false
  if (!Array.isArray(cal.points)) return false
  if (cal.points.length > MAX_CURVE_POINTS) return false
  return cal.points.every(p =>
    typeof p === 'object' && p !== null && isUnitNumber(p.x) && isUnitNumber(p.y),
  )
}

function isUnitNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}
