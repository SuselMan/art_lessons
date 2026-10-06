import type { Prisma } from '@prisma/client'

import type { Operation } from '@grafetto/shared'
import { ANNOTATION_OP_TYPES, isAnnotationOperation } from '@grafetto/shared'

/** (#612) What stored state already accounts for: which operations a layer's
 *  snapshot pixels or the room's stored layerState stand in for, and so which
 *  ones a joining client is not sent, RAM does not keep, and a fork does not
 *  copy. Pure — no Prisma client, no room record — so the one rule those three
 *  callers share has one home they all import, rather than living inside the
 *  module that owns rooms. Moved out of rooms.ts. */

/** The operations stored pixels account for, i.e. the ones deletion may
 *  eventually consider (#372). Pure function, exported for tests and for
 *  whatever re-enables pruning: the point is that "what a snapshot covers"
 *  has exactly one definition.
 *
 *  Callers must still satisfy the two conditions in
 *  rooms.ts's `pruneOperationsBeforeSnapshot` comment before deleting anything. */
export function deletableOperations(
  coveredSeqByLayer: ReadonlyMap<string, number>, operations: readonly Operation[],
  layerStateSeq: number | null = null, layerStateIds: ReadonlySet<string> | null = null,
): Operation[] {
  return operations.filter(op => isCoveredBySnapshot(coveredSeqByLayer, op, layerStateSeq, layerStateIds))
}

/** (#292) Operation types that must stay resident for a room's whole life,
 *  however old they are. `aliveIds`, `deletedIds` and `lockedLayerIds` are
 *  rebuilt by folding over `RoomRecord.operations`, so dropping any of these
 *  from the window would silently corrupt those mirrors: a `layer_add` older
 *  than the window would make its layer permanently undeletable
 *  (`target_gone` — the exact shape of #291's initial-layer bug), and a
 *  dropped `layer_owner_lock` would quietly unlock a layer on the next
 *  server restart. (#311) A dropped `layer_delete` would additionally lose a
 *  `deletedIds` entry — that one fails safe (back to accepting content on a
 *  dead layer, the pre-#311 behavior) rather than breaking drawing, but it's
 *  still a mirror this list exists to protect.
 *
 *  (#368) `operation_undo`/`_redo`/`_revoke` are here for the same reason one
 *  step removed: they don't create or destroy an id themselves, they decide
 *  whether the operation that did still counts. Dropping an undo below the
 *  window would resurrect the `layer_delete` it took back, so a room that had
 *  a deleted layer restored would come back from a restart with it deleted
 *  again — and every client that still shows it then diverges from the server
 *  about whether it may be drawn on.
 *
 *  All of them are a few hundred bytes each. The heavy types — `stroke` and
 *  `image_import`, which carry dab arrays and inline base64 image data — are
 *  deliberately absent: their pixels are exactly what a snapshot already
 *  contains, so below the snapshot they are pure weight. An undo *of* a
 *  stroke is kept even though the stroke itself isn't; it is a few hundred
 *  bytes, and telling the two apart would mean resolving every target before
 *  the query that fetches them.
 *
 *  Exported for anything outside this module that has to reproduce the
 *  resident window rather than guess at it — currently forkRoutes.ts (#317),
 *  which copies exactly what a cold load would consider resident. */
export const RESIDENT_OP_TYPES: readonly string[] = [
  'layer_add', 'folder_add', 'layer_delete', 'layer_merge', 'layer_duplicate', 'layer_owner_lock',
  'operation_undo', 'operation_redo', 'operation_revoke',
  // (#508) The annotation operations, and they are resident for a reason no
  // other entry here has: they are the only ones whose effect *nothing* else
  // stores. A layer's existence survives in the stored layerState and its
  // pixels in a snapshot, so those entries are resident to keep the server's
  // own mirrors honest; an annotation exists only as the operations that made
  // it. Drop one below the window and the remark is gone from the room for
  // good, with the log row still sitting in Postgres.
  ...ANNOTATION_OP_TYPES,
]

/** The ids a stored layerState still lists — see RoomRecord.layerStateIds.
 *  `null` when the stored value can't be read as a layerState at all.
 *
 *  Null rather than an empty set, and the distinction is the whole safety
 *  margin: an empty set says "every layer is gone", which withholds every
 *  operation in the room. This reads JSON a client wrote, so it has to assume
 *  it may one day read something else — and the only acceptable failure is the
 *  one that replays too much, never the one that replays too little. Same
 *  reasoning as #311's "an id the server never heard of is not treated as
 *  destroyed". */
