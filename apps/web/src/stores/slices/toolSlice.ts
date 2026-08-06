import type { StateCreator } from 'zustand'

import { defaultToolSettings, type ToolSettingsMap, type UiToolId, type SettingDescriptor } from '../../pages/Room/toolSchemas'

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
  'pencil', 'eraser', 'smudge', 'liner', 'marker', 'charcoal',
] as const satisfies readonly UiToolId[]

export type DrawingTool = (typeof DRAWING_TOOLS)[number]

/** The rest of the selection: tools that never paint. None of them may become
 *  a `ToolType` — that type travels inside `StrokeOperation` into the
 *  operation log, and a tool that emits no stroke (eyedropper, ruler, grid) or
 *  emits an operation of its own kind (transform → `layer_transform`) has no
 *  business in a serialized contract. Same reasoning that keeps the hand out
 *  of both lists; see below. */
export const NON_DRAWING_TOOLS = [
  'eyedropper', 'ruler', 'transform', 'grid',
] as const satisfies readonly UiToolId[]

export type NonDrawingTool = (typeof NON_DRAWING_TOOLS)[number]

/** What "the selected tool" means. Deliberately *not* including the hand: it
 *  is a viewport mode, not a member of this exclusive set, and lives in
 *  viewportSlice with the viewport it moves (see its own comment there).
 *  Selecting a tool ends a transform session; picking up the hand must not,
 *  because panning does not touch content — being able to see where you are
 *  dragging a layer to is the whole reason to reach for it mid-transform. */
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
export type PrimaryDrawingTool = 'pencil' | 'charcoal' | 'liner' | 'marker'

const PRIMARY_DRAWING_TOOLS: readonly PrimaryDrawingTool[] = ['pencil', 'charcoal', 'liner', 'marker']

function isPrimaryDrawingTool(tool: EditorTool): tool is PrimaryDrawingTool {
  return (PRIMARY_DRAWING_TOOLS as readonly EditorTool[]).includes(tool)
}

export interface ToolSlice {
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

export const createToolSlice: StateCreator<ToolSlice> = set => ({
  tool: 'pencil',
  drawingTool: 'pencil',
  lastDrawingTool: 'pencil',
  setTool: updater => set(state => {
    const next = typeof updater === 'function' ? updater(state.tool) : updater
    return {
      tool: next,
      drawingTool: isDrawingTool(next) ? next : state.drawingTool,
      lastDrawingTool: isPrimaryDrawingTool(next) ? next : state.lastDrawingTool,
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
