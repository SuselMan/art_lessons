import {expect,it,vi} from 'vitest'
import {prepareCanonicalRoomState} from './net/canonicalRoomState'
import {canonicalBootstrapOf,stageCanonicalRoomReplacement,createCanonicalRoomVerdicts,createCanonicalRecoveryControl} from './canonicalRoomController'
import type {ServerToClientEvents} from '@grafetto/shared'
function state(){
 let current=true
 const wire:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'B',name:'Board',ownerId:'U',paper:'flat',infinite:false,canvasWidth:8,canvasHeight:8,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'L',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'B',boardEpoch:2},canonicalHistoryBase:{kind:'full-room-prefix-v2',roomId:'B',boardEpoch:2,throughSeq:0,operationCount:0}}
 return {stash:prepareCanonicalRoomState(wire,{expectedBoardId:'B',isCurrent:()=>current}),expire:()=>{current=false}}
}
it('requires original read before constructing straight engine and retains original tail',()=>{
 const f=state(),bootstrap=canonicalBootstrapOf(f.stash,'B',true)!
 expect(bootstrap.read).toBe(f.stash.canonicalRead);expect(bootstrap.tail).toBe(f.stash.tailOperations)
 expect(()=>canonicalBootstrapOf(undefined,'B',true)).toThrow()
 expect(()=>canonicalBootstrapOf({...f.stash,tailOperations:[]},'B',true)).toThrow()
 expect(()=>canonicalBootstrapOf(f.stash,'other',true)).toThrow()
 expect(()=>canonicalBootstrapOf(f.stash,'B',false)).toThrow()
 f.expire();expect(()=>canonicalBootstrapOf(f.stash,'B',true)).toThrow()
 expect(canonicalBootstrapOf(undefined,'B',false)).toBeUndefined()
})
it('stages one same-board replacement in the existing ref with one mount increment',()=>{
 const {stash}=state(),pending={current:null as typeof stash|null},bump=vi.fn(),retire=vi.fn()
 const deps={boardId:'B',minimumSequence:0,pending,installedRead:undefined,hasPendingLocals:()=>false,retire,bump}
 expect(stageCanonicalRoomReplacement(stash,deps)).toBe(true)
 expect(pending.current).toBe(stash);expect(bump).toHaveBeenCalledOnce();expect(retire).toHaveBeenCalledOnce()
 expect(stageCanonicalRoomReplacement(stash,deps)).toBe(false);expect(bump).toHaveBeenCalledOnce()
 pending.current=null
 expect(stageCanonicalRoomReplacement(stash,{...deps,installedRead:stash.canonicalRead})).toBe(false)
})
it('never destroys or discards pending locals to replace the engine',()=>{
 const {stash}=state(),pending={current:null},retire=vi.fn(),bump=vi.fn()
 expect(()=>stageCanonicalRoomReplacement(stash,{boardId:'B',minimumSequence:0,pending,installedRead:undefined,hasPendingLocals:()=>true,retire,bump})).toThrow()
 expect(pending.current).toBeNull();expect(retire).not.toHaveBeenCalled();expect(bump).not.toHaveBeenCalled()
})
it('treats successful ACK as bookkeeping before confirmed, repairs rejects without replacement loops',()=>{
 const repair=vi.fn();let replacing=false
 const v=createCanonicalRoomVerdicts({repair,isReplacing:()=>replacing})
 const op={type:'canonical_stroke_close' as const,id:'C',userId:'U',timestamp:0,layerId:'L',targetUserId:'U',strokeId:'S',disposition:'commitPartial' as const,recordedNext:1,firstFrameOpId:'frame',lastFrameOpId:'frame'}
 v.onSettled(op,{ok:true,seq:1});expect(repair).not.toHaveBeenCalled()
 v.onSettled(op,{ok:false,reason:'invalid_operation'});expect(repair).toHaveBeenCalledOnce()
 v.onStalled(op);expect(repair).toHaveBeenCalledTimes(2)
 replacing=true;v.onStalled(op);v.onSettled(op,{ok:false,reason:'invalid_operation'});expect(repair).toHaveBeenCalledTimes(2)
})

it.each(['owner','socket','abort']as const)('binds BEGIN to original read/socket/engine and releases listeners after %s invalidation',async kind=>{
 const {createCanonicalRoomAuthor}=await import('./canonicalRoomController')
 const {stash}=state(),listeners=new Set<()=>void>()
 let ack!:(value:import('@grafetto/shared').CanonicalStrokeBeginResult)=>void
 const socket:import('./net/sendCanonicalStrokeBegin').CanonicalBeginEmitter={emit:(_event,_input,callback)=>{ack=callback},on:(_event,callback)=>{listeners.add(callback)},off:(_event,callback)=>{listeners.delete(callback)}}
 let current=true,active:typeof socket|null=socket
 const author=createCanonicalRoomAuthor(stash.canonicalRead,socket,()=>active,()=>current),controller=new AbortController()
 const pending=author.begin({layerId:'L',brush:'brush:soft@1',strokeId:'S',pigmentRgb8:[0,0,0],outerResourceOpacity:1,alphaDarken:'hard'},{signal:controller.signal,isCurrent:()=>true})
 const rejected=expect(pending).rejects.toThrow()
 if(kind==='owner')current=false
 if(kind==='socket')active=null
 if(kind==='abort')controller.abort()
 else ack({ok:false,reason:'canonical_repair_required'})
 await rejected;expect(listeners.size).toBe(0)
})

it('constructs/restores the actual engine from the same pending slot once, without treating engine publication as a new mount request',async()=>{
 const {createTestEngine}=await import('../../engine/testing/engineTestUtils')
 const {stash}=state(),pending={current:null as typeof stash|null},bump=vi.fn(),retire=vi.fn()
 let installedRead:typeof stash.canonicalRead|undefined,constructed=0,engineEpoch=0
 const deps=()=>({boardId:'B',minimumSequence:0,pending,installedRead,hasPendingLocals:()=>false,retire,bump})
 expect(stageCanonicalRoomReplacement(stash,deps())).toBe(true)
 const bootstrap=canonicalBootstrapOf(pending.current,'B',true)!
 const result=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:8,pageHeight:8,canonicalEmptyRoom:bootstrap},{width:8,height:8})
 constructed++;installedRead=bootstrap.read;pending.current=null;engineEpoch++
 const {IMPLICIT_LAYER_IDS}=await import('@grafetto/shared');for(const id of IMPLICIT_LAYER_IDS)result.engine.initLayer(id)
 try{
  await result.engine.restoreCanonicalEmptyRoom(bootstrap.read,bootstrap.tail)
  expect(stageCanonicalRoomReplacement(stash,deps())).toBe(false)
  expect(constructed).toBe(1);expect(engineEpoch).toBe(1);expect(bump).toHaveBeenCalledOnce()
  expect(result.engine.getOperations()).toEqual([])
 }finally{result.engine.destroy()}
},15000)

