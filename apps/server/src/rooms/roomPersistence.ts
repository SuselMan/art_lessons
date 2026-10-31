import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { CANONICAL_RECORDED_ATTACHMENT_LIMITS, parseCanonicalStrokeCloseOperation,type CanonicalStrokeCloseOperation,type RecordedCanonicalStrokeCloseOperation,readRoomRasterVersion, type CanonicalStrokeOperation, type Operation, type Room } from '@grafetto/shared'

import { prisma } from '../db/prisma.js'
import { enqueueWrite, type RoomWriteOutcome } from './roomRegistry.js'

/** (#612) The rows a live room writes as it goes — its creation, each
 *  participant, its palette, each operation. Every one is fire-and-forget
 *  through the room's write queue (roomRegistry.ts), never awaited on the
 *  socket path. Moved out of rooms.ts so the loader and the room lifecycle can
 *  both write without importing each other. */

export function persistRoomCreate(room: Room, passwordHash: string | undefined): void {
  enqueueWrite(room.id, () => prisma.room.create({
    data: {
      id: room.id, name: room.name, paper: room.paper, paperColor: room.paperColor ?? null,
      rasterVersion: readRoomRasterVersion(room.rasterVersion),
      infinite: room.infinite,
      canvasWidth: room.canvasWidth ?? null, canvasHeight: room.canvasHeight ?? null,
      passwordHash, accessMode: room.accessMode, ownerId: room.ownerId,
      // (#548) `[]` is the column's own "no restriction" — see schema.prisma.
      enabledTools: room.enabledTools ?? [],
      classVisibility: room.classVisibility ?? 'teacher_only',
    },
  }))
}

/** (#226) `name` is refreshed on every join, not just written once: it is what
 *  this person calls themselves *now*, and the access panel showing a name
 *  they abandoned three lessons ago would be worse than showing none. */
export function passwordGrant(hash: string | null | undefined): string | null {
  return hash ? createHash('sha256').update(hash).digest('hex') : null
}

export function persistParticipant(roomId: string, userId: string, name: string, passwordHash?: string | null): void {
  // Automatic board moves refresh the name, never a password permission.
  const grant = passwordHash === undefined ? {} : { passwordGrant: passwordGrant(passwordHash) }
  enqueueWrite(roomId, () => prisma.roomParticipant.upsert({
    where: { roomId_userId: { roomId, userId } },
    create: { roomId, userId, name, ...grant },
    update: { lastActiveAt: new Date(), name, ...grant },
  }))
}

export function persistPalette(roomId: string, colors: string[]): void {
  enqueueWrite(roomId, () => prisma.roomPalette.upsert({
    where: { roomId },
    create: { roomId, colors },
    update: { colors },
  }))
}

/** One immutable row projection shared by original insert and explicit repair. */
function operationRow(roomId: string, op: Operation) {
  const layerId = 'layerId' in op ? op.layerId : null
  return {
    id: op.id, seq: op.seq ?? 0, type: op.type, roomId, userId: op.userId,
    layerId, tool: op.type === 'stroke' ? op.tool : null,
    // Keep canonical interfaces acceptable to Prisma JSON without retaining a
    // second packed payload or introducing a looser serialized identity.
    data: op.type === 'canonical_stroke' ? { ...op, frame: { ...op.frame, composition: { ...op.frame.composition } } } : op,
  }
}

/** Indexed columns accompany DB JSON at the loader/repair authority boundary. */
export const canonicalOperationRowSelect = {
  id: true, roomId: true, userId: true, seq: true, type: true, layerId: true, tool: true, data: true,
} as const
export interface CanonicalStoredOperationRow {
  readonly id: string; readonly roomId: string; readonly userId: string; readonly seq: number
  readonly type: string; readonly layerId: string | null; readonly tool: string | null; readonly data: unknown
}
export function verifyCanonicalOperationRow(roomId: string, op: Operation, row: CanonicalStoredOperationRow | null): void {
  if (op?.type !== 'canonical_stroke' || !Number.isSafeInteger(op.seq) || op.seq! < 1)
    throw new TypeError('Canonical persistence requires a stamped operation')
  verifyIndexedOperationRow(roomId,op,row)
}

