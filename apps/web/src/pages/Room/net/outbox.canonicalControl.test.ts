import {describe,it,expect,vi} from 'vitest'
import type {OperationUndoOperation,SendResult} from '@grafetto/shared'
import {Outbox,type CanonicalSendLineage} from './outbox'
import {createInMemoryOutboxStorage,type OutboxEntry} from './outboxStorage'
const room='control-room',lane='canonical-control-v1' as const
const operation=(id='undo'):OperationUndoOperation=>({id,type:'operation_undo',userId:'author',timestamp:1,targetOpId:'frame'})
const stored=(op=operation()):OutboxEntry=>({op,roomId:room,attempts:0,nextRetryAt:0})
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return{promise,resolve}}
const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve()}
describe('SAME Outbox local canonical control lane',()=>{
 it('persists only outer classification and hydrates without read/lineage while sending unchanged operation JSON',async()=>{
  const memory=createInMemoryOutboxStorage(),op=operation(),first=new Outbox({roomId:room,storage:memory,canSend:()=>false,send:vi.fn()})
  await first.enqueue(op,{deliveryLane:lane});const copy=JSON.parse(JSON.stringify((await memory.getAll(room))[0]));expect(copy.deliveryLane).toBe(lane);expect(JSON.stringify(copy.op)).toBe(JSON.stringify(op));first.dispose()
  const storage=createInMemoryOutboxStorage();await storage.put(copy);const settled=vi.fn((..._args:unknown[])=>{}),sent:string[]=[],second=new Outbox({roomId:room,storage,onSettled:settled,send:async input=>{sent.push(JSON.stringify(input));return{ok:true,seq:5}}})
  await second.hydrate();await second.resendAll();await flush();expect(sent).toEqual([JSON.stringify(op)]);expect(settled).toHaveBeenCalledWith(op,{ok:true,seq:5},{roomId:room,deliveryLane:lane});expect(Object.isFrozen(settled.mock.calls[0][2])).toBe(true);second.dispose()
 })
 it('retains Attempt lineage across current read replacement and async durable-delete delay',async()=>{
  const memory=createInMemoryOutboxStorage(),answer=deferred<SendResult>(),deleted=deferred<void>(),old:CanonicalSendLineage={socket:{},connectionId:'one',boardId:room,originalRead:{}},settled=vi.fn((..._args:unknown[])=>{});let current=old
  const box=new Outbox({roomId:room,storage:{...memory,delete:async id=>{await deleted.promise;await memory.delete(id)}},getCanonicalSendLineage:()=>current,onSettled:settled,send:()=>answer.promise})
  const op=operation();await box.enqueue(op,{deliveryLane:lane});current={...old,originalRead:{}};answer.resolve({ok:true,seq:7});await flush();expect(settled).not.toHaveBeenCalled();deleted.resolve();await flush();expect(settled).toHaveBeenCalledWith(op,{ok:true,seq:7},{roomId:room,deliveryLane:lane,lineage:old});box.dispose()
 })
 it('preserves classification through backoff, retry and stalled notification',async()=>{
  const storage=createInMemoryOutboxStorage(),scheduled:(()=>void)[]=[],stalled=vi.fn((..._args:unknown[])=>{}),settled=vi.fn((..._args:unknown[])=>{});let fail=true
  const box=new Outbox({roomId:room,storage,schedule:fn=>scheduled.push(fn),onStalled:stalled,onSettled:settled,send:async()=>{if(fail)throw Error('offline');return{ok:true,seq:8}}})
  await box.enqueue(operation(),{deliveryLane:lane});await flush();for(let i=0;i<11;i++){scheduled.shift()!();await flush()}expect(box.stalledCount).toBe(1);expect(stalled).toHaveBeenCalledWith(operation(),{roomId:room,deliveryLane:lane});expect((await storage.getAll(room))[0].deliveryLane).toBe(lane);fail=false;await box.resendAll();await flush();expect(settled).toHaveBeenCalledWith(operation(),{ok:true,seq:8},{roomId:room,deliveryLane:lane});box.dispose()
 })
 it('retains first same-ID body/lane and refuses downgrade, body conflict and settling collision',async()=>{
  const memory=createInMemoryOutboxStorage(),answer=deferred<SendResult>(),deleted=deferred<void>(),send=vi.fn(()=>answer.promise),box=new Outbox({roomId:room,storage:{...memory,delete:async id=>{await deleted.promise;await memory.delete(id)}},send})
  const op=operation();await box.enqueue(op,{deliveryLane:lane});await box.enqueue({...op},{deliveryLane:lane});expect(send).toHaveBeenCalledOnce();await expect(box.enqueue({...op})).rejects.toThrow();await expect(box.enqueue({...op,targetOpId:'other'},{deliveryLane:lane})).rejects.toThrow();expect((await memory.getAll(room))[0].op).toMatchObject({targetOpId:'frame'});answer.resolve({ok:true,seq:9});await flush();await expect(box.enqueue({...op})).rejects.toThrow();deleted.resolve();await flush();box.dispose()
 })
 it('keeps historical absent lane legacy, including callback arity',async()=>{const done=vi.fn((..._args:unknown[])=>{}),box=new Outbox({roomId:room,storage:createInMemoryOutboxStorage(),onSettled:done,send:async()=>({ok:true,seq:1})});await box.enqueue(operation());await flush();expect(done).toHaveBeenCalledWith(operation(),{ok:true,seq:1});box.dispose()})
 it('never invokes option accessors or accepts marker on unrelated operation',async()=>{const invoked=vi.fn(),box=new Outbox({roomId:room,storage:createInMemoryOutboxStorage(),send:vi.fn()});const options={get deliveryLane(){invoked();return lane}};await expect(box.enqueue(operation(),options)).rejects.toThrow();expect(invoked).not.toHaveBeenCalled();await expect(box.enqueue({id:'other',type:'paper_dry',userId:'author',timestamp:0},{deliveryLane:lane})).rejects.toThrow();expect(box.pendingCount).toBe(0);box.dispose()})
 it.each(['unknown','accessor']as const)('retains PRESENT %s persisted marker visibly stalled without rewriting legacy',async kind=>{
  const base=stored(),invoked=vi.fn();Object.defineProperty(base,'deliveryLane',kind==='accessor'?{enumerable:true,get(){invoked();return lane}}:{enumerable:true,value:'future-control-v99'})
  const memory=createInMemoryOutboxStorage();await memory.put(base);const put=vi.spyOn(memory,'put'),send=vi.fn(),stalled=vi.fn((..._args:unknown[])=>{}),box=new Outbox({roomId:room,storage:memory,send,onStalled:stalled});await box.hydrate();await box.resendAll();await flush();expect(invoked).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();expect(put).not.toHaveBeenCalled();expect(box.pendingCount).toBe(1);expect(box.stalledCount).toBe(1);expect(stalled).toHaveBeenCalledOnce();await box.resendAll();await flush();expect(stalled).toHaveBeenCalledOnce();await box.whenIdle(10);box.dispose()
 })
 it('ignores old ACK after board dispose while retaining its persisted lane',async()=>{const memory=createInMemoryOutboxStorage(),answer=deferred<SendResult>(),done=vi.fn(),box=new Outbox({roomId:room,storage:memory,send:()=>answer.promise,onSettled:done});await box.enqueue(operation(),{deliveryLane:lane});box.dispose();answer.resolve({ok:true,seq:5});await flush();expect(done).not.toHaveBeenCalled();expect((await memory.getAll(room))[0].deliveryLane).toBe(lane)})
 it('captures immutable bounded metadata before persistence and never invokes operation getters',async()=>{
  const storage=createInMemoryOutboxStorage(),box=new Outbox({roomId:room,storage,canSend:()=>false,send:vi.fn()}),op=operation()
  await box.enqueue(op,{deliveryLane:lane});op.targetOpId='mutated';expect((await storage.getAll(room))[0].op).toMatchObject({targetOpId:'frame'})
  const getter=vi.fn(),bad=operation('bad');Object.defineProperty(bad,'targetOpId',{get(){getter();return 'frame'}})
  await expect(box.enqueue(bad,{deliveryLane:lane})).rejects.toThrow();expect(getter).not.toHaveBeenCalled();expect(box.pendingCount).toBe(1);box.dispose()
 })
 it('treats PRESENT undefined and invalid marked body as stalled rather than historical legacy',async()=>{
  for(const entry of [{...stored(),deliveryLane:undefined},{...stored(),deliveryLane:lane,op:{...operation(),type:'paper_dry' as const}}]){
    const storage=createInMemoryOutboxStorage(),send=vi.fn(),stalled=vi.fn();await storage.put(entry)
    const box=new Outbox({roomId:room,storage,send,onStalled:stalled});await box.resendAll();await flush();expect(send).not.toHaveBeenCalled();expect(stalled).toHaveBeenCalledOnce();expect(box.pendingCount).toBe(1);expect(box.stalledCount).toBe(1);box.dispose()
  }
 })

 it('reports the final failed Attempt lineage on stall rather than a newer read',async()=>{
  const storage=createInMemoryOutboxStorage(),scheduled:(()=>void)[]=[],stalled=vi.fn(),old:CanonicalSendLineage={socket:{},connectionId:'one',boardId:room,originalRead:{}}
  let current=old
  const box=new Outbox({roomId:room,storage,schedule:fn=>scheduled.push(fn),getCanonicalSendLineage:()=>current,onStalled:stalled,send:async()=>{current={...old,originalRead:{}};throw Error('offline')}})
  await box.enqueue(operation(),{deliveryLane:lane});await flush()
  for(let i=0;i<10;i++){scheduled.shift()!();await flush()}
  current=old;scheduled.shift()!();await flush()
  expect(stalled).toHaveBeenCalledWith(operation(),{roomId:room,deliveryLane:lane,lineage:old});box.dispose()
 })

})