it('rejects a full replacement cut older than the ACK watermark without retiring pending work',()=>{
 const {stash}=state(),pending={current:null},retire=vi.fn(),bump=vi.fn()
 expect(()=>stageCanonicalRoomReplacement(stash,{boardId:'B',minimumSequence:1,pending,installedRead:undefined,hasPendingLocals:()=>false,retire,bump})).toThrow('cut precedes')
 expect(pending.current).toBeNull();expect(retire).not.toHaveBeenCalled();expect(bump).not.toHaveBeenCalled()
})

it('publishes baseline IDs only after original engine commit and refuses an expired continuation',async()=>{
 const {canonicalDefaultAutoSourceBinding,buildCanonicalMaterial,CANONICAL_STROKE_RASTER_PROFILE}=await import('@grafetto/shared')
 const stock=(await import('../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native')).default
 const {restoreCanonicalRoomBaseline}=await import('./canonicalRoomController')
 const pin=canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as import('@grafetto/shared').BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1')
 const material={version:2 as const,assets:[],primarySource:pin,budget:{workUnits:1048576,outputBytes:1048576,drawPixels:1048576}}
 const snapshot:import('@grafetto/shared').CanonicalStrokeSnapshotV2={materialVersion:2,material,assets:[],layerId:'layer-1',brush:'brush:'+pin.descriptorId+'@'+pin.descriptorVersion,strokeId:'S',boardEpoch:2,descriptorSha256:pin.descriptorSha256,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'}}
 const {stash}=state(),wire={...stash,tailOperations:[{type:'canonical_stroke' as const,id:'frame',userId:'U',timestamp:0,seq:1,layerId:'layer-1',frame:{version:1 as const,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:snapshot.brush,strokeId:'S',frameOrdinal:0,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},material).packed}}],canonicalCapabilities:{version:1 as const,roomId:'B',boardEpoch:2,capabilities:[{originalUserId:'U',snapshot}],bindings:[{operationId:'frame',sequence:1,originalUserId:'U',capability:0}]},canonicalHistoryBase:{kind:'full-room-prefix-v2' as const,roomId:'B',boardEpoch:2,throughSeq:1,operationCount:1}}
 let current=true
 const prepared=prepareCanonicalRoomState(wire,{expectedBoardId:'B',isCurrent:()=>current}),ids=new Set<string>()
 let finish!:()=>void
 const engine={restoreCanonicalEmptyRoom:vi.fn(()=>new Promise<void>(resolve=>{finish=resolve}))}as unknown as import('../../engine').PencilEngineAPI
 const pending=restoreCanonicalRoomBaseline(engine,prepared.canonicalRead,prepared.tailOperations,()=>engine,ids)
 expect(ids.size).toBe(0);finish();await pending;expect([...ids]).toEqual(['frame'])
 ids.clear()
 const stale=restoreCanonicalRoomBaseline(engine,prepared.canonicalRead,prepared.tailOperations,()=>engine,ids),rejected=expect(stale).rejects.toThrow()
 current=false;finish();await rejected;expect(ids.size).toBe(0)
})

function recoveryFixture(){
 let active=false,pending=0,board='B',ack=0,connected=true
 const locked=vi.fn(),engine={setLocked:locked,hasActiveCanonicalAuthor:()=>active}as unknown as import('../../engine').PencilEngineAPI
 let current:typeof engine|null=engine
 const send=vi.fn(()=>ack),waiting=vi.fn()
 return {engine,locked,send,waiting,getEngine:()=>current,getBoard:()=>board,hasPendingLocals:()=>pending!==0,canRequest:()=>connected,resync:send,onWaiting:waiting,
  active:(v:boolean)=>{active=v},pending:(v:number)=>{pending=v},ack:(v:number)=>{ack=v},board:(v:string)=>{board=v},current:(v:typeof current)=>{current=v},connected:(v:boolean)=>{connected=v}}
}
it('defers corrupt recovery until source release and final settlement watermark; healthy cancellation alone never arms',async()=>{
 const {createCanonicalRecoveryControl}=await import('./canonicalRoomController'),f=recoveryFixture(),control=createCanonicalRecoveryControl(f)
 control.bind(f.engine,'B');control.restored(f.engine)
 f.active(true);control.drain();f.active(false);control.drain();expect(f.send).not.toHaveBeenCalled()
 f.active(true);f.pending(2);control.request(f.engine,'B')
 expect(f.locked).toHaveBeenCalledOnce();expect(f.send).not.toHaveBeenCalled()
 const verdicts=createCanonicalRoomVerdicts({repair:()=>control.request(f.engine,'B'),isReplacing:control.isReplacing,drain:control.drain})
 const op={type:'canonical_stroke_close' as const,id:'C',userId:'U',timestamp:0,layerId:'L',targetUserId:'U',strokeId:'S',disposition:'commitPartial' as const,recordedNext:1,firstFrameOpId:'F',lastFrameOpId:'F'}
 f.pending(0);f.ack(9);verdicts.onSettled(op,{ok:true,seq:9});expect(f.send).not.toHaveBeenCalled()
 f.active(false);control.request(f.engine,'B');expect(f.send).toHaveBeenCalledExactlyOnceWith();expect(f.send.mock.results[0].value).toBe(9)
 control.request(f.engine,'B');control.drain();expect(f.send).toHaveBeenCalledOnce()
})
it('retains stalled work and allows only explicit retry after a failed replacement',async()=>{
 const {createCanonicalRecoveryControl}=await import('./canonicalRoomController'),f=recoveryFixture(),control=createCanonicalRecoveryControl(f)
 control.bind(f.engine,'B');control.restored(f.engine);f.pending(1);control.request(f.engine,'B')
 expect(control.drain()).toBe(false);expect(f.send).not.toHaveBeenCalled()
 f.pending(0);control.drain();expect(f.send).toHaveBeenCalledOnce()
 control.failed(f.engine);control.request(f.engine,'B');control.drain();expect(f.send).toHaveBeenCalledOnce()
 control.retry(f.engine,'B');expect(f.send).toHaveBeenCalledTimes(2)
})
it('ignores stale engine/board callbacks and does not join while a replacement is restoring',async()=>{
 const {createCanonicalRecoveryControl}=await import('./canonicalRoomController'),f=recoveryFixture(),control=createCanonicalRecoveryControl(f)
 control.bind(f.engine,'B');control.request(f.engine,'B');expect(f.send).not.toHaveBeenCalled()
 const next={setLocked:vi.fn(),hasActiveCanonicalAuthor:()=>false}as unknown as import('../../engine').PencilEngineAPI
 f.current(next);control.bind(next,'B');control.request(f.engine,'B');expect(f.send).not.toHaveBeenCalled()
 control.restored(next);f.board('other');control.request(next,'B');expect(f.send).not.toHaveBeenCalled()
})
it('keeps an active zero-emission source fail-closed until an existing wake or explicit retry',async()=>{
 const {createCanonicalRecoveryControl}=await import('./canonicalRoomController'),f=recoveryFixture(),control=createCanonicalRecoveryControl(f)
 control.bind(f.engine,'B');control.restored(f.engine);f.active(true);control.request(f.engine,'B')
 expect(f.waiting).toHaveBeenCalledOnce();expect(f.send).not.toHaveBeenCalled()
 f.active(false);expect(f.send).not.toHaveBeenCalled() // no timer, implicit event or polling
 control.retry(f.engine,'B');expect(f.send).toHaveBeenCalledOnce()
})