/** Exact indexed identity only; does not grant read/append or receipt adoption. */
export function verifyIndexedOperationRow(roomId:string,op:Operation,row:CanonicalStoredOperationRow|null):void {
  const expected = operationRow(roomId, op)
  if (!row || row.id !== expected.id || row.roomId !== expected.roomId || row.userId !== expected.userId
    || row.seq !== expected.seq || row.type !== expected.type || row.layerId !== (expected.layerId ?? null)
    || row.tool !== expected.tool || !isDeepStrictEqual(row.data, expected.data))
    throw new Error('Canonical persistence immutable row conflict')
}

export type CanonicalMetadataOperation=Extract<Operation,{type:'operation_undo'|'operation_redo'}>
/** Closed bounded metadata copy, no target authority inferred from its ID. */
export function captureCanonicalMetadata(value:unknown,allowSeq=false):CanonicalMetadataOperation {
 const v=value as CanonicalMetadataOperation
 const text=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&x.length<=256&&!x.includes('\0')
 if(!v||typeof v!=='object'||Array.isArray(v)||(v.type!=='operation_undo'&&v.type!=='operation_redo')
  ||!text(v.id)||!text(v.userId)||!text(v.targetOpId)||!Number.isFinite(v.timestamp)||v.timestamp<0
  ||Object.keys(v).some(k=>!['type','id','userId','timestamp','targetOpId',...(allowSeq?['seq']:[])].includes(k))
  ||!['type','id','userId','timestamp','targetOpId'].every(k=>Object.hasOwn(v,k))
  ||v.seq!==undefined&&(!allowSeq||!Number.isSafeInteger(v.seq)||v.seq<1))throw new TypeError('Invalid canonical metadata operation')
 return Object.freeze({type:v.type,id:v.id,userId:v.userId,timestamp:v.timestamp,targetOpId:v.targetOpId,...v.seq===undefined?{}:{seq:v.seq}})
}
export function verifyCanonicalMetadataRow(roomId:string,op:CanonicalMetadataOperation|CanonicalStrokeCloseOperation,row:CanonicalStoredOperationRow|null):void {
 if(op.type==='canonical_stroke_close')parseCanonicalStrokeCloseOperation(op)
 else captureCanonicalMetadata(op,true)
 if(!Number.isSafeInteger(op.seq)||op.seq!<1)throw new TypeError('Canonical metadata requires stamped operation')
 verifyIndexedOperationRow(roomId,op,row)
}

export function persistOperation(roomId: string, op: Operation): Promise<RoomWriteOutcome<void>> {
  return enqueueWrite(roomId, async () => {
    await prisma.operation.create({ data: operationRow(roomId, op) })
    // Deliberately do NOT return/retain the ORM's full operation JSON row.
  })
}

/** Explicit canonical repair, not an upsert. The caller must hold the actual
 * resident immutable operation identity; this function confers no authority.
 * Each call schedules ONE attempt on the SAME existing room write queue. */
export function retryCanonicalOperationWrite(roomId: string, op: Operation): Promise<RoomWriteOutcome<void>> {
  if(op?.type==='canonical_stroke_close')op=parseCanonicalStrokeCloseOperation(op)
  else if(op?.type!=='canonical_stroke')op=captureCanonicalMetadata(op,true)
  if(!Number.isSafeInteger(op.seq)||op.seq!<1)throw new TypeError('Canonical persistence requires a stamped operation')
  return enqueueWrite(roomId, async () => {
    const expected = operationRow(roomId, op)
    const read = () => prisma.operation.findUnique({ where: { id: op.id }, select: canonicalOperationRowSelect })
    const verify = (row: Awaited<ReturnType<typeof read>>) => op.type==='canonical_stroke'?verifyCanonicalOperationRow(roomId,op,row):verifyCanonicalMetadataRow(roomId,op as CanonicalMetadataOperation|CanonicalStrokeCloseOperation,row)
    const row = await read()
    if (row) { verify(row); return }
    try { await prisma.operation.create({ data: expected }) }
    catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') throw error
      // A concurrent insert (or uncertain first response) is success ONLY when
      // the complete indexed identity and immutable payload really match.
      verify(await read())
    }
  })
}