export function layerStateIdsOf(state: unknown): Set<string> | null {
  if (typeof state !== 'object' || state === null) return null
  const items = (state as { items?: unknown }).items
  if (typeof items !== 'object' || items === null) return null
  return new Set(Object.keys(items))
}

/** (#372) The operations a layer's stored pixels can stand in for.
 *
 *  Deliberately only the *pure* pixel operations — ones that target a single
 *  layer and do nothing but paint it. Those are also the heavy ones (dab
 *  arrays, inline base64 images), so this is where all the saving is.
 *
 *  `layer_merge`, `layer_duplicate` and `layer_transform` paint too and are
 *  excluded on purpose. A merge is also a structural fact (it creates a layer
 *  and consumes its sources), a duplicate likewise (it creates one), and a
 *  transform can name several layers at once, so withholding any of them would
 *  take away something the client still needs. They are always sent, and the
 *  client skips re-applying their pixel half to a layer it has already restored
 *  past them, judged against the coverage it really has (#374).
 *
 *  (#446) The three selection operations *do* join the coverable list: each
 *  targets one layer and does nothing but paint it, which is the whole test
 *  above. `area_paste` carries an inline raster, so it is heavy in exactly the
 *  way this list exists for.
 *
 *  (#453) `area_fill` for both reasons at once: one layer, nothing but paint,
 *  and an inline raster the size of whatever was filled.
 *
 *  (#525) `shape` joins for the first reason only — one layer, nothing but
 *  paint. It is small on the wire (a recipe, not a raster), so nothing is
 *  saved by withholding it; it is here because a snapshot taken after it
 *  genuinely stands in for it, and leaving it out would make a room replay
 *  paint it a second time over pixels that already have it.
 *
 *  (#574) `layer_filter` for the same first reason, and it matters more here
 *  than anywhere: a filter reads the pixels it rewrites, so applying one a
 *  second time over a snapshot that already has it blurs the layer twice. */
const COVERABLE_OP_TYPES = [
  'stroke', 'image_import', 'layer_clear', 'area_transform', 'area_clear', 'area_paste', 'area_fill',
  'shape', 'layer_filter',
]

/** (#412) `'layerId' in op` used to be enough to narrow to a single-target
 *  operation. It stopped being: `layer_opacity`/`layer_visibility` still
 *  declare a `layerId`, now optional, so the test admits them and the field
 *  can be `undefined`. Narrowing by type instead says what was always meant —
 *  the three operations that carry pixels — and keeps the one list of them. */
type CoverableOperation = Extract<Operation, {
  type: 'stroke' | 'image_import' | 'layer_clear' | 'area_transform' | 'area_clear' | 'area_paste' | 'area_fill'
    | 'shape' | 'layer_filter'
}>

function isCoverableOp(op: Operation): op is CoverableOperation {
  return COVERABLE_OP_TYPES.includes(op.type)
}

/** Whether `op` is already accounted for by stored state, and so does not have
 *  to be replayed (#372).
 *
 *  Two kinds of stored state, because there are two kinds of thing an
 *  operation can leave behind:
 *
 *   - **pixels**, covered per layer by `coveredSeqByLayer`;
 *   - **structure** — which layers exist, their order, names, opacity,
 *     visibility — covered by the room's stored layerState at `layerStateSeq`.
 *
 *  The structural half was missing when this was first written, and it cost a
 *  live bug the same day (2026-07-31, room ksEMJOMy). Structural operations
 *  were declared uncoverable and therefore sent at any age, so a client that
 *  restored layerState at seq 3200 was then handed the `layer_merge` from seq
 *  314 and folded it in on top — re-inserting a layer the restored state
 *  already had. Ilya saw one layer listed twice, then three times, gaining a
 *  row per reload. Before this epic a single room-wide floor happened to
 *  withhold those; removing it for pixels left structure with no floor at all.
 *
 *  A `layer_merge`, `layer_duplicate` or `layer_transform` needs *both*: they carry structure (or
 *  several layers at once) and pixels, so either half still outstanding means
 *  the operation has to be replayed. That is the asymmetry worth keeping in
 *  view — "covered" is a claim about everything an operation did, not about
 *  its type.
 *
 *  This is the one rule three callers share — what stays in RAM, what a
 *  joining client is sent, and what a fork copies (forkRoutes.ts) — precisely
 *  because letting them drift is the shape of the bug the epic exists to
 *  fix.
 *
 *  (#536, §17.61) `targetOf` resolves what an undo, redo or revoke points at.
 *  Such an operation does what its target did, in reverse, so it is covered
 *  exactly when its target *at the undo's own seq* would be: an undo of a
 *  stroke needs that stroke's layer pixels to have reached it, not merely the
 *  stored structure. Judged by structure alone, a layer with no pixel snapshot
 *  — every watercolour layer whose bake was refused mid-wash — sent a joining
 *  client the stroke and withheld its undo, so the undone stroke came back.
 *  Without `targetOf`, or with a target no longer held, it falls back to that
 *  structural reading. */
