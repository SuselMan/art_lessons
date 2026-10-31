import {expect,it,vi} from 'vitest'
import {prepareCanonicalRoomState} from './net/canonicalRoomState'
import {canonicalBootstrapOf,stageCanonicalRoomReplacement,createCanonicalRoomVerdicts} from './canonicalRoomController'
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
})

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
