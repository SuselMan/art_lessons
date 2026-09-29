import type { OperationBase } from './operationBase.js'

/** (#613) The operations that change layer structure or a whole layer:
 *  add, delete, move, merge, duplicate, locks, opacity, transforms. */

/** Inserts a new raster layer directly above whichever layer its author had
 *  selected (#378) — the same `(parentId, index)` delta `layer_move` uses, and
 *  for the same reason it is carried in the operation rather than derived:
 *  `activeId` is per-user view state that never enters the log, so replay on
 *  anyone else's client has nothing to work out a position from. Resolving it
 *  at emission is also what makes concurrent adds behave, exactly like
 *  `layer_delete` resolving folder children up front.
 *
 *  Both fields optional, and absent means "top of rootOrder": that is where
 *  every layer went before this existed, so operations already in the log
 *  replay unchanged. */
export type LayerAddOperation = OperationBase & {
  type: 'layer_add'
  layerId: string
  name: string
  parentId?: string | null // folder id, or null/absent for root
  index?: number           // position within the target container, top→bottom
}

/** Imports a reference image onto a layer (#88) — always targets a layer
 *  created by a `layer_add` dispatched just before it, never an existing
 *  one, so this never needs to account for content already on the layer.
 *  `image` is a data URL, embedded directly in the op rather than uploaded
 *  and referenced by URL — there's no object storage yet (#114 tracks
 *  adding one later; Postgres bytea/JSONB is the accepted MVP tradeoff for
 *  binary content, see #110). `width`/`height` are the image's own natural
 *  size, needed to fit-center it within the canvas without redecoding. */
export type ImageImportOperation = OperationBase & {
  type: 'image_import'
  layerId: string
  image: string
  width: number
  height: number
  // World-space top-left placement (infinite canvas only, #133 follow-on).
  // Omitted entirely by fixed-canvas rooms — when absent, the engine's image blit's
  // existing fit-center-within-the-fixed-canvas behavior is unchanged, so
  // every already-recorded op (which never had x/y) keeps replaying exactly
  // as before. Infinite-mode imports always set both.
  x?: number
  y?: number
}

/** Inserts a new empty folder above the active item's own row (#378), by the
 *  same rule and for the same reasons as `LayerAddOperation` above.
 *
 *  (#410) `parentId` is the counterpart this used to lack on purpose, back
 *  when folders were one level deep and a folder's position could only ever be
 *  an index into `rootOrder`. Folders nest now, so a folder is placed by the
 *  same (container, index) pair as anything else. Absent or null means root —
 *  which is where every folder went before nesting existed, so `folder_add`
 *  operations already in the log replay exactly as they did. Absent `index`
 *  means the top. */
export type FolderAddOperation = OperationBase & {
  type: 'folder_add'
  layerId: string
  name: string
  parentId?: string | null // folder id, or null/absent for root
  index?: number
}

export type LayerDeleteOperation = OperationBase & {
  type: 'layer_delete'
  layerIds: string[]    // targets plus their folder children, resolved at emission
}

/** Delta move: relocate one item to (parentId, index). A full-order list would
 *  let one user's later reorder silently swallow another's undo (ADR 002 §2).
 *
 *  (#410) `parentId` may now name a folder even when the moving item is itself
 *  a folder. The one structural refusal left is a loop — a folder moved into
 *  its own descendant — and it is enforced in `applyMove`, i.e. on replay,
 *  not only where the gesture is made. */
export type LayerMoveOperation = OperationBase & {
  type: 'layer_move'
  /** Pre-#413 single-target form, still in recorded logs. Read both through
   *  `operationLayerIds`. */
  layerId?: string
  /** (#413) The items to relocate, inserted as one contiguous run in this
   *  order. One operation rather than one per item: a group move is one undo,
   *  and other participants see one change instead of watching a selection
   *  disassemble and reassemble itself.
   *
   *  A single `(parentId, index)` is enough for any legal group only because
   *  folders nest (#410) — before that, a set mixing folders and layers had no
   *  single container that could hold all of it. */
  layerIds?: string[]
  parentId: string | null // folder id, or null for root
  index: number           // position within the target container, top→bottom
}

/** (#412) Applies one opacity to any number of layers at once.
 *
 *  Plural rather than N separate operations for the reason `layer_transform`
 *  and `layer_delete` are already plural: one operation is one undo. N
 *  operations would make Ctrl+Z take a mass change apart layer by layer, and
 *  would let every other participant in the room watch it happen in pieces.
 *
 *  `layerId` is the pre-#412 single-target form. It is still in the recorded
 *  logs of every live room, so it stays readable forever; new operations only
 *  ever write `layerIds`. Read both through `operationLayerIds` rather than
 *  touching either field directly. */
