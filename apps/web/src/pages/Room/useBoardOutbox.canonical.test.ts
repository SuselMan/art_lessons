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

it('uses actual joined connection and original read lineage for two emitted frames, then fails closed on stale read',async()=>{
 const {prepareCanonicalRoomState}=await import('./net/canonicalRoomState')
 const {STRAIGHT_ROOM_RASTER_VERSION}=await import('@grafetto/shared')
 let current=true
 const state:Parameters<import('@grafetto/shared').ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:8,canvasHeight:8,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:STRAIGHT_ROOM_RASTER_VERSION},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:2},canonicalHistoryBase:{kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:0,operationCount:0}}
 const read=prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent:()=>current}).canonicalRead,s=setup(),sent:number[]=[],acks:((r:import('@grafetto/shared').SendResult)=>void)[]=[]
 const socket={id:'joined-connection',connected:true,emit:(...args:Parameters<OperationEmitter['emit']>)=>{if(args[0]!=='operation'||args[1].type!=='canonical_stroke')throw Error('Expected frame');sent.push(args[1].frame.frameOrdinal);acks.push(args[2])}}
 s.deps.socketRef.current=socket;s.deps.canonicalReadRef={current:read}
 const box=useRender(s.deps).outbox
 const frame=(n:number):Operation=>({type:'canonical_stroke',id:'f'+n,userId:'author',timestamp:0,layerId:'L',frame:{version:1,rasterProfile:'installed-arm64-scalar-fused-fpcr0-v1',brush:'brush:test@1',strokeId:'S',frameOrdinal:n,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},materialPacked:'scheduler does not decode'}})
 await box.enqueue(frame(0));await box.enqueue(frame(1));await box.enqueue(frame(2));expect(sent).toEqual([0,1])
 current=false;acks[0]({ok:true,seq:1});for(let i=0;i<30;i++)await Promise.resolve();expect(sent).toEqual([0,1])
 acks[1]({ok:true,seq:2});for(let i=0;i<30;i++)await Promise.resolve();expect(sent).toEqual([0,1,2]);acks[2]({ok:true,seq:3});await box.whenIdle(1000);for(let i=0;i<30;i++)await Promise.resolve()
 expect(s.verdicts.canonicalVerdicts.onSettled).toHaveBeenCalledTimes(3)
})
