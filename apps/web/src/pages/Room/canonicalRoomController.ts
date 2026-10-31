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
export function createCanonicalRoomVerdicts({repair,isReplacing}:{readonly repair:()=>void;readonly isReplacing:()=>boolean}):CanonicalOutboxVerdicts{
 const repairIfNeeded=()=>{if(!isReplacing())repair()}
 const verdicts:CanonicalOutboxVerdicts={onSettled:(_op,result)=>{if(!result.ok)repairIfNeeded()},onStalled:repairIfNeeded}
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
