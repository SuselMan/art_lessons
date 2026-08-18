import { useMemo } from 'react'
import type { ToolType } from '@grafetto/shared'

import { useRoomStore } from '../../stores/roomStore'
import type { DrawingTool, EditorTool } from '../../stores/slices/toolSlice'
import { transformGestureKind, type TransformHandleKind, type TransformMode } from './transformMath'
import type { RulerGesture } from './rulerGesture'

// ── what the pointer looks like, decided in exactly one place (#393) ────────
//
// The bug that produced this module: BrushCursor hid its dab-footprint
// preview on the single condition "the current tool isn't a dab tool", and
// transform was not a tool — it was an overlay mode laid on top of whichever
// drawing tool was selected. The pencil stayed "current" for the whole
// transform session, so its preview ring kept drawing on top of the gizmo.
// The same hole was open for every other mode that suspended painting.
//
// Three independent places used to decide this: the DAB_TOOLS set inside
// BrushCursor, per-element `cursor` values in TransformGizmo's CSS/JSX, and
// the hand tool's own `cursor: grab` rule. A fourth mode broke it again every
// time. Everything below is that decision, and nothing else in the app is
// allowed to make it: `Room.module.css` no longer names a cursor for the
// viewport, its pointer-catcher overlay, or either gizmo's handles.
//
// (#405) The mode axis is gone — transform, the ruler, the eyedropper and the
// grid are members of the one selected tool now (EditorTool, toolSlice.ts).
// That does *not* make this module redundant, which was the tempting reading:
// held Space still overrides everything, `drawingTool` still has to answer
// "what footprint would be painted" while `tool` names something that paints
// nothing, and the ruler catcher still hands out a cursor per gesture. What it
// does is let the decision be one exhaustive switch over the selection instead
// of a mode union crossed with a tool — and (#443) the hand is now a case in
// that switch rather than the one tool that had to be answered above it.

/** Which tools paint dabs, i.e. have a footprint worth previewing under the
 *  pointer at all. A record rather than a Set on purpose: adding a member to
 *  `ToolType` in `@grafetto/shared` without deciding whether it gets a
 *  preview is then a typecheck error here rather than a silently missing (or
 *  silently wrong) cursor. Every ToolType is a dab tool — the union is the
 *  drawing tools and nothing else — which is precisely why the preview cannot
 *  be answered from `drawingTool` alone: it is `tool` that decides whether
 *  that drawing tool is the one in hand right now. */
const PAINTS_DABS = {
  pencil: true,
  eraser: true,
  smudge: true,
  liner: true,
  marker: true,
  charcoal: true,
  brushPen: true,
  watercolor: true,
} as const satisfies Record<ToolType, boolean>

/** CSS `cursor` for the viewport surface. Inherited (the `cursor` property is
 *  inherited) by everything inside it that doesn't override it — the canvas,
 *  the ruler/eyedropper pointer catcher — so this one value covers the whole
 *  drawing surface, and only the gizmo handles below opt out of it. */
export type ViewportCursor =
  /** A tool is armed and a press on the canvas would do something aimed at a
   *  specific point: paint, pick a colour, lay a ruler line. */
  | 'crosshair'
  /** A press moves the view instead of the content. */
  | 'grab'
  /** Nothing of ours: either the gizmo's own per-handle cursors are the whole
   *  story, or the selected tool has no canvas gesture at all — and a
   *  crosshair over content that cannot be touched right now is a lie. */
  | 'default'

export interface CursorDecision {
  /** Whether BrushCursor's dab-footprint ring is on screen at all. */
  dabPreview: boolean
  viewportCursor: ViewportCursor
}

export interface CursorState {
  /** The one selected tool. */
  tool: EditorTool
  /** The drawing tool the engine is configured with — `tool` itself while a
   *  drawing tool is selected, otherwise the last one that was (see
   *  toolSlice). Only ever consulted when `tool` is that same drawing tool;
   *  it is taken separately so this function never has to narrow the union
   *  itself. */
  drawingTool: DrawingTool
  /** Space physically down (viewportSlice). Separate from `tool` because it
   *  lies *over* the selection rather than replacing it — the hand selected
   *  and Space held produce the same cursor by different routes, and only one
   *  of the two ends when a key comes up. */
  handHeld: boolean
}

/** The single answer to "what is the cursor right now".
 *
 *  Precedence, highest first:
 *
 *  1. **Held Space.** It beats everything, including an open transform
 *     session: a hold is laid over whatever is selected without replacing it,
 *     and it ends nothing — release it and the previous tool's own cursor is
 *     back. (#443) The *selected* hand no longer needs its own rule above the
 *     switch; it is a case inside it, like every other tool.
 *  2. **The selected tool**, exhaustively:
 *     - *transform* — nothing of ours: the gizmo hands out a system cursor per
 *       handle (resize arrows, the rotate glyph, move), and painting is locked
 *       for the duration anyway (`engine.setLocked`), so a crosshair would
 *       promise a stroke that cannot happen.
 *     - *eyedropper* — aim precisely, but there is no dab to preview: the next
 *       press picks a colour instead of painting one.
 *     - *hand* — `grab`, and no footprint: the next press moves the view.
 *     - *ruler* — aim precisely: a press lays a new straight edge, or grabs
 *       the existing one. Which of the two is a per-point answer the catcher
 *       asks `RULER_GESTURE_CURSOR` below for; this is the surface it sits on.
 *     - *selection* (#446) — aim precisely, no footprint: a press draws the
 *       outline of a region, it does not lay ink.
 *     - *grid* — `default`. The grid has no canvas gesture yet (#406), so
 *       every cursor that suggests one would be describing something that
 *       cannot happen.
 *     - a drawing tool — the crosshair, and the footprint preview.
 *
 *  The grid is the one tool whose *visibility* changes nothing here: it is a
 *  setting (`toolSettings.grid.show`) rather than state this function sees,
 *  and a visible grid intercepts no pointer events under any tool. Selecting
 *  it does change the cursor, which is new in #405 and is the point: a
 *  selected tool that cannot paint must not show a crosshair. */
