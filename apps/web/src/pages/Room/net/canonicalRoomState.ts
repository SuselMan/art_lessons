import {canonicalPlainTiltReadSource,canonicalAuthorPlainTiltSource} from '@grafetto/shared'
import type {CanonicalPlainTiltReadSource,CanonicalAuthorPlainTiltSource} from '@grafetto/shared'
import {captureCanonicalLocalReadScope,attachCanonicalRecordedDelivery} from './canonicalRecordedDelivery'
import type {CanonicalRecordedLifetime} from '../../../engine'
import {canonicalTexturedAutoReadSource,type CanonicalTexturedAutoReadSource,canonicalAuthorTexturedAutoSource,canonicalAuthorSoftPressureTexturedSource,canonicalAuthorPressureTexturedSource,type CanonicalAuthorPressureTexturedSource,type CanonicalAuthorTexturedAutoSource,type CanonicalAuthorSoftPressureTexturedSource,canonicalAuthorTexturedSource,type CanonicalAuthorTexturedSource,canonicalAuthorPrimaryTextureSource,CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_RECORDED_ATTACHMENT_LIMITS,LEGACY_ROOM_RASTER_VERSION,STRAIGHT_ROOM_RASTER_VERSION,readRoomRasterVersion,canonicalRecordedRasterProfiles,prepareCanonicalRecordedAttachment,verifyCanonicalEmptyHistoryBase,verifyCanonicalFullHistoryBase,captureCanonicalFullHistoryMetadata,type CanonicalFullHistoryBaseV2,type CanonicalEmptyHistoryBaseV1,type CanonicalPreparedRecordedOperation,type CanonicalStrokeRasterProfile,type Operation,type ServerToClientEvents} from '@grafetto/shared'
import {type CanonicalHistoryScope} from './canonicalHistoryPage'

type WireState=import('@grafetto/shared').RoomStateLegacyPayload
type IncomingWireState=Parameters<ServerToClientEvents['room_state']>[0]
const authority:unique symbol=Symbol('prepared-canonical-room-state')
export interface CanonicalRoomStateRead extends CanonicalRecordedLifetime {
 readonly scope:CanonicalHistoryScope
 readonly roomGeometry:Readonly<{width:number|undefined;height:number|undefined;infinite:boolean}>
 readonly authorPrimaryTextureSource?:'pressure-identity-subtract-v3'
 readonly plainTiltSource?:CanonicalPlainTiltReadSource
 readonly authorPlainTiltSource?:CanonicalAuthorPlainTiltSource
 readonly texturedAutoSource?:CanonicalTexturedAutoReadSource
 readonly authorTexturedAutoSource?:CanonicalAuthorTexturedAutoSource
 readonly authorSoftPressureTexturedSource?:CanonicalAuthorSoftPressureTexturedSource
 readonly authorPressureTexturedSource?:CanonicalAuthorPressureTexturedSource
 readonly authorTexturedSource?:CanonicalAuthorTexturedSource
 readonly authorRasterProfile:CanonicalStrokeRasterProfile
 readonly tailOperations:readonly Operation[]
 readonly preparedAtoms:readonly CanonicalPreparedRecordedOperation[]
 readonly emptyHistoryBase?:Readonly<CanonicalEmptyHistoryBaseV1>
 readonly fullHistoryBase?:Readonly<CanonicalFullHistoryBaseV2>
 readonly assertFullHistoryBase?:(candidateTail:readonly Operation[])=>ReturnType<typeof verifyCanonicalFullHistoryBase>
 assertEmptyHistoryBase(candidateTail:readonly Operation[]):Readonly<CanonicalEmptyHistoryBaseV1>
 readonly [authority]:(candidate:unknown,operations:readonly Operation[],boardId:string)=>void
}
/** Original connection metadata shared by both finite-history readers. */
export type CanonicalRoomConnectionRead=Pick<CanonicalRoomStateRead,'scope'|'roomGeometry'|'plainTiltSource'|'authorPlainTiltSource'|'texturedAutoSource'|'authorRasterProfile'|'authorPrimaryTextureSource'|'authorTexturedSource'|'authorPressureTexturedSource'|'authorTexturedAutoSource'|'authorSoftPressureTexturedSource'|'assertCurrent'>
export type PreparedCanonicalRoomState=WireState&{readonly canonicalRead:CanonicalRoomStateRead}
export type IndexedRoomStateDelivery=import('@grafetto/shared').RoomStateIndexedPayload&{readonly canonicalRead?:never;readonly canonicalIndexedRead:import('./canonicalIndexedRead').CanonicalIndexedSocketRead}
export type RoomStateDelivery=(WireState&{readonly canonicalRead?:CanonicalRoomStateRead;readonly canonicalIndexedRead?:never})|IndexedRoomStateDelivery
export type CanonicalRoomStatePreparer=(state:WireState,lifetime:{readonly isCurrent:()=>boolean;readonly expectedBoardId?:string})=>PreparedCanonicalRoomState
/** Internal exact lexical resource: a network object or copied internal marker
 * cannot authorize a raw tail, another board or an expired socket lifetime. */
