import type { AnnotationAddOperation, AnnotationDeleteOperation, AnnotationUpdateOperation } from './annotations.js'
import type {
  AreaClearOperation, AreaFillOperation, AreaPasteOperation, AreaTransformOperation,
} from './areaOperations.js'
import type { LayerFilterOperation } from './layerFilters.js'
import type {
  FolderAddOperation, ImageImportOperation, LayerAddOperation, LayerClearOperation, LayerDeleteOperation,
  LayerDuplicateOperation, LayerLockOperation, LayerMergeOperation, LayerMoveOperation, LayerOpacityOperation,
  LayerOwnerLockOperation, LayerRenameOperation, LayerTransformOperation, LayerVisibilityOperation,
} from './layerOperations.js'
import type { OperationBase } from './operationBase.js'
import type { ShapeOperation } from './shapes.js'
import type { StrokeOperation } from './stroke.js'

// Operations (drawing actions — serializable, replayable).
// The room's append-only operation log is the source of truth; layer pixel
// buffers and LayerState are derived by replaying it (ADR 002).
//
// (#613) The union of every operation, the meta operations that act on other
// entries (revoke, undo, redo), and the helpers that read the union.

/** Teacher-only: marks the target operation `gone` for everyone. Not an undo —
 *  it bypasses the author's history and cannot be redone (ADR 002 §6). */
export type OperationRevokeOperation = OperationBase & {
  type: 'operation_revoke'
  targetOpId: string
}

/** A user's own undo, broadcast so every participant sees it — not just the
 *  author (#103). `targetOpId` is the specific entry to flip done → undone,
 *  decided once by the author's own client (the latest done op of theirs
 *  that isn't itself an operation_revoke/undo/redo); every replica applies
 *  the exact same id, so there's nothing to reconcile. Self-scoped like
 *  `undo`/`redo` already are: only the operation's own author's ops are
 *  ever legal targets (see `OperationLog.applyUndo`) — unlike
 *  `operation_revoke`, this is reversible via `OperationRedoOperation` and
 *  needs no owner privilege. */
export type OperationUndoOperation = OperationBase & {
  type: 'operation_undo'
  targetOpId: string
}

/** Symmetric with `OperationUndoOperation`: flips a specific undone entry
 *  back to done. */
export type OperationRedoOperation = OperationBase & {
  type: 'operation_redo'
  targetOpId: string
}

/** (#536, ADR 011 §17.48) "Высушить всё" - the watercolour paper is dry, for
 *  everyone in the room, from this point in the log on. The whole sheet, not
 *  a layer: the teacher presses it to KNOW that what a student lays next goes
 *  onto dry paper, which a per-client button could not promise.
 *
 *  It carries nothing, and changes no pixel. Its whole effect is on the
 *  ephemeral wetness every client keeps (and on which wash the next stroke
 *  may join); the strokes after it record the dry paper they met in their own
 *  `wet` profile, so a replay would reproduce the picture even without it.
 *  What it adds is the part a replay does not see: the sheen on every screen,
 *  and the paper the next live stroke of each participant lands on.
 *
 *  Not undoable (there is no "wet it again"). Retained as an ordered
 *  historical barrier for foreign-water replay after the live paper dries. */
export type PaperDryOperation = OperationBase & {
  type: 'paper_dry'
}

/** (#536) How long live watercolour water stays on the paper, in ms.
 *  Historical paper_dry markers remain replay barriers after this window. */
export const WATERCOLOR_WET_DRY_MS = 120000

export type Operation =
  | StrokeOperation
  | LayerAddOperation
  | ImageImportOperation
  | FolderAddOperation
  | LayerDeleteOperation
  | LayerMoveOperation
  | LayerOpacityOperation
  | LayerVisibilityOperation
  | LayerRenameOperation
  | LayerOwnerLockOperation
  | LayerLockOperation
  | LayerClearOperation
  | LayerMergeOperation
  | LayerDuplicateOperation
  | LayerTransformOperation
  | AreaTransformOperation
  | AreaClearOperation
  | AreaPasteOperation
  | AreaFillOperation
  | ShapeOperation
  | LayerFilterOperation
  | OperationRevokeOperation
  | OperationUndoOperation
  | OperationRedoOperation
  | AnnotationAddOperation
  | AnnotationUpdateOperation
  | AnnotationDeleteOperation
  | PaperDryOperation

/** (#518) The layers whose *pixels* `op` changes — the only question a lock
 *  needs answered.
 *
 *  Exists because the lock used to be enforced in exactly one place: the gate
 *  on starting a stroke (`engine.setLocked`, see the Room page). Everything
 *  that paints without going through the pointer pipeline — the transform
 *  gizmo, the bucket, delete/cut/paste of a selection — walked straight past
 *  it and rewrote a locked layer. Enumerating the painting operations *here*,
 *  once, in the package both sides import, is what makes that class of hole
 *  closable rather than a list of five call sites somebody has to remember to
 *  extend.
 *
 *  The default is the strict one: a new operation type is refused on a locked
 *  layer only if it is named below, so the failure mode of forgetting to add
 *  one is a lock that leaks — which is why this returns the honest answer for
 *  every type rather than a policy. What is *exempt* is decided by the callers
 *  and stated there.
 *
 *  Deliberately not `operationLayerIds`: that reads two fields on the
 *  structural shape (`layerId`/`layerIds`) and cannot see `layer_transform`'s
 *  per-layer `transforms` list at all — which is precisely how a transform of
 *  an owner-locked layer got past the server for as long as it did (see
 *  rooms.ts's `ownerLockedTargets`). */
export function paintedLayerIds(op: OperationDraft): string[] {
  switch (op.type) {
    case 'stroke':
    case 'image_import':
    case 'layer_clear':
    case 'area_transform':
    case 'area_clear':
    case 'area_paste':
    case 'area_fill':
    // (#525) A shape paints one layer and nothing else, so it belongs here
    // from the first line of its existence — a painting operation missing
    // from this list is a layer lock that silently leaks (#518).
    case 'shape':
    // (#574) A filter rewrites every pixel of its one layer.
    case 'layer_filter':
      return [op.layerId]
    case 'layer_transform':
      return op.transforms.map(t => t.layerId)
    // A merge writes its pixels into a layer it creates in the same breath
    // (`layerId` is the *new* layer — see LayerMergeOperation), and a
    // duplicate likewise. Neither can paint into a layer that already exists,
    // so neither is a lock question.
    default:
      return []
  }
}

/** An operation as constructed at the emission site, before identity and
 *  ordering fields are stamped on. Distributes over the union. */
export type OperationDraft = Operation extends infer O
  ? O extends Operation ? Omit<O, 'id' | 'userId' | 'timestamp' | 'seq'> : never
  : never
