import { useCallback, type RefObject } from 'react'
import { clamp } from 'lodash-es'

import type { PencilEngineAPI } from '../../engine'
import { useRoomStore } from '../../stores/roomStore'
import { clientToRoomPoint } from './viewport/cameraMath'
import {
  composeMatrix, invertMatrix, applyMatrix, isIdentityMatrix, IDENTITY_MATRIX,
  transformGestureKind, isNegligibleTransform, distortQuad, solveQuadMatrix, isFrameInFront,
  translateMatrix, scaleAxisMatrix, skewAxisMatrix, rotateAboutMatrix,
  type TransformBounds, type TransformMatrix, type TransformHandleKind, type TransformMode,
} from '../../lib/transform/transformMath'
import type { TransformSession } from './useTransformSession'
import type { Viewport } from './viewport/useViewport'


// Layer transform tool (#120): canvas-space pivot for a scale handle is
// always the *opposite* corner/edge of the content bounding box (see
// engine.getContentBounds) — a real resize anchor, unlike the old
// whole-canvas-rect version this replaced.
const TRANSFORM_PIVOT: Record<'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r', (b: TransformBounds) => { x: number; y: number }> = {
  tl: b => ({ x: b.x + b.width, y: b.y + b.height }),
  tr: b => ({ x: b.x,           y: b.y + b.height }),
  bl: b => ({ x: b.x + b.width, y: b.y }),
  br: b => ({ x: b.x,           y: b.y }),
  t:  b => ({ x: b.x,           y: b.y + b.height }),
  b:  b => ({ x: b.x,           y: b.y }),
  l:  b => ({ x: b.x + b.width, y: b.y }),
  r:  b => ({ x: b.x,           y: b.y }),
}

// (#391) How far a shear may be pushed in one gesture. Unlike a scale this
// has no singularity to protect against (a single-axis shear's determinant is
// exactly 1 whatever the amount), so the clamp is purely about what a slip of
// the pen near the anchor edge can do: the shear is a ratio whose denominator
// is the distance to that edge, and 20 already lays the layer almost flat.
const MAX_TRANSFORM_SHEAR = 20

export interface TransformGizmoGestureDeps {
  /** The viewport container — pointer positions are measured against it. */
  vpRef: RefObject<HTMLDivElement | null>
  /** The camera the pointer is read through (Room's, from useViewport). */
  vp: Viewport
  handActive: boolean
  engineRef: RefObject<PencilEngineAPI | null>
  /** Declared in Room: the session's own hook and undo read them too. */
  transformSessionRef: RefObject<TransformSession | null>
  pendingTransformCommitRef: RefObject<{ opId: string; finish: () => void } | null>
}

/** (#493) The transform gizmo's pointer gestures (#120, #391, #392, #399,
 *  #407): dragging a handle — move, scale, rotate, skew, distort — into the
 *  open session's matrix, and dragging or resetting the rotation pivot.
 *
 *  The session itself (open, commit, reset) is useTransformSession's; this is
 *  what a hand does to it while it is open. Store-owned inputs — the room,
 *  the frame's bounds and pivot, the mode and proportions toggle — are read
 *  here; what Room derives itself comes in.
 *
 *  The refs that come in are named in the dependency lists: as parameters the
 *  lint rule no longer recognises them as refs, and a ref object never changes
 *  identity, so naming it costs nothing. Their `.current` is read at call
 *  time — in the listeners, when the pointer moves — on purpose, and never
 *  listed. */