export function isCoveredBySnapshot(
  coveredSeqByLayer: ReadonlyMap<string, number>, op: Operation,
  layerStateSeq: number | null = null, layerStateIds: ReadonlySet<string> | null = null,
  now: number = Date.now(),
  targetOf?: (opId: string) => Operation | undefined,
): boolean {
  const seq = op.seq ?? 0
  if (op.type === 'operation_undo' || op.type === 'operation_redo' || op.type === 'operation_revoke') {
    const target = targetOf?.(op.targetOpId)
    if (target) return isCoveredBySnapshot(coveredSeqByLayer, { ...target, seq }, layerStateSeq, layerStateIds, now)
  }
  const structureCovered = layerStateSeq !== null && seq <= layerStateSeq
  // A layer the stored structure no longer lists is gone, and a gone layer
  // needs no pixels: nothing displays it. Only meaningful for an operation the
  // structure already accounts for — above that seq, "not listed" means
  // "created since", which is the opposite conclusion.
  const pixelsCovered = (layerId: string): boolean =>
    seq <= (coveredSeqByLayer.get(layerId) ?? 0)
    || (structureCovered && layerStateIds !== null && !layerStateIds.has(layerId))

  if (isCoverableOp(op)) return pixelsCovered(op.layerId)
  if (op.type === 'layer_merge') return structureCovered && pixelsCovered(op.layerId)
  // (#449) Judged on the *copy*, never on the source: the source is unchanged
  // by having been copied, and its own coverage says nothing about whether the
  // copy's pixels made it into a snapshot.
  if (op.type === 'layer_duplicate') return structureCovered && pixelsCovered(op.layerId)
  if (op.type === 'layer_transform') return structureCovered && op.transforms.every(t => pixelsCovered(t.layerId))
  // (#508) Annotations are covered by nothing, ever. This is the one branch
  // that had to be written rather than inherited, and the fall-through below
  // would have been silently wrong: it reads "covered once the stored
  // layerState is newer than this operation", and a layerState knows only
  // about layers. An annotation is not in it, is not in any pixel snapshot,
  // and is not derivable from either — so treating it as covered would
  // withhold it from every joining client and trim it out of RAM the moment
  // the room stored a layerState past its seq. The remark would vanish from
  // the room while its row sat in Postgres, which is the exact shape of the
  // 2026-07-31 duplicate-layer bug described above, with the sign flipped.
  if (isAnnotationOperation(op)) return false
  // A paper-dry marker is also a historical physical barrier. Foreign-water
  // replay asks which donors were wet at each recorded stroke timestamp, not
  // at wall-clock now. Dropping an old marker re-imports water across Dry on
  // a cold load even though the present-day wet overlay would be empty.
  // Neither pixels nor structure encode this ordered boundary.
  if (op.type === 'paper_dry') return false
  // Everything else leaves structure and nothing else behind: layer_add,
  // folder_add, layer_delete, layer_move, layer_rename, layer_opacity,
  // layer_visibility, layer_owner_lock — and the meta operations, whose whole
  // effect is on entries the stored layerState already reflects.
  return structureCovered
}

/** (#418) The Postgres-side half of that window, as a `where` any caller can
 *  hand to Prisma. Exported because the fork route needs the same question
 *  asked of the same table, and it used to ask its own way — reading the
 *  whole log and filtering in JS, which is how one student pressing "take
 *  this into work" on a 22 000-operation lesson OOM-killed the server for
 *  everybody in it.
 *
 *  Deliberately a *superset* of `isCoveredBySnapshot`: it can only speak in
 *  `type`/`layerId`/`seq`, the three indexed columns, so it excludes the bulk
 *  — strokes and imports whose pixels a snapshot already holds — and leaves
 *  the finer judgements (structure covered by a stored layerState, a layer
 *  that no longer exists) to the JS rule running over what comes back. A
 *  caller wanting the exact window applies both; a caller wanting only to not
 *  read 400 MB needs just this one. */
export function residentOperationWhere(
  roomId: string, coveredSeqByLayer: ReadonlyMap<string, number>,
): Prisma.OperationWhereInput {
  const covered = [...coveredSeqByLayer].map(([layerId, seq]) => ({ layerId, seq: { lte: seq } }))
  if (covered.length === 0) return { roomId }
  return { roomId, NOT: { type: { in: COVERABLE_OP_TYPES }, OR: covered } }
}
