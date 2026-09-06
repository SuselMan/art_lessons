import { DIGITAL_BRUSHES, digitalBrushFromPreset } from '../../engine'

// #547: the little graph each brush shows in its picker row — the third file of
// this kind, after tiltResponseCurves.ts and pressureResponseCurves.ts, and it
// exists for the same reason both of those do (see SettingDescriptor's
// `optionCurves`: some options differ in a way no adjective pins down, and the
// only faithful picture of a function is its curve).
//
// What the axes are, and why this particular curve: distance from the stamp's
// centre out to its rim, against how much of the mark lands there. That is
// literally what separates the brushes in this set — v1 varies hardness and
// flow and nothing else — so the picker row shows the actual falloff the shader
// will draw rather than a word for it. "Soft" reads as a long slope, "ink" as a
// cliff at the very edge, and the difference between medium and hard is visible
// instead of being a matter of trusting the labels.
//
// Deliberately not a photographed sample stroke, which is what a pencil grade or
// a charcoal type gets (toolTypeImages.ts). A grade's difference is its *tone*
// and a photograph is the only honest picture of that; a brush's difference here
// is its edge, and a curve states it exactly while a thumbnail of a smear would
// mostly show whatever stroke someone happened to draw.
const SAMPLES = 25

/** The stamp's own profile, reproduced from DAB_FRAG's u_inkMode=10 branch.
 *
 *  A second copy of that formula, and it has to be watched: if the shader's
 *  falloff changes, this picture starts lying. It cannot simply call the shader
 *  (it is GLSL, and the preview has no GL context), and a shared closure would
 *  buy nothing — the shader would still spell out its own smoothstep. What keeps
 *  the two honest is that the tuning knob is `hardness`, which both read from
 *  the same descriptor.
 *
 *  The `aaNorm` floor the shader applies is not reproduced: it is a function of
 *  the mark's pixel radius, which a preview drawn at no particular size does not
 *  have. Its whole job there is antialiasing the hardest brush, so leaving it
 *  out draws ink-round's edge as the cliff it is meant to be rather than as
 *  whatever one pixel of ramp looks like at the size the user happens to pick. */
export function digitalBrushProfileSamples(id: string): number[] {
  const { tip: { hardness } } = digitalBrushFromPreset(id)
  return Array.from({ length: SAMPLES }, (_, i) => {
    const d = i / (SAMPLES - 1)
    if (d >= 1) return 0
    if (d <= hardness) return 1
    // GLSL smoothstep, spelled out: the shader's own
    // `1.0 - smoothstep(inner, 1.0, d)`.
    const t = (d - hardness) / (1 - hardness)
    return 1 - t * t * (3 - 2 * t)
  })
}

/** One sampled profile per brush, keyed by option value — the shape
 *  `SettingDescriptor.optionCurves` takes. */
export const DIGITAL_BRUSH_CURVES: Record<string, number[]> = (() => {
  const curves: Record<string, number[]> = {}
  for (const brush of DIGITAL_BRUSHES) curves[brush.id] = digitalBrushProfileSamples(brush.id)
  return curves
})()
