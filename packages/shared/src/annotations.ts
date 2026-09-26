import type { OperationBase } from './operationBase.js'

// ── Annotations (#508, эпик #87) ──────────────────────────────────────────
//
// An annotation is a remark laid *over* the drawing: a teacher circling a
// wrong proportion, a note pinned next to a hand that needs redrawing. It is
// permanent — it must survive a reload and be there at the next join, or it is
// useless for homework — but it is deliberately NOT part of the picture:
//
//   - it never enters a layer's pixel buffer, so no snapshot ever bakes it and
//     no `layer_clear`/`layer_merge` can take it with them;
//   - it is drawn by an SVG/DOM overlay riding `canvasWrap`'s own viewport
//     transform (the GridOverlay/RulerOverlay/PeerCursors pattern), which is
//     what lets a reader hide every annotation locally with a flag instead of
//     a `layer_visibility` operation that would blank them for the whole room;
//   - it is excluded from export and from the room thumbnail (decision, Ilya
//     26.08) — those bake the composite, and an annotation is not the drawing.
//
// The consequences of that choice are worth naming, because each one removed a
// problem rather than deferring it: an overlay knows nothing about pressure,
// so a finger can draw one with no pressure to emulate; text stays text, so it
// is editable and sharp at any zoom, and no font has to rasterize identically
// across devices to keep the room in sync (see .claude/rules.md's cross-device
// determinism rule — this design sidesteps it entirely instead of obeying it).
//
// Colour is a hex string here and `[r,g,b]` floats on a StrokeOperation. Not
// an inconsistency: a stroke's colour is handed to WebGL, an annotation's is
// handed to SVG, and each is written in the form its renderer actually takes.

export const ANNOTATION_KINDS = ['text', 'ink'] as const
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number]

/** What an annotation *is*, without the identity the log already carries.
 *  Coordinates are canvas/world space, exactly like `AreaFillOperation`'s —
 *  the overlay rides the same transform as the canvas, so an annotation stays
 *  glued to the paper through pan/zoom/rotate rather than floating in screen
 *  space.
 *
 *  `size` means two different things, and the split is deliberate rather than
 *  sloppy — it follows what each of the two is:
 *
 *   - **ink** is a mark *on* the paper, so its width is in canvas units and it
 *     grows and shrinks with the drawing, like every stroke does;
 *   - **text** is a pin stuck in the paper with a note attached, so its size is
 *     in *screen* pixels and stays legible at any zoom. The point it is pinned
 *     to is world space; the note hanging off it is interface. A remark you
 *     cannot read when you zoom out to look at the whole picture is useless at
 *     exactly the moment you want it, which is what canvas-unit text gave. */
export type AnnotationShape =
  | { kind: 'text'; x: number; y: number; color: string; size: number; text: string }
  /** `points` is flat `[x0, y0, x1, y1, …]` rather than `{x, y}[]`: an ink
   *  annotation is recorded once and read forever, and the flat form is a
   *  little over half the JSON of the object form for the same numbers. */
  | { kind: 'ink'; color: string; size: number; points: number[] }

/** An annotation as it exists after folding the log: its shape plus the two
 *  identity fields taken from the operation that created it. `authorId` is
 *  stamped at fold time rather than carried on the wire — the operation
 *  already says who sent it, and a second copy is a second thing that can
 *  disagree. */
export type Annotation = AnnotationShape & { id: string; authorId: string }

/** Ceilings on what one annotation may carry. Both are enforced where the
 *  operation is built, not on replay: an operation already in the log is
 *  permanent and must keep replaying whatever it says, so a limit that
 *  rejected on replay would be a way to make an old room stop loading. */
export const MAX_ANNOTATION_TEXT_LENGTH = 500
/** Ink is simplified (RDP) before it is recorded; this is the backstop for a
 *  gesture that survives simplification anyway — a very long scribble at very
 *  low zoom. Points, not coordinates: the flat array holds twice this. */
export const MAX_ANNOTATION_INK_POINTS = 2000

export const DEFAULT_ANNOTATION_COLOR = '#e5484d'
/** Screen pixels — see AnnotationShape on why text is measured differently
 *  from ink. Sized like the interface's own body text, because that is what a
 *  remark is: a sentence, not a heading. */
export const DEFAULT_ANNOTATION_TEXT_SIZE = 13
export const DEFAULT_ANNOTATION_INK_WIDTH = 8

/** Creates one annotation. `annotationId` is the annotation's own id, distinct
 *  from the operation's: `annotation_update` and `annotation_delete` target the
 *  annotation, and an operation id would tie them to the act of creating it. */
export type AnnotationAddOperation = OperationBase & {
  type: 'annotation_add'
  annotationId: string
  shape: AnnotationShape
}

/** Edits an existing annotation in place — fixing a typo, dragging a note to a
 *  better spot, recolouring it.
 *
 *  A third operation type rather than delete+add, and the reason is undo: a
 *  typo corrected by delete+add is two entries on the stack, so one Ctrl+Z
 *  leaves the annotation deleted and the user pressing it again to get back to
 *  where they started. The Operation Log is permanent, so this is the kind of
 *  economy that cannot be corrected later.
 *
 *  Fields absent from the patch are left as they were. A field that does not
 *  belong to the target's kind (`text` on an ink annotation) is ignored on
 *  replay rather than rejected — see `applyAnnotationOp`. */
export type AnnotationPatch = {
  x?: number
  y?: number
  color?: string
  size?: number
  text?: string
  points?: number[]
}

export type AnnotationUpdateOperation = OperationBase & {
  type: 'annotation_update'
  annotationId: string
  patch: AnnotationPatch
}

/** Plural for the same reason `layer_delete` is: clearing several remarks at
 *  once is one action and must be one undo. */
export type AnnotationDeleteOperation = OperationBase & {
  type: 'annotation_delete'
  annotationIds: string[]
}

/** The three types as data, for the server-side lists that decide what stays
 *  resident and what a snapshot covers. Exported from `shared` rather than
 *  written out on the server so the two cannot drift: an annotation type
 *  missing from the server's coverage rule is not a compile error, it is
 *  annotations silently disappearing from old rooms. */
export const ANNOTATION_OP_TYPES = ['annotation_add', 'annotation_update', 'annotation_delete'] as const

export type AnnotationOperation =
  | AnnotationAddOperation
  | AnnotationUpdateOperation
  | AnnotationDeleteOperation

export function isAnnotationOperation(op: { type: string }): op is AnnotationOperation {
  return (ANNOTATION_OP_TYPES as readonly string[]).includes(op.type)
}
