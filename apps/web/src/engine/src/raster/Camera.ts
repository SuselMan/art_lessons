// (#494) The camera: where the screen is looking in the world, and every piece
// of math that follows from it — the render buffers' padded extent, the
// composite's frame, the final rotate/zoom pass, screen <-> world, the pointer
// transforms and the preview buffers' origin (seam С10 of the survey; the
// frame value itself is cameraFrame.ts, which came first).
//
// The engine used to keep the pose in a bare field and derive all of this in a
// dozen private methods scattered across its file. Here it is one object the
// engine builds once and asks. It holds no GL and no DOM: the one layout read
// (the canvas's on-screen rect) is a function the engine hands in, so this file
// runs under the engine tests' DOM-less environment like the rest of src/.
//
// Every formula is carried over verbatim, in the same operation order — the
// composite's pixel alignment (#134) and pointer mapping depend on the exact
// floating-point results, not just on the algebra.
import type { Dab } from '@grafetto/shared'

import type { WorldRect } from '../buffers/tileMath'
import type { CameraFrame } from './cameraFrame'
import { composeMatrix, scaleRotateMatrix, translationMatrix, type Matrix3 } from './matrix'

/** The world point at screen centre, the zoom and the rotation. Replaced
 *  whole on every set, never mutated — a reader may keep the reference. */
export interface CameraPose {
  readonly wx: number
  readonly wy: number
  readonly zoom: number
  readonly angle: number
}

/** The part of a DOMRect the pointer transform reads. */
export interface CanvasRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** What PointerInput.setTransform takes: client coordinates to world units. */
export type PointerTransform = (clientX: number, clientY: number) => { x: number; y: number }

export interface CameraOptions {
  /** The canvas element's backing size. Read live: resizeCanvas changes it
   *  under a camera that has not moved. */
  readonly canvas: { readonly width: number; readonly height: number }
  readonly infinite: boolean
  /** (#470) The sheet's world size for a bounded room — see
   *  PencilEngineOptions.pageWidth. Only decides the first frame's pose. */
  readonly pageWidth?: number
  readonly pageHeight?: number
  /** `canvas.getBoundingClientRect()` — the engine's own DOM call, cached
   *  here (see canvasRect). */
  measureRect(): CanvasRect
}

export class Camera {
  private readonly _canvas: { readonly width: number; readonly height: number }
  private readonly _measureRect: () => CanvasRect
  private _pose: CameraPose
  // (#155 follow-up) Cached canvas.getBoundingClientRect() for the infinite
  // pointer transform's closure — see canvasRect's own doc comment for why
  // this is safe to cache and what invalidates it.
  private _rectCache: CanvasRect | null = null

  constructor(opts: CameraOptions) {
    const { canvas } = opts
    this._canvas = canvas
    this._measureRect = opts.measureRect
    // Bounded rooms never call setInfiniteCamera (only Room's infinite-mode
    // viewport-sync effect does) — #136: the below/above split-cache and
    // main composite now always go through the camera-relative tile-draw
    // path (_drawTileComposite), so a bounded room needs a fixed "identity"
    // camera here so world space (== canvas-pixel space for bounded rooms,
    // see tileMath.ts) maps 1:1 onto screen space, matching the plain
    // fullscreen-quad blit this replaces. Canvas size is fixed for a bounded
    // room's lifetime (unlike infinite rooms' resizeCanvas), so this is the
    // only assignment it ever needs.
    // (#470) Centred on the sheet, not on the canvas: the canvas is the
    // viewport now and its centre is an arbitrary corner of the page. The
    // caller drives the camera from its own viewport state within a frame or
    // two, so this only decides what the very first frame shows — but a first
    // frame looking at the wrong place is a visible flash.
    this._pose = opts.infinite
      ? { wx: canvas.width / 2, wy: canvas.height / 2, zoom: 1, angle: 0 }
      : { wx: (opts.pageWidth ?? canvas.width) / 2, wy: (opts.pageHeight ?? canvas.height) / 2, zoom: 1, angle: 0 }
  }

  /** The current pose — see CameraPose. Unlike setViewport()'s {cx,cy},
   *  which is a screen-space canvas-center position for the CSS-panned
   *  bounded-canvas path, this is a direct world-space reference point —
   *  there's no fixed canvas rect to recenter around once the canvas element
   *  itself just is "the viewport." */
  get pose(): CameraPose {
    return this._pose
  }

  set(wx: number, wy: number, zoom: number, angle: number): void {
    this._pose = { wx, wy, zoom, angle }
  }

