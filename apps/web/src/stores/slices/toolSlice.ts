import type { StateCreator } from 'zustand'

import type { ShapeFrame } from '@grafetto/shared'

import { defaultToolSettings, type ToolSettingsMap, type UiToolId, type SettingDescriptor, type ShapeSwatch } from '../../pages/Room/toolSchemas'

// ── one selected tool (#405) ────────────────────────────────────────────────
//
// The editor has exactly one tool in hand. Until #405 that was only true of
// the six drawing tools below, while the eyedropper, the ruler and the
// transform gizmo were `OverlayMode` — modes laid *on top of* whichever
// drawing tool was selected (#393, overlaySlice.ts, now deleted). Two things
// were "selected" at once, which is what let a transform session sit under a
// pencil that still called itself current, and why the ruler could be armed
// and painting at the same time.
//
// The two lists are `satisfies readonly UiToolId[]` rather than free-standing
// string unions so that a tool can only be named here if TOOL_SCHEMAS knows
// it — the schema is what the settings panel, persistence and the quick
// column all read from, and a selectable tool absent from it would render an
// empty panel rather than fail to compile.

/** The tools that put marks on a layer — the ones whose stroke becomes a
 *  `StrokeOperation`, i.e. exactly `ToolType` from `@grafetto/shared`. */
export const DRAWING_TOOLS = [
  'pencil', 'eraser', 'smudge', 'liner', 'marker', 'charcoal', 'brushPen', 'watercolor',
] as const satisfies readonly UiToolId[]

export type DrawingTool = (typeof DRAWING_TOOLS)[number]

/** The rest of the selection: tools that never paint. None of them may become
 *  a `ToolType` — that type travels inside `StrokeOperation` into the
 *  operation log, and a tool that emits no stroke (eyedropper, ruler, grid,
 *  hand) or emits an operation of its own kind (transform → `layer_transform`)
 *  has no business in a serialized contract.
 *
 *  (#443) The hand joined this list. ADR 007 §5 put it in `viewportSlice`
 *  instead, on the grounds that it is not a `ToolType` — but `EditorTool` and
 *  `ToolType` came apart in #405, and every other member here is already a
 *  selectable tool that never becomes one. Keeping the hand outside the
 *  selection bought nothing at the contract level (it is still absent from
 *  `ToolType`) and cost the one thing the toolbar is for: with a modifier
 *  lit next to a selected tool, two buttons were on at once and no rule
 *  explained which. */
// (#453) The fill belongs here rather than with the drawing tools, and the
// line it falls on is the one this list is defined by: it emits an operation
// of its own kind (`area_fill`, a raster) instead of a `StrokeOperation`, so
// it is not a `ToolType` and never reaches that serialized contract. That it
// lays down colour like a brush does is beside the point — so does paste.
export const NON_DRAWING_TOOLS = [
  'eyedropper', 'ruler', 'transform', 'selection', 'grid', 'hand', 'fill',
  // (#509/#510) The annotation tools sit here by the same test the fill does:
  // each emits an operation of its own kind (`annotation_add`) rather than a
  // StrokeOperation, so neither is a `ToolType` and neither reaches that
  // serialized contract. That they lay down a visible line is beside the
  // point — the line is not on a layer.
  'annotateText', 'annotatePen', 'annotateEraser',
  // (#525) The shape tool falls on this side of the line for the same reason
  // the fill does: it emits an operation of its own kind (`shape`) rather than
  // a StrokeOperation, so it is not a `ToolType` and never reaches that
  // serialized contract. Which shape it draws is a setting, not a second tool.
  'shape',
] as const satisfies readonly UiToolId[]

export type NonDrawingTool = (typeof NON_DRAWING_TOOLS)[number]

/** What "the selected tool" means — exactly one member of it is in hand, and
 *  selecting any of them ends an open transform session, the hand included
 *  (#443). Panning mid-transform is still available, through the two routes
 *  that never went through the selection in the first place: the middle button
 *  and held Space on a PC, one or two fingers on a tablet (the gizmo ignores
 *  touch outright). What #405 protected with an exception was therefore only
 *  the pen-on-a-PC case, and the exception was visible on every screen. */
export type EditorTool = DrawingTool | NonDrawingTool

export function isDrawingTool(tool: EditorTool): tool is DrawingTool {
  return (DRAWING_TOOLS as readonly EditorTool[]).includes(tool)
}

