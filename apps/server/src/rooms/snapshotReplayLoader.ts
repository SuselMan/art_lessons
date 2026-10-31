import type {CanonicalFullHistoryRows,CanonicalMixedFullHistoryRows} from './snapshotStore.js'
import {isDeepStrictEqual} from 'node:util'
import { IMPLICIT_LAYER_IDS, CANONICAL_RECORDED_ATTACHMENT_LIMITS, type CanonicalStrokeOperation, type verifyCanonicalRecordedPrefix, type Operation } from '@grafetto/shared'

import { canonicalOperationRowSelect,projectCanonicalIndexedOperation,type CanonicalStoredOperationRow } from './roomPersistence.js'
import { immutableCanonicalOperation } from './operationLog.js'
import { prisma } from '../db/prisma.js'
import { flushRoomWrites, rooms } from './roomRegistry.js'
import { layerStateIdsOf } from './snapshotCoverage.js'
import { planSnapshotReplay, type SnapshotReplayPlan, type SnapshotCandidate } from './snapshotReplayPlan.js'

const HISTORY_TYPES = ['operation_undo', 'operation_redo', 'operation_revoke']
const STRUCTURE_TYPES = ['layer_add', 'folder_add', 'layer_delete', 'layer_merge', 'layer_duplicate', 'layer_transform', 'layer_move', 'layer_opacity', 'layer_visibility', 'layer_rename', 'layer_owner_lock', 'layer_lock']

export interface CanonicalPrefixRequest {readonly anchor:CanonicalStrokeOperation;readonly row?:CanonicalStoredOperationRow;readonly throughSeq:number;readonly purpose:'read'|'undo-redo'}
export interface PreparedCanonicalPrefix {readonly operations:readonly CanonicalStrokeOperation[];readonly canonicalRows:readonly CanonicalStoredOperationRow[];readonly summary:ReturnType<typeof verifyCanonicalRecordedPrefix>}
export type CanonicalPrefixPreparer=(input:CanonicalPrefixRequest)=>Promise<PreparedCanonicalPrefix>
export type CanonicalFullHistoryReceipt=(CanonicalFullHistoryRows|CanonicalMixedFullHistoryRows)&{assertCurrent(this:CanonicalFullHistoryReceipt):void}
export interface SnapshotReplayPreparation {readonly prepareCanonicalPrefix?:CanonicalPrefixPreparer;readonly canonicalFloor?:number;readonly prepareFullCanonicalHistory?:(input:{readonly throughSeq:number;readonly floor:number})=>Promise<CanonicalFullHistoryReceipt>}

export interface PreparedSnapshotReplay extends SnapshotReplayPlan {
  index: { seq: number; layerState: unknown; layers: SnapshotCandidate[]; replayStructure?: true; historyLayers?: string[] } | null
  operations: Operation[]
  canonicalRows: readonly CanonicalStoredOperationRow[]
  historicalIds: Set<string>
  watermark: number
  readonly fullCanonicalHistory?:CanonicalFullHistoryReceipt
}

/** One computed selection serves both Socket.io tail and HTTP index. It does
 * not mutate stored coverage. Async queries finish before the socket joins
 * the content channel; the caller still joins+emits with no intervening await. */
