import { IMPLICIT_LAYER_IDS, type Operation } from '@grafetto/shared'

import { prisma } from '../db/prisma.js'
import { flushRoomWrites, rooms } from './roomRegistry.js'
import { layerStateIdsOf } from './snapshotCoverage.js'
import { planSnapshotReplay, type SnapshotReplayPlan, type SnapshotCandidate } from './snapshotReplayPlan.js'

const HISTORY_TYPES = ['operation_undo', 'operation_redo', 'operation_revoke']
const STRUCTURE_TYPES = ['layer_add', 'folder_add', 'layer_delete', 'layer_merge', 'layer_duplicate', 'layer_transform', 'layer_move', 'layer_opacity', 'layer_visibility', 'layer_rename', 'layer_owner_lock', 'layer_lock']

export interface PreparedSnapshotReplay extends SnapshotReplayPlan {
  index: { seq: number; layerState: unknown; layers: SnapshotCandidate[]; replayStructure?: true; historyLayers?: string[] } | null
  operations: Operation[]
  historicalIds: Set<string>
  watermark: number
}

/** One computed selection serves both Socket.io tail and HTTP index. It does
 * not mutate stored coverage. Async queries finish before the socket joins
 * the content channel; the caller still joins+emits with no intervening await. */
export async function prepareSnapshotReplay(roomId: string): Promise<PreparedSnapshotReplay> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await flushRoomWrites(roomId)
    const record = rooms.get(roomId)
    const watermark = (record?.nextSeq ?? 1) - 1
    const [stored, rows] = await Promise.all([
      prisma.roomLayerState.findUnique({ where: { roomId }, select: { seq: true, state: true } }),
      prisma.roomLayerSnapshot.findMany({ where: { roomId }, orderBy: { seq: 'desc' }, select: { layerId: true, seq: true, hash: true } }),
    ])
    const live = stored ? layerStateIdsOf(stored.state) : null
    const candidates = rows.filter(row => live === null || live.has(row.layerId))
    const byId = new Map((record?.operations ?? []).map(op => [op.id, op]))
    if (!stored) {
      if (record && ((rooms.get(roomId)?.nextSeq ?? 1) - 1 !== watermark)) continue
      return { snapshots: [], coverage: new Map(), historyLayers: new Set(), unresolvedTargets: new Set(), index: null, operations: [...byId.values()], historicalIds: new Set(), watermark }
    }
    const queried = new Set<string>()
    // Targets may have left resident RAM at snapshot upload/cold load. Resolve
    // only referenced ids, not the room's heavy covered stroke population.
    while (true) {
      const missing = [...byId.values()].filter(op => HISTORY_TYPES.includes(op.type)
        && ((op.seq ?? 0) > stored.seq || !candidates.length || (op.seq ?? 0) > Math.min(...candidates.map(s => s.seq))))
        .flatMap(op => 'targetOpId' in op && !byId.has(op.targetOpId) && !queried.has(op.targetOpId) ? [op.targetOpId] : [])
      if (!missing.length) break
      for (const id of missing) queried.add(id)
      const targets = await prisma.operation.findMany({ where: { roomId, id: { in: missing } }, select: { data: true } })
      for (const { data } of targets) { const op = data as Operation; byId.set(op.id, op) }
    }
    let plan = planSnapshotReplay(candidates, [...byId.values()], record?.aliveIds, stored.seq)
    if (plan.replayStructure) {
      const prefix = await prisma.operation.findMany({
        where: { roomId, type: { in: [...HISTORY_TYPES, ...STRUCTURE_TYPES] }, seq: { lte: watermark } },
        orderBy: { seq: 'asc' }, select: { data: true },
      })
      for (const { data } of prefix) { const op = data as Operation; byId.set(op.id, op) }
      // Legacy snapshot-only roots have no recoverable original structural
      // base. Never guess that base from currently alive layers.
      const created = new Set(IMPLICIT_LAYER_IDS)
      for (const op of [...byId.values()].filter(op => (op.seq ?? 0) <= stored.seq)) if (op.type === 'layer_add' || op.type === 'layer_merge' || op.type === 'layer_duplicate') created.add(op.layerId)
      else if (op.type === 'folder_add') created.add(op.layerId)
      if ([...(live ?? []), ...plan.historyLayers].some(id => !created.has(id))) {
        throw new Error('Snapshot structural base cannot be reconstructed')
      }
      plan = planSnapshotReplay(candidates, [...byId.values()], record?.aliveIds, stored.seq)
    }
    const loadedLayers = new Set<string>()
    const historicalIds = new Set<string>(plan.replayStructure
      ? [...byId.values()].filter(op => (op.seq ?? 0) <= stored.seq).map(op => op.id) : [])
    while (true) {
      const needed = new Set(plan.historyLayers)
      for (const row of candidates) if (plan.coverage.get(row.layerId) !== Math.max(...candidates.filter(s => s.layerId === row.layerId).map(s => s.seq))) needed.add(row.layerId)
      const next = [...needed].filter(id => !loadedLayers.has(id))
      if (!next.length) break
      for (const id of next) loadedLayers.add(id)
      const history = await prisma.operation.findMany({
        where: { roomId, OR: [{ layerId: { in: next } }, { type: { in: [...HISTORY_TYPES, ...STRUCTURE_TYPES, 'paper_dry'] } }] },
        orderBy: { seq: 'asc' }, select: { data: true },
      })
      for (const { data } of history) {
        const op = data as Operation
        byId.set(op.id, op)
        if ((op.seq ?? 0) <= (stored?.seq ?? 0)) historicalIds.add(op.id)
      }
      plan = planSnapshotReplay(candidates, [...byId.values()], record?.aliveIds, stored.seq)
    }
    if (plan.unresolvedTargets.size) throw new Error('Unresolved snapshot history dependency')
    if (record && ((rooms.get(roomId)?.nextSeq ?? 1) - 1 !== watermark)) continue
    return { ...plan, index: stored ? { seq: stored.seq, layerState: stored.state, layers: plan.snapshots, ...(plan.replayStructure ? { replayStructure: true as const, historyLayers: [...plan.historyLayers] } : {}) } : null,
      operations: [...byId.values()].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)), historicalIds, watermark }
  }
  throw new Error('Snapshot history changed during join preparation')
}
