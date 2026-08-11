import type { Viewport } from './useViewport'
import { clientToCanvas, type CanvasSize } from './pointerTransform'

// #143: world<->screen conversion for infinite-canvas rooms' overlay
// components (PeerCursors/GridOverlay/RulerOverlay/TransformGizmo), which
// for bounded rooms lean entirely on canvasWrap's
// own CSS transform (see useViewport's `canvasTransform`) to pan/zoom/
// rotate along with the canvas — a transform infinite rooms don't have
// (the canvas element never moves; the engine redraws its contents under a
// camera instead, see engine.setInfiniteCamera). These are the two
// directions of that camera mapping, expressed purely in terms of Room's
// own `vp` state — the same {cx, cy, zoom, angle} the bounded/CSS-pan path
// already uses (see useViewport's docstring for why (cx, cy) means "screen
// position of whatever's under it" in both modes) — and screen coordinates
// relative to the *viewport container's own top-left* (i.e.
// `clientX - rect.left`, not window-absolute, and never the actual canvas
// backing-buffer size the way bounded's `clientToCanvas` uses one).
//
// Derivation/verification: Room's viewport->engine sync effect already
// hand-solved "the world point at screen CENTER" from vp to feed
// setInfiniteCamera — screenToWorld below is that same formula generalized
// to an arbitrary screen point, not just the center (confirmed to agree
// with the old hand-solved version at screen point (hw, hh); that call
// site now just calls this instead of re-deriving it inline). worldToScreen
// is its algebraic inverse, and was independently cross-checked against the
// engine's own world->screen convention (see PencilEngine's
// _finishInfiniteComposite/_worldToScreenEdgeX/Y doc comments): forward
// mapping is screen = (vp.cx, vp.cy) + R(vp.angle) * vp.zoom * world, which
// is exactly what worldToScreen computes.

// Ceiling on the DPR this file will size the infinite canvas's backing
// store to — see deviceNativeZoom's own comment for why an *uncapped* DPR
// is a real perf problem, not just a quality knob. Found empirically
// on-device (Ilya's own tablet, DPR ~2.75): 1.5 and 1.25 both still felt
// laggy drawing on an infinite canvas; 1 (no DPR upscale at all — the
// pre-#154 backing-store size) was the first value that felt normal again.
// Effectively reverts #154's sharpness fix on any DPR>1 device — a
// deliberate trade Ilya chose after confirming smaller caps didn't recover
// enough headroom; a real fix that keeps both #154's sharpness *and*
// tablet performance would need to cut the per-pointermove/composite cost
// itself (e.g. dirty-rect tip/preview updates) rather than the resolution.
const MAX_BACKING_STORE_DPR = 1

/** The CSS zoom at which one world unit covers exactly one physical device
 *  pixel — 1 on a classic 96-dpi display, 1/2 on a 2x-scaled tablet, etc.,
 *  clamped to `MAX_BACKING_STORE_DPR` (see its own comment).
 *
 *  Infinite-canvas world units are document pixels (a stroke's world-space
 *  width is device-independent and shared by every peer), and tiles store
 *  content at one texel per world unit — so this zoom, not CSS 1.0, is
 *  where the drawing appears at its native 1:1 resolution. It's what an
 *  infinite room's zoom UI presents as "100%" (see Room's zoom label), what
 *  fit/reset resets to (see useViewport), and the factor between `vp.zoom`
 *  (CSS px per world unit, what all overlay/CSS math wants) and the zoom
 *  the engine renders at (physical canvas px per world unit — Room's
 *  viewport→engine sync divides by this, matching the DPR-sized canvas
 *  backing store its ResizeObserver sets up). Without this distinction,
 *  "100%" on a 2.8x-DPR tablet showed every tile texel blown up across
 *  ~2.8 physical pixels — the whole drawing (most visibly the paper grain
 *  baked into strokes) read ~2.8x coarser than its native resolution.
 *
 *  #154 sized the backing store to the *uncapped* DPR, which fixed that
 *  blur but scales the canvas's pixel count — and therefore the per-
 *  pointermove tip/preview-buffer clear+paint and every _display() full-
 *  canvas composite pass's GPU cost — with DPR². Invisible on a desktop
 *  GPU's huge fill-rate margin; on a real tablet (found on-device: DPR
 *  2.75, an otherwise-modest 1400x900 viewport ballooning to a 9.5-
 *  megapixel backing store, bigger than even an A2 bounded room's fixed
 *  2480x3508) it made drawing on an infinite canvas feel unusably laggy.
 *  Capping here (see MAX_BACKING_STORE_DPR) trades away that sharpness gain
 *  on any DPR>1 device for keeping per-frame cost bounded — confirmed on
 *  the same tablet that only a full revert to DPR-independent sizing
 *  actually fixed the lag (see the constant's own comment).
 *
 *  Read live (not cached) — devicePixelRatio changes with browser zoom and
 *  monitor moves. */