it('waits for final verdict after source release and does not observe pending-size changes as a new authority',async()=>{
 const {createCanonicalRecoveryControl}=await import('./canonicalRoomController'),f=recoveryFixture(),control=createCanonicalRecoveryControl(f)
 control.bind(f.engine,'B');control.restored(f.engine);f.active(true);f.pending(1);control.request(f.engine,'B')
 f.active(false);control.request(f.engine,'B');expect(f.send).not.toHaveBeenCalled()
 f.pending(0);expect(f.send).not.toHaveBeenCalled() // storage deletion/onSettled has not completed
 f.ack(11)
 const verdicts=createCanonicalRoomVerdicts({repair:()=>control.request(f.engine,'B'),isReplacing:control.isReplacing,drain:control.drain})
 verdicts.onSettled({type:'canonical_stroke_close',id:'C',userId:'U',timestamp:0,layerId:'L',targetUserId:'U',strokeId:'S',disposition:'commitPartial',recordedNext:1,firstFrameOpId:'F',lastFrameOpId:'F'},{ok:true,seq:11})
 expect(f.send).toHaveBeenCalledOnce();expect(f.send.mock.results[0].value).toBe(11)
})
it('arms before a synchronous lock-triggered fault callback and sends only once',async()=>{
 const {createCanonicalRecoveryControl}=await import('./canonicalRoomController'),f=recoveryFixture(),control=createCanonicalRecoveryControl(f)
 control.bind(f.engine,'B');control.restored(f.engine)
 f.locked.mockImplementation(()=>control.request(f.engine,'B'))
 control.request(f.engine,'B');expect(f.locked).toHaveBeenCalledOnce();expect(f.send).toHaveBeenCalledOnce()
})

it('shares a lazy retired-origin wait and resolves only after real resync returns with the original scope invalidated',async()=>{
 const {createCanonicalRecoveryControl}=await import('./canonicalRoomController'),f=recoveryFixture();let readCurrent=true
 const control=createCanonicalRecoveryControl({...f,resync:()=>{expect(readCurrent).toBe(true);readCurrent=false;expect(settled).toBe(false)}})
 control.bind(f.engine,'B');control.restored(f.engine);f.pending(1)
 await expect(control.whenRetiredTransition(f.engine,'B')).resolves.toBe('failed');expect(f.locked).not.toHaveBeenCalled()
 control.retired(f.engine,'B')
 const first=control.whenRetiredTransition(f.engine,'B'),second=control.whenRetiredTransition(f.engine,'B');expect(first).toBe(second)
 let settled=false;void first.then(()=>{settled=true});await Promise.resolve();expect(settled).toBe(false)
 f.pending(0);expect(control.drain()).toBe(true);expect(readCurrent).toBe(false);await expect(first).resolves.toBe('joining');expect(settled).toBe(true)
})
it('does not create an idle barrier on retirement without observers and does not reuse a failed interval on retry',async()=>{
 const {createCanonicalRecoveryControl}=await import('./canonicalRoomController'),f=recoveryFixture(),control=createCanonicalRecoveryControl(f)
 control.bind(f.engine,'B');control.restored(f.engine);control.retired(f.engine,'B');expect(f.send).toHaveBeenCalledOnce()
 await expect(control.whenRetiredTransition(f.engine,'B')).resolves.toBe('joining')
 control.failed(f.engine);f.pending(1);control.retry(f.engine,'B')
 await expect(control.whenRetiredTransition(f.engine,'B')).resolves.toBe('failed')
 control.retired(f.engine,'B');const fresh=control.whenRetiredTransition(f.engine,'B');f.pending(0);control.drain();await expect(fresh).resolves.toBe('joining');expect(f.send).toHaveBeenCalledTimes(2)
})
it.each(['detach','bind','board']as const)('settles the original passive waiter stale after %s without granting a new owner',async mode=>{
 const {createCanonicalRecoveryControl}=await import('./canonicalRoomController'),f=recoveryFixture(),control=createCanonicalRecoveryControl(f)
 control.bind(f.engine,'B');control.restored(f.engine);f.pending(1);control.retired(f.engine,'B');const first=control.whenRetiredTransition(f.engine,'B')
 if(mode==='detach')control.detach(f.engine)
 else if(mode==='bind'){f.board('C');control.bind(f.engine,'C')}
 else{f.board('C');control.drain()}
 await expect(first).resolves.toBe('stale');expect(f.send).not.toHaveBeenCalled();await expect(control.whenRetiredTransition(f.engine,'B')).resolves.toBe('stale')
})
it.each(['bind','detach','throw','failed']as const)('never acknowledges joining after reentrant resync %s',async mode=>{
 const {createCanonicalRecoveryControl}=await import('./canonicalRoomController'),f=recoveryFixture();let control:ReturnType<typeof createCanonicalRecoveryControl>
 control=createCanonicalRecoveryControl({...f,resync:()=>{if(mode==='bind'){f.board('C');control.bind(f.engine,'C')}else if(mode==='detach')control.detach(f.engine);else if(mode==='failed')control.failed(f.engine);else throw Error('resync failed')}})
 control.bind(f.engine,'B');control.restored(f.engine);f.pending(1);control.retired(f.engine,'B');const first=control.whenRetiredTransition(f.engine,'B');f.pending(0);expect(control.drain()).toBe(false)
 await expect(first).resolves.toBe(mode==='bind'||mode==='detach'?'stale':'failed')
})
it('retains pending work and source holds until independent settlement wakes the retired origin',async()=>{
 const {createCanonicalRecoveryControl}=await import('./canonicalRoomController'),f=recoveryFixture(),control=createCanonicalRecoveryControl(f)
 control.bind(f.engine,'B');control.restored(f.engine);f.active(true);f.pending(2);control.retired(f.engine,'B')
 const pending=control.whenRetiredTransition(f.engine,'B');let settled=false;void pending.then(()=>{settled=true})
 control.drain();f.active(false);control.drain();await Promise.resolve();expect(settled).toBe(false);expect(f.hasPendingLocals()).toBe(true)
 f.pending(0);f.connected(false);control.drain();expect(f.send).not.toHaveBeenCalled();f.connected(true);control.drain();await expect(pending).resolves.toBe('joining')
})
it('settles a retired-origin wait failed when lock fails and does not grant arbitrary request retirement',async()=>{
 const {createCanonicalRecoveryControl}=await import('./canonicalRoomController'),f=recoveryFixture(),control=createCanonicalRecoveryControl(f)
 control.bind(f.engine,'B');control.restored(f.engine);f.pending(1);control.request(f.engine,'B');await expect(control.whenRetiredTransition(f.engine,'B')).resolves.toBe('failed')
 f.locked.mockImplementation(()=>{throw Error('lock failed')});control.retry(f.engine,'B');control.retired(f.engine,'B');await expect(control.whenRetiredTransition(f.engine,'B')).resolves.toBe('failed');expect(f.send).not.toHaveBeenCalled()
})

