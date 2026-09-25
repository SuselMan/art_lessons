import type { ColorBalanceShift, CurvePoint, LayerFilter, LayerFilterKind } from '@grafetto/shared'

/** (#574) What the filter dialog is editing: the settings of every kind at
 *  once, so switching from Curves to Blur and back does not lose the curve.
 *  Only the selected kind becomes an operation. */
export interface FilterDraft {
  kind: LayerFilterKind
  gaussian: { radius: number }
  motion: { angle: number; distance: number }
  hsl: { hue: number; saturation: number; lightness: number }
  curves: Record<CurveChannel, CurvePoint[]>
  balance: Record<TonalRange, ColorBalanceShift> & { preserveLuminosity: boolean }
}

export const CURVE_CHANNELS = ['value', 'red', 'green', 'blue'] as const
export type CurveChannel = (typeof CURVE_CHANNELS)[number]

export const TONAL_RANGES = ['shadows', 'midtones', 'highlights'] as const
export type TonalRange = (typeof TONAL_RANGES)[number]

export const BALANCE_AXES = ['cyanRed', 'magentaGreen', 'yellowBlue'] as const

const identityCurve = (): CurvePoint[] => [[0, 0], [255, 255]]
const zeroShift = (): ColorBalanceShift => ({ cyanRed: 0, magentaGreen: 0, yellowBlue: 0 })

/** Every kind's starting settings: the identity for the colour filters, a
 *  modest visible amount for the blurs — a blur has no identity to start
 *  from, and radius 1 would look like the dialog did nothing. */
function defaults(): Omit<FilterDraft, 'kind'> {
  return {
    gaussian: { radius: 4 },
    motion: { angle: 0, distance: 20 },
    hsl: { hue: 0, saturation: 0, lightness: 0 },
    curves: { value: identityCurve(), red: identityCurve(), green: identityCurve(), blue: identityCurve() },
    balance: { shadows: zeroShift(), midtones: zeroShift(), highlights: zeroShift(), preserveLuminosity: true },
  }
}

export function initialDraft(kind: LayerFilterKind = 'gaussian_blur'): FilterDraft {
  return { kind, ...defaults() }
}

/** Puts the selected kind back to its starting settings, leaving the others. */
export function resetKind(draft: FilterDraft): FilterDraft {
  const d = defaults()
  switch (draft.kind) {
    case 'gaussian_blur': return { ...draft, gaussian: d.gaussian }
    case 'motion_blur': return { ...draft, motion: d.motion }
    case 'hsl': return { ...draft, hsl: d.hsl }
    case 'curves': return { ...draft, curves: d.curves }
    case 'color_balance': return { ...draft, balance: d.balance }
  }
}

/** The operation's filter for what the dialog currently shows. */
export function draftToFilter(draft: FilterDraft): LayerFilter {
  switch (draft.kind) {
    case 'gaussian_blur': return { kind: 'gaussian_blur', radius: draft.gaussian.radius }
    case 'motion_blur': return { kind: 'motion_blur', angle: draft.motion.angle, distance: draft.motion.distance }
    case 'hsl': return { kind: 'hsl', ...draft.hsl }
    case 'curves': return { kind: 'curves', ...draft.curves }
    case 'color_balance': return { kind: 'color_balance', ...draft.balance }
  }
}
