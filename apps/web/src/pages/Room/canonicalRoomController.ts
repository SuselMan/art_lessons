import {assertCanonicalRoomStateRead,type CanonicalRoomStateRead} from './net/canonicalRoomState'
import type {RoomStatePayload} from './restoreRoomState'
import type {CanonicalOutboxVerdicts} from './net/outboxVerdict'
import {sendCanonicalStrokeBegin,type CanonicalBeginEmitter} from './net/sendCanonicalStrokeBegin'
import type {CanonicalSourceAuthorService,PencilEngineAPI} from '../../engine'

/** The existing pending stash is the sole payload owner before construction. */
export function canonicalBootstrapOf(stash:RoomStatePayload|null|undefined,boardId:string,required:boolean){
 if(!stash?.canonicalRead){if(required)throw Error('Original canonical bootstrap unavailable');return undefined}
 if(!required)throw Error('Canonical bootstrap requires straight engine policy')
 const read=stash.canonicalRead,tail=stash.tailOperations
 assertCanonicalRoomStateRead(read,tail,boardId)
 if(stash.latestSnapshotSeq!==null||!read.fullHistoryBase||!read.assertFullHistoryBase)throw Error('Full canonical bootstrap required')
 read.assertFullHistoryBase(tail)
 return {read,tail}
}
export function stageCanonicalRoomReplacement(stash:RoomStatePayload,deps:{readonly boardId:string;readonly minimumSequence:number;readonly pending:{current:RoomStatePayload|null};readonly installedRead:CanonicalRoomStateRead|undefined;readonly hasPendingLocals:()=>boolean;readonly retire:()=>void;readonly bump:()=>void}):boolean{
 const original=canonicalBootstrapOf(stash,deps.boardId,true)!
 if(deps.pending.current?.canonicalRead===original.read||deps.installedRead===original.read)return false
 if(deps.hasPendingLocals())throw Error('Canonical replacement has unresolved local work')
 if(!Number.isSafeInteger(deps.minimumSequence)||deps.minimumSequence<0||original.read.fullHistoryBase!.throughSeq<deps.minimumSequence)throw Error('Canonical replacement cut precedes accepted work')
 // No queue: replace the SAME pending slot only after every admission check.
 deps.retire();deps.pending.current=stash;deps.bump();return true
}
export function createCanonicalRoomAuthor(read:CanonicalRoomStateRead,socket:CanonicalBeginEmitter,getSocket:()=>CanonicalBeginEmitter|null,isEngineCurrent:()=>boolean):CanonicalSourceAuthorService{
 read.assertCurrent()
 const service:CanonicalSourceAuthorService={begin:(input,lifetime)=>sendCanonicalStrokeBegin(socket,input,{boardEpoch:read.scope.boardEpoch,
  authorRasterProfile:read.authorRasterProfile,responseRasterProfiles:read.scope.allowedRasterProfiles??(read.scope.rasterProfile?[read.scope.rasterProfile]:undefined),signal:lifetime.signal,
  isCurrent:()=>{try{read.assertCurrent();return getSocket()===socket&&isEngineCurrent()&&lifetime.isCurrent()}catch{return false}}})}
 return Object.freeze(service)
}
/** Stable control facade, not a recorded-read factory. ACK precedes broadcast. */
export function createCanonicalRoomVerdicts({repair,isReplacing,drain}:{readonly repair:()=>void;readonly isReplacing:()=>boolean;readonly drain?:()=>unknown}):CanonicalOutboxVerdicts{
 const repairIfNeeded=()=>{if(!isReplacing())repair()}
 const verdicts:CanonicalOutboxVerdicts={onSettled:(_op,result)=>{if(result.ok)drain?.();else repairIfNeeded()},onStalled:repairIfNeeded}
 return Object.freeze(verdicts)
}

/** Bulk publication updates the EXISTING idempotency set only after the same
 * engine has committed the same original read. ACKs never call this. */
export async function restoreCanonicalRoomBaseline(engine:PencilEngineAPI,read:CanonicalRoomStateRead,tail:readonly import('@grafetto/shared').Operation[],currentEngine:()=>PencilEngineAPI|null,applied:Set<string>):Promise<void>{
 assertCanonicalRoomStateRead(read,tail,read.scope.roomId)
 if(currentEngine()!==engine)throw Error('Canonical baseline engine replaced')
 await engine.restoreCanonicalEmptyRoom(read,tail)
 assertCanonicalRoomStateRead(read,tail,read.scope.roomId)
 if(currentEngine()!==engine)throw Error('Canonical baseline engine replaced')
 for(const operation of tail)applied.add(operation.id)
}

/** One control latch for the current engine, never an operation/payload queue.
 * Fault callbacks already arrive after source holds reach zero. Outbox final
 * settlement invokes drain after publishing its accepted sequence watermark. */
export function createCanonicalRecoveryControl(deps:{readonly getEngine:()=>PencilEngineAPI|null;readonly getBoard:()=>string|null;readonly hasPendingLocals:()=>boolean;readonly canRequest:()=>boolean;readonly resync:()=>void;readonly onWaiting:()=>void}){
 type Origin={engine:PencilEngineAPI;board:string;phase:'restoring'|'ready'|'waiting'|'joining'|'failed';requested:boolean}
 let origin:Origin|undefined
 const matches=(engine:PencilEngineAPI,board:string)=>origin?.engine===engine&&origin.board===board&&deps.getEngine()===engine&&deps.getBoard()===board
 const drain=():boolean=>{
  const owner=origin
  if(!owner||!owner.requested||owner.phase!=='waiting'||!matches(owner.engine,owner.board))return false
  if(owner.engine.hasActiveCanonicalAuthor()||deps.hasPendingLocals()||!deps.canRequest())return false
  owner.phase='joining'
  try{deps.resync()}catch{owner.phase='failed';deps.onWaiting();return false}
  return true
 }
 const request=(engine:PencilEngineAPI,board:string):void=>{
  if(!matches(engine,board))return
  const owner=origin!
  if(owner.requested){drain();return}
  owner.requested=true
  if(owner.phase==='ready')owner.phase='waiting'
  deps.onWaiting()
  // Arm first: locking can synchronously finish a source and reenter here.
  try{engine.setLocked(true)}catch{owner.phase='failed';return}
  drain()
 }
 return Object.freeze({
  bind(engine:PencilEngineAPI,board:string){if(origin?.engine===engine&&origin.board===board)return;origin={engine,board,phase:'restoring',requested:false}},
  detach(engine:PencilEngineAPI){if(origin?.engine===engine)origin=undefined},
  request,drain,
  restored(engine:PencilEngineAPI){if(origin?.engine!==engine)return;origin.phase=origin.requested?'waiting':'ready';drain()},
  failed(engine:PencilEngineAPI){if(origin?.engine===engine)origin.phase='failed'},
  retry(engine:PencilEngineAPI,board:string){if(!matches(engine,board))return;origin!.phase='waiting';origin!.requested=false;request(engine,board)},
  isReplacing:()=>origin?.phase==='joining'||origin?.phase==='restoring',
 })
}