it.each(['detach','throw']as const)('does not expose provisional joining to a waiter first created inside resync before %s',async mode=>{
 const {createCanonicalRecoveryControl}=await import('./canonicalRoomController'),f=recoveryFixture();let control:ReturnType<typeof createCanonicalRecoveryControl>,inside:Promise<'joining'|'stale'|'failed'>|undefined
 control=createCanonicalRecoveryControl({...f,resync:()=>{inside=control.whenRetiredTransition(f.engine,'B');if(mode==='detach')control.detach(f.engine);else throw Error('resync failed')}})
 control.bind(f.engine,'B');control.restored(f.engine);control.retired(f.engine,'B')
 expect(inside).toBeDefined();await expect(inside).resolves.toBe(mode==='detach'?'stale':'failed')
})
it('does not refresh a failed retirement witness by rebinding the same owner or observing a different board',async()=>{
 const {createCanonicalRecoveryControl}=await import('./canonicalRoomController'),f=recoveryFixture(),control=createCanonicalRecoveryControl(f)
 control.bind(f.engine,'B');control.restored(f.engine);f.pending(1);control.retired(f.engine,'B');const pending=control.whenRetiredTransition(f.engine,'B')
 await expect(control.whenRetiredTransition(f.engine,'foreign')).resolves.toBe('stale');control.failed(f.engine);await expect(pending).resolves.toBe('failed')
 control.bind(f.engine,'B');await expect(control.whenRetiredTransition(f.engine,'B')).resolves.toBe('failed');expect(f.send).not.toHaveBeenCalled()
})
it('settles an old interval before reentrant retry can start another join',async()=>{
 const {createCanonicalRecoveryControl}=await import('./canonicalRoomController'),f=recoveryFixture();let control:ReturnType<typeof createCanonicalRecoveryControl>,calls=0
 control=createCanonicalRecoveryControl({...f,resync:()=>{if(++calls===1){f.pending(1);control.retry(f.engine,'B')}}})
 control.bind(f.engine,'B');control.restored(f.engine);f.pending(1);control.retired(f.engine,'B');const old=control.whenRetiredTransition(f.engine,'B');f.pending(0);expect(control.drain()).toBe(false)
 await expect(old).resolves.toBe('failed');await expect(control.whenRetiredTransition(f.engine,'B')).resolves.toBe('failed');control.retired(f.engine,'B');const fresh=control.whenRetiredTransition(f.engine,'B');f.pending(0);control.drain();await expect(fresh).resolves.toBe('joining');expect(calls).toBe(2)
})

async function resourceConsumerFixture(){
 const f=state(),{attachCanonicalRecordedDelivery}=await import('./net/canonicalRecordedDelivery'),{parseCanonicalStrokeCloseOperation}=await import('@grafetto/shared')
 const atom=Object.freeze({operation:parseCanonicalStrokeCloseOperation({type:'canonical_stroke_close',id:'close',userId:'U',timestamp:0,seq:1,layerId:'layer-1',targetUserId:'U',strokeId:'S',disposition:'commitPartial',recordedNext:1,firstFrameOpId:'F',lastFrameOpId:'F'})}),input=attachCanonicalRecordedDelivery(atom,f.stash.canonicalRead.scope)
 if(!('delivery'in input))throw Error('Missing original input')
 const prepare=vi.fn(async():Promise<import('../../engine/src/dabs/BrushPreparation').BrushPreparationResult>=>({status:'ready'})),engine={prepareOriginalRecorded:prepare}as unknown as import('../../engine').PencilEngineAPI
 let current:typeof engine|null=engine,board='B'
 const whenRetiredTransition=vi.fn(async():Promise<'joining'|'stale'|'failed'>=> 'failed')
 return{f,input,prepare,engine,deps:{currentEngine:()=>current,currentBoard:()=>board,recovery:{whenRetiredTransition}},replace:()=>{current={}as typeof engine},board:(v:string)=>{board=v}}
}
it('requires READY and retries only explicit cancellation under the SAME original resource owner',async()=>{
 const {prepareCanonicalRoomRecordedInput}=await import('./canonicalRoomController'),f=await resourceConsumerFixture()
 f.prepare.mockResolvedValueOnce({status:'cancelled'})
 await expect(prepareCanonicalRoomRecordedInput(f.engine,f.input,f.deps)).resolves.toBe('ready');expect(f.prepare).toHaveBeenCalledTimes(2);expect(f.deps.recovery.whenRetiredTransition).not.toHaveBeenCalled()
})
it.each(['joining','stale']as const)('accepts %s only after actual original read or engine becomes obsolete',async outcome=>{
 const {prepareCanonicalRoomRecordedInput}=await import('./canonicalRoomController'),f=await resourceConsumerFixture(),fault=Error('physical owner retired')
 f.prepare.mockRejectedValue(fault);f.deps.recovery.whenRetiredTransition.mockImplementation(async()=>{if(outcome==='joining')f.f.expire();else f.replace();return outcome})
 await expect(prepareCanonicalRoomRecordedInput(f.engine,f.input,f.deps)).resolves.toBe('obsolete');expect(f.prepare).toHaveBeenCalledOnce()
})
it.each(['joining','stale','failed']as const)('does not turn %s into success for a still-current original engine/read',async outcome=>{
 const {prepareCanonicalRoomRecordedInput}=await import('./canonicalRoomController'),f=await resourceConsumerFixture(),fault=Error('healthy budget refusal')
 f.prepare.mockRejectedValue(fault);f.deps.recovery.whenRetiredTransition.mockResolvedValue(outcome)
 await expect(prepareCanonicalRoomRecordedInput(f.engine,f.input,f.deps)).rejects.toBe(fault);expect(f.prepare).toHaveBeenCalledOnce()
})

