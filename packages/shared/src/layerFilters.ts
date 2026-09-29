import type { OperationBase } from './operationBase.js'

// ── Layer filters (#574, ADR 014) ─────────────────────────────────────────
//
// Blur, motion blur, hue/saturation/lightness, curves and colour balance,
// applied once to one layer's pixels. The result becomes the layer's content;
// there is no live effect layer recomputed over whatever sits underneath.
//
// **The recipe, not the result**, like `shape` and unlike `area_fill`. A fill
// ships its raster because it is a *threshold* over this device's GPU output,
// and a threshold turns a least-significant-bit disagreement into a different
// region. None of these five thresholds anything: each is a continuous
// function of its input, so two clients whose layers already differ by a bit
// still differ by about a bit afterwards. What keeps the function itself
// identical everywhere is where it runs — on the CPU, in integer arithmetic,
// with no trigonometry on the replay path (see engine/src/filters/layerFilters.ts).
// A raster would instead be the whole layer, base64, in a log kept forever.
//
// Every number here is an integer on purpose. The log is permanent, and a
// float that one client prints as 2.9999999999999996 and another typed in as 3
// is a disagreement nobody can see.

export const LAYER_FILTER_KINDS = ['gaussian_blur', 'motion_blur', 'hsl', 'curves', 'color_balance'] as const
export type LayerFilterKind = (typeof LAYER_FILTER_KINDS)[number]

/** Bounds every client clamps to before applying, so an out-of-range value
 *  from a peer (or a future UI) degrades to the nearest legal one instead of
 *  meaning something different on each side. */
export const LAYER_FILTER_LIMITS = {
  /** Gaussian radius, in layer pixels — roughly the standard deviation. */
  blurRadius: { min: 1, max: 100 },
  /** Length of the motion smear, in layer pixels, end to end. */
  motionDistance: { min: 1, max: 200 },
  /** Hue shift, in whole degrees either way. */
  hue: 180,
  /** Saturation, lightness and every colour-balance slider: -100..100. */
  percent: 100,
  /** Control points per curve, endpoints included. */
  curvePoints: 16,
} as const

/** One control point of a curve: input level → output level, both 0..255. */
export type CurvePoint = [number, number]

/** One tonal range of colour balance: each axis -100..100, the positive end
 *  being the second colour of its name (red, green, blue). */
export type ColorBalanceShift = {
  cyanRed: number
  magentaGreen: number
  yellowBlue: number
}

export type LayerFilter =
  | { kind: 'gaussian_blur'; radius: number }
  /** `angle` in whole degrees, 0 = horizontal, growing clockwise on screen
   *  (layer y points down). The smear is centred, so 0 and 180 are the same. */
  | { kind: 'motion_blur'; angle: number; distance: number }
  | { kind: 'hsl'; hue: number; saturation: number; lightness: number }
  /** `value` applies to all three channels after each channel's own curve. */
  | { kind: 'curves'; value: CurvePoint[]; red: CurvePoint[]; green: CurvePoint[]; blue: CurvePoint[] }
  | {
      kind: 'color_balance'
      shadows: ColorBalanceShift
      midtones: ColorBalanceShift
      highlights: ColorBalanceShift
      preserveLuminosity: boolean
    }

/** A pure single-layer pixel operation, so a layer snapshot can stand in for
 *  it (`COVERABLE_OP_TYPES`) and undo is a replay of the layer without it. */
export type LayerFilterOperation = OperationBase & {
  type: 'layer_filter'
  layerId: string
  filter: LayerFilter
}
