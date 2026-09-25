import {
  TOOL_SCHEMAS, getToolColor, isShapeTool,
  type ColorCapableTool, type ShapeSwatch, type ToolSettingsMap,
} from './toolSchemas'

// (#542) The one rule for "what does the colour well show right now", read by
// every place that shows one: the well pinned in the tool rail, the well at the
// centre of the floating panel, and the pair inside the colour flyout.
//
// It lives here rather than inline in Room because it is exactly the thing the
// issue called размазанным — the answer used to be assembled separately at each
// surface, and the shape tool's second colour had already grown a fourth
// assembly of its own. Being a plain function over the settings map also makes
// it the only part of this feature a node-run test can reach: the components
// around it are rendering, and this repo has no DOM in its unit tests.

/** What one glyph is drawn from. `stroke` absent — not null — is what marks a
 *  tool that carries a single colour: the ring collapses to a plain border
 *  instead of showing a second colour, which is why the distinction matters. */
export interface ColorWellState {
  fill: [number, number, number] | null
  stroke?: [number, number, number] | null
  highlight: 'outer' | 'core' | null
  /** The two-colour half, for the flyout's own pair row and the service entries
   *  in the floating panel's fan. Null for every tool carrying one colour. */
  pair: {
    strokeColor: [number, number, number]
    strokeOn: boolean
    /** Null for a shape with no inside — the line. */
    fillColor: [number, number, number] | null
    fillOn: boolean
    active: ShapeSwatch
  } | null
}

/** Whether this tool has a fill at all. The line has no inside; asked of the
 *  schema's own `visibleWhen` rather than of the kind directly, so the fill
 *  disappears here by exactly the rule that hides the fill fields in the
 *  settings panel — one place to change if a future shape is fill-less too. */
function hasFill(settings: ToolSettingsMap): boolean {
  return TOOL_SCHEMAS.shape.fillColor.visibleWhen?.(settings.shape) !== false
}

/** Which of a shape's two colours everything — the palette, the picker, the
 *  eyedropper, the engine — is actually pointed at.
 *
 *  Not simply the stored swatch: a line has no fill, so with `fill` selected
 *  and a line in hand the stored value names a colour that reaches nothing.
 *  Reading it through here is what stops a picked colour from silently landing
 *  in a field the drawing never shows. Every tool but the shapes answers
 *  `stroke`, which their own single `color` field ignores anyway. */
export function effectiveSwatch(
  settings: ToolSettingsMap, toolId: ColorCapableTool, swatch: ShapeSwatch,
): ShapeSwatch {
  if (!isShapeTool(toolId)) return 'stroke'
  return hasFill(settings) ? swatch : 'stroke'
}

export function colorWellState(
  settings: ToolSettingsMap, toolId: ColorCapableTool, swatch: ShapeSwatch,
): ColorWellState {
  if (!isShapeTool(toolId)) {
    return { fill: getToolColor(settings, toolId), highlight: null, pair: null }
  }

  const fillable = hasFill(settings)
  const active = effectiveSwatch(settings, toolId, swatch)
  const strokeOn = settings.shape.strokeOn !== false
  const fillOn = settings.shape.fillOn === true
  const strokeColor = getToolColor(settings, toolId, 'stroke')
  const fillColor = getToolColor(settings, toolId, 'fill')
  // A shape whose fill is off, and a shape that has no fill at all, both draw a
  // struck-through core: the difference between them is not something the
  // drawing can show, and it is already carried by whether the flyout offers a
  // fill well to switch back on.
  return {
    stroke: strokeOn ? strokeColor : null,
    fill: fillable && fillOn ? fillColor : null,
    highlight: active === 'fill' ? 'core' : 'outer',
    pair: {
      strokeColor,
      strokeOn,
      fillColor: fillable ? fillColor : null,
      fillOn,
      active,
    },
  }
}