/** Bounded close projection of actual indexed evidence, NOT a read/seal grant. */
export function projectCanonicalIndexedCloseOperation(roomId:string,row:CanonicalStoredOperationRow):{operation:RecordedCanonicalStrokeCloseOperation;bytes:number}{
 const operation=parseCanonicalStrokeCloseOperation(row.data)
 verifyIndexedOperationRow(roomId,operation,row)
 return {operation,bytes:Buffer.byteLength(JSON.stringify(operation),'utf8')}
}

/** Structural projection of an actual indexed row, not query/read/append authority.
 * Bound known scalar/array fields BEFORE immutable copy or JSON byte walks.
 * Material semantics stay with the SAME shared decoder and trusted binding. */
export function projectCanonicalIndexedOperation(roomId:string,row:CanonicalStoredOperationRow):{operation:CanonicalStrokeOperation;bytes:number}{
 const fail=():never=>{throw new TypeError('Invalid canonical indexed operation projection')}
 const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=256&&!v.includes('\0')
 const op=row.data as Operation
 verifyCanonicalOperationRow(roomId,op,row)
 if(op.type!=='canonical_stroke' ||!text(op.id)||!text(op.userId)||!text(op.layerId)||!Number.isFinite(op.timestamp)||!op.frame||!text(op.frame.strokeId)
    ||!text(op.frame.brush)||!text(op.frame.rasterProfile)||(op.frame.version!==1&&op.frame.version!==2)||!Number.isSafeInteger(op.frame.frameOrdinal)||op.frame.frameOrdinal<0
    ||!Array.isArray(op.frame.pigmentRgb8)||op.frame.pigmentRgb8.length!==3||op.frame.pigmentRgb8.some(v=>!Number.isInteger(v)||v<0||v>255)
    ||!op.frame.composition||!text(op.frame.composition.mode)||!text(op.frame.composition.alphaDarken)||!text(op.frame.composition.outerBlend)||!Number.isFinite(op.frame.composition.outerResourceOpacity)
    ||typeof op.frame.materialPacked!=='string'||Buffer.byteLength(op.frame.materialPacked,'utf8')>CANONICAL_RECORDED_ATTACHMENT_LIMITS.batchBytes)return fail()
   if(Object.keys(op).some(k=>!['id','userId','timestamp','seq','type','layerId','frame'].includes(k))
    ||Object.keys(op.frame).some(k=>!['version','rasterProfile','brush','strokeId','frameOrdinal','pigmentRgb8','composition','materialPacked'].includes(k))
    ||Object.keys(op.frame.composition).some(k=>!['mode','alphaDarken','outerResourceOpacity','outerBlend'].includes(k)))return fail()
   const projected:CanonicalStrokeOperation={id:op.id,userId:op.userId,timestamp:op.timestamp,seq:op.seq,type:'canonical_stroke',layerId:op.layerId,frame:{...op.frame,
    pigmentRgb8:[op.frame.pigmentRgb8[0],op.frame.pigmentRgb8[1],op.frame.pigmentRgb8[2]],composition:{mode:op.frame.composition.mode,alphaDarken:op.frame.composition.alphaDarken,outerResourceOpacity:op.frame.composition.outerResourceOpacity,outerBlend:op.frame.composition.outerBlend},materialPacked:op.frame.materialPacked}}
 const bytes=Buffer.byteLength(JSON.stringify(projected),'utf8')
 if(bytes>CANONICAL_RECORDED_ATTACHMENT_LIMITS.batchBytes)return fail()
 return {operation:projected,bytes}
}
