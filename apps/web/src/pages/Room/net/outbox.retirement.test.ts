import {expect,it,vi} from 'vitest'
import type {Operation,SendResult,StrokeOperation} from '@grafetto/shared'
import {Outbox} from './outbox'
import {createInMemoryOutboxStorage} from './outboxStorage'
import {createOutboxVerdicts} from './outboxVerdict'
const stroke:StrokeOperation={id:'old-board-wet',type:'stroke',userId:'A',layerId:'L',timestamp:1,tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',color:[0,0,1],dabs:[]}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
for(const result of [{ok:true,seq:9},{ok:false,reason:'target_gone'}] satisfies SendResult[])it(`${result.ok?'ACK':'recovery'} settles on its own board before durable deletion yields`,async()=>{
 const backing=createInMemoryOutboxStorage()
 let release!:()=>void,started!:()=>void
 const deletionStarted=new Promise<void>(resolve=>{started=resolve})
 const deletionGate=new Promise<void>(resolve=>{release=resolve})
 const deps={pendingIdsRef:{current:new Set<string>()},latestKnownSeqRef:{current:0},confirmOperation:vi.fn(),discardOperation:vi.fn(),checkSnapshotBoundary:vi.fn(),resolveTransformCommit:vi.fn(),scheduleLostWorkRecovery:vi.fn(),setLostWork:vi.fn()}
 const outbox=new Outbox({roomId:'old-board',storage:{...backing,delete:async id=>{started();await deletionGate;await backing.delete(id)}},send:async()=>result,...createOutboxVerdicts(deps)})
 const error=vi.spyOn(console,'error').mockImplementation(()=>{})
 try{
  await outbox.enqueue(stroke);await deletionStarted
  expect(deps.confirmOperation).toHaveBeenCalledTimes(result.ok?1:0)
  expect(deps.discardOperation).toHaveBeenCalledTimes(result.ok?0:1)
  expect(deps.scheduleLostWorkRecovery).toHaveBeenCalledTimes(result.ok?0:1)
  expect(deps.checkSnapshotBoundary).toHaveBeenCalledTimes(result.ok?1:0)
  expect(deps.resolveTransformCommit).toHaveBeenCalledTimes(result.ok?0:1)
  const counts=Object.values(deps).filter(value=>vi.isMockFunction(value)).map(value=>value.mock.calls.length)
  outbox.dispose() // React now switches the shared engine/board refs.
  release();await flush()
  expect(Object.values(deps).filter(value=>vi.isMockFunction(value)).map(value=>value.mock.calls.length)).toEqual(counts)
  expect(deps.latestKnownSeqRef.current).toBe(result.ok?9:0)
 }finally{release();outbox.dispose();error.mockRestore()}
})
it('retirement during the final retry persistence prevents a stale stalled callback',async()=>{
 const backing=createInMemoryOutboxStorage(),scheduled:Array<()=>void>=[]
 let release!:()=>void,started!:()=>void
 const gate=new Promise<void>(resolve=>{release=resolve}),persistStarted=new Promise<void>(resolve=>{started=resolve})
 const onStalled=vi.fn(),onPendingChange=vi.fn()
 const outbox=new Outbox({roomId:'old-board',storage:{...backing,put:async entry=>{if(entry.attempts===12){started();await gate}await backing.put(entry)}},send:async()=>{throw new Error('offline')},schedule:fn=>{scheduled.push(fn)},onStalled,onPendingChange})
 try{
  await outbox.enqueue(stroke)
  for(let i=0;i<11;i++){await flush();expect(scheduled.length).toBeGreaterThan(0);scheduled.shift()!()}
  await persistStarted;outbox.dispose();const count=onPendingChange.mock.calls.length
  release();await flush()
  expect(onStalled).not.toHaveBeenCalled()
  expect(onPendingChange).toHaveBeenCalledTimes(count)
  expect(scheduled).toHaveLength(0)
  expect(await backing.getAll('old-board')).toHaveLength(1)
 }finally{release();outbox.dispose()}
})
it('a pending-count page turn happens after causal settlement and receives no later callback',async()=>{
 const settled=vi.fn(),storage=createInMemoryOutboxStorage()
 let outbox!:Outbox
 const changes=vi.fn((pending:number)=>{if(pending===0)outbox.dispose()})
 outbox=new Outbox({roomId:'old-board',storage,send:async()=>({ok:true,seq:1}),onSettled:settled,onPendingChange:changes})
 try{
  await outbox.enqueue(stroke);await flush()
  expect(settled).toHaveBeenCalledTimes(1)
  expect(settled.mock.invocationCallOrder[0]).toBeLessThan(changes.mock.invocationCallOrder.at(-1)!)
  expect(await storage.getAll('old-board')).toHaveLength(0)
 }finally{outbox.dispose()}
})
it('a board mismatch before React retires the old queue keeps its in-flight verdict isolated and durable',async()=>{
 const storage=createInMemoryOutboxStorage(),settled=vi.fn()
 let board='old-board',resolve!: (result:SendResult)=>void
 const outbox=new Outbox({roomId:'old-board',storage,canSend:()=>board==='old-board',send:()=>new Promise<SendResult>(done=>{resolve=done}),onSettled:settled})
 try{
  await outbox.enqueue(stroke);await flush()
  board='next-board' // join/resetForBoard already updated refs; passive disposal has not run.
  resolve({ok:false,reason:'target_gone'});await flush()
  expect(settled).not.toHaveBeenCalled()
  expect(await storage.getAll('old-board')).toHaveLength(1)
 }finally{outbox.dispose()}
})

it('a temporary same-board send gate preserves an ACK until rejoin resends the original ID safely',async()=>{
 const storage=createInMemoryOutboxStorage(),settled=vi.fn()
 let joined=true,resolve!:(result:SendResult)=>void
 const send=vi.fn((_op:Operation)=>new Promise<SendResult>(done=>{resolve=done}))
 const outbox=new Outbox({roomId:'old-board',storage,canSend:()=>joined,send,onSettled:settled})
 try{
  await outbox.enqueue(stroke);await flush()
  joined=false;resolve({ok:true,seq:9});await flush()
  expect(settled).not.toHaveBeenCalled()
  expect(await storage.getAll('old-board')).toHaveLength(1)
  joined=true;await outbox.resendAll();await flush()
  expect(send).toHaveBeenCalledTimes(2)
  expect(send.mock.calls[0]).toEqual(send.mock.calls[1])
  resolve({ok:true,seq:9});await flush()
  expect(settled).toHaveBeenCalledExactlyOnceWith(stroke,{ok:true,seq:9})
  expect(await storage.getAll('old-board')).toHaveLength(0)
 }finally{outbox.dispose()}
})
