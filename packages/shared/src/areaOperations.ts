import type { LayerTransformMatrix } from './layerOperations.js'
import type { OperationBase } from './operationBase.js'

/** (#613) Operations on a region of one layer: the selection's transform,
 *  clear and paste (#446), and the fill (#453). */

/** (#446) A closed polygon in the same space layer pixels live in — canvas
 *  pixels for a bounded room, world units for an infinite one, exactly what
 *  `Dab.x/y` and `LayerTransformOperation.matrix` already use. Flat
 *  `[x0, y0, x1, y1, ...]` rather than `Array<{x, y}>` because a freehand
 *  lasso records a point per pointer sample and this rides in the permanent
 *  operation log: the flat form is ~2.5x smaller as JSON and needs no
 *  decoding on the replay path.
 *
 *  One polygon, not a list of them: a v1 selection is a single region, and
 *  add/subtract (which is what would need several sub-paths, with a fill rule
 *  to go with them) is deliberately out of scope. The three ways to draw one
 *  — rectangle, point-by-point lasso, freehand lasso — differ only in how the
 *  UI collects the points, and a rectangle is simply its four corners; none
 *  of them reaches the wire as its own kind, which is why nothing downstream
 *  branches on how a selection was made.
 *
 *  The closing edge is implicit (last point back to first) and self-
 *  intersection is legal — the rasterizer fills by nonzero winding, so a
 *  lasso that crosses itself has a defined result rather than a rejected one.
 *
 *  Note the space: these are *layer* coordinates, never screen ones. The
 *  viewport is per-user local state (CLAUDE.md), so a selection recorded in
 *  screen pixels would land somewhere else on every other participant's
 *  canvas. */
export type SelectionShape = {
  points: number[]
}

/** (#446) The three operations a selection can produce. All three are pure,
 *  single-layer pixel operations — they paint one layer and leave structure
 *  untouched — which is what lets them join `stroke`/`image_import`/
 *  `layer_clear` as snapshot-*coverable* on the server (rooms.ts's
 *  COVERABLE_OP_TYPES), unlike `layer_transform`, which names several layers
 *  at once and therefore can never be withheld from a joining client.
 *
 *  Single-layer is a decision, not an omission. `layer_transform` moves whole
 *  layers and a gizmo can hold several of them at once; a *selection* is a
 *  region drawn on the drawing in front of you, and the drawing in front of
 *  you is the active layer. Multi-layer would need the plural-with-atomic-
 *  undo shape `layer_transform` has (see its docstring) and buys a case
 *  nobody asked for; if it is ever wanted, it arrives the way #412/#413 added
 *  plurals elsewhere — additively, without invalidating a single operation
 *  already in the log.
 *
 *  Moves the pixels inside `selection` — and only those — through `matrix`,
 *  in place on one layer. The region is lifted (the source pixels are erased
 *  from the layer) and stamped down transformed, i.e. a move leaves a hole,
 *  which is what "move this piece of my drawing" means everywhere else. To
 *  keep a copy, the UI copies first and pastes; that is `area_paste`, not a
 *  flag here. */
export type AreaTransformOperation = OperationBase & {
  type: 'area_transform'
  layerId: string
  selection: SelectionShape
  matrix: LayerTransformMatrix
}

/** (#446) Erases everything inside `selection` on one layer — what both
 *  "delete" and the erase half of "cut" emit. `layer_clear` with a mask, and
 *  deliberately a separate type rather than an optional field on it: a
 *  `layer_clear` carrying an ignored `selection` would still wipe the whole
 *  layer on any client built before this existed, and the operation log is
 *  permanent. */
export type AreaClearOperation = OperationBase & {
  type: 'area_clear'
  layerId: string
  selection: SelectionShape
}

