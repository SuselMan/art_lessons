import type { Annotation, AnnotationPatch, AnnotationShape, Operation } from '@grafetto/shared'
import { MAX_ANNOTATION_INK_POINTS } from '@grafetto/shared'

/** Every annotation in the room, derived by folding the operation log — the
 *  same relationship `LayerState` has to the same log (see lib/layers.ts's
 *  `replayLayerState`), and derived the same way for the same reason: the log
 *  is the source of truth and this is a projection of it, so undo/redo need no
 *  code here at all. An undone `annotation_add` simply stops being among the
 *  done operations, and the next fold no longer produces it.
 *
 *  `order` exists because `items` is a map and z-order has to be *stated*
 *  rather than left to object key iteration: two annotations overlapping is
 *  ordinary (a note written next to a circled area), and which one is on top
 *  must be the same on every participant's screen. Creation order is that
 *  answer, and it comes straight from log order, which the server totally
 *  orders already. */
export interface AnnotationState {
  items: Record<string, Annotation>
  order: string[]
}

export function makeInitialAnnotationState(): AnnotationState {
  return { items: {}, order: [] }
}

/** Applies a patch to one annotation, ignoring fields that do not belong to
 *  its kind.
 *
 *  Ignoring rather than rejecting is deliberate. The Operation Log is
 *  permanent: a `text` field on an ink annotation can only arrive from a
 *  client version that disagrees with this one about what a patch may carry,
 *  and the safe reading of a field we do not understand is "apply what is
 *  legible, keep the rest" — never "refuse the operation", which would make an
 *  old room stop folding, nor "write it anyway", which would produce an
 *  annotation that is neither kind. */
function patchAnnotation(annotation: Annotation, patch: AnnotationPatch): Annotation {
  const next: Annotation = { ...annotation }
  if (patch.color !== undefined) next.color = patch.color
  if (patch.size !== undefined) next.size = patch.size
  if (next.kind === 'text') {
    if (patch.x !== undefined) next.x = patch.x
    if (patch.y !== undefined) next.y = patch.y
    if (patch.text !== undefined) next.text = patch.text
  } else if (patch.points !== undefined) {
    next.points = patch.points
  }
  return next
}

/** Folds one operation into the state. Anything that is not an annotation
 *  operation passes straight through — callers hand this the whole log rather
 *  than pre-filtering it, exactly as `applyContentOp` is handed every
 *  operation in lib/layers.ts. */
export function applyAnnotationOp(state: AnnotationState, op: Operation): AnnotationState {
  switch (op.type) {
    case 'annotation_add': {
      const annotation: Annotation = { ...op.shape, id: op.annotationId, authorId: op.userId }
      // Re-adding an existing id overwrites in place and does *not* move it in
      // `order`: folding the same log twice must land on the same state, and a
      // fold that reordered on repeat would quietly change which annotation is
      // drawn on top depending on how many times it ran.
      const order = state.order.includes(op.annotationId) ? state.order : [...state.order, op.annotationId]
      return { items: { ...state.items, [op.annotationId]: annotation }, order }
    }
    case 'annotation_update': {
      const existing = state.items[op.annotationId]
      // An update for an annotation that is not here lost a race with its own
      // deletion (or with an undo of the add). Dropping it is the same answer
      // lib/layers.ts gives a property operation on a layer that is gone: a
      // patch carries nothing that can be lost, so last-write-wins over
      // nothing is simply nothing.
      if (!existing) return state
      return { ...state, items: { ...state.items, [op.annotationId]: patchAnnotation(existing, op.patch) } }
    }
    case 'annotation_delete': {
      const doomed = new Set(op.annotationIds)
      if (!state.order.some(id => doomed.has(id))) return state
      const items: Record<string, Annotation> = {}
      for (const [id, annotation] of Object.entries(state.items)) {
        if (!doomed.has(id)) items[id] = annotation
      }
      return { items, order: state.order.filter(id => !doomed.has(id)) }
    }
    default:
      return state
  }
}

/** The whole projection: fold the room's done operations into annotations.
 *
 *  Unlike `replayLayerState`, this always starts from empty and always folds
 *  the *entire* done log, never a snapshot base plus a tail. That is not an
 *  oversight — it is what the server's own coverage rule allows. A snapshot
 *  covers pixels and the stored `layerState` covers structure; annotations are
 *  neither, so `isCoveredBySnapshot` never withholds one and every joining
 *  client is sent all of them however old the room is. Folding from empty is
 *  therefore both correct and the only form that cannot double-apply. */
export function replayAnnotations(ops: readonly Operation[]): AnnotationState {
  let state = makeInitialAnnotationState()
  for (const op of ops) state = applyAnnotationOp(state, op)
  return state
}

