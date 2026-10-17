import {expect,it,vi} from 'vitest'
import type {Operation,SendResult,StrokeOperation} from '@grafetto/shared'
import {Outbox} from './outbox'
import {createTestEngine,makeLayerAdd,makeStroke,dab,readTilePixels} from '../../../engine/testing/engineTestUtils'
import {createInMemoryOutboxStorage} from './outboxStorage'
import {createDurableRecoveryPrototype} from './durableRecoveryPrototype'
const stroke:StrokeOperation={id:'original',type:'stroke',userId:'A',layerId:'dead',timestamp:1,tool:'pencil',preset:'HB',color:[0,0,0],dabs:[]}
const tick=async()=>{for(let i=0;i<30;i++)await Promise.resolve()}
const plan=()=>{let n=0;return {live:{items:{},rootOrder:[],activeId:'',selectedIds:[]},log:[],restored:null,userId:'A',unnamedLayer:'lost',restoredName:(name:string)=>name,newId:()=>`recovered-${++n}`,now:()=>10}}
it('board reset during debounce retains replacements on the old board and restart never sends original',async()=>{
 const storage=createInMemoryOutboxStorage(),publish=vi.fn();let current=true
 const planner=createDurableRecoveryPrototype({roomId:'old',storage,plan:plan(),isCurrent:()=>current,publish})
 const outbox=new Outbox({roomId:'old',storage,send:async()=>({ok:false,reason:'target_gone'}),experimentalDurableTerminal:{handoff:entry=>planner.enqueue(entry)}})
 await outbox.enqueue(stroke);await tick()
 expect((await storage.getAll('old'))[0].terminal?.result.reason).toBe('target_gone')
 current=false;outbox.dispose();await planner.flush();await outbox.whenTerminalIdle()
 expect(publish).not.toHaveBeenCalled();expect(await storage.getAll('new')).toEqual([])
 const rows=await storage.getAll('old');expect(rows.map(row=>row.op.type)).toEqual(['layer_add','stroke'])
 const send=vi.fn(async(_op:Operation)=>({ok:true as const,seq:1}))
 const reopened=new Outbox({roomId:'old',storage,send,experimentalDurableTerminal:{}})
 await reopened.resendAll();await tick();expect(send).toHaveBeenCalledTimes(2)
 expect(send.mock.calls.every(call=>(call as unknown as [StrokeOperation])[0].id!==stroke.id)).toBe(true)
 reopened.dispose()
})
it('late permanent rejection after retirement is terminal at restart, including after unfreeze',async()=>{
 const storage=createInMemoryOutboxStorage();let verdict!:(result:SendResult)=>void
 const outbox=new Outbox({roomId:'old',storage,send:()=>new Promise(resolve=>{verdict=resolve}),experimentalDurableTerminal:{}})
 await outbox.enqueue(stroke);await tick();outbox.dispose();verdict({ok:false,reason:'room_frozen'});await tick();await outbox.whenTerminalIdle()
 expect((await storage.getAll('old'))[0].terminal).toBeDefined()
 const send=vi.fn(async()=>({ok:true as const,seq:1})),reopened=new Outbox({roomId:'old',storage,send,experimentalDurableTerminal:{}})
 await reopened.resendAll();await tick();await reopened.whenTerminalIdle();expect(send).not.toHaveBeenCalled();reopened.dispose()
})
it('two pending handoffs release both network slots before any replacement ACK',async()=>{
 const storage=createInMemoryOutboxStorage();let release!:()=>void
 const gate=new Promise<void>(resolve=>{release=resolve}),send=vi.fn(async(op:Operation)=>op.id==='third'?{ok:true as const,seq:3}:{ok:false as const,reason:'target_gone' as const})
 const outbox=new Outbox({roomId:'old',storage,send,experimentalDurableTerminal:{handoff:()=>gate}})
 await Promise.all([outbox.enqueue(stroke),outbox.enqueue({...stroke,id:'second'}),outbox.enqueue({...stroke,id:'third'})]);await tick()
 expect(send).toHaveBeenCalledTimes(3);release();await outbox.whenTerminalIdle();outbox.dispose()
})
it('terminal disk failure remains observable and does not retry rejected payload on the network',async()=>{
 const base=createInMemoryOutboxStorage(),send=vi.fn(async()=>({ok:false as const,reason:'target_gone' as const}))
 const storage={...base,putGuarded:async(entry:Parameters<NonNullable<typeof base.putGuarded>>[0])=>{if(entry.terminal)throw new Error('disk failed');return base.putGuarded!(entry)}}
 const outbox=new Outbox({roomId:'old',storage,send,experimentalDurableTerminal:{}})
 await outbox.enqueue(stroke);await tick();await expect(outbox.whenTerminalIdle()).rejects.toThrow('disk failed');expect(send).toHaveBeenCalledTimes(1);outbox.dispose()
})