  /** (#155 follow-up) `canvas.getBoundingClientRect()`, cached — a real
   *  synchronous layout read (a forced reflow if anything invalidated
   *  layout earlier in the same task), and setInfiniteCamera's pointer-
   *  transform closure used to call it fresh on *every* real pointer
   *  sample during a stroke (a fast stylus easily produces dozens of
   *  coalesced samples per animation frame). Live profiling during a
   *  drawing session confirmed this as the single largest actual
   *  app-attributable CPU cost, and chrome-devtools-mcp's own
   *  ForcedReflow insight independently named this exact call path
   *  (`_handleMove` → `_extract` → this transform closure) as the top
   *  forced-reflow culprit.
   *
   *  The canvas element's on-screen rect only changes on a genuine layout
   *  event (window/container resize — see the engine's resizeCanvas, which
   *  invalidates this), never merely from panning or drawing (a camera move
   *  re-renders *content*, it never repositions the canvas element itself
   *  — see setInfiniteCamera's own doc comment), so caching indefinitely
   *  between resizes is safe. */
  canvasRect(): CanvasRect {
    return this._rectCache ??= this._measureRect()
  }

  /** Drops the cached rect — see canvasRect. */
  invalidateRect(): void {
    this._rectCache = null
  }

  /** setViewport's pointer transform: a bounded room pans and rotates with a
   *  CSS transform the caller owns, so the client point is taken back through
   *  the caller's own (cx, cy, zoom, angle) about the canvas centre. The
   *  canvas half-size is captured here, as it always was. */
  boundedPointerTransform(cx: number, cy: number, zoom: number, angle: number): PointerTransform {
    const canvas = this._canvas
    const cos = Math.cos(-angle)
    const sin = Math.sin(-angle)
    const hw  = canvas.width  / 2
    const hh  = canvas.height / 2
    return (clientX, clientY) => {
      const dx = clientX - cx
      const dy = clientY - cy
      const rx = dx * cos - dy * sin
      const ry = dx * sin + dy * cos
      return { x: rx / zoom + hw, y: ry / zoom + hh }
    }
  }

  /** setInfiniteCamera's pointer transform for the current pose — the exact
   *  inverse of the composite's world->screen math (solved by hand, not
   *  matrix-inverted at runtime, since it's cheap and fixed shape): a raw
   *  client pointer event must land on the same world point a tile rendered
   *  at (wx,wy,zoom,angle) currently shows there. Reads the canvas element's
   *  own on-screen rect (canvasRect) rather than trusting a separate (cx,cy)
   *  — infinite mode's canvas has no CSS pan transform of its own, it's
   *  simply positioned to fill the viewport, so this is the same
   *  client->canvas-local math PointerInput's own untransformed fallback
   *  already does, composed with the inverse camera rotation/zoom on top. */
  pointerTransform(): PointerTransform {
    const canvas = this._canvas
    const { wx, wy, zoom, angle } = this._pose
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    // hw/hh must be read live inside the closure (like the composite does),
    // not captured here: resizeCanvas() can change canvas.width/height
    // afterwards (the ResizeObserver's first firing normally lands after this
    // is first called, while the canvas is still at its default 300x150)
    // without the camera ever being set again, which left pointer input
    // reading a stale size while every render used the live one — dabs
    // landed tens/hundreds of px off from the visible stroke.
    return (clientX, clientY) => {
      const rect = this.canvasRect()
      const scaleX = canvas.width / (rect.width || canvas.width)
      const scaleY = canvas.height / (rect.height || canvas.height)
      const screenX = (clientX - rect.left) * scaleX
      const screenY = (clientY - rect.top) * scaleY
      const hw = canvas.width / 2
      const hh = canvas.height / 2
      const sx = (screenX - hw) / zoom
      const sy = (screenY - hh) / zoom
      return { x: wx + sx * cos + sy * sin, y: wy - sx * sin + sy * cos }
    }
  }

  /** Pixel size for the split caches and the assembly buffer: a square padded
   *  to the canvas's own half-diagonal, big enough that any camera rotation
   *  still finds the whole screen covered once the final pass crops/rotates
   *  it back down to the real canvas size.
   *
   *  (#470) The same for both kinds of room now. A bounded room used to size
   *  these to its *sheet*, because its canvas element was the sheet and the
   *  browser did the panning with a CSS transform — so every buffer here grew
   *  with the paper rather than with the screen. On a 4096x4096 sheet that was
   *  four full-sheet buffers, 256 MiB, allocated before a single stroke, and
   *  it killed the tab on an iPad. Now the sheet is a rectangle in the world
   *  and these are all screen-sized, so the cost of a big sheet is nothing. */
  renderBufferExtent(): { w: number; h: number } {
    const canvas = this._canvas
    const halfDiag = Math.sqrt((canvas.width / 2) ** 2 + (canvas.height / 2) ** 2)
    const extent = Math.ceil(halfDiag * 2)
    return { w: extent, h: extent }
  }

