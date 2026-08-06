import { useMemo } from 'react'
import type { ToolType } from '@grafetto/shared'

import { useRoomStore } from '../../stores/roomStore'
import type { OverlayMode } from '../../stores/slices/overlaySlice'
import type { TransformHandleKind } from './TransformGizmo'
import type { RulerHandleKind } from './RulerOverlay'

// ── what the pointer looks like, decided in exactly one place (#393) ────────
//
// The bug that produced this module: BrushCursor hid its dab-footprint
// preview on the single condition "the current tool isn't a dab tool", and
// transform is not a tool — it is an overlay mode laid on top of whichever
// drawing tool is selected. The pencil stayed "current" for the whole
// transform session, so its preview ring kept drawing on top of the gizmo.
// The same hole was open for every other mode that suspends painting.
//
// Three independent places used to decide this: the DAB_TOOLS set inside
// BrushCursor, per-element `cursor` values in TransformGizmo's CSS/JSX, and
// the hand tool's own `cursor: grab` rule. A fourth mode broke it again every
// time. Everything below is that decision, and nothing else in the app is
// allowed to make it: `Room.module.css` no longer names a cursor for the
// viewport, its two pointer-catcher overlays, or either gizmo's handles.

/** Which tools paint dabs, i.e. have a footprint worth previewing under the
 *  pointer at all. A record rather than a Set on purpose: adding a member to
 *  `ToolType` in `@grafetto/shared` without deciding whether it gets a
 *  preview is then a typecheck error here rather than a silently missing (or
 *  silently wrong) cursor. Today every ToolType is a dab tool — the union is
 *  the drawing tools and nothing else — which is precisely why the tool axis
 *  alone could never answer "should the preview be visible". */
const PAINTS_DABS = {
  pencil: true,
  eraser: true,
  smudge: true,
  liner: true,
  marker: true,
  charcoal: true,
} as const satisfies Record<ToolType, boolean>

/** CSS `cursor` for the viewport surface. Inherited (the `cursor` property is
 *  inherited) by everything inside it that doesn't override it — the canvas,
 *  the eyedropper/ruler pointer catchers — so this one value covers the whole
 *  drawing surface, and only the gizmo handles below opt out of it. */
export type ViewportCursor =
  /** A tool is armed and a press on the canvas would paint (or pick, or place
   *  a ruler): the precise-aim cursor. */
  | 'crosshair'
  /** A press moves the view instead of the content. */
  | 'grab'
  /** Nothing of ours: the gizmo's own per-handle cursors are the whole story,
   *  and a crosshair over content that cannot be painted right now is a lie. */
  | 'default'

export interface CursorDecision {
  /** Whether BrushCursor's dab-footprint ring is on screen at all. */
  dabPreview: boolean
  viewportCursor: ViewportCursor
}

export interface CursorState {
  /** The selected drawing tool. Never says anything about the modes below —
   *  it stays exactly what it was while a mode is on. */
  tool: ToolType
  /** Hand tool or Space held (`isHandActive`). */
  handActive: boolean
  overlayMode: OverlayMode
  /** Only meaningful while `overlayMode === 'ruler'`. */
  rulerPlaced: boolean
  /** Accepted and deliberately ignored — see below. */
  gridActive: boolean
}

/** The single answer to "what is the cursor right now".
 *
 *  Precedence, highest first:
 *
 *  1. **Hand.** Space beats everything, including an open transform session:
 *     panning is a viewport gesture that never touches content, so it is
 *     always available and always looks the same.
 *  2. **Transform.** Nothing of ours: the gizmo hands out a system cursor per
 *     handle (resize arrows, the rotate glyph, move), and painting is locked
 *     for the duration anyway (`engine.setLocked`), so a crosshair would
 *     promise a stroke that cannot happen.
 *  3. **Eyedropper.** Aim precisely, but there is no dab to preview — the
 *     next press picks a colour instead of painting one.
 *  4. **Ruler, still being placed.** Same: the placement drag lays out a
 *     guide, it does not paint. Once placed the ruler is a persistent guide
 *     that strokes snap against, so drawing — and its preview — resume.
 *  5. **Nothing on.** The tool decides, and every current tool paints dabs.
 *
 *  `gridActive` is in `CursorState` and is intentionally never read: the grid
 *  is the one overlay that changes nothing about the pointer (it intercepts
 *  no events and blocks no painting). It is listed so that "does the grid
 *  affect the cursor?" is answered here, by a test, instead of being an open
 *  question every time someone adds a mode. */