// The subset of DrawingTool that actually lays ink and has its own color
// (unlike eraser/smudge, which modify what's already there) — what a
// "return to drawing" affordance (the toolbar's eraser/smudge toggle-off,
// FloatingToolPanel's top button) should switch back to. Excludes smudge
// deliberately: smudging isn't "drawing" either, it just isn't the thing
// most in need of a quick way back out (no dedicated toggle exists for it
// today beyond its own toolbar button). Marker (#252) joined pencil/liner
// here for the same reason liner did (#245 follow-up): it's a real drawing
// tool with its own color field, so the Color side-panel tab/colorTool logic
// in Room/index.tsx needs to be able to name it too.
//
// Charcoal (#304) joined for the same reason marker and liner did — it lays
// material and owns a color field, so it must be nameable here too.
//
// NOT the list of tools that own a color — that's ColorCapableTool in
// toolSchemas.ts, a separate capability that answers a different question (see
// its own comment); the two lists have already come apart, since colorPencil
// is color-capable there without being a selectable drawing tool here. Any
// consumer that means "whose color am I editing?" should say ColorCapableTool;
// this type only means "what do I switch back to when the eraser is toggled
// off?".
export type PrimaryDrawingTool = 'pencil' | 'charcoal' | 'liner' | 'marker' | 'brushPen' | 'watercolor'

export const PRIMARY_DRAWING_TOOLS: readonly PrimaryDrawingTool[] = ['pencil', 'charcoal', 'liner', 'marker', 'brushPen', 'watercolor']

function isPrimaryDrawingTool(tool: EditorTool): tool is PrimaryDrawingTool {
  return (PRIMARY_DRAWING_TOOLS as readonly EditorTool[]).includes(tool)
}

/** The tools that work on marks already on the layer instead of laying new
 *  ones: rubbing them out, smearing them, sampling their colour. What unites
 *  them is not what they do — one erases, one moves pigment, one only reads —
 *  but what they need: on an empty layer all three have nothing to act on.
 *
 *  They share FloatingToolPanel's second slot exactly the way
 *  PrimaryDrawingTool shares its first, which is the only reason the set is
 *  named at all. Note that it crosses the DrawingTool/NonDrawingTool line
 *  (the eyedropper paints nothing and never becomes a `ToolType`) — that
 *  split answers "does this emit a stroke into the operation log", a
 *  different question from "what is this tool for", and there is no reason
 *  the two should partition the same way. */
export type SecondaryTool = 'eraser' | 'smudge' | 'eyedropper'

export const SECONDARY_TOOLS: readonly SecondaryTool[] = ['eraser', 'smudge', 'eyedropper']

function isSecondaryTool(tool: EditorTool): tool is SecondaryTool {
  return (SECONDARY_TOOLS as readonly EditorTool[]).includes(tool)
}

export interface ToolSlice {
  /** (#529) Which of a shape's two colours every colour control is pointed at.
   *
   *  Here rather than in the tool's own settings because it is not a property
   *  of the tool: it is what the user last tapped, and it is shared by all four
   *  shape tools — switching from a rectangle to a star while editing the fill
   *  should keep editing the fill. Not persisted for the same reason. */
  shapeSwatch: ShapeSwatch
  setShapeSwatch: (swatch: ShapeSwatch) => void
  /** (#530) The shape being placed right now — the frame of an unconfirmed
   *  shape, or null when none is open.
   *
   *  In the store rather than in the hook that drives it because three
   *  unrelated things read it: the gizmo that draws its handles, the numeric
   *  fields that size it, and the engine preview. Nothing else about the shape
   *  lives here — the geometry and the paint are read from the tool's settings
   *  at the moment they are needed, so changing a setting while a shape is open
   *  changes the shape, which is what "editable until confirmed" means. */
  shapeFrame: ShapeFrame | null
  setShapeFrame: (frame: ShapeFrame | null) => void
  /** The one tool in hand. Everything else about "which tool is on" is
   *  derived from this — there is no second axis to disagree with it. */
  tool: EditorTool
  setTool: (updater: EditorTool | ((prev: EditorTool) => EditorTool)) => void
  /** The most recent `tool` that was a DrawingTool, kept in sync by setTool
   *  below. Two jobs, both of which need a *drawing* tool while `tool` may be
   *  naming the ruler or the gizmo:
   *
   *   - it is what the engine, the brush cursor and the sound are configured
   *     from, so selecting the ruler doesn't leave the engine holding a tool
   *     that cannot exist for it;
   *   - it is where the eyedropper goes back to once it has taken a colour
   *     (#405) — including to the eraser, if that is genuinely what was in
   *     hand a moment ago.
   *
   *  Distinct from `lastDrawingTool` below, which excludes eraser/smudge on
   *  purpose: "what was I painting with" and "what do I return to when the
   *  eraser is switched off" are different questions with different answers. */
  drawingTool: DrawingTool
  // Most recent PrimaryDrawingTool `tool` held, kept in sync automatically
  // by setTool below — not its own separate setter. Lets a "return to
  // drawing" affordance (eraser/smudge toggle-off, FloatingToolPanel's top
  // button) go back to whichever of pencil/liner was actually active
  // before, instead of assuming pencil (a real gap once liner became a
  // second real drawing tool - #245 follow-up).
  lastDrawingTool: PrimaryDrawingTool
  /** Every PrimaryDrawingTool, most recently selected first — `lastDrawingTool`
   *  above is just its head, computed from it in the same reducer so the two
   *  cannot drift.
   *
   *  The tail is what the head cannot answer. FloatingToolPanel's `drawing`
   *  role slot means "the drawing tool you have no button for", and once any
   *  slot can be pinned to a specific tool, "the last one" is the wrong
   *  answer: pin the marker, pick it, and the role slot dutifully becomes a
   *  second marker — one of eight slots spent saying what the slot beside it
   *  already says. So the role walks this list past everything the layout
   *  already holds. Answering that needs an order, not a value. */
  recentDrawingTools: readonly PrimaryDrawingTool[]
  // Most recent SecondaryTool `tool` held, the mirror image of the field
  // above and kept in sync the same way. FloatingToolPanel's second slot
  // shows and returns to it, so that slot remembers "I was erasing" or "I was
  // smudging" rather than always meaning the eraser.
  //
  // Maintained here rather than in the panel because the panel is not the only
  // thing that selects these tools: the left toolbar and the hotkeys do too,
  // and a slot that only remembered the choices made through itself would go
  // stale the moment the same choice was made a foot to the left.
  lastSecondaryTool: SecondaryTool
  /** The same list for the secondary tools, and the same reason — see
   *  `recentDrawingTools` above. This is the one the gap was actually reported
   *  on: with the smudge pinned to its own slot, selecting it moved the
   *  secondary role onto the smudge too, and the panel forgot that the eraser
   *  was ever there. */
  recentSecondaryTools: readonly SecondaryTool[]
  // TOOL_SCHEMAS-shaped settings for every registered tool (#170/#196) —
  // seeded with schema defaults here; Room re-seeds this from
  // loadToolSettings(localStorage, roomId) once at mount via
  // setAllToolSettings (the store itself has no concept of "room id" to
  // load from automatically).
  toolSettings: ToolSettingsMap
  setToolSetting: (
    toolId: UiToolId,
    key: string,
    value: SettingDescriptor['default'] | ((prev: SettingDescriptor['default']) => SettingDescriptor['default']),
  ) => void
  setAllToolSettings: (settings: ToolSettingsMap) => void
}