export function assertCanonicalRoomStateRead(value:CanonicalRoomStateRead,operations:readonly Operation[],boardId:string):void {
 if(!value||typeof value[authority]!=='function')throw Error('Canonical room state preparation unavailable')
 value[authority](value,operations,boardId)
}
/** Called ONLY for the authoritative current room_state event. Caller captures
 * the requested board and socket/context generation independently of this data.
 * It grants reading, never authoring as an original user. */
export function prepareCanonicalRoomState(state:WireState,lifetime:{readonly expectedBoardId:string;readonly isCurrent:()=>boolean}):PreparedCanonicalRoomState {
 const roomGeometry=Object.freeze({width:state.room.canvasWidth,height:state.room.canvasHeight,infinite:state.room.infinite})
 const {expectedBoardId,isCurrent}=lifetime
 if(!isCurrent()||state.room.id!==expectedBoardId||readRoomRasterVersion(state.room.rasterVersion)!==STRAIGHT_ROOM_RASTER_VERSION)throw Error('Stale canonical room state')
 const wireScope=state.canonicalReadScope
 if(!wireScope||Reflect.ownKeys(wireScope).some(key=>!['roomId','boardEpoch','rasterProfile','allowedRasterProfiles'].includes(String(key)))||wireScope.roomId!==expectedBoardId||!Number.isSafeInteger(wireScope.boardEpoch)||wireScope.boardEpoch<0||wireScope.boardEpoch>=Number.MAX_SAFE_INTEGER)throw Error('Invalid canonical room state scope')
 const profiles=canonicalRecordedRasterProfiles(wireScope)
 const authorRasterProfile=state.canonicalAuthorRasterProfile===undefined?CANONICAL_STROKE_RASTER_PROFILE:state.canonicalAuthorRasterProfile
 if(!profiles.includes(authorRasterProfile))throw Error('Invalid canonical room state author profile')
 const authorPrimaryTextureSource=canonicalAuthorPrimaryTextureSource(state,'canonicalAuthorPrimaryTextureSource',authorRasterProfile)
 const plainTiltSource=canonicalPlainTiltReadSource(state,'canonicalPlainTiltSource',authorRasterProfile)
 const authorPlainTiltSource=canonicalAuthorPlainTiltSource(state,'canonicalAuthorPlainTiltSource',authorRasterProfile)
 if(authorPlainTiltSource&&!plainTiltSource)throw Error('Plain tilt author requires original read policy')
 const texturedAutoSource=canonicalTexturedAutoReadSource(state,'canonicalTexturedAutoSource',authorRasterProfile)
 const authorTexturedAutoSource=canonicalAuthorTexturedAutoSource(state,'canonicalAuthorTexturedAutoSource',authorRasterProfile)
 const authorSoftPressureTexturedSource=canonicalAuthorSoftPressureTexturedSource(state,'canonicalAuthorSoftPressureTexturedSource',authorRasterProfile)
 const authorPressureTexturedSource=canonicalAuthorPressureTexturedSource(state,'canonicalAuthorPressureTexturedSource',authorRasterProfile)
 const authorTexturedSource=canonicalAuthorTexturedSource(state,'canonicalAuthorTexturedSource',authorRasterProfile)
 let read:CanonicalRoomStateRead
 const scope=captureCanonicalLocalReadScope({roomId:expectedBoardId,boardEpoch:wireScope.boardEpoch,allowedRasterProfiles:profiles,isCurrent},()=>{
  assertCanonicalRoomStateRead(read,read.tailOperations,expectedBoardId);return read
 })
 if(!Array.isArray(state.tailOperations)||state.tailOperations.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)throw Error('Invalid canonical room state tail')
 const baseDescriptor=Object.getOwnPropertyDescriptor(state,'canonicalHistoryBase')
 if(('canonicalHistoryBase'in state&&!baseDescriptor)||(baseDescriptor&&!Object.hasOwn(baseDescriptor,'value')))throw Error('Invalid canonical empty history base field')
 const rawBase=baseDescriptor?.value
 const fullKind=rawBase&&typeof rawBase==='object'&&Object.getOwnPropertyDescriptor(rawBase,'kind')?.value==='full-room-prefix-v2'
 // V2 captures only own scalar metadata. Canonical frames remain with the
 // SAME attachment owner; no synthetic closure or terminal frame is produced.
 const tail=fullKind?state.tailOperations.map(operation=>{
  const type=operation&&Object.getOwnPropertyDescriptor(operation,'type')
  if(!type||!Object.hasOwn(type,'value'))throw Error('Invalid canonical full history operation')
  return type.value==='canonical_stroke'?operation:captureCanonicalFullHistoryMetadata(operation)
 }):state.tailOperations
 if(!fullKind&&tail.some(op=>(op.type as string)==='canonical_stroke_close'))throw Error('Canonical close requires a recorded seal owner')
 const hasCanonical=tail.some(op=>op.type==='canonical_stroke')
 const baseAtoms=hasCanonical||state.canonicalCapabilities!==undefined
  ?prepareCanonicalRecordedAttachment(state.canonicalCapabilities,tail,scope)
  :Object.freeze(tail.map(operation=>Object.freeze({operation})))
 const fullHistory=fullKind?verifyCanonicalFullHistoryBase(rawBase,baseAtoms,scope):undefined
 const emptyHistoryBase=rawBase===undefined||fullKind?undefined:verifyCanonicalEmptyHistoryBase(rawBase,baseAtoms,scope)
 const preparedAtoms:CanonicalPreparedRecordedOperation[]=[]
 const operations=baseAtoms.map(atom=>atom.operation);Object.freeze(operations)
 read=Object.freeze({scope,roomGeometry,authorRasterProfile,...(plainTiltSource?{plainTiltSource}:{}),...(authorPlainTiltSource?{authorPlainTiltSource}:{}),...(texturedAutoSource?{texturedAutoSource}:{}),...(authorTexturedAutoSource?{authorTexturedAutoSource}:{}),...(authorSoftPressureTexturedSource?{authorSoftPressureTexturedSource}:{}),...(authorPressureTexturedSource?{authorPressureTexturedSource}:{}),...(authorTexturedSource?{authorTexturedSource}:{}),...(authorPrimaryTextureSource?{authorPrimaryTextureSource}:{}),tailOperations:operations,preparedAtoms,...(emptyHistoryBase?{emptyHistoryBase}:{}),...(fullHistory?{fullHistoryBase:fullHistory.base,assertFullHistoryBase(this:CanonicalRoomStateRead,candidateTail:readonly Operation[]){
  if(this!==read)throw Error('Foreign canonical full history receiver')
  assertCanonicalRoomStateRead(read,candidateTail,expectedBoardId);return fullHistory
 }}:{}),
 assertEmptyHistoryBase(this:CanonicalRoomStateRead,candidateTail:readonly Operation[]){
  if(this!==read||!emptyHistoryBase)throw Error('Canonical empty history base unavailable')
  assertCanonicalRoomStateRead(read,candidateTail,expectedBoardId);return emptyHistoryBase
 },assertCurrent(this:CanonicalRecordedLifetime){
  if(this!==read)throw Error('Foreign canonical recorded lifetime receiver')
  assertCanonicalRoomStateRead(read,operations,expectedBoardId);return scope
 },[authority]:(candidate:unknown,tail:readonly Operation[],boardId:string)=>{
  if(candidate!==read||tail!==operations||boardId!==expectedBoardId||!isCurrent())throw Error('Stale or foreign canonical room state preparation')
 }})
 for(const atom of baseAtoms)preparedAtoms.push(attachCanonicalRecordedDelivery(atom,scope))
 Object.freeze(preparedAtoms)
 assertCanonicalRoomStateRead(read,operations,expectedBoardId)
 return Object.freeze({...state,...(fullHistory?{canonicalHistoryBase:fullHistory.base}:emptyHistoryBase?{canonicalHistoryBase:emptyHistoryBase}:{}),tailOperations:operations,canonicalRead:read})
}
/** Runs before ordered brush loading, review stores, refs or replay queues.
 * No injected preparer means the existing legacy-only lane remains closed. */
