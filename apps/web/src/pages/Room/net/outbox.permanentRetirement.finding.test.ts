import {expect,it} from 'vitest'
import type {Operation,SendResult,StrokeOperation} from '@grafetto/shared'
import {operationRejectReason,type GateBoard,type GateLesson} from '../../../../../server/src/rooms/operationGate'
import {Outbox} from './outbox'
import {createInMemoryOutboxStorage} from './outboxStorage'
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
// Known OPEN #777. Real permission gate + Outbox; accepted-only dedup is the
// socketHandlers contract. A rejected verdict is not a server journal row.
for(const transition of ['board-gate','dispose'] as const)it.fails(`OPEN #777: a late permanent rejection cannot be accepted on reopening after ${transition}`,async()=>{
 const storage=createInMemoryOutboxStorage(),accepted=new Map<string,Operation>()
 const board:GateBoard={room:{},lockedLayerIds:new Set(),sharedLockedLayerIds:new Set(),aliveIds:new Set(['L']),deletedIds:new Set()}
 const lesson:GateLesson={room:{ownerId:'owner'},participants:new Map([['owner',{role:'owner'}],['A',{role:'member'}]]),roomFrozen:true,frozenUserIds:new Set()}
 const original:StrokeOperation={id:'permanently-refused-tail',type:'stroke',userId:'A',layerId:'L',tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',color:[0,0,1],dabs:[],timestamp:1}
 let currentBoard='old',release!:()=>void,attempts=0
 const send=async(op:Operation):Promise<SendResult>=>{
  if(accepted.has(op.id))return {ok:true,seq:1}
  const reason=operationRejectReason(board,lesson,op.userId,op)
  if(attempts++===0){expect(reason).toBe('room_frozen');return new Promise(resolve=>{release=()=>resolve({ok:false,reason:reason!})})}
  if(reason)return {ok:false,reason}
  accepted.set(op.id,op);return {ok:true,seq:1}
 }
 let active=new Outbox({roomId:'old',storage,send,canSend:()=>currentBoard==='old'})
 try{
  await active.enqueue(original);await flush()
  if(transition==='dispose')active.dispose();else currentBoard='next'
  release();await flush()
  expect(accepted.size).toBe(0)
  expect(await storage.getAll('old')).toHaveLength(1)
  lesson.roomFrozen=false;currentBoard='old'
  if(transition==='dispose')active=new Outbox({roomId:'old',storage,send})
  await active.resendAll();await flush()
  expect(attempts).toBe(2)
  // Desired terminal-verdict guarantee: reopening must not publish the
  // original stroke after the server already rejected that submission.
  expect(accepted.has(original.id)).toBe(false)
 }finally{active.dispose()}
})