/** (#446) Stamps a raster onto an existing layer at a given world rect —
 *  what "paste" emits, including a paste onto a layer other than the one the
 *  pixels were copied from.
 *
 *  Carries the pixels rather than a reference to where they came from
 *  (source layer + mask + the seq it was copied at), which would be smaller
 *  and is the wrong shape: replay would resolve that reference against the
 *  source layer *as it stands at the paste's own position in the log*, so
 *  painting over the original after copying — or undoing the stroke it came
 *  from — would retroactively change what had already been pasted. Clipboard
 *  contents are a snapshot at copy time on every other tool that has one, and
 *  a snapshot is what a raster in the operation is.
 *
 *  Distinct from `image_import`, which is imposed on a freshly created layer
 *  and fit-centers within the canvas (see its docstring) — the invariant that
 *  it never lands on content that already exists is worth keeping, so paste
 *  gets its own type instead of widening it.
 *
 *  `image` is a PNG data URL with straight (un-premultiplied) alpha, the same
 *  encoding `image_import` uses and the same one `_blitImage` premultiplies
 *  on the way into a layer buffer. `x`/`y` are the world-space top-left
 *  corner and `width`/`height` the rect it covers — always the raster's own
 *  natural size.
 *
 *  `matrix` is where it was moved to before it was let go. A pasted piece
 *  floats above the layer until it is dropped (ADR 008, "Плавающее
 *  выделение"), and whatever placing happened in between arrives here: one
 *  operation for the whole paste-place-drop gesture, rather than a paste
 *  followed by a transform of the region it landed in.
 *
 *  That second form would be wrong as well as clumsy. A transform lifts
 *  *everything* inside its mask, and by then that includes whatever was
 *  already under the pasted piece — which is exactly the bug the floating
 *  model exists to remove (Ilya, 13.08: "двигаться начинает и тот что
 *  вставился и тот что я изначально выделил").
 *
 *  Absent means identity — what a paste dropped where it landed writes.
 *  Applied about the world origin like `layer_transform`'s own matrix; the
 *  rect is not a second coordinate system, it is where the raster sits before
 *  the matrix acts. */
export type AreaPasteOperation = OperationBase & {
  type: 'area_paste'
  layerId: string
  image: string
  x: number
  y: number
  width: number
  height: number
  matrix?: LayerTransformMatrix
}

/** (#453) Which pixels the fill reads its boundaries from. `visible` is the
 *  composite of every visible layer — the lineart-above/colour-below case that
 *  is most of what a bucket is for — and `layer` is the target layer alone.
 *  Paint lands in the target layer either way; this only chooses what counts
 *  as a wall.
 *
 *  Ordered as the settings UI shows them, `visible` first because it is the
 *  default. */
export const FILL_SOURCES = ['visible', 'layer'] as const

export type FillSourceMode = (typeof FILL_SOURCES)[number]

/** (#453) What the fill tool records: the region it worked out, as pixels.
 *
 *  Same raster-in-a-world-rect shape as `area_paste` above, and painted by the
 *  same code — a fill *is* a stamp of a raster onto a layer. `image` is a PNG
 *  data URL with straight alpha whose RGB is the fill colour flat across the
 *  whole rect and whose alpha is the coverage mask; `x`/`y`/`width`/`height`
 *  place it, always at the raster's natural size (a fill is never resampled —
 *  it is computed at the pixels it lands on).
 *
 *  **Why the result and not the recipe.** The obvious encoding is the one the
 *  user performed: seed point, tolerance, gap closing, and let every client
 *  flood-fill its own copy of the layer. That fails the cross-device
 *  determinism rule in `.claude/rules.md`, and fails it worse than most things
 *  do. A flood fill is a *threshold* over pixels that came off the GPU, and a
 *  threshold amplifies: two devices whose graphite agrees to a
 *  least-significant bit disagree about which side of `tolerance` one pixel of
 *  a pencil line sits on, and one pixel is the whole difference between a
 *  filled shape and a filled canvas. It would also put a full-domain readback
 *  and scan on the main thread of every participant replaying a room.
 *
 *  The freedom that buys is worth stating: because only the author ever runs
 *  the algorithm, the algorithm is not part of the contract. Tolerance, gap
 *  closing and the antialiased rim can be rewritten, or replaced with a
 *  perceptual metric, without versioning this operation or touching a single
 *  one already in the log. Compare `area_transform`, which ships a polygon
 *  every participant rasterizes and is therefore pinned to the byte.
 *
 *  **Why not `area_paste`.** Mechanically it would fit — and that is the
 *  point at which it stops being a good idea. The log is permanent and kept on
 *  purpose as a dataset (#375); a fill recorded as a paste is a fill nobody
 *  can ever find again. The parameters below carry it: nothing on the replay
 *  path reads them, they exist so the record says what happened.
 *
 *  A pure single-layer pixel operation like the three `area_*` ops next door,
 *  so a layer snapshot can stand in for it (`COVERABLE_OP_TYPES`). */
export type AreaFillOperation = OperationBase & {
  type: 'area_fill'
  layerId: string
  image: string
  x: number
  y: number
  width: number
  height: number
  /** Where the user tapped, in the same layer space as `Dab.x/y`. Replay
   *  ignores it, as it does every field below — see the docstring. */
  seedX: number
  seedY: number
  color: [number, number, number]
  tolerance: number
  gapClose: number
  expand: number
  source: FillSourceMode
}