export type LayerOpacityOperation = OperationBase & {
  type: 'layer_opacity'
  layerId?: string
  layerIds?: string[]
  opacity: number       // 0–1
}

/** (#412) Same plural shape and the same reasoning as `LayerOpacityOperation`
 *  above — including the legacy `layerId`, which recorded logs still carry. */
export type LayerVisibilityOperation = OperationBase & {
  type: 'layer_visibility'
  layerId?: string
  layerIds?: string[]
  visible: boolean
}

export type LayerRenameOperation = OperationBase & {
  type: 'layer_rename'
  layerId: string
  name: string
}

/** Owner-only (#254/#258): reserves (or releases) a layer for the room
 *  owner — the server rejects `stroke`/other layerId-bearing operations
 *  targeting a `locked: true` layer from anyone but the owner. Goes through
 *  the normal Operation Log/replay path like `layer_visibility`/
 *  `layer_opacity` (so every participant's `RasterLayer.ownerLocked`/
 *  `LayerFolder.ownerLocked` stays in sync via applyContentOp), but is also
 *  the one operation type the server itself inspects the content of — see
 *  rooms.ts's `lockedLayerIds` tracking and its own doc comment for why
 *  that's a deliberate, narrow exception to "server never renders/parses
 *  operation content" (CLAUDE.md). */
export type LayerOwnerLockOperation = OperationBase & {
  type: 'layer_owner_lock'
  layerId: string
  locked: boolean
}

/** (#488) The other lock: a shared guard anyone may set and anyone may take
 *  off, stopping paint from every hand including the room owner's. Where
 *  `layer_owner_lock` is a claim about *who* may draw, this is a claim that
 *  *nobody* should right now — the "don't touch this one while we work"
 *  everyone in the room can see and undo.
 *
 *  It needs no privilege to send — that is what "anyone may take it off"
 *  means — but the server does inspect it (#518): it mirrors the flag the
 *  same way it mirrors `layer_owner_lock`, and refuses painting operations
 *  aimed at a locked layer from everyone, the room owner included. Until then
 *  the lock was a client-side courtesy, which is a different feature: any tab
 *  running an older build, or a stale one, wrote through it into everyone
 *  else's canvas. It is a real operation rather than local view state for a
 *  related reason — the alternative was tried, and a lock outside the log
 *  cannot survive a reload, since a reload has no earlier state to carry it
 *  from.
 *
 *  Single `layerId` rather than the plural shape `layer_visibility` uses, and
 *  deliberately: the server refuses layerId-bearing operations aimed at an
 *  owner-locked layer, so naming one layer is what keeps a non-owner from
 *  unlocking what the owner reserved. A mass toggle sends one per layer. */
export type LayerLockOperation = OperationBase & {
  type: 'layer_lock'
  layerId: string
  locked: boolean
}

export type LayerClearOperation = OperationBase & {
  type: 'layer_clear'
  layerId: string
}

export type LayerMergeOperation = OperationBase & {
  type: 'layer_merge'
  layerId: string       // id of the new merged layer
  name: string
  // Bottom→top, with each source's effective opacity captured at merge time
  // so replay does not depend on later opacity changes.
  sources: Array<{ id: string; opacity: number }>
  parentId: string | null // where the merged layer lands
  index: number
}

/** (#449) Copies one layer — pixels and all — into a brand-new layer, leaving
 *  the source untouched.
 *
 *  Deliberately its own operation rather than `layer_add` + something: the copy
 *  carries the source's pixels, and nothing already in the log can express
 *  "these pixels, again, over there". Re-recording them as an `image_import`
 *  would mean rasterizing to a data URL at emission — lossy on an infinite
 *  canvas, which has no single raster to flatten to, and enormous on the wire
 *  for something the receiving client can reproduce from state it already has.
 *
 *  Shaped like `LayerMergeOperation` above and handled alongside it everywhere,
 *  because it is the same *kind* of thing: an operation carrying pixels **and**
 *  structure at once. That combination is what decides its treatment on the
 *  snapshot path — it is never withheld from a joining client the way a pure
 *  pixel op is (the client needs its structural half), so the client skips the
 *  pixel half itself against the coverage it restored. See `isCoveredBySnapshot`
 *  in the server's rooms.ts and `_isCoveredByRestore` in the engine.
 *
 *  `sourceOpacity` is captured at emission for the same reason a merge captures
 *  its sources': replay must not depend on an opacity the source picked up
 *  afterwards. Unlike a merge it is *not* applied to the pixels — it becomes
 *  the copy's own `opacity`, so the duplicate looks exactly like what was
 *  duplicated rather than baking transparency into ink.
 *
 *  Duplicating a folder is not this operation: it is a `folder_add` plus one of
 *  these per descendant layer, emitted together (see LayerPanel's
 *  `buildDuplicateOps`). A folder holds no pixels of its own, so there is
 *  nothing here for it to copy. */
