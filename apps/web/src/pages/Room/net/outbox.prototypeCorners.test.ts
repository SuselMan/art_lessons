import {expect,it,vi} from 'vitest'
import type {StrokeOperation} from '@grafetto/shared'
import {Outbox} from './outbox'
import {createInMemoryOutboxStorage,type OutboxEntry} from './outboxStorage'
import {createDurableRecoveryPrototype} from './durableRecoveryPrototype'
const stroke=(id:string):StrokeOperation=>({id,type:'stroke',userId:'A',layerId:'dead',timestamp:1,tool:'pencil',preset:'HB',color:[0,0,0],dabs:[]})
const row=(id:string):OutboxEntry=>({op:stroke(id),roomId:'old',attempts:0,nextRetryAt:0,terminal:{result:{ok:false,reason:'target_gone'},recordedAt:2}})
const tick=async()=>{for(let i=0;i<30;i++)await Promise.resolve()}
it('retirement by another writer during final retry does not leave a phantom stalled ID',async()=>{
 const storage=createInMemoryOutboxStorage(),scheduled:Array<()=>void>=[],onStalled=vi.fn();let attempts=0
 const outbox=new Outbox({roomId:'old',storage,experimentalDurableTerminal:{},schedule:fn=>{scheduled.push(fn)},onStalled,send:async()=>{
  if(++attempts===12){await storage.put(row('a'));await storage.replaceTerminal!('old',['a'],[{op:stroke('replacement'),roomId:'old',attempts:0,nextRetryAt:0}])}
  throw new Error('timeout')
 }})
 try{
  await outbox.enqueue(stroke('a'))
  for(let i=0;i<11;i++){await tick();scheduled.shift()!()}
  await tick();expect(outbox.pendingCount).toBe(0);expect(outbox.stalledCount).toBe(0);expect(onStalled).not.toHaveBeenCalled()
 }finally{outbox.dispose()}
})
it('a second enqueue and only scheduled flush during an earlier transaction is drained',async()=>{
 const base=createInMemoryOutboxStorage();await base.put(row('a'));await base.put(row('b'))
 let release!:()=>void,started!:()=>void,n=0
 const gate=new Promise<void>(resolve=>{release=resolve}),entered=new Promise<void>(resolve=>{started=resolve})
 const storage={...base,replaceTerminal:async(...args:Parameters<NonNullable<typeof base.replaceTerminal>>)=>{if(++n===1){started();await gate}return base.replaceTerminal!(...args)}}
 let id=0
 const planner=createDurableRecoveryPrototype({roomId:'old',storage,isCurrent:()=>false,publish:()=>{},plan:{live:{items:{},rootOrder:[],activeId:'',selectedIds:[]},log:[],restored:null,userId:'A',unnamedLayer:'lost',restoredName:name=>name,newId:()=>`replacement-${++id}`,now:()=>10}})
 const a=planner.enqueue(row('a'));const first=planner.flush();await entered
 const b=planner.enqueue(row('b'));const second=planner.flush();release()
 try{await first;await second;expect((await base.getAll('old')).some(entry=>entry.op.id==='b')).toBe(false);await Promise.all([a,b])}
 finally{await planner.flush()}
})
it('same-ID cross-board writes are rejected instead of adopting another board terminal row',async()=>{
 const storage=createInMemoryOutboxStorage();await storage.put(row('a'))
 await expect(storage.putGuarded!({...row('a'),roomId:'new'})).rejects.toThrow('board')
 expect((await storage.getAll('old'))[0].terminal).toBeDefined();expect(await storage.getAll('new')).toEqual([])
})
