import { PRESSURE_RESPONSES, brushPenWidth, type PressureResponse } from '../../engine'

// #454: the little graph each pressure-response option shows in its picker row,
// the pressure counterpart of tiltResponseCurves.ts — same contract (the picker
// draws normalized 0..1 samples and learns nothing about what they mean), same
// reason for existing (a named feel is easier to choose with its shape beside
// it than from the word alone).
//
// What the axes are: reported pressure across the full 0..1 the stylus can
// report, against the width the nib gives at it. Plotted as the *raw* width
// fraction rather than rescaled per option, because the three options differ in
// exactly that amount — a soft nib is wider than a firm one at the same
// pressure, and a graph normalized per curve would hide the whole difference
// and draw three identical lines.
//
// That also means every curve starts at the width floor rather than at zero,
// which is honest: the pen never draws nothing (ADR 009 §2).
const SAMPLES = 25

export function pressureResponseSamples(response: PressureResponse): number[] {
  return Array.from({ length: SAMPLES }, (_, i) => brushPenWidth(i / (SAMPLES - 1), response))
}

/** One sampled curve per response, keyed by option value — the shape
 *  `SettingDescriptor.optionCurves` takes. */
export const PRESSURE_RESPONSE_CURVES: Record<PressureResponse, number[]> = (() => {
  const curves = {} as Record<PressureResponse, number[]>
  for (const response of PRESSURE_RESPONSES) curves[response] = pressureResponseSamples(response)
  return curves
})()