it('durable restart recovers actual lost pixels without painting the new board',async()=>{
 const old=createTestEngine({userId:'A',pageWidth:16,pageHeight:16},{width:16,height:16}).engine
 const reopened=createTestEngine({userId:'A',pageWidth:16,pageHeight:16},{width:16,height:16}).engine
 const next=createTestEngine({userId:'A',pageWidth:16,pageHeight:16},{width:16,height:16}).engine
 const storage=createInMemoryOutboxStorage();let current=true
 old.appendOperation({...makeLayerAdd('B','dead'),seq:1},'remote')
 const original=makeStroke('A','dead',[dab(8,8,{size:7,opacity:1,pressure:1})],{id:'original'})
 old.appendOperation(original)
 const expected=readTilePixels(old,'dead',0,0,16,16)!
 const planner=createDurableRecoveryPrototype({roomId:'old',storage,plan:plan(),isCurrent:()=>current,publish:ops=>{for(const op of ops)old.appendOperation(op)}})
 const outbox=new Outbox({roomId:'old',storage,send:async()=>({ok:false,reason:'target_gone'}),experimentalDurableTerminal:{observe:entry=>old.discardOperation(entry.op.id),handoff:entry=>planner.enqueue(entry)}})
 try{
  await outbox.enqueue(original);await tick();current=false;outbox.dispose()
  await planner.flush();await outbox.whenTerminalIdle()
  const rows=await storage.getAll('old')
  for(const row of rows)reopened.appendOperation(row.op)
  const recovered=rows.find(row=>row.op.type==='stroke')!.op as StrokeOperation
  expect(readTilePixels(reopened,recovered.layerId,0,0,16,16)).toEqual(expected)
  expect(next.getOperations()).toEqual([])
  expect(rows.every(row=>row.op.id!==original.id)).toBe(true)
 }finally{outbox.dispose();old.destroy();reopened.destroy();next.destroy()}
})
it('a stale second opt-in writer cannot send or overwrite the first terminal decision',async()=>{
 const storage=createInMemoryOutboxStorage()
 await storage.put({op:stroke,roomId:'old',attempts:0,nextRetryAt:0,terminal:{result:{ok:false,reason:'target_gone'},recordedAt:2}})
 const send=vi.fn(async()=>({ok:true as const,seq:1}))
 const second=new Outbox({roomId:'old',storage,send,experimentalDurableTerminal:{}})
 try{
  await second.enqueue(stroke);await tick();await second.whenTerminalIdle()
  expect(send).not.toHaveBeenCalled();expect((await storage.getAll('old'))[0].terminal).toBeDefined()
 }finally{second.dispose()}
})
it('handoff abort reports failure while the terminal payload remains recoverable after restart',async()=>{
 const storage=createInMemoryOutboxStorage(),send=vi.fn(async()=>({ok:false as const,reason:'target_gone' as const}))
 const outbox=new Outbox({roomId:'old',storage,send,experimentalDurableTerminal:{handoff:async()=>{throw new Error('transaction aborted')}}})
 await outbox.enqueue(stroke);await tick();await expect(outbox.whenTerminalIdle()).rejects.toThrow('transaction aborted');outbox.dispose()
 const restarted=new Outbox({roomId:'old',storage,send,experimentalDurableTerminal:{}})
 await restarted.resendAll();await tick();await restarted.whenTerminalIdle()
 expect(send).toHaveBeenCalledTimes(1);expect((await storage.getAll('old'))[0].op).toEqual(stroke);restarted.dispose()
})
