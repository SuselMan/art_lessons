import type { ShapeFrame, ShapeGeometry, ShapeFill, ShapeStroke } from '@grafetto/shared'
import type { ShapeKind } from '@grafetto/shared'
import type { ToolSettingsValue } from './toolSchemas'

// (#530) The arithmetic of drawing a shape: what a drag means, and how the
// tool's settings become the geometry and paint an operation carries.
//
// Kept out of Room/index.tsx and out of the hook that drives it, for the same
// reason selectionGesture.ts is: this is the part worth testing, and none of
// it needs an engine, a canvas or a store. It is also where the modifier keys
// are actually decided, which is the part with an opinion in it.

const DEG = Math.PI / 180

/** How finely Shift snaps a line's angle. 15° rather than 45°: the useful
 *  angles when laying out a drawing are the ones a set square gives you —
 *  horizontals, verticals, diagonals and the thirds between them. */
export const LINE_ANGLE_SNAP_DEG = 15

export interface DragModifiers {
  /** The tool's own toggle. Shift *inverts* this rather than setting it —
   *  otherwise, with the toggle on, holding Shift would do nothing, and the
   *  habit of holding it to constrain would silently stop working (the tablet
   *  has no Shift at all, which is why the toggle exists in the first place). */
  keepProportions: boolean
  shift: boolean
  /** Alt draws outward from the press instead of corner to corner. */
  fromCenter: boolean
}

/** The frame a drag from `start` to `current` describes.
 *
 *  `width`/`height` come out signed for a line and unsigned for everything
 *  else, which is exactly what ShapeFrame documents: a line from the top-left
 *  to the bottom-right and one from the top-right to the bottom-left fill the
 *  same rectangle, and only the sign tells them apart. */
export function frameFromDrag(
  kind: 'line' | 'boxed',
  start: { x: number; y: number },
  current: { x: number; y: number },
  mods: DragModifiers,
): ShapeFrame {
  const constrain = mods.keepProportions !== mods.shift
  let dx = current.x - start.x
  let dy = current.y - start.y

  if (kind === 'line') {
    if (constrain) {
      // The angle snaps; the length is whatever the hand gave, projected onto
      // the snapped direction so the far end tracks the pointer instead of
      // jumping when it crosses a boundary.
      const len = Math.hypot(dx, dy)
      const step = LINE_ANGLE_SNAP_DEG * DEG
      const snapped = Math.round(Math.atan2(dy, dx) / step) * step
      dx = Math.cos(snapped) * len
      dy = Math.sin(snapped) * len
    }
    return mods.fromCenter
      ? { x: start.x - dx, y: start.y - dy, width: dx * 2, height: dy * 2, angle: 0 }
      : { x: start.x, y: start.y, width: dx, height: dy, angle: 0 }
  }

  if (constrain) {
    // The larger extent wins, so a square grows to contain the drag rather
    // than shrinking to fit inside it — dragging further never makes the shape
    // smaller.
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    dx = Math.sign(dx || 1) * side
    dy = Math.sign(dy || 1) * side
  }

  if (mods.fromCenter) {
    return {
      x: start.x - Math.abs(dx), y: start.y - Math.abs(dy),
      width: Math.abs(dx) * 2, height: Math.abs(dy) * 2, angle: 0,
    }
  }
  return {
    x: Math.min(start.x, start.x + dx), y: Math.min(start.y, start.y + dy),
    width: Math.abs(dx), height: Math.abs(dy), angle: 0,
  }
}

/** Whether a drag produced anything worth recording. A press that never moved
 *  draws nothing at all (#525): the log is permanent, and every mistimed tap
 *  with a shape tool in hand would otherwise leave an operation in it. */
export function isDrawableFrame(frame: ShapeFrame): boolean {
  if (frame.width === 0 && frame.height === 0) return false
  return Math.abs(frame.width) >= 1 || Math.abs(frame.height) >= 1
}