it('classifies controls only from the original bootstrap/read and actual constructed socket/engine',async()=>{
 const {createCanonicalControlCapture}=await import('./canonicalRoomController')
 const {stash}=state(),bootstrap=canonicalBootstrapOf(stash,'B',true)!,socket={connected:true}
 let installed=bootstrap.read,activeSocket:typeof socket|null=socket,currentEngine=true,joined=true,board='B'
 const deps={socket,getSocket:()=>activeSocket,getInstalledRead:()=>installed,isEngineCurrent:()=>currentEngine,isJoined:()=>joined,getBoard:()=>board}
 const capture=createCanonicalControlCapture(bootstrap.read,bootstrap.tail,'B',deps)
 expect(capture()).toBe('canonical-control-v1')
 currentEngine=false;expect(capture).toThrow();currentEngine=true
 installed=state().stash.canonicalRead;expect(capture).toThrow();installed=bootstrap.read
 activeSocket={connected:true};expect(capture).toThrow();activeSocket=socket
 socket.connected=false;expect(capture).toThrow();socket.connected=true
 joined=false;expect(capture).toThrow();joined=true
 board='other';expect(capture).toThrow();board='B'
 expect(capture()).toBe('canonical-control-v1')
 expect(()=>createCanonicalControlCapture({...bootstrap.read},bootstrap.tail,'B',deps)).toThrow()
 expect(()=>createCanonicalControlCapture(bootstrap.read,[],'B',deps)).toThrow()
})
it('keeps a stale/offline original classifier present and never blesses a fresh latest read',async()=>{
 const {createCanonicalControlCapture}=await import('./canonicalRoomController')
 const f=state(),bootstrap=canonicalBootstrapOf(f.stash,'B',true)!,fresh=state().stash.canonicalRead
 const capture=createCanonicalControlCapture(bootstrap.read,bootstrap.tail,'B',{socket:null,getSocket:()=>null,getInstalledRead:()=>fresh,isEngineCurrent:()=>true,isJoined:()=>false,getBoard:()=> 'B'})
 expect(typeof capture).toBe('function');expect(capture).toThrow();f.expire();expect(capture).toThrow()
})

it('carries genuine bootstrap classification through SAME Outbox without changing the actual engine journal',async()=>{
 const {createCanonicalControlCapture}=await import('./canonicalRoomController')
 const {createTestEngine}=await import('../../engine/testing/engineTestUtils')
 const {createEngineNetworkCallbacks}=await import('./engineNetwork')
 const {Outbox}=await import('./net/outbox'),{createInMemoryOutboxStorage}=await import('./net/outboxStorage')
 const {createOutboxVerdicts}=await import('./net/outboxVerdict'),{createPendingPreviews}=await import('./net/pendingPreviews')
 const {IMPLICIT_LAYER_IDS}=await import('@grafetto/shared')
 const f=state(),bootstrap=canonicalBootstrapOf(f.stash,'B',true)!,options={rasterVersion:'straight-rgba8-v1' as const,pageWidth:8,pageHeight:8,canonicalEmptyRoom:bootstrap}
 const first=createTestEngine(options,{width:8,height:8}),second=createTestEngine(options,{width:8,height:8}),socket={connected:true}
 let current:typeof first.engine|null=first.engine
 const applied={current:new Set<string>()},pending={current:new Set<string>()},watermark={current:0},confirm=vi.fn(),discard=vi.fn(),snapshot=vi.fn(),settled=vi.fn(),sent:string[]=[]
 const verdicts=createOutboxVerdicts({pendingIdsRef:pending,latestKnownSeqRef:watermark,confirmOperation:confirm,discardOperation:discard,checkSnapshotBoundary:snapshot,resolveTransformCommit:vi.fn(),scheduleLostWorkRecovery:vi.fn(),setLostWork:vi.fn(),canonicalVerdicts:{onSettled:settled,onStalled:vi.fn()}})
 const box=new Outbox({roomId:'B',storage:createInMemoryOutboxStorage(),...verdicts,getCanonicalSendLineage:()=>({socket,connectionId:'actual-test-connection',boardId:'B',originalRead:bootstrap.read}),send:async op=>{sent.push(JSON.stringify(op));return{ok:true,seq:1}}})
 try{
  for(const id of IMPLICIT_LAYER_IDS)first.engine.initLayer(id)
  await first.engine.restoreCanonicalEmptyRoom(bootstrap.read,bootstrap.tail)
  const capture=createCanonicalControlCapture(bootstrap.read,bootstrap.tail,'B',{socket,getSocket:()=>socket,getInstalledRead:()=>bootstrap.read,isEngineCurrent:()=>current===first.engine,isJoined:()=>true,getBoard:()=> 'B'})
  const on=createEngineNetworkCallbacks({engineRef:{current:first.engine},appliedOpIdsRef:applied,pendingIdsRef:pending,outbox:box,captureCanonicalControl:capture,markActive:vi.fn(),pendingPreviewsRef:{current:createPendingPreviews()},applyRemoteOp:vi.fn(),syncFromLog:vi.fn(),checkSnapshotBoundary:snapshot,editingBlockedRef:{current:false},sendLive:vi.fn(),sendLiveEnd:vi.fn()})
  const op={id:'metadata',type:'operation_undo' as const,userId:'U',timestamp:0,targetOpId:'frame'}
  on.onLocalOperation(op);for(let i=0;i<25;i++)await Promise.resolve()
  expect(sent).toEqual([JSON.stringify(op)]);expect(watermark.current).toBe(1);expect(settled).toHaveBeenCalledWith(op,{ok:true,seq:1},{roomId:'B',deliveryLane:'canonical-control-v1',lineage:{socket,connectionId:'actual-test-connection',boardId:'B',originalRead:bootstrap.read}})
  expect(first.engine.getOperations()).toEqual([]);expect(applied.current.size).toBe(0);expect(pending.current.size).toBe(0);expect(confirm).not.toHaveBeenCalled();expect(discard).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled()
  current=second.engine;expect(()=>on.onLocalOperation({...op,id:'stale-engine'})).toThrow();expect(sent).toHaveLength(1)
  current=first.engine;f.expire();expect(()=>on.onLocalOperation({...op,id:'expired-read'})).toThrow();expect(sent).toHaveLength(1)
 }finally{box.dispose();first.engine.destroy();second.engine.destroy()}
},15000)