export async function prepareSnapshotReplay(roomId: string,preparation?:SnapshotReplayPreparation): Promise<PreparedSnapshotReplay> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await flushRoomWrites(roomId)
    const record = rooms.get(roomId)
    const watermark = (record?.nextSeq ?? 1) - 1
    const [stored, rows] = await Promise.all([
      prisma.roomLayerState.findUnique({ where: { roomId }, select: { seq: true, state: true } }),
      prisma.roomLayerSnapshot.findMany({ where: { roomId }, orderBy: { seq: 'desc' }, select: { layerId: true, seq: true, hash: true } }),
    ])
    if(preparation?.prepareFullCanonicalHistory){
      if(stored||rows.length||!record||preparation.canonicalFloor!==0)throw Error('Canonical full baseline unavailable')
      const receipt=await preparation.prepareFullCanonicalHistory({throughSeq:watermark,floor:preparation.canonicalFloor})
      receipt.assertCurrent()
      if(receipt.throughSeq!==watermark||rooms.get(roomId)!==record||record.nextSeq-1!==watermark)throw Error('Canonical full baseline changed')
      const known=new Map(receipt.operations.map(op=>[op.id,op]))
      for(const op of record.operations)if(!isDeepStrictEqual(known.get(op.id),op))throw Error('Canonical resident history missing or changed')
      const plan=planSnapshotReplay([], [...receipt.operations],record.aliveIds)
      if(plan.unresolvedTargets.size)throw Error('Unresolved canonical full history')
      return {...plan,index:null,operations:[...receipt.operations],canonicalRows:receipt.canonicalRows,historicalIds:new Set(),watermark,fullCanonicalHistory:receipt}
    }
    const live = stored ? layerStateIdsOf(stored.state) : null
    const candidates = rows.filter(row => live === null || live.has(row.layerId))
    const canonicalRows = new Map<string,CanonicalStoredOperationRow>()
    const canonicalSizes=new Map<string,number>()
    let canonicalBytes=0
    const account=(id:string,bytes:number)=>{
      if(!preparation?.prepareCanonicalPrefix||canonicalSizes.has(id))return
      if(canonicalBytes+bytes>CANONICAL_RECORDED_ATTACHMENT_LIMITS.batchBytes)throw Error('Canonical replay prefix byte capacity exceeded')
      canonicalBytes+=bytes;canonicalSizes.set(id,bytes)
    }
    const acceptRow = (row:CanonicalStoredOperationRow):Operation => {
      const op=row.data as Operation
      if(row.type!=='canonical_stroke'&&op?.type!=='canonical_stroke')return op
      const projected=projectCanonicalIndexedOperation(roomId,row)
      account(projected.operation.id,projected.bytes)
      const existing=byId.get(projected.operation.id)
      if(existing&&!isDeepStrictEqual(existing,projected.operation))throw Error('Canonical replay immutable dependency changed')
      if(preparation?.prepareCanonicalPrefix&&!byId.has(projected.operation.id)&&byId.size>=CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)throw Error('Canonical replay binding capacity exceeded')
      const copy=immutableCanonicalOperation(projected.operation,projected.operation.seq!)
      canonicalRows.set(copy.id,Object.freeze({...row,data:copy}))
      return copy
    }
    const byId = new Map((record?.operations ?? []).map(op => [op.id, op]))
    const proven=new Map<string,{readonly ordinal:number;readonly count:number;readonly ended:boolean}>()
    const prepareCanonicalDependencies=async()=>{
      const groups=new Map<string,{anchor:CanonicalStrokeOperation;members:CanonicalStrokeOperation[];purpose:'read'|'undo-redo'}>()
      for(const op of byId.values())if(op.type==='canonical_stroke'&&!op.frame.materialPacked.startsWith('1|')){
        if(!preparation?.prepareCanonicalPrefix)throw Error('Canonical replay prefix preparer unavailable')
        if(preparation&&byId.size>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)throw Error('Canonical replay binding capacity exceeded')
        const key=JSON.stringify([op.userId,op.frame.strokeId]),group=groups.get(key)
        if(group){group.members.push(op);if(op.frame.frameOrdinal>group.anchor.frame.frameOrdinal)group.anchor=op}
        else {if(groups.size>=CANONICAL_RECORDED_ATTACHMENT_LIMITS.capabilities)throw Error('Canonical replay gesture capacity exceeded');groups.set(key,{anchor:op,members:[op],purpose:'read'})}
      }
      const target=(id:string,seen=new Set<string>()):Operation|undefined=>{
        if(seen.has(id))throw Error('Cyclic snapshot history dependency')
        seen.add(id);const op=byId.get(id)
        return op&&HISTORY_TYPES.includes(op.type)&&'targetOpId'in op?target(op.targetOpId,seen):op
      }
      for(const op of byId.values())if((op.type==='operation_undo'||op.type==='operation_redo')){
        const resolved=target(op.targetOpId)
        if(resolved?.type==='canonical_stroke'){
          const group=groups.get(JSON.stringify([resolved.userId,resolved.frame.strokeId]));if(group)group.purpose='undo-redo'
        }
      }
      for(const [key,group]of groups){
        const previous=proven.get(key)
        if(previous&&previous.ordinal===group.anchor.frame.frameOrdinal&&previous.count===group.members.length){
          if(group.purpose==='undo-redo'&&!previous.ended)throw Error('Canonical undo replay prefix is open')
          continue
        }
        const prefix=await preparation!.prepareCanonicalPrefix!({anchor:group.anchor,row:canonicalRows.get(group.anchor.id),throughSeq:watermark,purpose:group.purpose})
        if(group.purpose==='undo-redo'&&!prefix.summary.ended)throw Error('Canonical undo replay prefix is open')
        if(prefix.operations.length!==prefix.canonicalRows.length||prefix.operations.length!==prefix.summary.recordedNext)throw Error('Canonical prepared prefix closure changed')
        const recovered=new Map(prefix.operations.map(op=>[op.id,op]))
        for(const member of group.members)if(!isDeepStrictEqual(recovered.get(member.id),member))throw Error('Canonical known prefix member missing or changed')
        // Project/count the entire candidate before mutating either local merge.
        let bytes=canonicalBytes,added=0
        const projected=prefix.canonicalRows.map((row,n)=>{
          const prepared=projectCanonicalIndexedOperation(roomId,row)
          if(!isDeepStrictEqual(prepared.operation,prefix.operations[n]))throw Error('Canonical prepared row identity changed')
          if(!canonicalSizes.has(prepared.operation.id))bytes+=prepared.bytes
          if(!byId.has(prepared.operation.id))added++
          return prepared
        })
        if(bytes>CANONICAL_RECORDED_ATTACHMENT_LIMITS.batchBytes||byId.size+added>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)throw Error('Canonical replay aggregate capacity exceeded')
        for(let n=0;n<projected.length;n++){
          const row=prefix.canonicalRows[n],op=acceptRow(row);byId.set(op.id,op)
        }
        proven.set(key,{ordinal:prefix.summary.recordedNext-1,count:prefix.summary.recordedNext,ended:prefix.summary.ended})
      }
    }
    if(!stored&&!preparation?.prepareCanonicalPrefix){
      await prepareCanonicalDependencies()
      if(record&&((rooms.get(roomId)?.nextSeq??1)-1!==watermark))continue
      return {snapshots:[],coverage:new Map(),historyLayers:new Set(),unresolvedTargets:new Set(),index:null,operations:[...byId.values()],canonicalRows:[],historicalIds:new Set(),watermark}
    }
    const queried = new Set<string>()
    // Targets may have left resident RAM at snapshot upload/cold load. Resolve
    // only referenced ids, not the room's heavy covered stroke population.
    while (true) {
      const missing = [...byId.values()].filter(op => HISTORY_TYPES.includes(op.type)
        && (!stored || (op.seq ?? 0) > stored.seq || !candidates.length || (op.seq ?? 0) > Math.min(...candidates.map(s => s.seq))))
        .flatMap(op => 'targetOpId' in op && !byId.has(op.targetOpId) && !queried.has(op.targetOpId) ? [op.targetOpId] : [])
      if (!missing.length) break
      for (const id of missing) queried.add(id)
      const targets = await prisma.operation.findMany({ where: { roomId, id: { in: missing } }, select: canonicalOperationRowSelect })
      for (const row of targets) { const op = acceptRow(row); byId.set(op.id, op) }
    }
    await prepareCanonicalDependencies()
    if(!stored){
      const plan=planSnapshotReplay([], [...byId.values()],record?.aliveIds)
      if(plan.unresolvedTargets.size)throw Error('Unresolved snapshot history dependency')
      if(record&&((rooms.get(roomId)?.nextSeq??1)-1!==watermark))continue
      return {...plan,index:null,operations:[...byId.values()].sort((a,b)=>(a.seq??0)-(b.seq??0)),canonicalRows:Object.freeze([...canonicalRows.values()]),historicalIds:new Set(),watermark}
    }
    let plan = planSnapshotReplay(candidates, [...byId.values()], record?.aliveIds, stored.seq)
    if (plan.replayStructure) {
      const prefix = await prisma.operation.findMany({
        where: { roomId, type: { in: [...HISTORY_TYPES, ...STRUCTURE_TYPES] }, seq: { lte: watermark } },
        orderBy: { seq: 'asc' }, select: canonicalOperationRowSelect,
      })
      for (const row of prefix) { const op = acceptRow(row); byId.set(op.id, op) }
      // Legacy snapshot-only roots have no recoverable original structural
      // base. Never guess that base from currently alive layers.
      const created = new Set(IMPLICIT_LAYER_IDS)
      for (const op of [...byId.values()].filter(op => (op.seq ?? 0) <= stored.seq)) if (op.type === 'layer_add' || op.type === 'layer_merge' || op.type === 'layer_duplicate') created.add(op.layerId)
      else if (op.type === 'folder_add') created.add(op.layerId)
      if ([...(live ?? []), ...plan.historyLayers].some(id => !created.has(id))) {
        throw new Error('Snapshot structural base cannot be reconstructed')
      }
      await prepareCanonicalDependencies()
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
        orderBy: { seq: 'asc' }, select: canonicalOperationRowSelect,
      })
      for (const row of history) {
        const op = acceptRow(row)
        byId.set(op.id, op)
        if ((op.seq ?? 0) <= (stored?.seq ?? 0)) historicalIds.add(op.id)
      }
      await prepareCanonicalDependencies()
      plan = planSnapshotReplay(candidates, [...byId.values()], record?.aliveIds, stored.seq)
    }
    for(const op of byId.values())if(op.type==='canonical_stroke'&&(op.seq??0)<=stored.seq)historicalIds.add(op.id)
    if (plan.unresolvedTargets.size) throw new Error('Unresolved snapshot history dependency')
    if (record && ((rooms.get(roomId)?.nextSeq ?? 1) - 1 !== watermark)) continue
    return { ...plan, index: stored ? { seq: stored.seq, layerState: stored.state, layers: plan.snapshots, ...(plan.replayStructure ? { replayStructure: true as const, historyLayers: [...plan.historyLayers] } : {}) } : null,
      operations: [...byId.values()].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)), canonicalRows: Object.freeze([...canonicalRows.values()]), historicalIds, watermark }
  }
  throw new Error('Snapshot history changed during join preparation')
}