/** The tool's settings, as the geometry an operation carries.
 *
 *  This is where the UI's conveniences are turned back into geometry, and the
 *  star is the one that matters: the slider says "starness" from 0 (a regular
 *  polygon) to 1 (needle-thin), because that is continuous and says what the
 *  control does, while the operation carries the inner radius as a fraction of
 *  the outer — which is the honest geometric parameter but is discontinuous at
 *  its own zero (see ShapeGeometry.polystar). cos(PI/points) is where the
 *  inner vertices land exactly on the edges between the outer ones, i.e. the
 *  polygon, so starness scales down from there. */
export function shapeGeometryFrom(kind: ShapeKind, values: ToolSettingsValue): ShapeGeometry {
  switch (kind) {
    case 'rectangle':
      return { kind: 'rectangle', cornerRadius: num(values.cornerRadius) }
    case 'ellipse':
      return {
        kind: 'ellipse',
        startAngle: num(values.startAngle) * DEG,
        endAngle: num(values.endAngle) * DEG,
        innerRadius: num(values.innerRadius),
        closePath: values.closePath !== false,
      }
    case 'polystar': {
      const points = Math.round(num(values.points)) || 3
      const starness = Math.max(0, Math.min(1, num(values.starness)))
      return {
        kind: 'polystar',
        points,
        innerRadius: Math.cos(Math.PI / points) * (1 - starness),
        rotation: num(values.rotation) * DEG,
      }
    }
    case 'line':
      return { kind: 'line', cap: capOf(values.cap) }
  }
}

/** The two colours, as the operation carries them: absent rather than
 *  transparent when switched off. */
export function shapePaintFrom(values: ToolSettingsValue): {
  stroke: ShapeStroke | null; fill: ShapeFill | null
} {
  const stroke: ShapeStroke | null = values.strokeOn === false ? null : {
    color: rgb(values.strokeColor),
    width: num(values.strokeWidth),
    align: alignOf(values.strokeAlign),
    join: values.strokeJoin === 'round' ? 'round' : 'miter',
  }
  const fill: ShapeFill | null = values.fillOn === true && values.fillColor !== undefined
    ? { color: rgb(values.fillColor) }
    : null
  return { stroke, fill }
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function rgb(value: unknown): [number, number, number] {
  return Array.isArray(value) && value.length === 3 ? value as [number, number, number] : [0, 0, 0]
}

function alignOf(value: unknown): ShapeStroke['align'] {
  return value === 'center' || value === 'outside' ? value : 'inside'
}

function capOf(value: unknown): 'butt' | 'round' | 'square' {
  return value === 'butt' || value === 'square' ? value : 'round'
}

// ── Editing an unconfirmed shape (#530) ─────────────────────────────────────
//
// The handles are the transform gizmo's own — same component, same hit areas,
// same rotate zones (#528's rule: one uncommitted-edit mechanism, not two).
// What differs is what a drag *means*: the transform tool builds a matrix and
// bakes it into pixels, while a shape has no pixels yet, so a handle simply
// edits the frame the shape will be drawn from. That is the whole reason this
// is arithmetic here rather than a second copy of transformMath.

/** Rotates `p` about `c` by `-angle` — world space into the frame's own. */
function toLocal(p: { x: number; y: number }, c: { x: number; y: number }, angle: number) {
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const dx = p.x - c.x, dy = p.y - c.y
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos }
}

function toWorld(p: { x: number; y: number }, c: { x: number; y: number }, angle: number) {
  const cos = Math.cos(angle), sin = Math.sin(angle)
  return { x: c.x + p.x * cos - p.y * sin, y: c.y + p.x * sin + p.y * cos }
}

export type ShapeHandle =
  | 'body' | 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r'
  | 'rotate-tl' | 'rotate-tr' | 'rotate-bl' | 'rotate-br'

/** The frame a handle drag produces. `frame` is the frame as it was when the
 *  drag started, so a drag is always resolved from its own origin rather than
 *  accumulated frame by frame — the same shape of state the gizmo's own drag
 *  keeps, and what makes a drag reversible by dragging back. */