function historyControl(pendingProbe?:()=>boolean,lineageProbe?:()=>void,canRequestProbe?:()=>boolean){
 const f=state(),read=f.stash.canonicalRead,tail=f.stash.tailOperations,socket={},engine={hasActiveCanonicalAuthor:vi.fn(()=>false),setLocked:vi.fn()} as unknown as import('../../engine').PencilEngineAPI
 let current:typeof engine|null=engine,pending=false,active=false
 const lineage={socket,connectionId:'one',boardId:'B',originalRead:read},hold=vi.fn(),known=vi.fn(),waiting=vi.fn(),resync=vi.fn(()=>f.expire())
 const control=createCanonicalRecoveryControl({getEngine:()=>current,getBoard:()=> 'B',hasPendingLocals:()=>pendingProbe?.()??pending,canRequest:()=>canRequestProbe?.()??true,resync,onWaiting:vi.fn(),onHistoryJoining:waiting,getControlLineage:()=>{lineageProbe?.();return lineage},holdHistory:hold,noteKnownSequence:known})
 vi.mocked(engine.hasActiveCanonicalAuthor).mockImplementation(()=>active);control.bind(engine,'B');control.restored(engine)
 const op={id:'metadata',type:'operation_undo' as const,userId:'U',timestamp:0,targetOpId:'frame'},begin=()=>control.beginControl(engine,'B',read,tail,op)
 const context={roomId:'B',deliveryLane:'canonical-control-v1' as const,lineage}
 return{...f,read,tail,socket,engine,lineage,control,hold,known,waiting,resync,begin,op,context,setPending:(value:boolean)=>{pending=value},setActive:(value:boolean)=>{active=value},replace:()=>{current=null}}
}
it('healthy control arms busy without lock/resync until genuine ACK then waits ordinary author/outbox drain',()=>{
 const h=historyControl();h.begin();h.setActive(true);h.setPending(true)
 expect(h.control.controlBusy(h.engine,'B')).toBe(true);expect(h.engine.setLocked).not.toHaveBeenCalled();expect(h.waiting).not.toHaveBeenCalled();expect(h.control.drain()).toBe(false)
 expect(h.control.settleControl(h.op,{ok:true,seq:4},h.context)).toBe(true)
 expect(h.hold).toHaveBeenCalledOnce();expect(h.known).toHaveBeenCalledWith(4);expect(h.resync).not.toHaveBeenCalled();expect(h.engine.setLocked).not.toHaveBeenCalled()
 h.setPending(false);h.control.drain();expect(h.resync).not.toHaveBeenCalled();h.setActive(false);h.control.authorIdle(h.engine,'B')
 expect(h.resync).toHaveBeenCalledOnce();expect(h.engine.setLocked).toHaveBeenCalledWith(true);expect(h.control.settleControl(h.op,{ok:true,seq:4},h.context)).toBe(false)
})
it('healthy confirmed before ACK retains cursor-independent lowercut and ACK wakes once; lost broadcast works too',()=>{
 const h=historyControl();h.begin();h.setPending(true)
 expect(h.control.confirmedControl(h.engine,'B',h.read,h.tail,{...h.op,seq:3})).toBe(true)
 expect(h.control.confirmedControl(h.engine,'B',h.read,h.tail,{...h.op,seq:3})).toBe(true);expect(h.hold).toHaveBeenCalledOnce();expect(h.resync).not.toHaveBeenCalled()
 h.setPending(false);h.control.settleControl(h.op,{ok:true,seq:3},h.context);expect(h.resync).toHaveBeenCalledOnce()
 const lost=historyControl();lost.begin();lost.control.settleControl(lost.op,{ok:true,seq:7},lost.context);expect(lost.resync).toHaveBeenCalledOnce()
})
it('healthy receipts reject copied/stale/wrong-ID/lineage and never resync replacement engine',()=>{
 const h=historyControl();h.begin()
 expect(h.control.settleControl({...h.op,targetOpId:'other'},{ok:true,seq:3},h.context)).toBe(false)
 expect(h.control.settleControl({...h.op,id:'other'},{ok:true,seq:3},h.context)).toBe(false)
 expect(h.control.settleControl(h.op,{ok:true,seq:3},{...h.context,lineage:{...h.lineage,originalRead:{}}})).toBe(false)
 expect(()=>h.begin()).toThrow();h.replace();expect(h.control.settleControl(h.op,{ok:true,seq:3},h.context)).toBe(false);expect(h.control.confirmedControl(h.engine,'B',h.read,h.tail,{...h.op,seq:3})).toBe(false);expect(h.resync).not.toHaveBeenCalled()
})
it('healthy failure never treats a no-invalidation resync or rejected ACK as joining proof',()=>{
 const h=historyControl();h.begin();h.resync.mockImplementation(()=>{})
 h.control.settleControl(h.op,{ok:true,seq:3},h.context);expect(h.control.isReplacing()).toBe(false)
 const rejected=historyControl();rejected.begin();rejected.control.settleControl(rejected.op,{ok:false,reason:'invalid_operation'},rejected.context)
 expect(rejected.resync).not.toHaveBeenCalled();expect(rejected.engine.setLocked).not.toHaveBeenCalled();expect(rejected.control.controlBusy(rejected.engine,'B')).toBe(false);expect(rejected.begin).not.toThrow()
})

