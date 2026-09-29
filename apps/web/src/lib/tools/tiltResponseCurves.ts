import {
  CHARCOAL_FEEL, PENCIL_TILT, TILT_RESPONSES, tiltResponseT, type TiltResponse,
} from '../../engine'

// #409: the little graph each tilt-response option shows in its picker row.
//
// The picker draws whatever normalized 0..1 samples it is handed (see
// OptionPicker's `curve`), so everything tilt-specific — what the axes mean and
// how far they run — is decided here, once, and nothing in the component family
// learns about degrees or dab shape.
//
// What the y axis is: normalized elongation, `(aspect - 1) / (aspectMax - 1)`,
// which is exactly the response's own `t`. That identity is why the graph can
// be one line per option and still be honest about materials with very
// different aspectMax — a pencil reaching ×5 and a charcoal stick reaching ×8
// draw the same shape because the shape is what the setting picks; the amount
// is the material's, and the user is not choosing it here.
//
// Why the x axis runs to 90° and not to the material's own fullDeg: the
// difference between 'restrained' and the other two is *precisely* that it
// normalizes against a tilt a stylus on a tablet cannot reach (#389), so a
// graph rescaled per option would hide the one thing worth seeing — that the
// restrained curve never arrives inside the range a hand actually works in.
// Plotted against real degrees, it reads as the flat-then-late line it is.
const MAX_DEG = 90

// Enough to render a smooth cubic in an 88x34 strip without the polyline's own
// corners showing, and few enough that all four curves are a handful of numbers
// computed once at module load.
const SAMPLES = 25

/** The response's normalized elongation sampled evenly over 0..90° of tilt. */
export function tiltResponseSamples(
  response: TiltResponse, materialFullDeg: number, materialCurve: number,
): number[] {
  return Array.from({ length: SAMPLES }, (_, i) =>
    tiltResponseT((i / (SAMPLES - 1)) * MAX_DEG, response, materialFullDeg, materialCurve))
}

/** One sampled curve per response, for a material with these two numbers —
 *  keyed by option value, which is the shape `SettingDescriptor.optionCurves`
 *  takes. */
export function tiltResponseCurvesFor(
  materialFullDeg: number, materialCurve: number,
): Record<TiltResponse, number[]> {
  const curves = {} as Record<TiltResponse, number[]>
  for (const response of TILT_RESPONSES) {
    curves[response] = tiltResponseSamples(response, materialFullDeg, materialCurve)
  }
  return curves
}

// Sampled once at module load, from the live tuning configs' current values.
// The debug overlay can move PENCIL_TILT.curve/fullDeg afterwards and these
// graphs will not follow — deliberate, and only true of a dev-only panel: the
// graph is a picture of *which of the three shapes this is*, and re-deriving it
// on every render to track a slider nobody but us ever sees would trade real
// work for a difference no user can produce.
export const GRAPHITE_TILT_CURVES = tiltResponseCurvesFor(PENCIL_TILT.fullDeg, PENCIL_TILT.curve)
export const CHARCOAL_TILT_CURVES = tiltResponseCurvesFor(CHARCOAL_FEEL.fullDeg, CHARCOAL_FEEL.curve)