export function preflightRoomStateDelivery(state:IncomingWireState,prepare?:CanonicalRoomStatePreparer,lifetime?:{readonly isCurrent:()=>boolean;readonly expectedBoardId?:string}):RoomStateDelivery {
 if(state.canonicalIndexedHistory!==undefined)throw Error('Indexed history requires an actual post-seat open')
 const version=readRoomRasterVersion(state.room.rasterVersion)
 if(version===LEGACY_ROOM_RASTER_VERSION){
  if(state.tailOperations?.some(op=>(op.type as string)==='canonical_stroke_close'))throw Error('Canonical close requires a recorded seal owner')
  if('canonicalTexturedAutoSource'in state||'canonicalAuthorTexturedAutoSource'in state||'canonicalAuthorSoftPressureTexturedSource'in state||'canonicalAuthorPressureTexturedSource'in state||'canonicalAuthorTexturedSource'in state||'canonicalAuthorPrimaryTextureSource'in state||'canonicalHistoryBase'in state||state.canonicalReadScope!==undefined||state.canonicalAuthorRasterProfile!==undefined||state.canonicalCapabilities!==undefined||Object.hasOwn(state,'canonicalRead'))throw Error('Unexpected canonical legacy room state')
  return state
 }
 if(version!==STRAIGHT_ROOM_RASTER_VERSION||!prepare)throw Error('Unsupported canonical room state')
 const result=prepare(state,lifetime??{isCurrent:()=>true})
 if(lifetime&&result.canonicalRead.scope.isCurrent!==lifetime.isCurrent)throw Error('Foreign canonical connection lifetime')
 if(result.room.id!==state.room.id||readRoomRasterVersion(result.room.rasterVersion)!==STRAIGHT_ROOM_RASTER_VERSION)throw Error('Foreign prepared room metadata')
 assertCanonicalRoomStateRead(result.canonicalRead,result.tailOperations,state.room.id)
 return result
}