it('healthy enqueue failure rolls back only its unplaced receipt without clearing pending or blessing an old interval',()=>{
 const h=historyControl(),receipt=h.begin();expect(h.control.cancelControl({...receipt})).toBe(false)
 expect(h.control.cancelControl(receipt)).toBe(true);expect(h.control.controlBusy(h.engine,'B')).toBe(false)
 const next=h.begin();expect(next).not.toBe(receipt);expect(h.control.cancelControl(receipt)).toBe(false)
 h.setPending(true);h.control.settleControl(h.op,{ok:true,seq:2},h.context);expect(h.control.cancelControl(next)).toBe(false);expect(h.resync).not.toHaveBeenCalled()
})
it('local healthy control denies active/pending work while peer confirmed metadata can wait for it without cancel',()=>{
 const h=historyControl();h.setActive(true);expect(h.begin).toThrow('busy');h.setActive(false);h.setPending(true);expect(h.begin).toThrow('busy')
 expect(h.control.confirmedControl(h.engine,'B',h.read,h.tail,{...h.op,seq:3})).toBe(true)
 expect(h.control.controlBusy(h.engine,'B')).toBe(true);expect(h.engine.setLocked).not.toHaveBeenCalled();expect(h.resync).not.toHaveBeenCalled()
})

it('healthy callbacks cannot reenter joining twice or turn a healthy interval into retired proof',async()=>{
 const h=historyControl();h.begin();h.waiting.mockImplementation(()=>{h.control.drain()})
 h.control.settleControl(h.op,{ok:true,seq:3},h.context);expect(h.resync).toHaveBeenCalledOnce()
 expect(await h.control.whenRetiredTransition(h.engine,'B')).toBe('failed')
})
it('healthy hold failure and reentrant owner replacement never publish a join or lock a newer engine',()=>{
 const h=historyControl();h.begin();h.hold.mockImplementation(()=>{throw Error('hold failed')})
 expect(h.control.settleControl(h.op,{ok:true,seq:3},h.context)).toBe(false);expect(h.resync).not.toHaveBeenCalled();expect(h.engine.setLocked).not.toHaveBeenCalled()
 const r=historyControl();r.begin();r.known.mockImplementation(()=>{r.replace()})
 expect(r.control.settleControl(r.op,{ok:true,seq:3},r.context)).toBe(false);expect(r.resync).not.toHaveBeenCalled();expect(r.engine.setLocked).not.toHaveBeenCalled()
})
it('healthy rejection creates a fresh interval and never treats an unplaced command as durable fault',()=>{
 const h=historyControl(),old=h.begin();h.control.settleControl(h.op,{ok:false,reason:'invalid_operation'},h.context)
 expect(h.resync).not.toHaveBeenCalled();expect(h.engine.setLocked).not.toHaveBeenCalled();expect(h.control.controlBusy(h.engine,'B')).toBe(false)
 const next=h.begin();expect(next).not.toBe(old);expect(h.control.cancelControl(old)).toBe(false)
})
it('requires genuine original full read/tail and a current captured connection before arming',()=>{
 const h=historyControl()
 expect(()=>h.control.beginControl(h.engine,'B',{...h.read},h.tail,h.op)).toThrow()
 expect(()=>h.control.beginControl(h.engine,'B',h.read,[],h.op)).toThrow()
 h.lineage.connectionId='two';const receipt=h.begin();h.lineage.connectionId='three'
 expect(h.control.settleControl(h.op,{ok:true,seq:3},h.context)).toBe(false);expect(h.control.cancelControl(receipt)).toBe(false);expect(h.resync).not.toHaveBeenCalled()
})

it('rechecks the actual origin after author/pending callbacks before publishing a healthy local arm',()=>{
 const h=historyControl();vi.mocked(h.engine.hasActiveCanonicalAuthor).mockImplementation(()=>{h.expire();return false})
 expect(h.begin).toThrow();expect(h.control.controlBusy(h.engine,'B')).toBe(false);expect(h.hold).not.toHaveBeenCalled();expect(h.resync).not.toHaveBeenCalled()
 const changed=historyControl(()=>{changed.replace();return false});expect(changed.begin).toThrow();expect(changed.control.controlBusy(changed.engine,'B')).toBe(false)
})

it('fixed SAME Outbox verdict finds its internally armed origin without an external active-control ref',async()=>{
 const {Outbox}=await import('./net/outbox'),{createInMemoryOutboxStorage}=await import('./net/outboxStorage')
 let box:InstanceType<typeof Outbox>|undefined
 const h=historyControl(()=>!!box?.pendingCount);h.begin()
 let resolve!:(result:import('@grafetto/shared').SendResult)=>void
 const answer=new Promise<import('@grafetto/shared').SendResult>(done=>{resolve=done})
 box=new Outbox({roomId:'B',storage:createInMemoryOutboxStorage(),getCanonicalSendLineage:()=>h.lineage,send:()=>answer,onSettled:(op,result,context)=>{h.control.settleControl(op,result,context)}})
 try{
  await box.enqueue(h.op,{deliveryLane:'canonical-control-v1'});expect(h.resync).not.toHaveBeenCalled();expect(h.control.controlBusy(h.engine,'B')).toBe(true)
  resolve({ok:true,seq:4});for(let i=0;i<25;i++)await Promise.resolve()
  expect(box.pendingCount).toBe(0);expect(h.resync).toHaveBeenCalledOnce();expect(h.known).toHaveBeenCalledWith(4);expect(h.hold).toHaveBeenCalledOnce()
 }finally{box.dispose()}
})

it('a rejected local command still drains an independently confirmed peer metadata cut',()=>{
 const h=historyControl();h.begin();h.setPending(true)
 h.control.confirmedControl(h.engine,'B',h.read,h.tail,{...h.op,id:'peer',userId:'peer',seq:4})
 h.setPending(false);h.control.settleControl(h.op,{ok:false,reason:'invalid_operation'},h.context)
 expect(h.resync).toHaveBeenCalledOnce();expect(h.known).toHaveBeenCalledWith(4)
})