export function deviceNativeZoom(): number {
  return 1 / Math.min(window.devicePixelRatio || 1, MAX_BACKING_STORE_DPR)
}

/** Upper zoom limit, shared by every gesture and control that can change
 *  zoom (wheel, pinch, the header's drag-to-adjust readout). Same for both
 *  room modes — magnifying costs nothing extra, it's zooming *out* that
 *  multiplies work (see minZoom). */
export const ZOOM_MAX = 20

/** (#440) Multiplier per press of the keyboard zoom keys. The wheel and the
 *  pinch are continuous and read their step off the gesture itself; a keypress
 *  has no magnitude, so it needs one chosen. 1.25 is what browsers themselves
 *  step their own zoom ladder by (100 → 125 → 150), which is what these keys
 *  used to do before we took them over — the same press should not suddenly
 *  move a noticeably different amount. */
export const ZOOM_KEY_STEP = 1.25

// (#363) How far an infinite room may zoom out, as a fraction of its own
// "100%" (deviceNativeZoom, see above) — i.e. what the header readout shows,
// not a raw `vp.zoom`. Deliberately 10x tighter than a bounded room's limit,
// because the two modes pay completely different costs for the same number:
// a bounded room composites one fixed page no matter how small it's drawn,
// while an infinite room composites one draw call per visible 1024x1024 tile,
// so its per-frame cost grows with 1/zoom². At the old 0.04 a 1920x1080
// viewport spans ~3100 tiles; at 0.1 it spans ~576. Neither is cheap — this
// is a ceiling on the damage, not a fix (that's the LOD work #363 defers) —
// but it's the difference between "slow" and "allocates gigabytes".
const INFINITE_MIN_ZOOM_FRACTION = 0.1

// A bounded room's own floor, unchanged since before #363: its cost doesn't
// scale with zoom-out, so the only thing this guards is the viewport turning
// into an unusable speck.
const BOUNDED_MIN_ZOOM = 0.04

/** Lower zoom limit for `vp.zoom` in this room's mode — the counterpart to
 *  ZOOM_MAX, and the one every zoom control must clamp to so they can't
 *  disagree about how far out is too far.
 *
 *  Returned in `vp.zoom`'s own units (CSS px per world unit), which is why
 *  the infinite branch scales by deviceNativeZoom() rather than returning a
 *  bare fraction: an infinite room's "100%" is deviceNativeZoom(), not 1
 *  (see its doc comment), so a fixed `vp.zoom` floor would mean a different
 *  on-screen percentage — and a different tile count, which is the thing
 *  actually being limited — on a device whose DPR is below 1. */
export function minZoom(infinite: boolean): number {
  return infinite ? INFINITE_MIN_ZOOM_FRACTION * deviceNativeZoom() : BOUNDED_MIN_ZOOM
}

export function worldToScreen(worldX: number, worldY: number, vp: Viewport): { x: number; y: number } {
  const cos = Math.cos(vp.angle)
  const sin = Math.sin(vp.angle)
  return {
    x: vp.cx + (worldX * cos - worldY * sin) * vp.zoom,
    y: vp.cy + (worldX * sin + worldY * cos) * vp.zoom,
  }
}

export function screenToWorld(screenX: number, screenY: number, vp: Viewport): { x: number; y: number } {
  const dx = screenX - vp.cx
  const dy = screenY - vp.cy
  const cos = Math.cos(vp.angle)
  const sin = Math.sin(vp.angle)
  return {
    x: (dx * cos + dy * sin) / vp.zoom,
    y: (-dx * sin + dy * cos) / vp.zoom,
  }
}

