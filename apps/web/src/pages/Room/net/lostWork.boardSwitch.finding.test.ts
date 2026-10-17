import {expect,it,vi} from 'vitest'
import type {LayerState} from '@grafetto/shared'
import {createTestEngine,makeLayerAdd,makeStroke,dab,readTilePixels} from '../../../engine/testing/engineTestUtils'
import {Outbox} from './outbox'
import {createInMemoryOutboxStorage} from './outboxStorage'
import {createOutboxVerdicts} from './outboxVerdict'
import {createLostWorkBatcher,recoveryOperations} from './lostWork'
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
// Known OPEN #777. The desired survival assertion must fail until a durable
// recovery handoff exists; the preceding assertions prove the concrete loss.
it.fails('OPEN #777: board reset before the 800ms recovery flush loses the only remaining content copy',async()=>{
 const old=createTestEngine({userId:'A',pageWidth:16,pageHeight:16},{width:16,height:16}).engine
 const next=createTestEngine({userId:'A',pageWidth:16,pageHeight:16},{width:16,height:16}).engine
 const storage=createInMemoryOutboxStorage(),timers=new Map<number,()=>void>()
 let timerId=0,id=0,active=old
 const empty:LayerState={items:{},rootOrder:[],activeId:'',selectedIds:[]}
 const recovery=vi.fn((lost:Parameters<typeof recoveryOperations>[0]['lost'])=>{
  const {operations}=recoveryOperations({lost,live:empty,log:active.getOperations(),restored:null,userId:'A',unnamedLayer:'layer',restoredName:name=>name,newId:()=>`recovery-${++id}`,now:()=>1000})
  for(const op of operations)active.appendOperation(op)
 })
 const batch=createLostWorkBatcher({onFlush:recovery,quietMs:800,maxWaitMs:5000,now:()=>0,timers:{set:fn=>{const id=++timerId;timers.set(id,fn);return id},clear:id=>{timers.delete(id)}}})
 const deps={pendingIdsRef:{current:new Set<string>()},latestKnownSeqRef:{current:0},confirmOperation:vi.fn(),discardOperation:(op:Parameters<typeof old.appendOperation>[0])=>{active.discardOperation(op.id)},checkSnapshotBoundary:vi.fn(),resolveTransformCommit:vi.fn(),scheduleLostWorkRecovery:batch.add,setLostWork:vi.fn()}
 const outbox=new Outbox({roomId:'old-board',storage,send:async()=>({ok:false,reason:'target_gone'}),...createOutboxVerdicts(deps)})
 const error=vi.spyOn(console,'error').mockImplementation(()=>{})
 try{
  old.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote')
  const original=makeStroke('A','L',[dab(8,8,{size:7,opacity:1,pressure:1})],{id:'lost-content'})
  old.appendOperation(original)
  expect(readTilePixels(old,'L',0,0,16,16)!.some(v=>v>0)).toBe(true)
  await outbox.enqueue(original);await flush()
  expect(timers.size).toBe(1)
  expect(old.getOperations().some(op=>op.id===original.id)).toBe(false)
  expect(await storage.getAll('old-board')).toHaveLength(0)
  batch.reset();active=next;outbox.dispose() // enterBoard/resetLostWork before 800ms.
  for(const timer of timers.values())timer()
  expect(recovery).not.toHaveBeenCalled()
  expect(next.getOperations()).toHaveLength(0)
  const durable=await storage.getAll('old-board')
  // Desired guarantee: content must remain in either a durable record or an
  // engine recovery operation. Currently all three copies are absent.
  expect(durable.length>0 || old.getOperations().some(op=>op.type==='stroke') || next.getOperations().some(op=>op.type==='stroke')).toBe(true)
 }finally{batch.reset();outbox.dispose();old.destroy();next.destroy();error.mockRestore()}
})