it('locks the idle real canonical engine BEFORE joining UI reenters actual pointer DOWN',async()=>{
 const {createTestEngine}=await import('../../engine/testing/engineTestUtils')
 const {installBrushLibrary}=await import('../../engine/src/presets/importedBrushes')
 const stock=(await import('../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native')).default
 const descriptor=stock.rows.find(row=>row.index===4)!.descriptor as unknown as import('@grafetto/shared').BrushDescriptor,preset='brush:'+descriptor.id+'@'+descriptor.version
 installBrushLibrary({schemaVersion:1,brushes:[{descriptor,name:'native Basic2',source:'native',warnings:[]}],assets:[],skipped:[]})
 const f=state(),read=f.stash.canonicalRead,tail=f.stash.tailOperations,begin=vi.fn(()=>new Promise<import('@grafetto/shared').CanonicalStrokeBeginResult>(()=>{})),repair=vi.fn()
 const make=()=>{
  const r=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:8,pageHeight:8,canonicalEmptyRoom:{read,tail},canonicalAuthor:{begin},onLocalOperation:vi.fn(),onCanonicalRecoveryRequired:repair},{width:8,height:8}),engine=r.engine,gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
  Object.assign(gl,{bufferSubData:vi.fn(),getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,getAttribLocation:(_p:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),getShaderPrecisionFormat:()=>({precision:23}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},getTexParameter:(_t:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,getParameter:(key:number)=>key===9001?[0,0,8,8]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
  engine.initLayer('background');engine.initLayer('layer-1');engine.setCompositeOrder([{id:'layer-1',opacity:1}]);engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(40);engine.setLocked(false);return engine
 }
 const engine=make(),positive=make(),down={x:1,y:2,pressure:.5,tiltX:0,tiltY:0,speed:0,pointerType:'pen' as const,timeStamp:100,dispatchTime:100}
 try{
  for(const e of [engine,positive]){await e.paperReady();await e.restoreCanonicalEmptyRoom(read,tail);expect((await e.prepareBrush(preset)).status).toBe('ready')}
  positive['_onStart'](down);expect(begin).toHaveBeenCalledOnce();expect(positive.hasActiveCanonicalAuthor()).toBe(true);positive.destroy();begin.mockClear();repair.mockClear()
  const socket={},lineage={socket,connectionId:'one',boardId:'B',originalRead:read},resync=vi.fn(()=>f.expire()),joining=vi.fn(()=>engine['_onStart'](down))
  const control=createCanonicalRecoveryControl({getEngine:()=>engine,getBoard:()=> 'B',hasPendingLocals:()=>false,canRequest:()=>true,resync,onWaiting:vi.fn(),onHistoryJoining:joining,holdHistory:vi.fn(),noteKnownSequence:vi.fn(),getControlLineage:()=>lineage})
  control.bind(engine,'B');control.restored(engine)
  control.confirmedControl(engine,'B',read,tail,{id:'peer-undo',type:'operation_undo',userId:'peer',timestamp:0,targetOpId:'frame',seq:1})
  expect(joining).toHaveBeenCalledOnce();expect(begin).not.toHaveBeenCalled();expect(engine.hasActiveCanonicalAuthor()).toBe(false);expect(repair).not.toHaveBeenCalled();expect(resync).toHaveBeenCalledOnce()
 }finally{engine.destroy();positive.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(positive['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it.each(['canRequest','lineage']as const)('healthy drain remains waiting if %s callback starts a source before its final idle check',kind=>{
 let h!:ReturnType<typeof historyControl>,armed=false
 h=historyControl(undefined,()=>{if(kind==='lineage'&&armed)h.setActive(true)},()=>{armed=true;if(kind==='canRequest')h.setActive(true);return true})
 h.control.confirmedControl(h.engine,'B',h.read,h.tail,{...h.op,seq:3})
 expect(h.engine.hasActiveCanonicalAuthor()).toBe(true);expect(h.engine.setLocked).not.toHaveBeenCalled();expect(h.waiting).not.toHaveBeenCalled();expect(h.resync).not.toHaveBeenCalled();expect(h.control.controlBusy(h.engine,'B')).toBe(true)
})

it('local arm observes an author started by the final lineage callback before publishing its command',()=>{
 let h!:ReturnType<typeof historyControl>,armed=false
 h=historyControl(()=>{armed=true;return false},()=>{if(armed)h.setActive(true)})
 expect(h.begin).toThrow('busy');expect(h.control.controlBusy(h.engine,'B')).toBe(false);expect(h.engine.setLocked).not.toHaveBeenCalled();expect(h.hold).not.toHaveBeenCalled()
})

it('final pending callback replacement prevents locking the previous engine or notifying newer UI',()=>{
 let h!:ReturnType<typeof historyControl>,late=false
 h=historyControl(()=>{if(late)h.replace();return false},undefined,()=>{late=true;return true})
 h.control.confirmedControl(h.engine,'B',h.read,h.tail,{...h.op,seq:3})
 expect(h.engine.setLocked).not.toHaveBeenCalled();expect(h.waiting).not.toHaveBeenCalled();expect(h.resync).not.toHaveBeenCalled()
})

it('shares a lazy healthy transition barrier until actual ordinary-idle/ACK drain invalidates the original read',async()=>{
 const h=historyControl();h.begin()
 expect(await h.control.whenHistoryTransition(h.engine,'B')).toBe('failed')
 h.setActive(true);h.setPending(true);h.control.settleControl(h.op,{ok:true,seq:3},h.context)
 const a=h.control.whenHistoryTransition(h.engine,'B'),b=h.control.whenHistoryTransition(h.engine,'B');expect(a).toBe(b)
 let released=false;void a.then(()=>{released=true});await Promise.resolve();expect(released).toBe(false)
 h.setActive(false);h.control.authorIdle(h.engine,'B');expect(h.resync).not.toHaveBeenCalled();await Promise.resolve();expect(released).toBe(false)
 h.resync.mockImplementation(()=>{expect(h.control.whenHistoryTransition(h.engine,'B')).toBe(a);h.expire()})
 h.setPending(false);h.control.drain();expect(await a).toBe('joining');expect(()=>h.read.assertCurrent()).toThrow();expect(h.resync).toHaveBeenCalledOnce()
 expect(await h.control.whenRetiredTransition(h.engine,'B')).toBe('failed')
})
it('healthy rendezvous settles stale on detach and failed on actual resync failure without retired authority',async()=>{
 const detached=historyControl();detached.setPending(true)
 detached.control.confirmedControl(detached.engine,'B',detached.read,detached.tail,{...detached.op,seq:3})
 const a=detached.control.whenHistoryTransition(detached.engine,'B');detached.control.detach(detached.engine);expect(await a).toBe('stale')
 const failed=historyControl();failed.setPending(true);failed.control.confirmedControl(failed.engine,'B',failed.read,failed.tail,{...failed.op,seq:3})
 const b=failed.control.whenHistoryTransition(failed.engine,'B');failed.resync.mockImplementation(()=>{throw Error('join failed')});failed.setPending(false);failed.control.drain();expect(await b).toBe('failed');expect(()=>failed.read.assertCurrent()).not.toThrow()
})
