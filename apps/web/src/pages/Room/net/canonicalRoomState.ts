import {CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_RECORDED_ATTACHMENT_LIMITS,LEGACY_ROOM_RASTER_VERSION,STRAIGHT_ROOM_RASTER_VERSION,readRoomRasterVersion,canonicalRecordedRasterProfiles,prepareCanonicalRecordedAttachment,type CanonicalPreparedRecordedOperation,type CanonicalStrokeRasterProfile,type Operation,type ServerToClientEvents} from '@grafetto/shared'
import {captureCanonicalHistoryScope,type CanonicalHistoryScope} from './canonicalHistoryPage'

type WireState=Parameters<ServerToClientEvents['room_state']>[0]
const authority:unique symbol=Symbol('prepared-canonical-room-state')
export interface CanonicalRoomStateRead {
 readonly scope:CanonicalHistoryScope
 readonly authorRasterProfile:CanonicalStrokeRasterProfile
 readonly tailOperations:readonly Operation[]
 readonly preparedAtoms:readonly CanonicalPreparedRecordedOperation[]
 readonly [authority]:(candidate:unknown,operations:readonly Operation[],boardId:string)=>void
}
export type PreparedCanonicalRoomState=WireState&{readonly canonicalRead:CanonicalRoomStateRead}
export type RoomStateDelivery=WireState&{readonly canonicalRead?:CanonicalRoomStateRead}
export type CanonicalRoomStatePreparer=(state:WireState)=>PreparedCanonicalRoomState
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
 const {expectedBoardId,isCurrent}=lifetime
 if(!isCurrent()||state.room.id!==expectedBoardId||readRoomRasterVersion(state.room.rasterVersion)!==STRAIGHT_ROOM_RASTER_VERSION)throw Error('Stale canonical room state')
 const wireScope=state.canonicalReadScope
 if(!wireScope||Reflect.ownKeys(wireScope).some(key=>!['roomId','boardEpoch','rasterProfile','allowedRasterProfiles'].includes(String(key)))||wireScope.roomId!==expectedBoardId||!Number.isSafeInteger(wireScope.boardEpoch)||wireScope.boardEpoch<0||wireScope.boardEpoch>=Number.MAX_SAFE_INTEGER)throw Error('Invalid canonical room state scope')
 const profiles=canonicalRecordedRasterProfiles(wireScope)
 const authorRasterProfile=state.canonicalAuthorRasterProfile===undefined?CANONICAL_STROKE_RASTER_PROFILE:state.canonicalAuthorRasterProfile
 if(!profiles.includes(authorRasterProfile))throw Error('Invalid canonical room state author profile')
 const scope=captureCanonicalHistoryScope({roomId:expectedBoardId,boardEpoch:wireScope.boardEpoch,allowedRasterProfiles:profiles,isCurrent})!
 if(!Array.isArray(state.tailOperations)||state.tailOperations.length>CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings)throw Error('Invalid canonical room state tail')
 const hasCanonical=state.tailOperations.some(op=>op.type==='canonical_stroke')
 const preparedAtoms=hasCanonical||state.canonicalCapabilities!==undefined
  ?prepareCanonicalRecordedAttachment(state.canonicalCapabilities,state.tailOperations,scope)
  :Object.freeze(state.tailOperations.map(operation=>Object.freeze({operation})))
 const operations=preparedAtoms.map(atom=>atom.operation);Object.freeze(operations)
 let read:CanonicalRoomStateRead
 read=Object.freeze({scope,authorRasterProfile,tailOperations:operations,preparedAtoms,[authority]:(candidate:unknown,tail:readonly Operation[],boardId:string)=>{
  if(candidate!==read||tail!==operations||boardId!==expectedBoardId||!isCurrent())throw Error('Stale or foreign canonical room state preparation')
 }})
 assertCanonicalRoomStateRead(read,operations,expectedBoardId)
 return Object.freeze({...state,tailOperations:operations,canonicalRead:read})
}
/** Runs before ordered brush loading, review stores, refs or replay queues.
 * No injected preparer means the existing legacy-only lane remains closed. */
export function preflightRoomStateDelivery(state:WireState,prepare?:CanonicalRoomStatePreparer):RoomStateDelivery {
 const version=readRoomRasterVersion(state.room.rasterVersion)
 if(version===LEGACY_ROOM_RASTER_VERSION){
  if(state.canonicalReadScope!==undefined||state.canonicalAuthorRasterProfile!==undefined||state.canonicalCapabilities!==undefined||Object.hasOwn(state,'canonicalRead'))throw Error('Unexpected canonical legacy room state')
  return state
 }
 if(version!==STRAIGHT_ROOM_RASTER_VERSION||!prepare)throw Error('Unsupported canonical room state')
 const result=prepare(state)
 if(result.room.id!==state.room.id||readRoomRasterVersion(result.room.rasterVersion)!==STRAIGHT_ROOM_RASTER_VERSION)throw Error('Foreign prepared room metadata')
 assertCanonicalRoomStateRead(result.canonicalRead,result.tailOperations,state.room.id)
 return result
}
