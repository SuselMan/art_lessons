import type { CanonicalStrokeOperation, Operation } from '@grafetto/shared'

/** Stored pixels are immutable, but their usability changes when later history
 * mutations alter an operation baked into them. This is a per-join selection;
 * it never changes the stored coverage or discards a blob. */
export interface SnapshotCandidate {
  layerId: string
  seq: number
  hash: string
}

export interface SnapshotReplayPlan {
  snapshots: SnapshotCandidate[]
  coverage: Map<string, number>
  historyLayers: Set<string>
  unresolvedTargets: Set<string>
  /** The uploaded structural tree predates a changed historical structure. */
  replayStructure?: true
}

const isHistoryChange = (op: Operation): op is Extract<Operation, {
  type: 'operation_undo' | 'operation_redo' | 'operation_revoke'
}> => op.type === 'operation_undo' || op.type === 'operation_redo' || op.type === 'operation_revoke'

function pixelLayers(op: Operation): string[] {
  if (op.type === 'layer_transform') return op.transforms.map(t => t.layerId)
  if (op.type === 'layer_delete') return op.layerIds
  if ('layerId' in op && typeof op.layerId === 'string') return [op.layerId]
  return []
}

/** `operations` includes mutation targets, even when the resident window no
 * longer holds them. The async loader resolves those ids before calling this
 * pure rule; an unresolved target fails closed rather than guessing a layer. */
export function planSnapshotReplay(
  candidates: readonly SnapshotCandidate[], operations: readonly Operation[],
  liveLayers?: ReadonlySet<string>, structuralSeq?: number,
): SnapshotReplayPlan {
  const byId = new Map(operations.map(op => [op.id, op]))
  // Local dependency index only. Full decoded prefix authority belongs to
  // the loader; the pure plan still refuses missing/conflicting ordinal0.
  const firstCanonical=new Map<string,CanonicalStrokeOperation|null>()
  const canonicalKey=(op:CanonicalStrokeOperation)=>JSON.stringify([op.userId,op.frame.strokeId])
  for(const op of operations)if(op.type==='canonical_stroke'&&op.frame.frameOrdinal===0){
    const key=canonicalKey(op)
    firstCanonical.set(key,firstCanonical.has(key)?null:op)
  }
  const sameCanonicalContext=(a:CanonicalStrokeOperation,b:CanonicalStrokeOperation)=>!a.frame.materialPacked.startsWith('1|')&&!b.frame.materialPacked.startsWith('1|')
    &&a.userId===b.userId&&a.layerId===b.layerId
    &&a.frame.version===b.frame.version&&a.frame.rasterProfile===b.frame.rasterProfile&&a.frame.brush===b.frame.brush&&a.frame.strokeId===b.frame.strokeId
    &&a.frame.pigmentRgb8.every((v,i)=>v===b.frame.pigmentRgb8[i])&&a.frame.composition.mode===b.frame.composition.mode
    &&a.frame.composition.alphaDarken===b.frame.composition.alphaDarken&&a.frame.composition.outerBlend===b.frame.composition.outerBlend
    &&Object.is(a.frame.composition.outerResourceOpacity,b.frame.composition.outerResourceOpacity)
  const cutoff = new Map<string, number>()
  const historyLayers = new Set<string>()
  const unresolvedTargets = new Set<string>()
  let replayStructure = false
  const before = (layerId: string, seq: number): boolean => {
    const old = cutoff.get(layerId)
    if (old !== undefined && old <= seq) return false
    cutoff.set(layerId, seq)
    return true
  }
  const resolve = (id: string, seen: Set<string>): Operation | undefined => {
    if (seen.has(id)) { unresolvedTargets.add(id); return }
    seen.add(id)
    const target = byId.get(id)
    if (!target) { unresolvedTargets.add(id); return }
    return isHistoryChange(target) ? resolve(target.targetOpId, seen) : target
  }
  for (const change of operations) {
    if (!isHistoryChange(change)) continue
    if (candidates.length && (change.seq ?? 0) <= Math.min(...candidates.map(s => s.seq))
      && (structuralSeq === undefined || (change.seq ?? 0) <= structuralSeq)) continue
    const target = resolve(change.targetOpId, new Set())
    if (!target) continue
    let targetSeq=target.seq??0
    // MaterialV1 keeps its historical closed lane; the new read-prefix
    // contract covers V2 only. Unknown tags never fall into the V1 exception.
    if(target.type==='canonical_stroke'&&!target.frame.materialPacked.startsWith('1|')){
      const first=firstCanonical.get(canonicalKey(target))
      if(!first||!sameCanonicalContext(first,target)||!Number.isSafeInteger(first.seq)||first.seq!<1||first.seq!>targetSeq){unresolvedTargets.add(target.id);continue}
      targetSeq=first.seq!
    }
    if (structuralSeq !== undefined && (target.seq ?? 0) <= structuralSeq
      && structuralSeq < (change.seq ?? 0)
      && (target.type.startsWith('layer_') || target.type === 'folder_add')
      && target.type !== 'layer_clear' && target.type !== 'layer_transform') {
      replayStructure = true
      // A deleted source may have no current snapshot candidate at all.
      // Restoring its structure still requires its original pixels.
      for (const id of pixelLayers(target)) before(id, target.seq ?? 0)
    }
    for (const layerId of pixelLayers(target)) {
      // A mutation already represented in a candidate is not a reason to
      // reject it. Equality matters: undo5 is in snapshot5; redo6 is not.
      if (candidates.some(s => s.layerId === layerId
        && targetSeq <= s.seq && s.seq < (change.seq ?? 0))) {
        before(layerId, targetSeq)
      }
    }
  }
  const select = (): SnapshotCandidate[] => {
    const selected = new Map<string, SnapshotCandidate>()
    for (const s of candidates) {
      if (historyLayers.has(s.layerId)) continue
      if (s.seq >= (cutoff.get(s.layerId) ?? Infinity)) continue
      if (!selected.has(s.layerId) || selected.get(s.layerId)!.seq < s.seq) selected.set(s.layerId, s)
    }
    return [...selected.values()]
  }
  // Replaying a merge/copy requires its sources at the operation's historical
  // instant. Current source snapshots cannot stand in for that earlier state.
  // Load only those source histories, recursively, rather than all room layers.
  let changed = true
  while (changed) {
    changed = false
    const coverage = new Map(select().map(s => [s.layerId, s.seq]))
    for (const op of operations) {
      if (op.type !== 'layer_merge' && op.type !== 'layer_duplicate') continue
      if (liveLayers && !liveLayers.has(op.layerId) && !historyLayers.has(op.layerId)) continue
      if ((op.seq ?? 0) <= (coverage.get(op.layerId) ?? 0)) continue
      const sources = op.type === 'layer_merge' ? op.sources.map(s => s.id) : [op.sourceId]
      for (const id of sources) if (!historyLayers.has(id)) {
        historyLayers.add(id)
        changed = true
      }
    }
  }
  const snapshots = select()
  const coverage = new Map(snapshots.map(s => [s.layerId, s.seq]))
  for (const [layerId] of cutoff) if (!coverage.has(layerId)) historyLayers.add(layerId)
  return { snapshots, coverage, historyLayers, unresolvedTargets, ...(replayStructure ? { replayStructure: true as const } : {}) }
}