export type LayerDuplicateOperation = OperationBase & {
  type: 'layer_duplicate'
  layerId: string        // id of the new copy
  sourceId: string       // layer being copied; stays alive
  name: string
  sourceOpacity: number  // 0–1, the source's own opacity at emission time
  sourceVisible: boolean
  parentId: string | null // where the copy lands
  index: number
}

/** 2x3 affine [a, b, c, d, tx, ty]: x' = a*x + c*y + tx, y' = b*x + d*y + ty.
 *  The only encoding a layer_transform had before #392. */
export type AffineMatrixTuple = [number, number, number, number, number, number]

/** 3x3 projective (homography), column-major to match the affine tuple's own
 *  column-major reading and gl.uniformMatrix3fv's required layout:
 *  [a, b, g, c, d, h, tx, ty, i] means
 *      x' = (a*x + c*y + tx) / (g*x + h*y + i)
 *      y' = (b*x + d*y + ty) / (g*x + h*y + i)
 *  An affine map is the case g = h = 0, i = 1 — which is exactly what
 *  toHomography() produces from the six-number form. */
export type HomographyMatrixTuple = [
  number, number, number,
  number, number, number,
  number, number, number,
]

/** What travels on the wire (#392). Six numbers is not legacy-and-deprecated
 *  — it stays the encoding every affine gizmo drag emits, because writing
 *  three constants into every log entry for the common case is pure waste.
 *  Nine numbers appears only when a Distort actually needs it.
 *
 *  Consumers never branch on the length: they call toHomography() once at
 *  the read boundary and work in 3x3 from there. That is what keeps a
 *  projective transform from becoming a second code path through undo,
 *  snapshots and the bake — mathematically an affine map *is* a homography,
 *  and the shader already multiplies by a mat3 either way. It is also why
 *  every operation log recorded before #392 (kept on purpose as a dataset,
 *  #375) stays readable forever with no migration. */
export type LayerTransformMatrix = AffineMatrixTuple | HomographyMatrixTuple

/** Widens the wire form to the 3x3 every consumer actually works in. */
export function toHomography(matrix: LayerTransformMatrix): HomographyMatrixTuple {
  if (matrix.length === 9) return matrix
  const [a, b, c, d, tx, ty] = matrix
  return [a, b, 0, c, d, 0, tx, ty, 1]
}

/** True when a homography has no projective part, i.e. it round-trips to the
 *  compact six-number form without loss. Emitters use it to keep affine drags
 *  on the affine encoding even while composing in 3x3; the epsilon is
 *  absolute because g and h are in units of 1/px, where anything at 1e-12 is
 *  accumulated float noise and not a perspective anyone drew. */
export function isAffineHomography(m: HomographyMatrixTuple): boolean {
  return Math.abs(m[2]) < 1e-12 && Math.abs(m[5]) < 1e-12 && Math.abs(m[8] - 1) < 1e-12
}

/** Narrows back to the compact form when there is no projective part to lose,
 *  so an ordinary move/scale/rotate still writes six numbers. Returns the
 *  nine-number form unchanged when it genuinely carries perspective. */
export function toWireMatrix(m: HomographyMatrixTuple): LayerTransformMatrix {
  return isAffineHomography(m) ? [m[0], m[1], m[3], m[4], m[6], m[7]] : m
}

/** Transforms (translate/scale/rotate/skew/distort) one or more layers' pixel
 *  content in place — one operation regardless of how many layers a gizmo
 *  moved together, so undo/redo flips them all atomically (a partial
 *  transform applied to some selected layers but not others would be a worse
 *  bug than a slightly bigger log entry — see #120 discussion). Background is
 *  never a legal target, same as other structural ops. */
export type LayerTransformOperation = OperationBase & {
  type: 'layer_transform'
  transforms: Array<{
    layerId: string
    matrix: LayerTransformMatrix
  }>
}
