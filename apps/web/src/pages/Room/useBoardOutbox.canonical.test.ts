import {afterEach,expect,it,vi} from 'vitest'
import type {Operation} from '@grafetto/shared'
import type {OperationEmitter} from './net/sendOperation'
import type {BoardOutboxDeps} from './useBoardOutbox'
// Only React retention/effect scheduling is modeled; queue, storage adapter,
// typed network mapping and verdict owner execute their production code.
const hooks=vi.hoisted(()=>({cursor:0,slots:[]as {value:unknown;deps?:readonly unknown[]}[],effects:[]as (()=>void)[]}))
vi.mock('react',()=>({
 useRef:(value:unknown)=>{const i=hooks.cursor++;return(hooks.slots[i]??={value:{current:value}}).value},
 useState:(value:unknown)=>{const i=hooks.cursor++;return(hooks.slots[i]??={value:[value,vi.fn()]}).value},
 useMemo:(make:()=>unknown,deps:readonly unknown[])=>{const i=hooks.cursor++,old=hooks.slots[i];if(!old||deps.some((d,j)=>d!==old.deps?.[j]))hooks.slots[i]={value:make(),deps};return hooks.slots[i].value},
 useEffect:(effect:()=>void,deps:readonly unknown[])=>{const i=hooks.cursor++,old=hooks.slots[i];if(!old||deps.some((d,j)=>d!==old.deps?.[j])){hooks.slots[i]={value:undefined,deps};hooks.effects.push(effect)}},
}))
vi.mock('./net/outboxStorage',async importOriginal=>{const actual=await importOriginal<typeof import('./net/outboxStorage')>();return{...actual,createIndexedDbOutboxStorage:()=>actual.createInMemoryOutboxStorage()}})
import {useBoardOutbox} from './useBoardOutbox'
const boxes:ReturnType<typeof useBoardOutbox>['outbox'][]=[]
afterEach(()=>{for(const box of boxes.splice(0))box.dispose();hooks.slots=[];hooks.effects=[];hooks.cursor=0;vi.restoreAllMocks()})
function useRender(deps:BoardOutboxDeps){hooks.cursor=0;const value=useBoardOutbox(deps);boxes.push(value.outbox);for(const effect of hooks.effects.splice(0))effect();return value}
function setup(){
 const emit=vi.fn((...args:Parameters<OperationEmitter['emit']>)=>args[2]({ok:true,seq:7}))
 const verdicts={pendingIdsRef:{current:new Set<string>()},latestKnownSeqRef:{current:0},confirmOperation:vi.fn(),discardOperation:vi.fn(),checkSnapshotBoundary:vi.fn(),resolveTransformCommit:vi.fn(),scheduleLostWorkRecovery:vi.fn(),setLostWork:vi.fn(),canonicalVerdicts:{onSettled:vi.fn(),onStalled:vi.fn()},requestFullResync:vi.fn()}
 const deps:BoardOutboxDeps={boardId:'room',socketRef:{current:{emit}},hasJoinedRef:{current:true},socketBoardRef:{current:'room'},verdicts}
 const op:Operation={type:'canonical_stroke_close',id:'close',userId:'author',timestamp:0,layerId:'L',targetUserId:'author',strokeId:'S',disposition:'commitPartial',recordedNext:1,firstFrameOpId:'first',lastFrameOpId:'last'}
 return{emit,verdicts,deps,op}
}
it('forwards the actual canonical control owner through SAME persisted Outbox and typed sender without legacy paint',async()=>{
 const s=setup(),value=useRender(s.deps)
 await value.outbox.enqueue(s.op);await value.outbox.whenIdle(1000)
 expect(s.emit).toHaveBeenCalledWith('canonical_stroke_close',expect.objectContaining({operationId:'close',expectedRecordedNext:1}),expect.any(Function))
 expect(s.verdicts.canonicalVerdicts.onSettled).toHaveBeenCalledWith(s.op,{ok:true,seq:7})
 expect(s.verdicts.latestKnownSeqRef.current).toBe(7);expect(s.verdicts.requestFullResync).not.toHaveBeenCalled()
 expect(s.verdicts.confirmOperation).not.toHaveBeenCalled();expect(s.verdicts.discardOperation).not.toHaveBeenCalled();expect(s.verdicts.checkSnapshotBoundary).not.toHaveBeenCalled()
})
it('forwards the existing resync fallback when a canonical ACK has no control owner',async()=>{
 const s=setup();vi.spyOn(console,'error').mockImplementation(()=>{})
 const value=useRender({...s.deps,verdicts:{...s.verdicts,canonicalVerdicts:undefined}})
 await value.outbox.enqueue(s.op);await value.outbox.whenIdle(1000)
 expect(s.verdicts.requestFullResync).toHaveBeenCalledOnce();expect(s.verdicts.confirmOperation).not.toHaveBeenCalled();expect(value.outbox.pendingCount).toBe(0)
})
it('captures a replaced control owner through the hook dependency contract and retires the previous owner queue',async()=>{
 const s=setup(),first=useRender(s.deps),dispose=vi.spyOn(first.outbox,'dispose'),nextOwner={onSettled:vi.fn(),onStalled:vi.fn()}
 const next=useRender({...s.deps,verdicts:{...s.verdicts,canonicalVerdicts:nextOwner}})
 expect(next.outbox).not.toBe(first.outbox);expect(dispose).toHaveBeenCalledOnce()
 await next.outbox.enqueue(s.op);await next.outbox.whenIdle(1000)
 expect(nextOwner.onSettled).toHaveBeenCalledOnce();expect(s.verdicts.canonicalVerdicts.onSettled).not.toHaveBeenCalled()
})

it('forwards a retained stalled canonical operation once through the same owner',async()=>{
 vi.useFakeTimers();const log=vi.spyOn(console,'error').mockImplementation(()=>{})
 try{
  const s=setup();s.emit.mockImplementation((...args)=>args[2]({ok:false,reason:'server_error'}))
  const value=useRender(s.deps);await value.outbox.enqueue(s.op);await vi.runAllTimersAsync();await value.outbox.whenIdle(1000)
  expect(s.verdicts.canonicalVerdicts.onStalled).toHaveBeenCalledOnce();expect(s.verdicts.canonicalVerdicts.onStalled).toHaveBeenCalledWith(s.op)
  expect(value.outbox.pendingCount).toBe(1);expect(value.outbox.stalledCount).toBe(1);expect(s.verdicts.discardOperation).not.toHaveBeenCalled()
 }finally{for(const box of boxes)box.dispose();log.mockRestore();vi.useRealTimers()}
})