  /** How much bigger the assembly buffer is than the real canvas, split
   *  (roughly) evenly on each side, *rounded to the nearest whole pixel* — see
   *  CameraFrame.centerX (cameraFrame.ts) for why this integer-ness is exactly
   *  the fix for infinite rooms always looking faintly softer than bounded
   *  ones.
   *
   *  (#470) Bounded rooms render through the camera too: their extent is the
   *  same padded square, so they pad exactly like an infinite room — the
   *  early return for them that used to sit here would have put every bounded
   *  frame half a buffer off. */
  assemblyPad(): { padX: number; padY: number } {
    const canvas = this._canvas
    const { w: ew, h: eh } = this.renderBufferExtent()
    return { padX: Math.round((ew - canvas.width) / 2), padY: Math.round((eh - canvas.height) / 2) }
  }

  /** (#301) The scale the composite draws the assembly buffer at — see
   *  CameraFrame.scale for the full reasoning. */
  compositeScale(): number {
    return Math.min(1, this._pose.zoom)
  }

  /** (#301) How much magnification the final screen pass still has to apply
   *  on top of what the assembly buffer was already drawn at — 1 whenever
   *  the camera is at or below zoom 1, and the zoom itself above that (the
   *  assembly caps at world resolution). Also the flag for whether that pass
   *  resamples at all: combined with a nonzero angle it decides between
   *  Catmull-Rom and a plain bilinear tap (see PAPER_COMPOSE_FRAG). */
  residualScale(): number {
    return this._pose.zoom / this.compositeScale()
  }

  /** (#494) The on-screen composite's frame: the live camera, drawn into the
   *  assembly buffer at canvas centre plus its rounded padding (#134), at
   *  min(1, zoom) (#301), reading tiles over visibleWorldRect. Derived, not
   *  stored — every on-screen composite builds it fresh and passes it down. */
  liveFrame(): CameraFrame {
    const canvas = this._canvas
    const { wx, wy, angle } = this._pose
    const { padX, padY } = this.assemblyPad()
    return {
      wx, wy,
      centerX: canvas.width / 2 + padX,
      centerY: canvas.height / 2 + padY,
      scale: this.compositeScale(),
      angle,
      view: this.visibleWorldRect(),
    }
  }

  /** The world-space rect currently visible on screen — what determines
   *  which tiles resolveVisible()/composite bother reading (never creates
   *  them, so a few extra out-of-view tiles considered here costs a bit of
   *  redundant compositing, never correctness).
   *
   *  The camera can point anywhere and rotate freely, so this generously pads
   *  to an axis-aligned bounding box of the (rotated) viewport rect —
   *  tightening this to the exact rotated quad instead of its bounding box is
   *  a nicety, not a correctness fix. (#470) Camera-derived for a bounded
   *  room too: what is on screen is decided by where the camera is, not by
   *  the sheet being the canvas. */
  visibleWorldRect(): WorldRect {
    const canvas = this._canvas
    const { wx, wy, zoom } = this._pose
    const halfW = canvas.width / 2 / zoom
    const halfH = canvas.height / 2 / zoom
    const halfDiag = Math.sqrt(halfW * halfW + halfH * halfH)
    return { minX: wx - halfDiag, minY: wy - halfDiag, maxX: wx + halfDiag, maxY: wy + halfDiag }
  }