export function useTransformGizmoGestures({
  vpRef, vp, handActive, engineRef, transformSessionRef, pendingTransformCommitRef,
}: TransformGizmoGestureDeps) {
  const config = useRoomStore(s => s.room)
  const transformBounds = useRoomStore(s => s.transformBounds)
  const transformCenterOverride = useRoomStore(s => s.transformCenterOverride)
  const setTransformCenterOverride = useRoomStore(s => s.setTransformCenterOverride)
  const setTransformSessionMatrix = useRoomStore(s => s.setTransformSessionMatrix)
  const transformMode = useRoomStore(s => s.toolSettings.transform.mode) as TransformMode
  const transformKeepProportions = useRoomStore(s => s.toolSettings.transform.keepProportions) as boolean


  // Layer transform tool (#120): mirrors handleRulerDown's drag-capture
  // pattern exactly, but per-handle (body/corner/rotate) rather than a
  // single A→B drag. Since #399 a gesture no longer commits anything — it
  // folds into the open session's matrix and stays a preview until the
  // session ends.
  const handleTransformHandleDown = useCallback((handle: TransformHandleKind, e: React.PointerEvent<SVGElement>) => {
    if (e.pointerType === 'touch') return
    // (#405) The hand outranks the gizmo, the same way it outranks every tool
    // in the cursor decision (resolveCursor's rule 1) and for the same reason:
    // while it is up, a drag anywhere moves the view. Without this the handles
    // would still swallow a mouse drag that started on one, so panning to see
    // where a layer is going — the whole reason to reach for the hand mid-
    // transform — would fail exactly over the thing being dragged. (#443: with
    // the hand a tool, only held Space can reach here, and it is exactly the
    // route that still needs this.)
    if (handActive) return
    // (#395) The previous session's commit is still in flight, so the layer
    // doesn't carry it yet and transformBounds still describes where the
    // content was before it. A gesture started here would build on a
    // transform that may yet be refused. The wait is one round trip.
    if (pendingTransformCommitRef.current) return
    const session = transformSessionRef.current
    const el = vpRef.current
    if (!session || !el || !config || !transformBounds) return
    e.stopPropagation()
    const overlay = e.currentTarget
    const penPointerId = e.pointerId
    try { overlay.setPointerCapture(penPointerId) } catch { /* context loss */ }

    // #143: world-space for infinite rooms (clientToRoomPoint) — matches
    // transformBounds/pivot/center (engine.getContentBounds, real world
    // coordinates for infinite rooms) so drag deltas/pivots are computed in
    // one consistent space instead of mixing world-space bounds with a
    // placeholder-canvas-space pointer position.
    const rect = el.getBoundingClientRect()

    // (#399) Which side of the accumulated matrix a gesture composes on is not
    // a style choice — it decides whether the frame stays a rectangle.
    //
    // Scaling has to go *inside* (session ∘ gesture): the handles pull along
    // the frame's own axes, so the squash is stated in the frame's local
    // space, before whatever rotation the session already holds.
    //
    // Rotation has to go *outside* (gesture ∘ session): turning the frame is a
    // rigid move of whatever shape it currently is. Composed inside, a
    // rotation lands *under* an existing non-uniform scale — squash-then-turn
    // becomes turn-then-squash, which is a shear, and the corners stop being
    // 90°. That is the bug Ilya hit by squashing one axis and then rotating.
    // Keeping rotation outside holds the session in the form
    // rotation ∘ scale, which is angle-preserving on a rectangle no matter how
    // the two are interleaved.
    //
    // Translation *does* care, and used to be filed here as the one that
    // doesn't (#407). The claim was that for a drag of `d` canvas px,
    // session ∘ translate(A⁻¹d) and translate(d) ∘ session are the same
    // matrix — true, but only while the session has a linear part `A` to
    // invert, i.e. while it is affine. Once Distort (#392) put a projective
    // row in it, composing a move inside means sliding the source rectangle
    // *through* the perspective field before it is applied, so the layer comes
    // out re-foreshortened: measured on a distorted frame, a plain 150x40 drag
    // took the sides from 626.5/447.8/400/300 to 688.6/484.8/428.4/294.7 —
    // every one of them changed, and one got shorter. Dragging a picture
    // across the page is not supposed to reshape it.
    //
    // So translation goes outside, with rotation, for the same reason rotation
    // is there: it is a rigid move of whatever shape the session currently
    // holds. For an affine session this is exactly the old behaviour (the
    // identity above still holds), so nothing that worked before changes.
    const sessionBase = session.matrix
    const toLocalSpace = invertMatrix(sessionBase)
    if (!toLocalSpace) return
    const toCanvasPoint = (clientX: number, clientY: number) => clientToRoomPoint(clientX, clientY, rect, vp, config)
    const toPoint = (clientX: number, clientY: number) => {
      const p = toCanvasPoint(clientX, clientY)
      return applyMatrix(toLocalSpace, p.x, p.y)
    }

    const bounds = transformBounds
    const center = transformCenterOverride ?? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    // (#391/#392) What this handle means under the current mode — every mode
    // redefines exactly one family of handles (Rotate & Skew the edges,
    // Distort the corners) and borrows the rest from Free transform.
    const gestureKind = transformGestureKind(handle, transformMode)
    const isRotate = gestureKind === 'rotate'
    const isDistort = gestureKind === 'distort'
    const pivot = handle === 'body' || isRotate ? center : TRANSFORM_PIVOT[handle as keyof typeof TRANSFORM_PIVOT](bounds)
    const start = toPoint(e.clientX, e.clientY)
    // Rotation works entirely in canvas space, so its centre and start angle
    // are the local ones pushed back out through the session matrix.
    const centerCanvas = applyMatrix(sessionBase, center.x, center.y)
    const startCanvas = toCanvasPoint(e.clientX, e.clientY)
    const startAngle = Math.atan2(startCanvas.y - centerCanvas.y, startCanvas.x - centerCanvas.x)
    const startDist  = Math.max(Math.hypot(start.x - pivot.x, start.y - pivot.y), 1e-6)
    const startDistX = Math.max(Math.abs(start.x - pivot.x), 1e-6)
    const startDistY = Math.max(Math.abs(start.y - pivot.y), 1e-6)
    // Signed, unlike the two above: a shear is "how far the grabbed edge slid,
    // per unit of distance from the anchor edge", and which side of the anchor
    // the edge sits on decides the sign of the resulting matrix (see
    // skewAxisMatrix). Guarded away from zero the same way — an edge dragged
    // while the frame is degenerate would otherwise divide by nothing.
    const startOffsetX = Math.sign(start.x - pivot.x || 1) * startDistX
    const startOffsetY = Math.sign(start.y - pivot.y || 1) * startDistY
    // Null means "this pointer position has no usable matrix" — only Distort
    // can produce one (drag a corner onto the line through its two neighbours
    // and there is no homography at all), and the answer is to leave the frame
    // where it was rather than to throw or to snap it somewhere arbitrary.
    const computeMatrix = (clientX: number, clientY: number): TransformMatrix | null => {
      if (isRotate) {
        const w = toCanvasPoint(clientX, clientY)
        const angle = Math.atan2(w.y - centerCanvas.y, w.x - centerCanvas.x) - startAngle
        return rotateAboutMatrix(angle, centerCanvas.x, centerCanvas.y)
      }
      const p = toPoint(clientX, clientY)
      // (#407) In *canvas* px, unlike every gesture below it: a move composes
      // outside the session, so it has to be stated in the space the session's
      // output already lives in. Reading the local-space delta here instead
      // would re-introduce the same mixing the outside composition exists to
      // avoid, just from the other end.
      if (gestureKind === 'move') {
        const pc = toCanvasPoint(clientX, clientY)
        return translateMatrix(pc.x - startCanvas.x, pc.y - startCanvas.y)
      }
      // Distort (#392): the grabbed corner goes exactly where the pointer is
      // and the other three hold still, so the gesture *is* the four-point
      // correspondence the solver takes. No clamp on how far it can be
      // dragged, unlike a scale — a corner pulled past its neighbours is a
      // fold, which is a shape, not a singularity; the two ways this genuinely
      // has no answer (three corners collinear, and a quad whose vanishing
      // line crosses the frame) are refused below instead.
      if (isDistort) {
        const quad = distortQuad(bounds, handle, p)
        return quad && solveQuadMatrix(bounds, quad)
      }
      // Rotate & Skew's edge handles (#391): the edge slides along itself and
      // the opposite edge stays pinned, so only the travel *along* the edge is
      // read — pushing the top edge up or down does nothing, exactly as in
      // Adobe's own skew. Proportions have no meaning for a shear, so the
      // keep-proportions toggle is deliberately not consulted here; it still
      // governs this mode's corner handles below.
      if (gestureKind === 'skewX') {
        const shear = clamp((p.x - start.x) / startOffsetY, -MAX_TRANSFORM_SHEAR, MAX_TRANSFORM_SHEAR)
        return skewAxisMatrix(shear, 0, pivot.x, pivot.y)
      }
      if (gestureKind === 'skewY') {
        const shear = clamp((p.y - start.y) / startOffsetX, -MAX_TRANSFORM_SHEAR, MAX_TRANSFORM_SHEAR)
        return skewAxisMatrix(0, shear, pivot.x, pivot.y)
      }
      // Edge handles in Free transform: always exactly one axis, about the
      // opposite edge. The proportions toggle deliberately does not reach them
      // (#391) — an edge that keeps the aspect ratio is an edge that cannot
      // stretch, and stretching one axis is the only thing an edge handle has
      // ever been for. Briefly they scaled both axes while the lock was on,
      // which, since the lock is on by default, meant single-axis stretch was
      // unreachable out of the box: a regression of the default dressed up as
      // a feature. The toggle now governs the corners and nothing else.
      if (handle === 't' || handle === 'b') {
        const scaleY = clamp(Math.abs(p.y - pivot.y) / startDistY, 0.05, 20)
        return scaleAxisMatrix(1, scaleY, pivot.x, pivot.y)
      }
      if (handle === 'l' || handle === 'r') {
        const scaleX = clamp(Math.abs(p.x - pivot.x) / startDistX, 0.05, 20)
        return scaleAxisMatrix(scaleX, 1, pivot.x, pivot.y)
      }
      // Corner handles — the only place the proportions toggle is read. Locked
      // (the default, and what they always did before #391) the two axes share
      // one factor taken from the pointer's distance to the anchor corner;
      // unlocked, each axis is measured on its own — Free transform's whole
      // point, and the reason #132 asked for a toggle rather than a Shift key
      // nobody can press on a tablet.
      if (transformKeepProportions) {
        const scale = clamp(Math.hypot(p.x - pivot.x, p.y - pivot.y) / startDist, 0.05, 20)
        return scaleAxisMatrix(scale, scale, pivot.x, pivot.y)
      }
      return scaleAxisMatrix(
        clamp(Math.abs(p.x - pivot.x) / startDistX, 0.05, 20),
        clamp(Math.abs(p.y - pivot.y) / startDistY, 0.05, 20),
        pivot.x, pivot.y,
      )
    }

    // Coalesce to one previewLayerTransform call per animation frame rather
    // than one per raw pointermove — a pen digitizer fires well past 60/s,
    // and previewLayerTransform's own GPU cost scales with how much of the
    // page the dragged content currently covers (a bounded room's own tile
    // size is its whole canvas, see engine/index.ts's _makeLayerBuffer —
    // content spanning two such tiles means transform-blitting two full-
    // page-sized buffers on every call). Rendering more previews than the
    // display can even show is pure wasted GPU work; this was a real,
    // reported stutter/hang testing on an underpowered device once content
    // was dragged past the page edge. Only the *latest* pointer position
    // within a frame is ever previewed — nothing else about the preview's
    // correctness changes, this only throttles how often it's recomputed.
    let rafId: number | null = null
    let latestMatrix: TransformMatrix | null = null
    // What the canvas and the gizmo should show: everything the session had
    // already accumulated, with this gesture composed on the side its own
    // meaning demands (see computeMatrix's comment above). A Distort composes
    // *inside*, with the scales and for the same reason: its four target
    // corners are stated in the frame's own local space, before whatever
    // rotation the session is already carrying.
    //
    // Null when the result is not something to show: either the gesture had no
    // matrix at all, or the accumulated one folds the frame through the
    // vanishing line, where half the layer would render as a mirrored ghost
    // (isFrameInFront). Refusing beats clamping — a clamp would have to invent
    // some nearest legal quad, and the honest behaviour is that the corner
    // simply stops following the pointer once it has gone somewhere there is
    // no picture for.
    // (#407) Rotation and translation are the two rigid moves — they act on
    // the shape the session already produced, so they compose outside. Every
    // other gesture is stated in the frame's own axes and composes inside.
    const composesOutside = isRotate || gestureKind === 'move'
    const accumulated = (gesture: TransformMatrix | null): TransformMatrix | null => {
      if (!gesture) return null
      const next = composesOutside ? composeMatrix(gesture, sessionBase) : composeMatrix(sessionBase, gesture)
      return isFrameInFront(next, bounds) ? next : null
    }
    const showPreview = (matrix: TransformMatrix) => {
      setTransformSessionMatrix(matrix)
      const engine = engineRef.current
      // (#446) The masked preview when the session is scoped to a selection —
      // same lifecycle, same clearLayerTransformPreview, and (by construction,
      // see the engine's _composeAreaTiles) the same pixels the commit will
      // bake.
      // (#446) A floating paste draws its own raster above the layer; a lift
      // draws the layer with the region taken out of it and put back moved.
      if (session.paste && session.targetIds.length === 1) {
        engine?.previewAreaPaste(
          session.targetIds[0], session.paste.image,
          { x: session.paste.x, y: session.paste.y, width: session.paste.width, height: session.paste.height },
          matrix,
        )
        return
      }
      if (session.selection && session.targetIds.length === 1) {
        engine?.previewAreaTransform(session.targetIds[0], session.selection, matrix)
        return
      }
      engine?.previewLayerTransform(session.targetIds.map(layerId => ({ layerId, matrix })))
    }
    const flushPreview = () => {
      rafId = null
      if (!latestMatrix) return
      const next = accumulated(latestMatrix)
      if (next) showPreview(next)
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      latestMatrix = computeMatrix(ev.clientX, ev.clientY)
      if (rafId === null) rafId = requestAnimationFrame(flushPreview)
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      overlay.removeEventListener('pointermove', onMove)
      overlay.removeEventListener('pointerup', onUp)
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
      // (#399) Release commits nothing. The gesture folds into the session's
      // matrix and the preview stays exactly as it is — which is the whole
      // point: the frame keeps the orientation the gesture just gave it
      // instead of being re-derived from an axis-aligned box of pixels.
      // (#405) And it keeps it until the session actually ends — Enter, Esc, a
      // click past the gizmo, another tool, another layer. Nothing bakes it on
      // a timer any more; that timer is what made the frame appear to reset
      // itself a couple of seconds after every gesture.
      const gesture = computeMatrix(ev.clientX, ev.clientY)
      // A click, or pen jitter below the threshold — and, since #392, a
      // release on a pointer position that has no usable matrix at all: roll
      // the session's display back to where it was rather than folding in a
      // no-op that would drift the accumulated matrix by a fraction of a pixel
      // per tap.
      const next = gesture && accumulated(gesture)
      if (!gesture || !next || isNegligibleTransform(gestureKind, gesture, bounds)) {
        if (isIdentityMatrix(sessionBase)) {
          setTransformSessionMatrix(sessionBase)
          const engine = engineRef.current
          engine?.clearLayerTransformPreview()
        } else {
          showPreview(sessionBase)
        }
        return
      }
      // The session may have been closed under us mid-gesture (tool switched
      // off, selection changed) — in that case its commit already went out
      // with the matrix as of then, and this gesture has nowhere to land.
      const live = transformSessionRef.current
      if (live) live.matrix = next
      showPreview(next)
    }
    overlay.addEventListener('pointermove', onMove)
    overlay.addEventListener('pointerup', onUp)
  }, [
    vpRef, vp, config, handActive, transformBounds, transformCenterOverride, transformMode,
    transformKeepProportions, setTransformSessionMatrix,
    engineRef, transformSessionRef, pendingTransformCommitRef,
  ])

  // Adobe Animate-style draggable rotation pivot — a separate gesture from
  // the scale/rotate/translate handles above: it only ever updates
  // transformCenterOverride (local UI state), never previews or dispatches
  // a transform of its own. Double-click resets it back to the content
  // bounds' own center (see TransformGizmo's onCenterDoubleClick).
  const handleTransformCenterDown = useCallback((e: React.PointerEvent<SVGElement>) => {
    if (e.pointerType === 'touch') return
    // Same reason as the handles above (#405): the hand owns every drag.
    if (handActive) return
    const el = vpRef.current
    if (!el || !config) return
    e.stopPropagation()
    const overlay = e.currentTarget
    const penPointerId = e.pointerId
    try { overlay.setPointerCapture(penPointerId) } catch { /* context loss */ }

    const rect = el.getBoundingClientRect()
    // #143: world-space for infinite rooms (clientToRoomPoint) — matches
    // transformBounds/pivot/center (engine.getContentBounds, real world
    // coordinates for infinite rooms) so drag deltas/pivots are computed in
    // one consistent space instead of mixing world-space bounds with a
    // placeholder-canvas-space pointer position.
    //
    // (#399) Stored in the session's local space, like transformBounds and
    // unlike the raw pointer: the handle is rendered inside the gizmo's own
    // `<g transform>`, so a canvas-space point would be pushed through the
    // session matrix a second time and slide away from the finger. Local
    // space also means the pivot rides along with the content through later
    // gestures instead of staying pinned to a canvas coordinate.
    const session = transformSessionRef.current
    const toLocalSpace = invertMatrix(session?.matrix ?? IDENTITY_MATRIX)
    if (!toLocalSpace) return
    const toPoint = (clientX: number, clientY: number) => {
      const p = clientToRoomPoint(clientX, clientY, rect, vp, config)
      return applyMatrix(toLocalSpace, p.x, p.y)
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      setTransformCenterOverride(toPoint(ev.clientX, ev.clientY))
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== penPointerId) return
      overlay.removeEventListener('pointermove', onMove)
      overlay.removeEventListener('pointerup', onUp)
    }
    overlay.addEventListener('pointermove', onMove)
    overlay.addEventListener('pointerup', onUp)
  }, [vpRef, vp, config, handActive, setTransformCenterOverride, transformSessionRef])

  const handleTransformCenterReset = useCallback(
    () => setTransformCenterOverride(null),
    [setTransformCenterOverride],
  )

  return { handleTransformHandleDown, handleTransformCenterDown, handleTransformCenterReset }
}