export function frameFromHandleDrag(
  frame: ShapeFrame, handle: ShapeHandle,
  start: { x: number; y: number }, current: { x: number; y: number },
  mods: Pick<DragModifiers, 'keepProportions' | 'shift'>,
): ShapeFrame {
  const center = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 }

  if (handle === 'body') {
    return { ...frame, x: frame.x + (current.x - start.x), y: frame.y + (current.y - start.y) }
  }

  if (handle.startsWith('rotate-')) {
    const a0 = Math.atan2(start.y - center.y, start.x - center.x)
    const a1 = Math.atan2(current.y - center.y, current.x - center.x)
    let angle = frame.angle + (a1 - a0)
    // Shift snaps rotation the way it snaps a line's angle, and to the same
    // ladder — the useful angles are the same ones.
    if (mods.shift) {
      const step = LINE_ANGLE_SNAP_DEG * DEG
      angle = Math.round(angle / step) * step
    }
    return { ...frame, angle }
  }

  const signX = Math.sign(frame.width) || 1
  const signY = Math.sign(frame.height) || 1
  const halfX = Math.abs(frame.width) / 2
  const halfY = Math.abs(frame.height) / 2
  const p = toLocal(current, center, frame.angle)

  let left = -halfX, right = halfX, top = -halfY, bottom = halfY
  if (handle === 'l' || handle === 'tl' || handle === 'bl') left = Math.min(p.x, right - 1)
  if (handle === 'r' || handle === 'tr' || handle === 'br') right = Math.max(p.x, left + 1)
  if (handle === 't' || handle === 'tl' || handle === 'tr') top = Math.min(p.y, bottom - 1)
  if (handle === 'b' || handle === 'bl' || handle === 'br') bottom = Math.max(p.y, top + 1)

  const corner = handle.length === 2
  if (corner && (mods.keepProportions !== mods.shift) && halfX > 0 && halfY > 0) {
    // Keep the frame's own aspect ratio, driven by whichever axis the hand
    // moved further — the same rule the initial drag follows.
    const ratio = halfY / halfX
    const w = right - left, h = bottom - top
    if (Math.abs(w * ratio) > Math.abs(h)) {
      const nh = Math.abs(w) * ratio
      if (handle === 'tl' || handle === 'tr') top = bottom - nh
      else bottom = top + nh
    } else {
      const nw = Math.abs(h) / ratio
      if (handle === 'tl' || handle === 'bl') left = right - nw
      else right = left + nw
    }
  }

  const localCenter = { x: (left + right) / 2, y: (top + bottom) / 2 }
  const worldCenter = toWorld(localCenter, center, frame.angle)
  // Signed for a line, whose two ends are what the frame's diagonal *is*, and
  // whose direction must survive an edit that only moved one edge.
  const width = (right - left) * signX
  const height = (bottom - top) * signY
  return {
    x: worldCenter.x - width / 2,
    y: worldCenter.y - height / 2,
    width,
    height,
    angle: frame.angle,
  }
}

/** Sets one dimension from a typed number, keeping the frame's centre where it
 *  is — a frame being sized by hand is being sized *around what it contains*,
 *  and moving it sideways because a number grew would be a surprise. */
export function frameWithSize(frame: ShapeFrame, axis: 'width' | 'height', value: number): ShapeFrame {
  const size = Math.max(1, Math.abs(value)) * (Math.sign(frame[axis]) || 1)
  const center = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 }
  const next = { ...frame, [axis]: size } as ShapeFrame
  return { ...next, x: center.x - next.width / 2, y: center.y - next.height / 2 }
}

/** Applies a width:height ratio to a frame, keeping its area roughly as it was
 *  rather than snapping one side to the other: a 3:4 preset on a wide frame
 *  should give a portrait frame of a similar size, not one as tall as the
 *  original was wide. */
export function frameWithRatio(frame: ShapeFrame, ratio: number): ShapeFrame {
  const w = Math.abs(frame.width), h = Math.abs(frame.height)
  const area = Math.max(1, w * h)
  const nh = Math.sqrt(area / ratio)
  const nw = nh * ratio
  return frameWithSize(frameWithSize(frame, 'width', nw), 'height', nh)
}