/** Ramer–Douglas–Peucker: drops points that lie within `tolerance` of the
 *  line their neighbours already describe.
 *
 *  Ink is simplified before it is recorded, and the reason is that a raw
 *  pointer stream is sampled in *screen* pixels while an annotation is stored
 *  in *canvas* ones. Scribble across the paper at low zoom and a hand-sized
 *  gesture is thousands of points spread over thousands of canvas units — the
 *  same "one gesture, unbounded payload" that made strokes need `dabsPacked`
 *  (#366). Here the fix is cheaper than an encoding, because unlike a stroke's
 *  dabs (each carrying pressure, tilt and opacity that must replay exactly) an
 *  annotation's points are just a path, and a path that deviates by less than
 *  its own line width is the same path. */
export function simplifyPoints(points: readonly number[], tolerance: number): number[] {
  const count = points.length >> 1
  if (count < 3) return [...points]

  const keep = new Uint8Array(count)
  keep[0] = 1
  keep[count - 1] = 1
  // Iterative rather than recursive: a long scribble is thousands of points,
  // and the recursion depth of the naive form is bounded only by that count.
  const stack: Array<[number, number]> = [[0, count - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()!
    if (last <= first + 1) continue
    const ax = points[first * 2], ay = points[first * 2 + 1]
    const bx = points[last * 2], by = points[last * 2 + 1]
    const dx = bx - ax, dy = by - ay
    const lengthSq = dx * dx + dy * dy
    let worst = -1
    let worstIndex = first
    for (let i = first + 1; i < last; i++) {
      const px = points[i * 2], py = points[i * 2 + 1]
      // Distance from the point to the segment a→b. When a and b coincide (a
      // gesture that came back to where it started) the segment is a point and
      // the distance to it is the plain one.
      let distSq: number
      if (lengthSq === 0) {
        distSq = (px - ax) ** 2 + (py - ay) ** 2
      } else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq))
        distSq = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2
      }
      if (distSq > worst) { worst = distSq; worstIndex = i }
    }
    if (worst > tolerance * tolerance) {
      keep[worstIndex] = 1
      stack.push([first, worstIndex], [worstIndex, last])
    }
  }

  const out: number[] = []
  for (let i = 0; i < count; i++) {
    if (keep[i]) out.push(points[i * 2], points[i * 2 + 1])
  }
  return out
}

/** Simplification plus the hard ceiling behind it (`MAX_ANNOTATION_INK_POINTS`).
 *
 *  The ceiling is applied by dropping every nth point rather than by truncating
 *  the tail: a scribble that hits the limit should lose detail evenly, not lose
 *  its second half. It should be unreachable in practice — simplification
 *  already collapses ordinary gestures by an order of magnitude — and exists so
 *  that "unreachable" is a property of the code rather than of the user's
 *  patience. */
export function prepareInkPoints(points: readonly number[], tolerance: number): number[] {
  const simplified = simplifyPoints(points, tolerance)
  const count = simplified.length >> 1
  if (count <= MAX_ANNOTATION_INK_POINTS) return simplified
  const stride = Math.ceil(count / MAX_ANNOTATION_INK_POINTS)
  const out: number[] = []
  for (let i = 0; i < count; i += stride) out.push(simplified[i * 2], simplified[i * 2 + 1])
  // The last point is what makes the path end where the finger lifted; keep it
  // whatever the stride landed on — but never by going one over the ceiling
  // this function exists to enforce. When the strided walk already filled it,
  // the last sample gives up its place rather than being appended after it.
  const lastX = simplified[(count - 1) * 2], lastY = simplified[(count - 1) * 2 + 1]
  if (out[out.length - 2] !== lastX || out[out.length - 1] !== lastY) {
    if ((out.length >> 1) >= MAX_ANNOTATION_INK_POINTS) out.length -= 2
    out.push(lastX, lastY)
  }
  return out
}

/** The SVG `points`/`d` payload for one ink annotation. Kept next to the fold
 *  rather than in the overlay component so it is unit-testable without a DOM. */
export function inkPathData(points: readonly number[]): string {
  if (points.length < 4) {
    // A tap with the pen tool is a dot, and a one-point polyline draws nothing
    // at all in SVG. Emitting a zero-length segment gives `stroke-linecap:
    // round` something to cap, which is exactly the dot the user drew.
    if (points.length < 2) return ''
    return `M ${points[0]} ${points[1]} L ${points[0]} ${points[1]}`
  }
  let d = `M ${points[0]} ${points[1]}`
  for (let i = 2; i < points.length; i += 2) d += ` L ${points[i]} ${points[i + 1]}`
  return d
}

/** Whether a shape is worth recording at all — an empty note or an ink gesture
 *  with no points is a cancelled action, not an annotation. */
export function isMeaningfulShape(shape: AnnotationShape): boolean {
  return shape.kind === 'text' ? shape.text.trim().length > 0 : shape.points.length >= 2
}