/** CSS transform string for a wrapper that carries *only* the overlay layer
 *  in an infinite room — never the `<canvas>` itself, which the engine
 *  already draws camera-relative content directly into (setInfiniteCamera);
 *  wrapping that too would visually double-move it. The infinite-mode
 *  counterpart of useViewport's own `transformFor`/`canvasTransform` for
 *  bounded rooms, minus the trailing `translate(-width/2,-height/2)`: world
 *  (0,0) already plays the role bounded's canvas-center does, so there's no
 *  separate size-based recentering to fold in here. Whatever element this
 *  is applied to must set `transform-origin: 0 0` (see `.worldOverlayWrap`
 *  in Room.module.css), matching `.canvasWrap`'s own transform-origin for
 *  the same reason. */
export function cameraTransformCss(vp: Viewport): string {
  return `translate(${vp.cx}px,${vp.cy}px) rotate(${vp.angle}rad) scale(${vp.zoom})`
}

/** The world-space rect currently visible in the viewport — used by the
 *  infinite-room grid variant (see GridOverlay.tsx) to know how far to draw
 *  lines. Deliberately mirrors PencilEngine's own `_visibleWorldRect` (a
 *  generous axis-aligned bounding box of the rotated viewport rect, padded
 *  to the half-diagonal rather than tightened to the exact rotated quad) —
 *  the grid only needs to *at least* cover what's actually visible, and
 *  matching the engine's own padding keeps this from needing its own,
 *  possibly-inconsistent, notion of "visible". */
export function visibleWorldRect(
  vp: Viewport, viewportWidth: number, viewportHeight: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const { x: wx, y: wy } = screenToWorld(viewportWidth / 2, viewportHeight / 2, vp)
  const halfW = viewportWidth / 2 / vp.zoom
  const halfH = viewportHeight / 2 / vp.zoom
  const halfDiag = Math.hypot(halfW, halfH)
  return { minX: wx - halfDiag, minY: wy - halfDiag, maxX: wx + halfDiag, maxY: wy + halfDiag }
}

/** Single branch point for "where did this client-space pointer event land,
 *  in whatever space this room's overlays/tools are defined in" — bounded
 *  rooms answer in canvas-pixel space (`clientToCanvas`, unchanged),
 *  infinite rooms answer in genuine world space (`screenToWorld` above).
 *  Room's ruler/transform drag handlers and the #37 cursor
 *  broadcast used to call `clientToCanvas` unconditionally, even for
 *  infinite rooms — since `config.width/height` there is only the
 *  PLACEHOLDER_INFINITE_CANVAS_SIZE placeholder (see Room/index.tsx), not
 *  the real camera position, that produced numbers that don't correspond
 *  to any real position. Harmless while those overlays/the ruler's engine
 *  guide were unconditionally not shown/used for infinite rooms, but wrong
 *  the moment they are (#143) — `getContentBounds`'s bounds (real world
 *  space) and this point (the old placeholder space) would otherwise be
 *  mixed in the same drag computation. */
export function clientToRoomPoint(
  clientX: number, clientY: number, rect: DOMRect, vp: Viewport,
  config: { infinite: boolean } & CanvasSize,
): { x: number; y: number } {
  if (config.infinite) return screenToWorld(clientX - rect.left, clientY - rect.top, vp)
  return clientToCanvas(
    clientX, clientY,
    { cx: rect.left + vp.cx, cy: rect.top + vp.cy, zoom: vp.zoom, angle: vp.angle },
    config,
  )
}

/** Turning the view around a fixed screen point (#319, ADR 007 §4).
 *
 *  Changing `angle` alone pivots around `(cx, cy)` — the canvas centre's own
 *  screen position in bounded rooms, the camera origin in infinite ones —
 *  which at working zoom is usually somewhere off-screen, so the drawing
 *  swings out of view instead of turning under the cursor. Carrying `(cx, cy)`
 *  the same way around `anchor` cancels that exactly: whatever the anchor was
 *  over stays there, and everything else turns around it — the single-pointer
 *  equivalent of what a two-finger twist does about the midpoint between the
 *  fingers.
 *
 *  `anchor` is in viewport-container coordinates (`clientX - rect.left`), the
 *  same space `cx`/`cy` live in. */
export function rotateViewportAround(
  vp: Viewport, anchorX: number, anchorY: number, dAngle: number,
): Viewport {
  const cos = Math.cos(dAngle)
  const sin = Math.sin(dAngle)
  const rx = vp.cx - anchorX
  const ry = vp.cy - anchorY
  return {
    ...vp,
    angle: vp.angle + dAngle,
    cx: anchorX + rx * cos - ry * sin,
    cy: anchorY + rx * sin + ry * cos,
  }
}