export function resolveCursor(state: CursorState): CursorDecision {
  if (state.handHeld) return { dabPreview: false, viewportCursor: 'grab' }

  switch (state.tool) {
    case 'hand':
      return { dabPreview: false, viewportCursor: 'grab' }
    case 'transform':
    case 'grid':
      return { dabPreview: false, viewportCursor: 'default' }
    case 'eyedropper':
    case 'ruler':
    // (#446) *selection* — aim precisely: a press starts (or extends) an
    // outline. No footprint, for the same reason the eyedropper has none —
    // the brush circle would promise a stroke that this press cannot make.
    case 'selection':
      return { dabPreview: false, viewportCursor: 'crosshair' }
    default:
      return { dabPreview: PAINTS_DABS[state.drawingTool], viewportCursor: 'crosshair' }
  }
}

/** `resolveCursor` fed from the store. Single-field selectors (never one
 *  object-returning selector — that would hand zustand a fresh snapshot on
 *  every render) plus a memo, so the returned decision keeps a stable
 *  identity while nothing relevant changes. */
export function useCursor(): CursorDecision {
  const tool = useRoomStore(s => s.tool)
  const drawingTool = useRoomStore(s => s.drawingTool)
  const handHeld = useRoomStore(s => s.handHeld)

  return useMemo(
    () => resolveCursor({ tool, drawingTool, handHeld }),
    [tool, drawingTool, handHeld],
  )
}

// ── direct manipulation: gizmo handles and the ruler ────────────────────────
//
// What the pointer is over is a DOM/geometry fact rather than app state, which
// is the one thing the tool-level decision above cannot express. It still
// belongs here rather than in each component's CSS, because "the transform
// gizmo is what supplies the cursor during a transform" is half of decision
// (2) above and the two halves must not be able to drift. Each call site
// applies these inline; the CSS classes carry no `cursor`.

/** No native CSS keyword rotates, so the corner rotate zones use an inline
 *  SVG glyph. It stays in `Room.module.css` (as `--cursor-rotate` on
 *  `.transformSvg`) because a 700-character data URL is an asset, not a
 *  decision — this is the decision, referring to it. */
const ROTATE_CURSOR = 'var(--cursor-rotate)'

/** What a handle's arrows point along when it scales — the only part of the
 *  answer that depends on *which* handle rather than on what the handle
 *  currently does. */
const SCALE_CURSOR: Record<Exclude<TransformHandleKind, 'body' | `rotate-${string}`>, string> = {
  tl: 'nwse-resize',
  br: 'nwse-resize',
  tr: 'nesw-resize',
  bl: 'nesw-resize',
  t: 'ns-resize',
  b: 'ns-resize',
  l: 'ew-resize',
  r: 'ew-resize',
}

/** (#391/#392) A handle's cursor, given the transform mode — a function now
 *  rather than the flat record this was, because a mode changes what dragging
 *  a handle *does* and the arrow has to describe the gesture, not the handle's
 *  position on the frame. An edge that shears slides along itself, so its
 *  arrows turn 90°; a Distort corner goes wherever it is dragged, so a
 *  two-headed diagonal would be describing a gesture that isn't happening.
 *
 *  Deliberately derived from `transformGestureKind` — the same function Room
 *  asks what a drag means — rather than re-deciding it here from `mode`. That
 *  is #393's own rule applied one level down: the cursor is a *statement about
 *  the gesture*, so it must not be able to disagree with the gesture. Adding a
 *  fourth mode changes one switch, and this follows.
 *
 *  The plain resize keywords are kept for shear on purpose: no standard CSS
 *  cursor means "skew", and a custom bitmap for it would be a worse affordance
 *  than an arrow that at least points the right way. */
export function transformHandleCursor(handle: TransformHandleKind, mode: TransformMode): string {
  const kind = transformGestureKind(handle, mode)
  if (kind === 'move' || kind === 'distort') return 'move'
  if (kind === 'rotate') return ROTATE_CURSOR
  // A sheared edge slides along its own length: the horizontal edges move
  // sideways, the vertical ones up and down — the opposite axis from the one
  // the same handle stretches along.
  if (kind === 'skewX') return 'ew-resize'
  if (kind === 'skewY') return 'ns-resize'
  return SCALE_CURSOR[handle as keyof typeof SCALE_CURSOR]
}

/** The rotation pivot, which is not a `TransformHandleKind` (it has its own
 *  down handler rather than travelling through `onHandleDown`). */
export const TRANSFORM_PIVOT_CURSOR = 'move'

/** (#405) What a press on the ruler catcher would do, said as a cursor. The
 *  ruler's line and endpoints are no longer separate event targets with
 *  cursors of their own — one full-viewport catcher decides per point what a
 *  press means (see `rulerGestureAt`), so the cursor has to be decided from
 *  that same answer or the two would disagree about which gesture is on
 *  offer. `new` keeps the viewport's own crosshair: laying a fresh straight
 *  edge is an aimed gesture like painting, not a grab. */
export const RULER_GESTURE_CURSOR: Record<RulerGesture, string> = {
  a: 'grab',
  b: 'grab',
  body: 'move',
  new: 'crosshair',
}