/** `item` first, everything else in the order it was already in.
 *
 *  Returns the list unchanged — the same reference, not an equal copy — when
 *  `item` is already at the front, which is the common case (selecting the
 *  tool you already have). A fresh array every time would re-render every
 *  subscriber on every no-op selection. */
function moveToFront<T>(list: readonly T[], item: T): readonly T[] {
  if (list[0] === item) return list
  return [item, ...list.filter(existing => existing !== item)]
}

export const createToolSlice: StateCreator<ToolSlice> = set => ({
  shapeSwatch: 'stroke',
  setShapeSwatch: swatch => set({ shapeSwatch: swatch }),
  shapeFrame: null,
  setShapeFrame: frame => set({ shapeFrame: frame }),
  tool: 'pencil',
  drawingTool: 'pencil',
  lastDrawingTool: 'pencil',
  // Seeded with the full lists so a role always has somewhere to go, even
  // before anything has been selected — a panel whose first render has an
  // empty role slot would be reporting "no tool" for the pencil it is
  // holding. The heads match `tool` and the two `last*` fields above.
  recentDrawingTools: PRIMARY_DRAWING_TOOLS,
  lastSecondaryTool: 'eraser',
  recentSecondaryTools: SECONDARY_TOOLS,
  setTool: updater => set(state => {
    const next = typeof updater === 'function' ? updater(state.tool) : updater
    // The `last*` fields are read off these rather than assigned in parallel:
    // one computation, so "the last one" and "the front of the list" cannot
    // come to disagree.
    const recentDrawingTools = isPrimaryDrawingTool(next)
      ? moveToFront(state.recentDrawingTools, next) : state.recentDrawingTools
    const recentSecondaryTools = isSecondaryTool(next)
      ? moveToFront(state.recentSecondaryTools, next) : state.recentSecondaryTools
    return {
      tool: next,
      drawingTool: isDrawingTool(next) ? next : state.drawingTool,
      recentDrawingTools,
      lastDrawingTool: recentDrawingTools[0],
      recentSecondaryTools,
      lastSecondaryTool: recentSecondaryTools[0],
    }
  }),
  toolSettings: defaultToolSettings(),
  setToolSetting: (toolId, key, value) => set(state => ({
    toolSettings: {
      ...state.toolSettings,
      [toolId]: {
        ...state.toolSettings[toolId],
        [key]: typeof value === 'function'
          ? (value as (prev: SettingDescriptor['default']) => SettingDescriptor['default'])(state.toolSettings[toolId][key])
          : value,
      },
    },
  })),
  setAllToolSettings: settings => set({ toolSettings: settings }),
})
