import type { Operation } from '@grafetto/shared'

import { prisma } from '../db/prisma.js'
import { flushRoomWrites, rooms } from './roomRegistry.js'
import { layerStateIdsOf } from './snapshotCoverage.js'
import { planSnapshotReplay, type SnapshotReplayPlan, type SnapshotCandidate } from './snapshotReplayPlan.js'

const HISTORY_TYPES = ['operation_undo', 'operation_redo', 'operation_revoke']
const STRUCTURE_TYPES = ['layer_add', 'folder_add', 'layer_delete', 'layer_merge', 'layer_duplicate', 'layer_transform']

export interface PreparedSnapshotReplay extends SnapshotReplayPlan {
  index: { seq: number; layerState: unknown; layers: SnapshotCandidate[] } | null
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
    if (!stored || !candidates.length) {
      if (record && ((rooms.get(roomId)?.nextSeq ?? 1) - 1 !== watermark)) continue
      return { snapshots: [], coverage: new Map(), historyLayers: new Set(), unresolvedTargets: new Set(), index: stored ? { seq: stored.seq, layerState: stored.state, layers: [] } : null, operations: [...byId.values()], historicalIds: new Set(), watermark }
    }
    const queried = new Set<string>()
    // Targets may have left resident RAM at snapshot upload/cold load. Resolve
    // only referenced ids, not the room's heavy covered stroke population.
    while (true) {
      const missing = [...byId.values()].filter(op => HISTORY_TYPES.includes(op.type)
        && (!candidates.length || (op.seq ?? 0) > Math.min(...candidates.map(s => s.seq))))
        .flatMap(op => 'targetOpId' in op && !byId.has(op.targetOpId) && !queried.has(op.targetOpId) ? [op.targetOpId] : [])
      if (!missing.length) break
      for (const id of missing) queried.add(id)
      const targets = await prisma.operation.findMany({ where: { roomId, id: { in: missing } }, select: { data: true } })
      for (const { data } of targets) { const op = data as Operation; byId.set(op.id, op) }
    }
    let plan = planSnapshotReplay(candidates, [...byId.values()], record?.aliveIds)
    const loadedLayers = new Set<string>()
    const historicalIds = new Set<string>()
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
      plan = planSnapshotReplay(candidates, [...byId.values()], record?.aliveIds)
    }
    if (plan.unresolvedTargets.size) throw new Error('Unresolved snapshot history dependency')
    if (record && ((rooms.get(roomId)?.nextSeq ?? 1) - 1 !== watermark)) continue
    return { ...plan, index: stored ? { seq: stored.seq, layerState: stored.state, layers: plan.snapshots } : null,
      operations: [...byId.values()].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)), historicalIds, watermark }
  }
  throw new Error('Snapshot history changed during join preparation')
}