  /** (#138) World point that a live-tip/predicted/peer-reveal preview
   *  buffer's own pixel (0,0) represents. These buffers are always plain,
   *  fixed-size (canvas.width x canvas.height) AccumulationBuffers — unlike
   *  a real layer's tiles, which resolveForPaint() dynamically positions to
   *  cover wherever a batch of dabs actually falls, these never grow or
   *  move once created, so *some* origin has to be chosen up front for
   *  their dabs (genuine world coordinates for infinite rooms, arbitrarily
   *  far from world origin depending on where the camera happens to be) to
   *  land inside their fixed small pixel range at all.
   *
   *  Centering on the current camera's own world position is the natural
   *  choice: the whole point of these previews is to show something
   *  happening on screen right now, and (per the engine's note on
   *  setInfiniteCamera) panning and painting are mutually exclusive
   *  gestures in this app, so the camera is guaranteed not to move for as
   *  long as a single stroke/prediction/reveal buffer stays alive — one
   *  snapshot at creation time (stroke start / previewOperation's first
   *  queued op for a peer) stays valid for that buffer's whole lifetime.
   *
   *  Reduces to exactly (0,0) whenever the camera sits at
   *  {wx: canvas.width/2, wy: canvas.height/2} — the pre-#138 plain
   *  (0,0)-anchored behaviour of every one of these buffers. */
  centeredOrigin(): { x: number; y: number } {
    const { wx, wy } = this._pose
    return { x: wx - this._canvas.width / 2, y: wy - this._canvas.height / 2 }
  }

  /** The destination(canvas)->source(assembly) matrix the final rotate pass
   *  goes through — shared by the plain transform blit and the on-screen
   *  paper pass (#301) so both apply the exact same rotation.
   *
   *  Uses assemblyPad()'s *rounded* half-difference as the assembly buffer's
   *  own center, not its literal half-size (ext/2) — see CameraFrame.centerX's
   *  comment for why that distinction is what keeps an unrotated (angle 0,
   *  by far the common case) frame an exact, lossless pixel copy instead of a
   *  permanently-blurred bilinear resample.
   *
   *  (#301) Carries the residual magnification too, not just the rotation:
   *  above zoom 1 the assembly buffer is drawn at world resolution rather
   *  than at zoom, and this pass is where the rest of the zoom gets applied
   *  — which is the point, since doing both here means one resample instead
   *  of two. At or below zoom 1 the residual is exactly 1 and this reduces
   *  to the pure rotation it has always been. */
  rotateMatrixInv(): Matrix3 {
    const canvas = this._canvas
    const { angle } = this._pose
    const { padX, padY } = this.assemblyPad()
    return composeMatrix(
      translationMatrix(canvas.width / 2 + padX, canvas.height / 2 + padY),
      composeMatrix(
        scaleRotateMatrix(1 / this.residualScale(), -angle),
        translationMatrix(-canvas.width / 2, -canvas.height / 2),
      ),
    )
  }

  /** Screen(canvas)-pixel -> world-unit mapping for the live camera — the
   *  full inverse of the forward chain the composite actually draws
   *  through, carried one step further than rotateMatrixInv (which stops at
   *  assembly pixels). Forward, that chain is
   *  screenPx = canvasCenter + R(angle) * (world - camera) * zoom
   *  — composed of frameEdgeX/Y (world -> assembly px, the live frame's
   *  scale and centre) and rotateMatrixInv (assembly px -> screen px,
   *  rotation about canvasCenter); the assembly buffer's own padding cancels
   *  out between the two, which is why it doesn't appear here at all.
   *  Inverting gives world = camera + R(-angle) * (screenPx - canvasCenter)
   *  / zoom, i.e. exactly the composition below.
   *
   *  (#301) What lets PAPER_COMPOSE_FRAG sample paper at a screen pixel's
   *  true world position *after* the rotation instead of before it — see
   *  that shader's own comment for why doing it after is the whole point. */
  screenToWorldMatrix(): Matrix3 {
    const canvas = this._canvas
    const { wx, wy, zoom, angle } = this._pose
    return composeMatrix(
      translationMatrix(wx, wy),
      composeMatrix(scaleRotateMatrix(1 / zoom, -angle), translationMatrix(-canvas.width / 2, -canvas.height / 2)),
    )
  }
}

/** (#138) Translates `dabs` from world coordinates into one of the preview
 *  buffers' own local coordinate space (buffer pixel (0,0) == world `origin`
 *  — see Camera.centeredOrigin), mirroring what
 *  ILayerBuffer.resolveForPaint's originX/originY subtraction already does
 *  for a real tile. Never mutates its input: dabs may still be read afterward
 *  by their real caller (the live stroke, in particular, must keep the
 *  untranslated *world* coordinates for the eventual recorded Operation). A
 *  no-op array identity when `origin` is exactly (0,0) — skips the
 *  allocation on the hot path that never needed it. */
export function translateDabs(dabs: Dab[], origin: { x: number; y: number }): Dab[] {
  if (origin.x === 0 && origin.y === 0) return dabs
  return dabs.map(d => ({ ...d, x: d.x - origin.x, y: d.y - origin.y }))
}