export function resolveCursor(state: CursorState): CursorDecision {
  if (state.handActive) return { dabPreview: false, viewportCursor: 'grab' }

  switch (state.overlayMode) {
    case 'transform':
      return { dabPreview: false, viewportCursor: 'default' }
    case 'eyedropper':
      return { dabPreview: false, viewportCursor: 'crosshair' }
    case 'ruler':
      return state.rulerPlaced
        ? { dabPreview: PAINTS_DABS[state.tool], viewportCursor: 'crosshair' }
        : { dabPreview: false, viewportCursor: 'crosshair' }
    case 'none':
      return { dabPreview: PAINTS_DABS[state.tool], viewportCursor: 'crosshair' }
  }
}

/** `resolveCursor` fed from the store. Single-field selectors (never one
 *  object-returning selector — that would hand zustand a fresh snapshot on
 *  every render) plus a memo, so the returned decision keeps a stable
 *  identity while nothing relevant changes. */
export function useCursor(): CursorDecision {
  const tool = useRoomStore(s => s.tool)
  const handTool = useRoomStore(s => s.handTool)
  const handHeld = useRoomStore(s => s.handHeld)
  const overlayMode = useRoomStore(s => s.overlayMode)
  const rulerPlaced = useRoomStore(s => s.rulerPlaced)
  const gridActive = useRoomStore(s => s.gridActive)

  return useMemo(
    () => resolveCursor({ tool, handActive: handTool || handHeld, overlayMode, rulerPlaced, gridActive }),
    [tool, handTool, handHeld, overlayMode, rulerPlaced, gridActive],
  )
}

// ── gizmo handles ──────────────────────────────────────────────────────────
//
// Direct-manipulation handles are the one thing the mode-level decision above
// cannot express: which of them the pointer is over is a DOM fact, not app
// state. They still belong here rather than in each component's CSS, because
// "the transform gizmo is what supplies the cursor during a transform" is
// half of decision (2) above and the two halves must not be able to drift.
// Each component applies these inline; the CSS classes carry no `cursor`.

/** No native CSS keyword rotates, so the corner rotate zones use an inline
 *  SVG glyph. It stays in `Room.module.css` (as `--cursor-rotate` on
 *  `.transformSvg`) because a 700-character data URL is an asset, not a
 *  decision — this is the decision, referring to it. */
const ROTATE_CURSOR = 'var(--cursor-rotate)'

export const TRANSFORM_HANDLE_CURSOR: Record<TransformHandleKind, string> = {
  body: 'move',
  tl: 'nwse-resize',
  br: 'nwse-resize',
  tr: 'nesw-resize',
  bl: 'nesw-resize',
  t: 'ns-resize',
  b: 'ns-resize',
  l: 'ew-resize',
  r: 'ew-resize',
  'rotate-tl': ROTATE_CURSOR,
  'rotate-tr': ROTATE_CURSOR,
  'rotate-bl': ROTATE_CURSOR,
  'rotate-br': ROTATE_CURSOR,
}

/** The rotation pivot, which is not a `TransformHandleKind` (it has its own
 *  down handler rather than travelling through `onHandleDown`). */
export const TRANSFORM_PIVOT_CURSOR = 'move'

export const RULER_HANDLE_CURSOR: Record<RulerHandleKind, string> = {
  body: 'move',
  a: 'grab',
  b: 'grab',
}
