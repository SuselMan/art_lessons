import {openBrushGlRestoreGate,closeBrushGlRestoreGate,saveBrushGlState} from './src/dabs/BrushGlState'
import {runBrushGlTurn} from './src/dabs/BrushGlBatch'
import {indexedSocketFixture,indexedFrame,indexedSnapshot,indexedAttachment} from './testing/canonicalIndexedReadFixture'
import type {CanonicalIndexedRead,CanonicalRecordedInput} from './src/oplog/CanonicalRecordedDelivery'
import {createHash} from 'node:crypto'
import markerFixture from './src/presets/fixtures/sourceDefaultAutoWholePath/markerDry.normal.native.json'
import {isBrushLibrary,canonicalBrushDescriptorJSON,canonicalDefaultAutoSourceBinding,canonicalSourceComposition,CANONICAL_MATERIAL_LIMITS,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE as D,prepareCanonicalRecordedAttachment} from '@grafetto/shared'
import {attachCanonicalRecordedDelivery} from '../pages/Room/net/canonicalRecordedDelivery'
import {sourceStrokeAuthorDescriptor} from './src/presets/sourceStrokeAuthorDescriptor'
import {SourceStrokeAuthor,type SourceStrokeAuthorState,type SourceStrokeAuthorStep} from './src/presets/sourceStrokeAuthor'
import {SourceStrokeMaterialAdapter} from './src/presets/sourceStrokeMaterialAdapter'
import {SourceCanonicalFrameEncoder} from './src/presets/sourceCanonicalFrameEncoder'
import {CanonicalWashLayerCoordinator} from './src/dabs/CanonicalWashLayerCoordinator'
import {CanonicalRgba8CompositePass} from './src/dabs/CanonicalRgba8CompositePass'
import {exactFrame} from './src/raster/cameraFrame'
import {TransformedMaskPrepass} from './src/dabs/TransformedMaskPrepass'
import {afterEach,expect,it,vi} from 'vitest'
import {sourceAutoGeometry,canonicalSoftAutoSourcePin,buildCanonicalMaterial,CANONICAL_STROKE_RASTER_PROFILE,type CanonicalStrokeOperation,type CanonicalStrokeSnapshotV2,type CanonicalRecordedAttachmentV1,type ServerToClientEvents} from '@grafetto/shared'
import {prepareCanonicalRoomState} from '../pages/Room/net/canonicalRoomState'
import {createTestEngine} from './testing/engineTestUtils'
import {PencilEngine} from './index'
afterEach(()=>vi.restoreAllMocks())
function fixture(ended=true){
 const curve={text:'0,1;1,0',points:[{x:0,y:1,corner:false},{x:1,y:0,corner:false}]}
 const primarySource=canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,descriptorId:'soft',descriptorVersion:1,descriptorSha256:'a'.repeat(64),source:{kind:'softAuto',generator:'soft',shape:'circle',diameter:8,ratio:1,horizontalFade:1,verticalFade:1,antialias:false,spikes:2,randomness:0,density:1,softnessCurve:curve},brushScale:1,brushAngle:0,coverageProfile:'neon64-f32-fma-v1',reader:'krita-bd6e8d0-v1',compilerProfile:'eigen-5.0.1-mapped-arm64-f64-v3',buildId:'b'.repeat(64),radialCurve:{source:curve,coefficients:[[0,0,-1,1]]}})
 const material={version:2 as const,assets:[],primarySource,budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'layer-1',brush:'brush:soft@1',strokeId:'S',boardEpoch:2,descriptorSha256:'a'.repeat(64),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},assets:[],materialVersion:2,material}
 const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:8,ratio:1,spikes:2,scale:1,angle:0},{scale:1,ratio:1,rotation:0},0,0)
 const recipe={kind:'softAuto' as const,sourceSlot:0 as const,source:primarySource.source,coverageProfile:primarySource.coverageProfile,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:false}
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:0,y:0,opacity:1,flow:1}],fences:[{at:0,kind:'segmentBegin',group:0},{at:1,kind:'primaryEnd',group:0},{at:1,kind:'segmentEnd',group:0},...(ended?[{at:1,kind:'gestureEnd' as const}]:[])]},material).packed
 const op:CanonicalStrokeOperation={id:'op',userId:'author',timestamp:0,seq:1,type:'canonical_stroke',layerId:'layer-1',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:snapshot.brush,strokeId:'S',frameOrdinal:0,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:packed}}
 const attachment:CanonicalRecordedAttachmentV1={version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:'op',sequence:1,originalUserId:'author',capability:0}]}
 return {attachment,op,expected:{roomId:'room',boardEpoch:2}}
}
function state(ended=true){
 const f=fixture(ended)
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:8,canvasHeight:8,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[f.op],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:f.expected,canonicalCapabilities:f.attachment}
 return {state,f}
}

function original(empty=false,ended=true,isCurrent=()=>true){const {state:s}=state(ended);s.canonicalHistoryBase={kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:empty?0:1,operationCount:empty?0:1};if(empty){s.tailOperations=[];s.canonicalCapabilities=undefined}return prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent})}
it('admits an original empty baseline into the actual straight constructor and commits via its real engine journal/layer owner',async()=>{
 const prepared=original(true),read=prepared.canonicalRead,tail=prepared.tailOperations
 const {engine}=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:8,pageHeight:8,canonicalEmptyRoom:{read,tail}},{width:8,height:8})
 try{engine.initLayer('background');engine.initLayer('layer-1');const result=await engine.restoreCanonicalEmptyRoom(read,tail);expect(result.committed).toBe(true);expect(engine.rasterVersion).toBe('straight-rgba8-v1');expect(engine.getOperations()).toHaveLength(0)}finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('rejects copied original-owner metadata before touching the canvas',()=>{
 const p=original(true),get=vi.fn(()=>{throw Error('Canvas touched')}),canvas=new Proxy({} as HTMLCanvasElement,{get})
 expect(()=>new PencilEngine(canvas,{rasterVersion:'straight-rgba8-v1',pageWidth:8,pageHeight:8,canonicalEmptyRoom:{read:{...p.canonicalRead},tail:p.tailOperations}})).toThrow('Canonical empty history base unavailable');expect(get).not.toHaveBeenCalled()
})
function engineFor(prepared:ReturnType<typeof original>|CanonicalIndexedRead,side=8,onCanonicalIndexedMetadata?:(input:CanonicalRecordedInput)=>void,canonicalAuthor?:NonNullable<Parameters<typeof createTestEngine>[0]>['canonicalAuthor'],onCanonicalIndexedReadIdle?:()=>void){
 const result=createTestEngine({onCanonicalIndexedMetadata,onCanonicalIndexedReadIdle,canonicalAuthor,rasterVersion:'straight-rgba8-v1',pageWidth:side,pageHeight:side,...('canonicalRead'in prepared?{canonicalEmptyRoom:{read:prepared.canonicalRead,tail:prepared.tailOperations}}:{canonicalIndexedRoom:prepared})},{width:side,height:side}),gl=result.engine['gl'],get=gl.getParameter.bind(gl),mock=result.canvas.getContext('webgl')!
 const extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
 // Local state observation supplements only; real engine/services/jobs execute.
 Object.assign(gl,{getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,
  getAttribLocation:(_program:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),
  getShaderPrecisionFormat:()=>({precision:23}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},
  getTexParameter:(_target:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,
  getParameter:(key:number)=>key===9001?[0,0,side,side]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
 for(const id of ['background','layer-1'])result.engine.initLayer(id)
 result.engine.setCompositeOrder([{id:'layer-1',opacity:1}])
 return result
}
it('advances the same canonical job through the shared task transport despite an unrelated author cancellation',async()=>{
 const p=original(),{engine}=engineFor(p),schedule=vi.spyOn(engine['_authorTasks'],'schedule')
 try{
  const pending=engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  void pending.catch(()=>{}) // Keep a failed assertion's teardown rejection observed.
  expect(schedule).toHaveBeenCalledOnce()
  engine['_cancelOwnedAuthor'](false)
  expect((await pending).committed).toBe(true)
  expect(engine['_log'].entries[0].canonicalInput).toBe(p.canonicalRead.preparedAtoms[0])
  expect(engine['_authorTasks']['tasks'].size).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('cancels its own shared task and rejects a delivered stale wakeup before any GL work',async()=>{
 const p=original(),{engine}=engineFor(p),schedule=vi.spyOn(engine['_authorTasks'],'schedule'),unschedule=vi.spyOn(engine['_authorTasks'],'unschedule')
 try{
  const pending=engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations),rejected=expect(pending).rejects.toThrow('cancelled')
  const stale=schedule.mock.calls[0]?.[0];expect(stale).toBeTypeOf('function')
  engine['_cancelRebuildJob']('layer-1');await rejected
  expect(unschedule).toHaveBeenCalledOnce()
  const draw=vi.spyOn(engine['gl'],'drawArrays'),allocate=vi.spyOn(engine['gl'],'createTexture')
  stale!();expect(draw).not.toHaveBeenCalled();expect(allocate).not.toHaveBeenCalled()
  expect(engine['_log'].entries).toHaveLength(0);expect(engine['_authorTasks']['tasks'].size).toBe(0)
  expect(engine['_brushMipCache'].reservedBytes).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('runs a real ended source frame through the actual RebuildJob/coordinator/services and publishes original log proof with straight pixels',async()=>{
 const p=original(),{engine}=engineFor(p),old=engine['_layers'],draw=vi.spyOn(engine['gl'],'drawArrays'),visible=vi.spyOn(engine['_passes'],'transform'),finish=vi.spyOn(engine['gl'],'finish')
 try{
  const result=await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  expect(result.committed).toBe(true);expect(result.cleanupFailures).toEqual([]);expect(draw).toHaveBeenCalled();engine['_drawCompositeItem'](exactFrame({x:0,y:0,width:8,height:8}),'layer-1',1,engine['_assemblyFBO'].fbo,8,8);expect(visible).toHaveBeenCalled();expect(finish).not.toHaveBeenCalled()
  expect(engine['_layers']).not.toBe(old);expect(engine['_layers'].get('layer-1')?.pixelEncoding).toBe('straight-rgba8')
  expect(engine['_log'].entries[0].canonicalInput).toBe(p.canonicalRead.preparedAtoms[0]);expect(engine['_log'].entries[0].serverSeq).toBe(1)
  expect(engine['_rebuildJobs'].size).toBe(0);expect(engine['_canonicalLayerOwner']?.prepared).toBe(true);expect(engine['_canonicalLayerOwner']?.coordinator).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBeGreaterThan(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('rejects a genuinely open prefix and mismatched original geometry before canvas access',()=>{
 const canvas=new Proxy({} as HTMLCanvasElement,{get(){throw Error('Canvas touched')}}),open=original(false,false),closed=original(true)
 expect(()=>new PencilEngine(canvas,{rasterVersion:'straight-rgba8-v1',pageWidth:8,pageHeight:8,canonicalEmptyRoom:{read:open.canonicalRead,tail:open.tailOperations}})).toThrow('Open canonical')
 expect(()=>new PencilEngine(canvas,{rasterVersion:'straight-rgba8-v1',pageWidth:9,pageHeight:8,canonicalEmptyRoom:{read:closed.canonicalRead,tail:closed.tailOperations}})).toThrow('geometry mismatch')
})
it('retires all unpublished candidate resources on a real source prepare failure without changing old layers/journal',async()=>{
 const p=original(),{engine}=engineFor(p),old=engine['_layers'],primary=new Error('prepass admission failed')
 const retire=[...old.values()].map(buffer=>vi.spyOn(buffer,'destroy'))
 vi.spyOn(TransformedMaskPrepass.prototype,'prepare').mockImplementationOnce(()=>{throw primary})
 try{
  await expect(engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)).rejects.toBe(primary)
  expect(engine['_layers']).toBe(old);expect(engine['_log'].entries).toHaveLength(0);for(const destroy of retire)expect(destroy).not.toHaveBeenCalled()
  expect(engine['_rebuildJobs'].size).toBe(0);expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('cancels the actual scheduled job on destroy without publishing its staged source journal',async()=>{
 const p=original(),{engine}=engineFor(p),promise=engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
 engine.destroy();await expect(promise).rejects.toThrow('destroyed')
 expect(engine['_log'].entries).toHaveLength(0);expect(engine['_rebuildJobs'].size).toBe(0);expect(engine['_brushMipCache'].reservedBytes).toBe(0)
})
it('keeps a reentrant layer replacement from committing during original authority callbacks inside journal CAS',async()=>{
 let effect=()=>{};const p=original(false,true,()=>{effect();return true}),{engine}=engineFor(p),old=engine['_layers'],replacement=new Map(old),prepend=engine['_log'].prependHistorical.bind(engine['_log'])
 vi.spyOn(engine['_log'],'prependHistorical').mockImplementation((entries,revision,beforePublish)=>{effect=()=>{engine['_layers']=replacement;effect=()=>{}};return prepend(entries,revision,beforePublish)})
 try{
  await expect(engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)).rejects.toThrow('owner changed')
  expect(engine['_layers']).toBe(replacement);expect(engine['_log'].entries).toHaveLength(0);expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('returns a committed result with cleanup diagnostics and attempts all old owners after one old retirement fails',async()=>{
 const p=original(),{engine}=engineFor(p),old=engine['_layers'],primary=new Error('old layer retirement failed'),buffers=[...old.values()],retire=buffers[0].destroy.bind(buffers[0])
 vi.spyOn(buffers[0],'destroy').mockImplementation(()=>{retire();old.delete('layer-1');throw primary});const second=vi.spyOn(buffers[1],'destroy')
 try{
  const result=await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  expect(result.committed).toBe(true);expect(result.cleanupFailures).toContain(primary);expect(second).toHaveBeenCalledOnce()
  expect(engine['_layers']).not.toBe(old);expect(engine['_log'].entries).toHaveLength(1);expect(engine['_log'].entries[0].serverSeq).toBe(1)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('keeps legacy tile replay closed while the accepted original prefix recovers',async()=>{
 const p=original(),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const replay=vi.spyOn(engine,'_syncBuffersToLog' as never),init=vi.spyOn(engine,'_initGL' as never)
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));engine['_handleContextRestored']()
  expect(engine['_canonicalPixelsReady']).toBe(false);expect(init).toHaveBeenCalledOnce();expect(replay).not.toHaveBeenCalled()
  expect(engine['_log'].entries[0].serverSeq).toBe(1);expect(engine.bakeNetworkSnapshot('layer-1')).toBeNull()
  expect(()=>engine['_makeTileRebuilder']('layer-1')()).toThrow('recovery required')
  await vi.waitFor(()=>expect(engine['_canonicalPixelsReady']).toBe(true))
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('preserves a real GPU draw failure and retires partially written unpublished storage before rejecting',async()=>{
 const p=original(),{engine}=engineFor(p),old=engine['_layers'],primary=new Error('canonical draw failed')
 await engine.paperReady()
 const draw=CanonicalRgba8CompositePass.prototype.drawSource
 vi.spyOn(CanonicalRgba8CompositePass.prototype,'drawSource').mockImplementationOnce(function(this:CanonicalRgba8CompositePass,...args){draw.apply(this,args);throw primary})
 try{
  await expect(engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)).rejects.toBe(primary)
  expect(engine['_layers']).toBe(old);expect(engine['_log'].entries).toHaveLength(0)
  expect(engine['_rebuildJobs'].size).toBe(0);expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('retires an adopted first candidate when creating the second implicit layer fails before publication',async()=>{
 const p=original(),{engine}=engineFor(p),old=engine['_layers'],primary=new Error('second implicit candidate failed'),make=engine['_makeLayerBuffer'].bind(engine),first=make(),destroy=vi.spyOn(first,'destroy')
 engine['_makeLayerBuffer']=vi.fn<typeof engine['_makeLayerBuffer']>().mockImplementationOnce(()=>first).mockImplementationOnce(()=>{throw primary})
 try{
  await expect(engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)).rejects.toBe(primary)
  expect(destroy).toHaveBeenCalledOnce();expect(engine['_layers']).toBe(old);expect(engine['_log'].entries).toHaveLength(0)
  expect(engine['_rebuildJobs'].size).toBe(0);expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('recovers the accepted original prefix through the same job without changing journal, revision or entry identities',async()=>{
 const p=original(),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const log=engine['_log'],entries=log.entries,revision=log.revision,entry=entries[0],old=engine['_layers'],init=vi.spyOn(engine,'_initGL' as never),finish=vi.spyOn(engine['gl'],'finish')
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));engine['_handleContextRestored']();engine['_handleContextRestored']()
  await vi.waitFor(()=>expect(engine['_layers']).not.toBe(old))
  expect(engine['_log']).toBe(log);expect(log.entries).toBe(entries);expect(log.revision).toBe(revision);expect(log.entries[0]).toBe(entry)
  expect(init).toHaveBeenCalledOnce();expect(finish).not.toHaveBeenCalled();expect(engine['_contextLost']).toBe(false)
  expect(engine['_canonicalLayerOwner']?.prepared).toBe(true);expect(engine['_canonicalLayerOwner']?.coordinator).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBeGreaterThan(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('closes read/export/display while a fresh recovered generation is pending',async()=>{
 const p=original(),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));engine['_handleContextRestored']()
  const read=vi.spyOn(engine['gl'],'readPixels'),draw=vi.spyOn(engine['gl'],'drawArrays'),exported=vi.spyOn(engine['_exporter'],'exportPNG'),area=vi.spyOn(engine['_area'],'readAreaImage')
  expect(engine.pickColor(1,1)).toBeNull();expect(await engine.exportPNG()).toBeNull();expect(await engine.bakePreview()).toBeNull();expect(await engine.readAreaImage('layer-1',{points:[0,0,8,0,8,8,0,8]})).toBeNull();expect(area).not.toHaveBeenCalled()
  engine['_display']();expect(read).not.toHaveBeenCalled();expect(draw).not.toHaveBeenCalled();expect(exported).not.toHaveBeenCalled()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('rejects stale original authority before allocating any restored scene',async()=>{
 let current=true;const p=original(false,true,()=>current),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));current=false
  const allocate=vi.spyOn(engine['gl'],'createTexture'),init=vi.spyOn(engine,'_initGL' as never)
  engine['_handleContextRestored']()
  expect(init).not.toHaveBeenCalled();expect(allocate).not.toHaveBeenCalled();expect(engine['_log'].entries[0].serverSeq).toBe(1)
  expect(engine.pickColor(1,1)).toBeNull()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('retires a healthy failed restored allocation before allowing only an explicit original-owner retry',async()=>{
 const p=original(),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);await engine.paperReady()
  const entries=engine['_log'].entries,old=engine['_layers'],primary=new Error('healthy restored allocation failed'),programs=new Set<WebGLProgram>(),gl=engine['gl'],create=gl.createProgram.bind(gl),remove=gl.deleteProgram.bind(gl)
  vi.spyOn(gl,'createProgram').mockImplementation(()=>{const value=create();if(value)programs.add(value);return value})
  const deleted=vi.spyOn(gl,'deleteProgram').mockImplementation(value=>{if(value)programs.delete(value);remove(value)})
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}))
  vi.spyOn(engine['gl'],'createFramebuffer').mockImplementationOnce(()=>{throw primary})
  engine['_handleContextRestored']()
  expect(engine['_canonicalEmptyTransaction']).toBeUndefined();expect(engine['_canonicalPixelsReady']).toBe(false);expect(engine['_contextLost']).toBe(false)
  expect(engine['_layers']).toBe(old);expect(engine['_log'].entries).toBe(entries);expect(deleted).toHaveBeenCalled();expect(programs.size).toBe(0)
  const init=vi.spyOn(engine,'_initGL' as never);engine['_handleContextRestored']();expect(init).not.toHaveBeenCalled()
  expect((await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)).committed).toBe(true)
  expect(engine['_log'].entries).toBe(entries);expect(engine['_canonicalPixelsReady']).toBe(true)
  expect(engine['_canonicalLayerOwner']?.prepared).toBe(true);expect(engine['_canonicalLayerOwner']?.coordinator).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBeGreaterThan(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('retires a partially drawn recovered candidate on healthy failure and preserves the accepted journal',async()=>{
 const p=original(),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);await engine.paperReady()
  const entries=engine['_log'].entries,revision=engine['_log'].revision,old=engine['_layers'],draw=CanonicalRgba8CompositePass.prototype.drawSource,primary=new Error('recovery draw failed')
  vi.spyOn(CanonicalRgba8CompositePass.prototype,'drawSource').mockImplementationOnce(function(this:CanonicalRgba8CompositePass,...args){draw.apply(this,args);throw primary})
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));engine['_handleContextRestored']()
  await vi.waitFor(()=>expect(engine['_canonicalEmptyTransaction']).toBeUndefined())
  expect(engine['_canonicalPixelsReady']).toBe(false);expect(engine['_layers']).toBe(old);expect(engine['_log'].entries).toBe(entries);expect(engine['_log'].revision).toBe(revision)
  expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)
  expect((await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)).committed).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('invalidates a pending recovery on repeated physical loss and never lets its stale init rollback delete the next scene',async()=>{
 const p=original(),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const entries=engine['_log'].entries,revision=engine['_log'].revision,init=engine['_initGL'].bind(engine);let stale:(()=>void)|undefined
  engine['_initGL']=()=>{const rollback=init();stale??=rollback;return rollback}
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));engine['_handleContextRestored']()
  await vi.waitFor(()=>expect(engine['_canonicalPixelsReady']).toBe(true))
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));engine['_handleContextRestored']()
  expect(engine['_canonicalEmptyTransaction']).toBeDefined()
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));expect(engine['_canonicalEmptyTransaction']).toBeUndefined()
  engine['_handleContextRestored']();await vi.waitFor(()=>expect(engine['_canonicalPixelsReady']).toBe(true))
  const destroy=vi.spyOn(engine['_passes'],'destroy');stale!();expect(destroy).not.toHaveBeenCalled()
  expect(engine['_log'].entries).toBe(entries);expect(engine['_log'].revision).toBe(revision)
  expect(engine['_canonicalLayerOwner']?.prepared).toBe(true);expect(engine['_canonicalLayerOwner']?.coordinator).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBeGreaterThan(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('cleans interrupted initial history and reinitializes its physical scene only for explicit original-owner retry',async()=>{
 const p=original(),{engine}=engineFor(p)
 try{
  const pending=engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations),rejected=expect(pending).rejects.toThrow('context lost')
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));await rejected
  engine['_handleContextRestored']();expect(engine['_canonicalEmptyTransaction']).toBeUndefined();expect(engine['_canonicalPixelsReady']).toBe(false);expect(engine['_log'].entries).toHaveLength(0)
  const init=vi.spyOn(engine,'_initGL' as never),paper=vi.spyOn(engine['_paper'],'init')
  expect((await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)).committed).toBe(true)
  expect(init).toHaveBeenCalledOnce();expect(paper).toHaveBeenCalledOnce();expect(engine['_paper'].texture).not.toBeNull();expect(engine['_canonicalPixelsReady']).toBe(true);expect(engine['_log'].entries[0].canonicalInput).toBe(p.canonicalRead.preparedAtoms[0])
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it.each(['state','serverSeq','frame'] as const)('rejects an accepted entry %s mutation from original authority before restored allocation',async field=>{
 let mutate=()=>{};const p=original(false,true,()=>{mutate();return true}),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const entry=engine['_log'].entries[0],revision=engine['_log'].revision
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}))
  mutate=()=>{if(field==='state')entry.state='undone';else if(field==='serverSeq')entry.serverSeq=99;else if(entry.op.type==='canonical_stroke')entry.op.frame={...entry.op.frame,strokeId:'forged'}}
  const allocate=vi.spyOn(engine['gl'],'createTexture')
  engine['_handleContextRestored']()
  expect(allocate).not.toHaveBeenCalled();expect(engine['_canonicalPixelsReady']).toBe(false);expect(engine['_log'].revision).toBe(revision)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it.each(['state','serverSeq','frame'] as const)('rechecks accepted mutable %s after final original callbacks before map publication',async field=>{
 let mutate=()=>{};const p=original(false,true,()=>{mutate();return true}),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const entry=engine['_log'].entries[0],entries=engine['_log'].entries,revision=engine['_log'].revision,old=engine['_layers'],publish=engine['_publishCanonicalEmpty'].bind(engine)
  engine['_publishCanonicalEmpty']=tx=>{mutate=()=>{if(field==='state')entry.state='undone';else if(field==='serverSeq')entry.serverSeq=99;else if(entry.op.type==='canonical_stroke')entry.op.frame={...entry.op.frame,strokeId:'forged'}};publish(tx)}
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));engine['_handleContextRestored']()
  await vi.waitFor(()=>expect(engine['_canonicalEmptyTransaction']).toBeUndefined())
  expect(engine['_canonicalPixelsReady']).toBe(false);expect(engine['_layers']).toBe(old);expect(engine['_log'].entries).toBe(entries);expect(engine['_log'].revision).toBe(revision)
  expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

function fullOriginal({ended=true,hidden=false,redo=false,current=()=>true}:{ended?:boolean;hidden?:boolean;redo?:boolean;current?:()=>boolean}={}){
 const {state:s}=state(ended)
 if(!ended)s.tailOperations.push({type:'canonical_stroke_close',id:'seal',userId:'author',timestamp:1,seq:2,layerId:'layer-1',targetUserId:'author',strokeId:'S',disposition:'commitPartial',recordedNext:1,firstFrameOpId:'op',lastFrameOpId:'op'})
 if(hidden)s.tailOperations.push({type:'operation_undo',id:'undo',userId:'author',timestamp:2,seq:s.tailOperations.length+1,targetOpId:'op'})
 if(redo)s.tailOperations.push({type:'operation_redo',id:'redo',userId:'author',timestamp:3,seq:s.tailOperations.length+1,targetOpId:'undo'})
 s.canonicalHistoryBase={kind:'full-room-prefix-v2',roomId:'room',boardEpoch:2,throughSeq:s.tailOperations.length,operationCount:s.tailOperations.length}
 return prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:current})
}
it.each([{ended:true,hidden:false},{ended:false,hidden:false},{ended:true,hidden:true},{ended:false,hidden:true},{ended:false,hidden:true,redo:true}])('restores original full history with final visibility through the same layer owner (%j)',async options=>{
 const p=fullOriginal(options),{engine}=engineFor(p),frames=vi.spyOn(CanonicalWashLayerCoordinator.prototype,'enqueueRecorded'),seals=vi.spyOn(CanonicalWashLayerCoordinator.prototype,'enqueueRecordedSeal')
 try{
  const result=await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  expect(result.cleanupFailures).toEqual([])
  const entries=engine['_log'].entries
  expect(entries).toHaveLength(p.tailOperations.length)
  entries.forEach((entry,i)=>{expect(entry.canonicalInput).toBe(p.canonicalRead.preparedAtoms[i]);expect(entry.serverSeq).toBe(i+1)})
  const visible=!options.hidden||'redo'in options&&options.redo
  expect(entries[0].state).toBe(visible?'done':'undone')
  expect(frames).toHaveBeenCalledTimes(visible?1:0);expect(seals).toHaveBeenCalledTimes(visible&&!options.ended?1:0)
  expect(engine['_canonicalPixelsReady']).toBe(true)
  expect(engine['_canonicalLayerOwner']?.coordinator).toBeUndefined()
  expect(engine['_canonicalLayerOwner']?.inputs).toHaveLength(entries.length)
  expect(engine['_canonicalRecoveryDirty']).toBe(false)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)}
})
it('rejects copied and stale original full history before canvas access',()=>{
 let current=true;const p=fullOriginal({ended:false,current:()=>current}),canvas=new Proxy({}as HTMLCanvasElement,{get(){throw Error('Canvas touched')}})
 expect(()=>new PencilEngine(canvas,{rasterVersion:'straight-rgba8-v1',pageWidth:8,pageHeight:8,canonicalEmptyRoom:{read:{...p.canonicalRead},tail:p.tailOperations}})).toThrow('Foreign canonical full history receiver')
 current=false
 expect(()=>new PencilEngine(canvas,{rasterVersion:'straight-rgba8-v1',pageWidth:8,pageHeight:8,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations}})).toThrow('Stale')
})
it.each([{ended:false,hidden:false},{ended:false,hidden:true}])('recovers the accepted original full history after physical loss without replacing its journal (%j)',async options=>{
 const p=fullOriginal(options),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const log=engine['_log'],entries=log.entries,revision=log.revision,states=entries.map(entry=>entry.state),old=engine['_layers']
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));engine['_handleContextRestored']()
  await vi.waitFor(()=>expect(engine['_canonicalPixelsReady']).toBe(true))
  expect(engine['_layers']).not.toBe(old);expect(engine['_log']).toBe(log);expect(log.entries).toBe(entries);expect(log.revision).toBe(revision)
  expect(entries.map(entry=>entry.state)).toEqual(states);entries.forEach((entry,i)=>expect(entry.canonicalInput).toBe(p.canonicalRead.preparedAtoms[i]))
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

function markerOriginal(empty=false){
 const library:unknown={schemaVersion:1,brushes:[markerFixture.imported],assets:[],skipped:[]};if(!isBrushLibrary(library))throw Error('Invalid Marker')
 const descriptor=library.brushes[0].descriptor,sha=createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex')
 expect(sha).toBe(markerFixture.canonicalDescriptorSHA256)
 const source=canonicalDefaultAutoSourceBinding(descriptor,sha,D,G),composition=canonicalSourceComposition(descriptor,G)
 if(!composition)throw Error('Missing source composition')
 const material={version:2 as const,assets:[],primarySource:source,budget:{workUnits:CANONICAL_MATERIAL_LIMITS.workUnits,outputBytes:CANONICAL_MATERIAL_LIMITS.outputBytes,drawPixels:CANONICAL_MATERIAL_LIMITS.drawPixels}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'layer-1',brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:markerFixture.strokeId,boardEpoch:2,descriptorSha256:sha,rasterProfile:G,pigmentRgb8:[0,0,0],composition:{...composition,alphaDarken:'creamy',outerResourceOpacity:1},assets:[],materialVersion:2,material}
 const compiled=sourceStrokeAuthorDescriptor(descriptor,{colorIdentity:'normal-import-black',lodScale:1,inputProfile:'krita-freehand-no-smoothing-v1',coverageProfile:D});if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const author=new SourceStrokeAuthor(compiled.program);let cursor=author.createState(4321,7654,.3)
 const adapter=new SourceStrokeMaterialAdapter(compiled.program,material,cursor),encoder=new SourceCanonicalFrameEncoder({...snapshot,material}),ops:CanonicalStrokeOperation[]=[];let draws=0
 const accept=(chunks:ReturnType<typeof adapter.finish>)=>{for(const c of chunks){const encoded=encoder.encode(c.packed);draws+=encoded.frame.draws.length;ops.push({id:'marker-'+ops.length,type:'canonical_stroke',userId:'author',timestamp:ops.length,seq:ops.length+1,layerId:'layer-1',frame:encoded.envelope})}}
 const consume=(iterator:Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState>)=>{while(true){const n=iterator.next();if(n.done){cursor=n.value;return}accept(adapter.accept(n.value));const cut=adapter.flush();if(cut)accept([cut])}}
 for(const packet of markerFixture.packets){accept(adapter.beginInput(cursor));if(packet===markerFixture.packets[0]){const cut=adapter.flush();if(cut)accept([cut])}consume(author.plan(cursor,packet))}
 accept(adapter.beginInput(cursor));consume(author.finish(cursor));accept(adapter.finish(cursor))
 expect(ops).toHaveLength(29);expect(draws).toBe(17);expect(encoder.ended).toBe(true)
 const attachment:CanonicalRecordedAttachmentV1={version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:'author',snapshot}],bindings:ops.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}))}
 const base=state().state,tail=empty?[]:ops
 const wire:Parameters<ServerToClientEvents['room_state']>[0]={...base,room:{...base.room,canvasWidth:64,canvasHeight:64},tailOperations:tail,canonicalAuthorRasterProfile:G,canonicalReadScope:{roomId:'room',boardEpoch:2,allowedRasterProfiles:[G]},canonicalCapabilities:empty?undefined:attachment,canonicalHistoryBase:{kind:'full-room-prefix-v2',roomId:'room',boardEpoch:2,throughSeq:tail.length,operationCount:tail.length}}
 return {prepared:prepareCanonicalRoomState(wire,{expectedBoardId:'room',isCurrent:()=>true}),ops,attachment}
}
it('restores the actual29-frame rotated Marker original full baseline and recovers the same journal',async()=>{
 const {prepared:p,ops}=markerOriginal(),{engine}=engineFor(p,64),gl=engine['gl'],upload=vi.spyOn(gl,'texSubImage2D'),draw=vi.spyOn(gl,'drawArrays')
 try{
  await engine.paperReady();await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  expect(engine['_canonicalLayerOwner']?.mask).toEqual({width:54,height:54,slots:1})
  expect(engine['_canonicalExportReady']()).toBe(true);expect(engine['_log'].entries.map(e=>e.canonicalInput?.operation)).toEqual(ops)
  const nonzero=(args:readonly unknown[])=>args[8] instanceof Uint8Array&&args[8].some(value=>value!==0)
  expect(upload.mock.calls.some(nonzero)).toBe(true);expect(draw).toHaveBeenCalled()
  const entries=engine['_log'].entries,revision=engine['_log'].revision
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));engine['_handleContextRestored']()
  await vi.waitFor(()=>expect(engine['_canonicalPixelsReady']).toBe(true),{timeout:5000})
  expect(engine['_log'].entries).toBe(entries);expect(engine['_log'].revision).toBe(revision);expect(engine['_canonicalExportReady']()).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)}
})
it('admits actual Marker empty-control before hot rotated originals under the same bounded owner',async()=>{
 const {prepared:p,ops,attachment}=markerOriginal(true),{engine}=engineFor(p,64),gl=engine['gl'],draw=vi.spyOn(gl,'drawArrays')
 try{
  await engine.paperReady();await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,stable=owner.stable
  for(let i=0;i<ops.length;i++){
   const input=attachCanonicalRecordedDelivery(prepareCanonicalRecordedAttachment({...attachment,bindings:[attachment.bindings[i]]},[ops[i]],p.canonicalRead.scope)[0],p.canonicalRead.scope)
   if(!('delivery'in input))throw Error('Missing original input delivery')
   expect(await engine.prepareOriginalRecorded(input)).toMatchObject({status:'ready'});engine.appendOriginalRecorded(input)
   if(i===0){expect(owner.mask).toEqual({width:54,height:54,slots:1});expect(engine['_log'].entries).toHaveLength(1)}
  }
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0),{timeout:5000})
  expect(engine['_canonicalLayerOwner']).toBe(owner);expect(owner.stable).toBe(stable);expect(engine['_canonicalExportReady']()).toBe(true)
  expect(engine['_log'].entries.map(e=>e.canonicalInput?.operation)).toEqual(ops);expect(draw).toHaveBeenCalled()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)}
})

it('consumes genuine indexed socket pages beyond the old whole-history limits without retained historical LogEntries',async()=>{
 const operations=Array.from({length:72*30},(_,i)=>indexedFrame(i+1,'gesture'+Math.floor(i/30),i%30===29,i%30)),issuer=indexedSocketFixture(operations,64),read=await issuer.open(),{engine}=engineFor(read)
 try{
  await engine.paperReady()
  const enqueue=vi.spyOn(CanonicalWashLayerCoordinator.prototype,'enqueueRecorded'),restore=engine.restoreCanonicalIndexedRoom(read)
  expect(engine['_canonicalPixelsReady']).toBe(false)
  await restore
  expect(enqueue).toHaveBeenCalledTimes(operations.length)
  expect(engine['_log'].canonicalRetainedSuffix).toHaveLength(0)
  expect(engine['_canonicalLayerOwner']?.inputs).toHaveLength(0)
  expect(engine['_log'].canonicalAcceptedCut?.throughSeq).toBe(operations.length)
  expect(engine.hasLayerContent('layer-1')).toBe(true)
  expect(engine.getRoomDerivedState()).toMatchObject({kind:'canonical-indexed-v1',operationCount:operations.length,throughSeq:operations.length,structure:'implicit-initial-layers'})
  expect(()=>engine.getOperations()).toThrow('asynchronous session export')
  expect(issuer.requests.filter(r=>r.event==='canonical_history_stream_evidence')).toHaveLength(72)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},120000)

it('keeps a genuine nonempty OPEN source and raw leases current after more than1024 page-released original frames',async()=>{
 const operations=Array.from({length:1030},(_,i)=>indexedFrame(i+1,'long-open',false,i)),first=operations[0]
 if(first.type!=='canonical_stroke'||indexedSnapshot.material.primarySource.kind!=='defaultAuto')throw Error('Actual native source fixture required')
 const pin=indexedSnapshot.material.primarySource,g=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:pin.source.diameter,ratio:pin.source.ratio,spikes:2,scale:pin.brushScale,angle:pin.brushAngle},{scale:.1,ratio:1,rotation:0},0,0)
 first.frame={...first.frame,materialPacked:buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe:{kind:'defaultAuto',source:pin.source,coverageProfile:pin.coverageProfile,brushScale:pin.brushScale,brushAngle:pin.brushAngle,scale:.1,ratio:1,rotation:0,subX:0,subY:0,width:g.maskSize[0],height:g.maskSize[1],mirrorH:false,mirrorV:false},role:'primary',x:0,y:0,opacity:1,flow:1}],fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:1,group:0},{kind:'segmentEnd',at:1,group:0}]},indexedSnapshot.material).packed}
 const issuer=indexedSocketFixture(operations,64)
 issuer.handlers.canonical_history_stream_evidence=body=>({ok:true,value:{kind:'canonical-indexed-history-root-evidence-v1',streamId:'read0',throughSeq:operations.length,root:body.root,rows:[first],canonicalCapabilities:indexedAttachment([first]),first:0,terminal:null,lastMetadata:null,latestRedo:null,firstUndoAfterLatestRedo:null,ownBranchAfterUndo:null}})
 const read=await issuer.open(),{engine}=engineFor(read),paint=vi.spyOn(CanonicalRgba8CompositePass.prototype,'drawSource')
 try{
  await engine.paperReady();await engine.restoreCanonicalIndexedRoom(read)
  expect(paint).toHaveBeenCalled();expect(issuer.requests.filter(r=>r.event==='canonical_history_stream_evidence')).toHaveLength(1)
  expect(engine['_log'].canonicalRetainedSuffix).toHaveLength(0)
  expect(engine['_canonicalLayerOwner']?.coordinator?.checkpointReady).toBe(false)
  expect(engine['_canonicalLayerOwner']?.coordinator?.presentationReady).toBe(true)
  expect(engine['_canonicalLayerOwner']?.indexedCarry?.size).toBe(1)
  expect(engine['_canonicalExportReady']()).toBe(false)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},120000)
it('verifies original hidden root evidence without warming its source or painting it',async()=>{
 const first=indexedFrame(),undo={id:'undo',seq:2,type:'operation_undo' as const,userId:'actor',timestamp:1,targetOpId:first.id},issuer=indexedSocketFixture([first,undo],1)
 issuer.handlers.canonical_history_stream_evidence=body=>({ok:true,value:{kind:'canonical-indexed-history-root-evidence-v1',streamId:'read0',throughSeq:2,root:body.root,rows:[first,undo],canonicalCapabilities:indexedAttachment([first]),first:0,terminal:0,lastMetadata:1,latestRedo:null,firstUndoAfterLatestRedo:1,ownBranchAfterUndo:null}})
 const read=await issuer.open(),{engine}=engineFor(read),prepare=vi.spyOn(TransformedMaskPrepass.prototype,'prepare'),paint=vi.spyOn(CanonicalRgba8CompositePass.prototype,'drawSource')
 try{await engine.paperReady();await engine.restoreCanonicalIndexedRoom(read);expect(prepare).not.toHaveBeenCalled();expect(paint).not.toHaveBeenCalled();expect(engine.hasLayerContent('layer-1')).toBe(false);expect(engine.getRoomDerivedState()).toMatchObject({kind:'canonical-indexed-v1',operationCount:2})}
 finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('publishes a bounded genuine follow without retaining old entries or replacing the physical owner',async()=>{
 const operations=[indexedFrame(1,'first')],issuer=indexedSocketFixture(operations,1),read=await issuer.open(),{engine}=engineFor(read)
 try{
  await engine.paperReady();await engine.restoreCanonicalIndexedRoom(read)
  const cut=engine['_log'].canonicalAcceptedCut!,owner=engine['_canonicalLayerOwner'],stable=owner!.stable
  operations.push(indexedFrame(2,'second'),indexedFrame(3,'third'))
  const follow=await read.lifetime.follow(cut)
  await engine.appendCanonicalIndexedContinuation(follow)
  expect(engine['_log'].canonicalAcceptedCut?.throughSeq).toBe(3)
  expect(engine['_log'].canonicalRetainedSuffix).toHaveLength(0)
  expect(engine['_canonicalLayerOwner']).toBe(owner);expect(owner!.stable).toBe(stable)
  expect(engine.getRoomDerivedState()).toMatchObject({throughSeq:3,operationCount:3})
  expect(engine.hasLayerContent('layer-1')).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('hands actual metadata to U3 without advancing the accepted cut or poisoning the source',async()=>{
 const operations=[indexedFrame(1,'first')],issuer=indexedSocketFixture(operations,2),read=await issuer.open(),handoff=vi.fn(),{engine}=engineFor(read,8,handoff)
 try{
  await engine.paperReady();await engine.restoreCanonicalIndexedRoom(read)
  const cut=engine['_log'].canonicalAcceptedCut!,owner=engine['_canonicalLayerOwner']
  operations.push(indexedFrame(2,'second'),{id:'undo-first',seq:3,userId:'actor',timestamp:0,type:'operation_undo',targetOpId:'frame1'})
  await engine.appendCanonicalIndexedContinuation(await read.lifetime.follow(cut))
  expect(handoff).toHaveBeenCalledOnce()
  const input:CanonicalRecordedInput=handoff.mock.calls[0][0];input.delivery.assertCurrent(input)
  expect(input.operation.id).toBe('undo-first');expect(engine['_log'].canonicalAcceptedCut).toBe(cut)
  expect(engine['_log'].canonicalRetainedSuffix.map(entry=>entry.serverSeq)).toEqual([2])
  expect(engine['_canonicalLayerOwner']).toBe(owner);expect(owner!.failed).toBe(false)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('exports actual original full pages asynchronously after a published cut',async()=>{
 const operations=[indexedFrame(1,'first'),indexedFrame(2,'second')],issuer=indexedSocketFixture(operations,1),read=await issuer.open(),{engine}=engineFor(read)
 try{
  await engine.paperReady();await engine.restoreCanonicalIndexedRoom(read)
  const entries=engine['_log'].entries,revision=engine['_log'].revision,cut=engine['_log'].canonicalAcceptedCut
  const blob=await engine.exportSessionJSON()
  expect(JSON.parse(await blob.text())).toEqual(operations)
  expect(engine['_log'].entries).toBe(entries);expect(engine['_log'].revision).toBe(revision);expect(engine['_log'].canonicalAcceptedCut).toBe(cut)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('recovers a published indexed cut through actual full reopen without rewriting the same log',async()=>{
 const operations=[indexedFrame(1,'first'),indexedFrame(2,'second')],issuer=indexedSocketFixture(operations,1),read=await issuer.open(),{engine}=engineFor(read)
 try{
  await engine.paperReady();await engine.restoreCanonicalIndexedRoom(read)
  const log=engine['_log'],entries=log.entries,revision=log.revision,cut=log.canonicalAcceptedCut
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));engine['_handleContextRestored']()
  await vi.waitFor(()=>expect(engine['_canonicalPixelsReady']).toBe(true),{timeout:5000})
  expect(engine['_log']).toBe(log);expect(log.entries).toBe(entries);expect(log.revision).toBe(revision);expect(log.canonicalAcceptedCut).toBe(cut)
  expect(engine.getRoomDerivedState()).toMatchObject({operationCount:2,throughSeq:2})
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('selects indexed history asynchronously from genuine original evidence and suppresses duplicate pending requests',async()=>{
 const first=indexedFrame(),issuer=indexedSocketFixture([first],1),read=await issuer.open(),{engine}=engineFor(read,8,undefined,{begin:async()=>{throw Error('History selection must not call BEGIN')}}),emit=vi.fn()
 let selected:((value:unknown)=>void)|undefined
 issuer.handlers.canonical_history_stream_select=()=>new Promise(resolve=>{selected=resolve})
 try{
  await engine.paperReady();await engine.restoreCanonicalIndexedRoom(read);engine.setUserId('actor');engine.setLocked(false);engine['_onLocalOperation']=emit
  const log=engine['_log'],revision=log.revision,request=engine.requestHistory('undo')
  await vi.waitFor(()=>expect(selected).toBeTypeOf('function'))
  expect(await engine.requestHistory('undo')).toBeNull();expect(emit).not.toHaveBeenCalled()
  selected!({ok:true,value:{targetOperationId:first.id,evidence:{kind:'canonical-indexed-history-root-evidence-v1',streamId:'read0',throughSeq:1,root:{originalUserId:'actor',strokeId:'stroke',layerId:'layer-1',firstOperationId:first.id,firstSequence:1},rows:[first],canonicalCapabilities:indexedAttachment([first]),first:0,terminal:0,lastMetadata:null,latestRedo:null,firstUndoAfterLatestRedo:null,ownBranchAfterUndo:null}}})
  expect((await request)?.id).toBe(first.id);expect(emit).toHaveBeenCalledOnce();expect(emit.mock.calls[0][0]).toMatchObject({type:'operation_undo',targetOpId:first.id})
  expect(log.revision).toBe(revision);expect(log.entries).toHaveLength(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('rejects a stale actual page arrival before publication and retires all candidate CPU ownership',async()=>{
 const issuer=indexedSocketFixture([indexedFrame()],1),delegate=issuer.handlers.canonical_history_stream_next
 let release:((value:unknown)=>void)|undefined,response:unknown
 issuer.handlers.canonical_history_stream_next=body=>{response=delegate(body);return new Promise(resolve=>{release=resolve})}
 const read=await issuer.open(),{engine}=engineFor(read)
 try{
  await engine.paperReady();const layers=engine['_layers'],revision=engine['_log'].revision,restore=engine.restoreCanonicalIndexedRoom(read),rejected=expect(restore).rejects.toThrow()
  await vi.waitFor(()=>expect(release).toBeTypeOf('function'))
  issuer.setCurrent(false);release!(response);await rejected
  expect(engine['_canonicalPixelsReady']).toBe(false);expect(engine['_layers']).toBe(layers);expect(engine['_log'].revision).toBe(revision);expect(engine['_log'].canonicalAcceptedCut).toBeNull()
  expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_rebuildJobs'].size).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('reverifies a canceled partial original FOLLOW without reappending or repainting its genuine nonempty prefix',async()=>{
 if(indexedSnapshot.material.primarySource.kind!=='defaultAuto')throw Error('Native original source required')
 const pin=indexedSnapshot.material.primarySource,g=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:pin.source.diameter,ratio:pin.source.ratio,spikes:2,scale:pin.brushScale,angle:pin.brushAngle},{scale:.1,ratio:1,rotation:0},0,0)
 const painted=(seq:number,strokeId:string,ended=false)=>{
  const op=indexedFrame(seq,strokeId,ended);if(op.type!=='canonical_stroke')throw Error('Frame required')
  op.frame={...op.frame,materialPacked:buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe:{kind:'defaultAuto',source:pin.source,coverageProfile:pin.coverageProfile,brushScale:pin.brushScale,brushAngle:pin.brushAngle,scale:.1,ratio:1,rotation:0,subX:0,subY:0,width:g.maskSize[0],height:g.maskSize[1],mirrorH:false,mirrorV:false},role:'primary',x:seq===5?3:0,y:0,opacity:1,flow:1}],fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:1,group:0},{kind:'segmentEnd',at:1,group:0},...(ended?[{kind:'gestureEnd' as const,at:1}]:[])]},indexedSnapshot.material).packed}
  return op
 }
 const operations=[indexedFrame()],issuer=indexedSocketFixture(operations,1),read=await issuer.open(),{engine}=engineFor(read),primary=Error('Actual resource preparation refused'),prepare=engine.prepareOriginalRecorded.bind(engine)
 const draw=vi.spyOn(CanonicalRgba8CompositePass.prototype,'drawSource'),enqueue=vi.spyOn(CanonicalWashLayerCoordinator.prototype,'enqueueRecorded')
 try{
  await engine.paperReady();await engine.restoreCanonicalIndexedRoom(read)
  const cut=engine.getCanonicalIndexedCut()!,owner=engine['_canonicalLayerOwner']!
  operations.push(painted(2,'retry-open'),indexedFrame(3,'retry-open',false,1),indexedFrame(4,'retry-open',true,2))
  let fail=true
  vi.spyOn(engine,'prepareOriginalRecorded').mockImplementation((input,options)=>{if(fail&&input.operation.seq===3){fail=false;throw primary}return prepare(input,options)})
  await expect(engine.appendCanonicalIndexedContinuation(()=>read.lifetime.follow(cut))).rejects.toBe(primary)
  expect(owner.failed).toBe(false);expect(engine.getCanonicalIndexedCut()).toBe(cut)
  expect(engine['_log'].canonicalRetainedSuffix.map(e=>e.serverSeq)).toEqual([2])
  await vi.waitFor(()=>expect(owner.coordinator?.pending).toBe(false),{timeout:5000})
  const deposited=()=>draw.mock.calls.filter(([request])=>request.source.kind==='maskRgb').length,count=deposited(),queued=enqueue.mock.calls.length
  expect(count).toBeGreaterThan(0)
  const original=operations[1];operations[1]={...original,id:'foreign-same-sequence'}
  await expect(engine.appendCanonicalIndexedContinuation(()=>read.lifetime.follow(cut))).rejects.toThrow('retained original mismatch')
  expect(deposited()).toBe(count);expect(enqueue).toHaveBeenCalledTimes(queued);expect(owner.failed).toBe(false)
  operations[1]=original
  expect(await engine.appendCanonicalIndexedContinuation(()=>read.lifetime.follow(cut))).toBe('advanced')
  await vi.waitFor(()=>expect(engine['_canonicalExportReady']()).toBe(true),{timeout:5000})
  expect(deposited()).toBe(count);expect(enqueue).toHaveBeenCalledTimes(queued+2)
  expect(engine.getCanonicalIndexedCut()?.throughSeq).toBe(4);expect(owner.indexedCarry?.size).toBe(0)
  expect(engine['_log'].canonicalRetainedSuffix).toHaveLength(0)
  operations.push(painted(5,'next-original-gesture',true))
  expect(await engine.appendCanonicalIndexedContinuation(()=>read.lifetime.follow(engine.getCanonicalIndexedCut()!))).toBe('advanced')
  await vi.waitFor(()=>expect(engine['_canonicalExportReady']()).toBe(true),{timeout:5000})
  expect(deposited()).toBeGreaterThan(count);expect(engine['_canonicalLayerOwner']).toBe(owner)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('keeps the engine read reservation until actual finite cancel ACK cleanup settles',async()=>{
 const operations=[indexedFrame()],issuer=indexedSocketFixture(operations,1),read=await issuer.open(),idle=vi.fn(),{engine}=engineFor(read,8,undefined,undefined,idle),primary=Error('Preparation first error')
 let acknowledge:((value:unknown)=>void)|undefined,cancelBody:Record<string,unknown>|undefined
 issuer.handlers.canonical_history_stream_cancel=body=>{cancelBody=body;return new Promise(resolve=>{acknowledge=resolve})}
 try{
  await engine.paperReady();await engine.restoreCanonicalIndexedRoom(read);const cut=engine.getCanonicalIndexedCut()!
  operations.push(indexedFrame(2,'next'))
  const prepare=vi.spyOn(engine,'prepareOriginalRecorded').mockRejectedValue(primary)
  const pending=engine.appendCanonicalIndexedContinuation(()=>read.lifetime.follow(cut)),rejected=expect(pending).rejects.toBe(primary)
  await vi.waitFor(()=>expect(acknowledge).toBeTypeOf('function'))
  expect(engine['_canonicalLayerOwner']?.indexedFollowing).toBe(true);expect(idle).not.toHaveBeenCalled()
  const acquire=vi.fn(()=>read.lifetime.follow(cut));expect(await engine.appendCanonicalIndexedContinuation(acquire)).toBe('busy');expect(acquire).not.toHaveBeenCalled()
  acknowledge!({ok:true,value:{streamId:cancelBody!.streamId,requestId:cancelBody!.requestId}});await rejected
  expect(engine['_canonicalLayerOwner']?.indexedFollowing).toBe(false);expect(idle).toHaveBeenCalledOnce()
  prepare.mockRestore();expect(await engine.appendCanonicalIndexedContinuation(()=>read.lifetime.follow(cut))).toBe('advanced')
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})


/** Controlled delivery of the actual shared scheduler callbacks; no read/cut is fabricated. */
function indexedRestoreTransport(engine:PencilEngine){
 const wakes=new Map<number,()=>void>();let token=0
 const schedule=vi.spyOn(engine['_authorTasks'],'schedule').mockImplementation(callback=>{wakes.set(++token,callback);return token})
 vi.spyOn(engine['_authorTasks'],'unschedule').mockImplementation(id=>{wakes.delete(id)})
 const step=vi.spyOn(engine as unknown as {_stepCanonicalIndexed:typeof engine['_stepCanonicalIndexed']},'_stepCanonicalIndexed')
 const turns:number[]=[]
 async function drain(){
  for(let idle=0,guard=0;idle<24;guard++){
   if(guard>20000)throw Error('Indexed restore did not park')
   const first=wakes.entries().next().value
   if(first){idle=0;wakes.delete(first[0]);const before=step.mock.calls.length;first[1]();turns.push(step.mock.calls.length-before)}else idle++
   for(let i=0;i<8;i++)await Promise.resolve()
   await new Promise(resolve=>setTimeout(resolve,1))
  }
 }
 return {wakes,schedule,step,turns,drain}
}
it('batches genuine indexed restore transitions within64 and parks until the actual empty terminal ACK',async()=>{
 const operations=Array.from({length:190},(_,i)=>indexedFrame(i+1,'bounded',i===189,i)),issuer=indexedSocketFixture(operations,64),read=await issuer.open(),{engine}=engineFor(read)
 let terminal:(()=>void)|undefined
 const next=issuer.handlers.canonical_history_stream_next
 issuer.handlers.canonical_history_stream_next=body=>Number(body.afterSeq)===operations.length?new Promise(resolve=>{terminal=()=>resolve(next(body))}):next(body)
 try{
  await engine.paperReady();vi.spyOn(performance,'now').mockReturnValue(0)
  const transport=indexedRestoreTransport(engine),restore=engine.restoreCanonicalIndexedRoom(read)
  void restore.catch(()=>{})
  await transport.drain()
  expect(terminal).toBeTypeOf('function');expect(transport.wakes.size).toBe(0)
  expect(engine.getCanonicalIndexedCut()).toBeNull();expect(engine['_canonicalPixelsReady']).toBe(false)
  const parked=transport.schedule.mock.calls.length;await transport.drain();expect(transport.schedule).toHaveBeenCalledTimes(parked)
  expect(Math.max(...transport.turns)).toBe(64);expect(transport.turns.every(n=>n<=64)).toBe(true)
  terminal!();await transport.drain();await restore
  expect(engine.getCanonicalIndexedCut()?.throughSeq).toBe(190)
  expect(engine['_log'].entries).toHaveLength(0);expect(engine['_log'].canonicalRetainedSuffix).toHaveLength(0);expect(engine['_canonicalLayerOwner']?.inputs).toHaveLength(0)
  expect(transport.schedule.mock.calls.length).toBeLessThan(operations.length)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('yields indexed restore at the4ms slice budget while retaining the same genuine job and exact final cut',async()=>{
 const operations=Array.from({length:40},(_,i)=>indexedFrame(i+1,'timed',i===39,i)),issuer=indexedSocketFixture(operations,64),read=await issuer.open(),{engine}=engineFor(read)
 try{
  await engine.paperReady();let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now+=2)
  const transport=indexedRestoreTransport(engine),restore=engine.restoreCanonicalIndexedRoom(read)
  void restore.catch(()=>{})
  await transport.drain();await restore
  expect(transport.turns.some(n=>n===2)).toBe(true);expect(transport.turns.every(n=>n<=2)).toBe(true)
  expect(engine.getCanonicalIndexedCut()?.throughSeq).toBe(40);expect(transport.wakes.size).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
for(const failure of ['cancel','fault'] as const)it(`stops the SAME indexed slice after actual ${failure} without a successor wake or false cut`,async()=>{
 const operations=Array.from({length:40},(_,i)=>indexedFrame(i+1,'interrupted',i===39,i)),issuer=indexedSocketFixture(operations,64),read=await issuer.open(),{engine}=engineFor(read)
 try{
  await engine.paperReady();vi.spyOn(performance,'now').mockReturnValue(0)
  const actual=engine['_stepCanonicalIndexed'].bind(engine),transport=indexedRestoreTransport(engine)
  // Delegate to the real implementation until actual originals have been consumed.
  transport.step.mockImplementation(job=>{
   actual(job)
   if(job.canonical!.transaction.indexed!.count>=2&&!job.canonical!.transaction.finished){
    if(failure==='cancel')engine['_cancelRebuildJob']('layer-1')
    else throw Error('actual indexed slice fault')
   }
  })
  const restore=engine.restoreCanonicalIndexedRoom(read),rejected=expect(restore).rejects.toThrow(failure==='cancel'?'cancelled':'actual indexed slice fault')
  await transport.drain();await rejected
  expect(transport.wakes.size).toBe(0);expect(engine.getCanonicalIndexedCut()).toBeNull();expect(engine['_canonicalPixelsReady']).toBe(false)
  expect(engine['_rebuildJobs'].size).toBe(0);expect(engine['_log'].entries).toHaveLength(0);expect(engine['_brushMipCache'].reservedBytes).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('rejects late genuine indexed terminal delivery after original owner invalidation without reawakening the candidate',async()=>{
 const issuer=indexedSocketFixture([indexedFrame()],64),read=await issuer.open(),{engine}=engineFor(read)
 const next=issuer.handlers.canonical_history_stream_next;let terminal:(()=>void)|undefined
 issuer.handlers.canonical_history_stream_next=body=>Number(body.afterSeq)===1?new Promise(resolve=>{terminal=()=>resolve(next(body))}):next(body)
 try{
  await engine.paperReady();const transport=indexedRestoreTransport(engine),restore=engine.restoreCanonicalIndexedRoom(read)
  const rejected=expect(restore).rejects.toThrow()
  await transport.drain();expect(terminal).toBeTypeOf('function');const wakes=transport.schedule.mock.calls.length
  issuer.setCurrent(false);terminal!();await transport.drain();await rejected
  expect(transport.schedule).toHaveBeenCalledTimes(wakes);expect(transport.wakes.size).toBe(0)
  expect(engine.getCanonicalIndexedCut()).toBeNull();expect(engine['_rebuildJobs'].size).toBe(0);expect(engine['_brushMipCache'].reservedBytes).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

function paintedIndexedPreviewFrame(seq:number,ordinal:number,ended=false,stroke='preview'){
 const op=indexedFrame(seq,stroke,ended,ordinal)
 if(op.type!=='canonical_stroke'||indexedSnapshot.material.primarySource.kind!=='defaultAuto')throw Error('Default original required')
 const pin=indexedSnapshot.material.primarySource,g=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:pin.source.diameter,ratio:pin.source.ratio,spikes:2,scale:pin.brushScale,angle:pin.brushAngle},{scale:.01,ratio:1,rotation:0},0,0)
 op.frame={...op.frame,materialPacked:buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe:{kind:'defaultAuto',source:pin.source,coverageProfile:pin.coverageProfile,brushScale:pin.brushScale,brushAngle:pin.brushAngle,scale:.01,ratio:1,rotation:0,subX:0,subY:0,width:g.maskSize[0],height:g.maskSize[1],mirrorH:false,mirrorV:false},role:'primary',x:ordinal,y:0,opacity:.5,flow:.7}],fences:[{kind:'segmentBegin',at:0,group:ordinal},{kind:'primaryEnd',at:1,group:ordinal},{kind:'segmentEnd',at:1,group:ordinal},...(ended?[{kind:'gestureEnd' as const,at:1}]:[])]},indexedSnapshot.material).packed}
 return op
}
it('defers unpublished SAME-page continuation previews, but flushes every page boundary before the genuine final cut',async()=>{
 const run=async(pageSize:number)=>{
  const operations=Array.from({length:4},(_,i)=>paintedIndexedPreviewFrame(i+1,i,i===3)),issuer=indexedSocketFixture(operations,pageSize),read=await issuer.open(),{engine}=engineFor(read)
  const advance=vi.spyOn(CanonicalWashLayerCoordinator.prototype,'advance'),present=vi.spyOn(CanonicalWashLayerCoordinator.prototype as unknown as {present:(started:number)=>void},'present'),draw=vi.spyOn(CanonicalRgba8CompositePass.prototype,'drawSource')
  const next=issuer.handlers.canonical_history_stream_next
  issuer.handlers.canonical_history_stream_next=body=>{
   if(Number(body.afterSeq)>0){
    const coordinator=engine['_rebuildJobs'].get('layer-1')?.canonical?.indexedOwner?.coordinator
    if(coordinator){expect(coordinator.pending).toBe(false);expect(coordinator.presentationReady).toBe(true)}
   }
   return next(body)
  }
  try{
   await engine.paperReady();const transport=indexedRestoreTransport(engine),restore=engine.restoreCanonicalIndexedRoom(read)
   void restore.catch(()=>{});await transport.drain();await restore
   const deferred=advance.mock.calls.filter(([options])=>options?.deferPresentation).length
   expect(engine.getCanonicalIndexedCut()?.throughSeq).toBe(4);expect(engine['_canonicalPixelsReady']).toBe(true)
   expect(draw.mock.calls.filter(([request])=>request.source.kind==='maskRgb')).toHaveLength(4)
   expect(engine['_canonicalLayerOwner']?.coordinator).toBeUndefined()
   return {deferred,presents:present.mock.calls.length}
  }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);advance.mockRestore();present.mockRestore();draw.mockRestore()}
 }
 const boundary=await run(1),samePage=await run(64)
 expect(boundary.deferred).toBe(0);expect(samePage.deferred).toBeGreaterThan(0);expect(samePage.presents).toBeLessThan(boundary.presents)
})
it('flushes preview before a different original root and never defers its ended predecessor',async()=>{
 const operations=[paintedIndexedPreviewFrame(1,0,true,'one'),paintedIndexedPreviewFrame(2,0,true,'two')],issuer=indexedSocketFixture(operations,64),read=await issuer.open(),{engine}=engineFor(read),advance=vi.spyOn(CanonicalWashLayerCoordinator.prototype,'advance')
 try{
  await engine.paperReady();await engine.restoreCanonicalIndexedRoom(read)
  expect(advance.mock.calls.every(([options])=>!options?.deferPresentation)).toBe(true)
  expect(engine.getCanonicalIndexedCut()?.throughSeq).toBe(2)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('does not defer healthy physical recovery of an accepted original indexed prefix',async()=>{
 const operations=Array.from({length:3},(_,i)=>paintedIndexedPreviewFrame(i+1,i,i===2)),issuer=indexedSocketFixture(operations,64),read=await issuer.open(),{engine}=engineFor(read),advance=vi.spyOn(CanonicalWashLayerCoordinator.prototype,'advance')
 try{
  await engine.paperReady();await engine.restoreCanonicalIndexedRoom(read);advance.mockClear()
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));engine['_handleContextRestored']()
  await vi.waitFor(()=>expect(engine['_canonicalPixelsReady']).toBe(true),{timeout:5000})
  expect(advance).toHaveBeenCalled();expect(advance.mock.calls.every(([options])=>!options?.deferPresentation)).toBe(true)
  expect(engine.getCanonicalIndexedCut()?.throughSeq).toBe(3)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

for(const failure of ['stale','cancel'] as const)it(`rejects actual ${failure} after deferred deposition without publishing a cut or retaining ownership`,async()=>{
 const operations=Array.from({length:4},(_,i)=>paintedIndexedPreviewFrame(i+1,i,i===3)),issuer=indexedSocketFixture(operations,64),read=await issuer.open(),{engine}=engineFor(read)
 const advance=CanonicalWashLayerCoordinator.prototype.advance
 let deferred=false,interrupted=false
 vi.spyOn(CanonicalWashLayerCoordinator.prototype,'advance').mockImplementation(function(this:CanonicalWashLayerCoordinator,options){
  advance.call(this,options)
  if(options?.deferPresentation){deferred=true;if(!this.executionPending&&!interrupted){interrupted=true;if(failure==='stale')issuer.setCurrent(false);else engine['_cancelRebuildJob']('layer-1')}}
 })
 try{
  await engine.paperReady();const layers=engine['_layers'],revision=engine['_log'].revision
  const restore=engine.restoreCanonicalIndexedRoom(read),rejected=expect(restore).rejects.toThrow()
  await rejected
  expect(deferred).toBe(true);expect(interrupted).toBe(true)
  expect(engine.getCanonicalIndexedCut()).toBeNull();expect(engine['_canonicalPixelsReady']).toBe(false)
  expect(engine['_layers']).toBe(layers);expect(engine['_log'].revision).toBe(revision)
  expect(engine['_rebuildJobs'].size).toBe(0);expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('keeps metadata and hidden original roots on the ordinary validation path without source preparation',async()=>{
 const first=paintedIndexedPreviewFrame(1,0,false,'hidden'),last=paintedIndexedPreviewFrame(2,1,true,'hidden'),undo={id:'hide',seq:3,type:'operation_undo' as const,userId:'actor',timestamp:1,targetOpId:first.id}
 const operations=[first,last,undo],issuer=indexedSocketFixture(operations,64)
 issuer.handlers.canonical_history_stream_evidence=body=>({ok:true,value:{kind:'canonical-indexed-history-root-evidence-v1',streamId:'read0',throughSeq:3,root:body.root,rows:operations,canonicalCapabilities:indexedAttachment(operations),first:0,terminal:1,lastMetadata:2,latestRedo:null,firstUndoAfterLatestRedo:2,ownBranchAfterUndo:null}})
 const read=await issuer.open(),{engine}=engineFor(read),prepare=vi.spyOn(TransformedMaskPrepass.prototype,'prepare'),advance=vi.spyOn(CanonicalWashLayerCoordinator.prototype,'advance')
 try{
  await engine.paperReady();await engine.restoreCanonicalIndexedRoom(read)
  expect(prepare).not.toHaveBeenCalled();expect(advance).not.toHaveBeenCalled()
  expect(engine.getCanonicalIndexedCut()?.throughSeq).toBe(3);expect(engine.hasLayerContent('layer-1')).toBe(false)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

function indexedEvidenceLookaheadFixture(hidden=false){
 const operations:ReturnType<typeof indexedFrame>[]=[...Array.from({length:3},(_,i)=>paintedIndexedPreviewFrame(i+1,i,i===2,'first')),paintedIndexedPreviewFrame(4,0,false,'next'),paintedIndexedPreviewFrame(5,1,true,'next')]
 if(hidden)operations.push({id:'hide-next',seq:6,type:'operation_undo',userId:'actor',timestamp:1,targetOpId:operations[3].id})
 const issuer=indexedSocketFixture(operations,64),actualEvidence=issuer.handlers.canonical_history_stream_evidence
 let fulfill:(()=>void)|undefined,reject:((error:unknown)=>void)|undefined,requests=0
 issuer.handlers.canonical_history_stream_evidence=body=>{
  requests++
  if((body.root as {strokeId:string}).strokeId!=='next')return actualEvidence(body)
  return new Promise((resolve,fail)=>{fulfill=()=>resolve(hidden?{ok:true,value:{kind:'canonical-indexed-history-root-evidence-v1',streamId:'read0',throughSeq:operations.length,root:body.root,rows:operations.slice(3),canonicalCapabilities:indexedAttachment(operations.slice(3)),first:0,terminal:1,lastMetadata:2,latestRedo:null,firstUndoAfterLatestRedo:2,ownBranchAfterUndo:null}}:actualEvidence(body));reject=fail})
 }
 return {issuer,operations,get requests(){return requests},get fulfill(){return fulfill},get reject(){return reject}}
}
it('overlaps ONE genuine same-page root evidence ACK with current pixel execution, then admits that SAME result in order',async()=>{
 const f=indexedEvidenceLookaheadFixture(),read=await f.issuer.open(),{engine}=engineFor(read),draw=vi.spyOn(CanonicalRgba8CompositePass.prototype,'drawSource')
 const next=f.issuer.handlers.canonical_history_stream_next
 let terminal:(()=>void)|undefined,drawsAtRequest:number|undefined
 const evidence=f.issuer.handlers.canonical_history_stream_evidence
 f.issuer.handlers.canonical_history_stream_evidence=body=>{if((body.root as {strokeId:string}).strokeId==='next')drawsAtRequest=draw.mock.calls.length;return evidence(body)}
 f.issuer.handlers.canonical_history_stream_next=body=>Number(body.afterSeq)===5?new Promise(resolve=>{terminal=()=>resolve(next(body))}):next(body)
 try{
  await engine.paperReady();const transport=indexedRestoreTransport(engine),restore=engine.restoreCanonicalIndexedRoom(read)
  void restore.catch(()=>{});await transport.drain()
  expect(f.fulfill).toBeTypeOf('function');expect(f.requests).toBe(2)
  expect(draw.mock.calls.length).toBeGreaterThan(drawsAtRequest!)
  const state=engine['_rebuildJobs'].get('layer-1')!.canonical!.transaction.indexed!
  expect(state.count).toBe(3);expect(state.waiting).toBe(true);expect(state.evidenceLookahead?.outcome.settled).toBe(false)
  expect(draw.mock.calls.filter(([request])=>request.source.kind==='maskRgb')).toHaveLength(3)
  expect(engine.getCanonicalIndexedCut()).toBeNull();expect(f.issuer.requests.filter(r=>r.event==='canonical_history_stream_next')).toHaveLength(1)
  await expect(read.nextPage()).rejects.toThrow('original read unavailable') // Actual consumer busy gate, no extra wire request.
  expect(f.issuer.requests.filter(r=>r.event==='canonical_history_stream_next')).toHaveLength(1)
  f.fulfill!();await transport.drain()
  expect(f.requests).toBe(2);expect(state.evidenceLookahead).toBeUndefined();expect(terminal).toBeTypeOf('function')
  expect(draw.mock.calls.filter(([request])=>request.source.kind==='maskRgb')).toHaveLength(5)
  expect(engine.getCanonicalIndexedCut()).toBeNull();expect(engine['_canonicalPixelsReady']).toBe(false)
  terminal!();await transport.drain();await restore
  expect(engine.getCanonicalIndexedCut()?.throughSeq).toBe(5);expect(engine['_brushMipCache'].reservedBytes).toBeGreaterThan(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
for(const late of ['fulfill','reject'] as const)it(`detaches a pending lookahead before cancellation and observes its late ${late} without a wake or retained candidate`,async()=>{
 const f=indexedEvidenceLookaheadFixture(),read=await f.issuer.open(),{engine}=engineFor(read)
 try{
  await engine.paperReady();const transport=indexedRestoreTransport(engine),restore=engine.restoreCanonicalIndexedRoom(read),rejected=expect(restore).rejects.toThrow('cancelled')
  await transport.drain()
  const state=engine['_rebuildJobs'].get('layer-1')!.canonical!.transaction.indexed!,cell=state.evidenceLookahead!.outcome
  expect(cell.notify).toBeTypeOf('function')
  engine['_cancelRebuildJob']('layer-1');await rejected
  expect(state.evidenceLookahead).toBeUndefined();expect(cell.active).toBe(false);expect(cell.notify).toBeUndefined();expect(cell.proof).toBeUndefined()
  const scheduled=transport.schedule.mock.calls.length
  if(late==='fulfill')f.fulfill!();else f.reject!(Error('late genuine evidence failure'))
  await transport.drain()
  expect(transport.schedule).toHaveBeenCalledTimes(scheduled);expect(engine['_rebuildJobs'].size).toBe(0)
  expect(engine.getCanonicalIndexedCut()).toBeNull();expect(engine['_brushMipCache'].reservedBytes).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('retains a failed lookahead only until ordered root admission, then rejects the candidate without false cut',async()=>{
 const f=indexedEvidenceLookaheadFixture(),read=await f.issuer.open(),{engine}=engineFor(read)
 try{
  await engine.paperReady();const transport=indexedRestoreTransport(engine),restore=engine.restoreCanonicalIndexedRoom(read),rejected=expect(restore).rejects.toThrow('genuine evidence failure')
  await transport.drain();expect(f.requests).toBe(2)
  f.reject!(Error('genuine evidence failure'));await transport.drain();await rejected
  expect(engine.getCanonicalIndexedCut()).toBeNull();expect(engine['_canonicalPixelsReady']).toBe(false)
  expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('releases an already-fulfilled genuine lookahead proof when the candidate is canceled before adoption',async()=>{
 const f=indexedEvidenceLookaheadFixture(),read=await f.issuer.open(),{engine}=engineFor(read)
 try{
  await engine.paperReady();const transport=indexedRestoreTransport(engine),restore=engine.restoreCanonicalIndexedRoom(read),rejected=expect(restore).rejects.toThrow('cancelled')
  await transport.drain()
  const state=engine['_rebuildJobs'].get('layer-1')!.canonical!.transaction.indexed!,pending=state.evidenceLookahead!,cell=pending.outcome
  f.fulfill!();for(let i=0;i<32;i++)await Promise.resolve()
  expect(cell.settled).toBe(true);const proof=cell.proof!;expect(proof.assertCurrent(proof,pending.input).first.operation.id).toBe('frame4')
  engine['_cancelRebuildJob']('layer-1');await rejected
  expect(cell.proof).toBeUndefined();expect(cell.notify).toBeUndefined();expect(()=>proof.assertCurrent(proof,pending.input)).toThrow()
  expect(state.evidenceLookahead).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine.getCanonicalIndexedCut()).toBeNull()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('uses actual prefetched hidden-root witnesses only for visibility, never for source admission or painting',async()=>{
 const f=indexedEvidenceLookaheadFixture(true),read=await f.issuer.open(),{engine}=engineFor(read),draw=vi.spyOn(CanonicalRgba8CompositePass.prototype,'drawSource')
 try{
  await engine.paperReady();const transport=indexedRestoreTransport(engine),restore=engine.restoreCanonicalIndexedRoom(read)
  void restore.catch(()=>{});await transport.drain();expect(f.requests).toBe(2)
  f.fulfill!();await transport.drain();await restore
  expect(draw.mock.calls.filter(([request])=>request.source.kind==='maskRgb')).toHaveLength(3)
  expect(engine.getCanonicalIndexedCut()?.throughSeq).toBe(6);expect(engine['_canonicalPixelsReady']).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('rejects a stale real origin while its prefetched evidence ACK is pending without publishing the candidate',async()=>{
 const f=indexedEvidenceLookaheadFixture(),read=await f.issuer.open(),{engine}=engineFor(read)
 try{
  await engine.paperReady();const transport=indexedRestoreTransport(engine),restore=engine.restoreCanonicalIndexedRoom(read),rejected=expect(restore).rejects.toThrow()
  await transport.drain();const state=engine['_rebuildJobs'].get('layer-1')!.canonical!.transaction.indexed!,cell=state.evidenceLookahead!.outcome
  f.issuer.setCurrent(false);f.fulfill!();await transport.drain();await rejected
  expect(cell.active).toBe(false);expect(cell.notify).toBeUndefined();expect(cell.proof).toBeUndefined()
  expect(engine.getCanonicalIndexedCut()).toBeNull();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_rebuildJobs'].size).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('uses ordinary ordered evidence when the optional lookahead metadata reservation does not fit',async()=>{
 const f=indexedEvidenceLookaheadFixture(),read=await f.issuer.open(),{engine}=engineFor(read),prefetch=engine['_prefetchIndexedEvidence'].bind(engine),cpu=engine['_brushMipCache']
 vi.spyOn(engine as unknown as {_prefetchIndexedEvidence:typeof prefetch},'_prefetchIndexedEvidence').mockImplementation(job=>{
  // Temporary real CPU-owner pressure applies ONLY during optional admission;
  // mandatory coordinator work resumes with its normal budget afterwards.
  const release=cpu.reserve(cpu.budgetBytes-cpu.reservedBytes)
  try{prefetch(job)}finally{release()}
 })
 try{
  await engine.paperReady();const transport=indexedRestoreTransport(engine),restore=engine.restoreCanonicalIndexedRoom(read)
  void restore.catch(()=>{});await transport.drain()
  const state=engine['_rebuildJobs'].get('layer-1')!.canonical!.transaction.indexed!
  expect(state.evidenceLookahead).toBeUndefined();expect(state.count).toBe(3);expect(f.requests).toBe(2)
  f.fulfill!();await transport.drain();await restore
  expect(engine.getCanonicalIndexedCut()?.throughSeq).toBe(5)
 }finally{engine.destroy();expect(cpu.reservedBytes).toBe(0)}
})

// MockGL intentionally omits binding tracking. Expose these actual engine-owned
// captured handles only; all unrelated GL state uses the original fixture.
function captureManagedBindings(gl:WebGLRenderingContext,buffer:WebGLBuffer,texture?:WebGLTexture|null){
 const original=gl.getParameter.bind(gl)
 return vi.spyOn(gl,'getParameter').mockImplementation(parameter=>parameter===gl.ARRAY_BUFFER_BINDING?buffer:parameter===gl.TEXTURE_BINDING_2D?(texture??null):original(parameter))
}

it('activates the engine-minted screen/paper proof after successful FIRST GL initialization in its real canonical services',async()=>{
 const issuer=indexedSocketFixture([paintedIndexedPreviewFrame(1,0,true)],1),read=await issuer.open(),{engine}=engineFor(read)
 try{
  await engine.paperReady();await engine.restoreCanonicalIndexedRoom(read)
  expect(engine['_glInitializedGeneration']).toBe(engine['_physicalGeneration']);expect(engine['_glSceneGeneration']).toBeGreaterThan(0)
  const owner=engine['_canonicalLayerOwner']!,gl=engine['gl'],buffer=engine['_screenBuf']!,texture=engine['_paper'].texture
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture)
  captureManagedBindings(gl,buffer,texture)
  const buffers=vi.spyOn(gl,'isBuffer'),textures=vi.spyOn(gl,'isTexture')
  runBrushGlTurn({participants:[owner.prepass,owner.composite],callbackScope:owner.callbackScope},()=>{})
  expect(buffers).not.toHaveBeenCalledWith(buffer);expect(textures).not.toHaveBeenCalledWith(texture)
  runBrushGlTurn({participants:[owner.prepass,owner.composite]},()=>{})
  expect(buffers).toHaveBeenCalledWith(buffer);expect(textures).toHaveBeenCalledWith(texture)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it.each(['physical','scene','initialized','destroyed','lost']as const)('actual engine ownership falls back when %s changes despite retained native pointers',async mutation=>{
 const issuer=indexedSocketFixture([paintedIndexedPreviewFrame(1,0,true)],1),read=await issuer.open(),{engine}=engineFor(read)
 try{
  await engine.paperReady();await engine.restoreCanonicalIndexedRoom(read)
  const pair=engine['_createCanonicalGlOwner'](),gl=engine['gl'],buffer=engine['_screenBuf']!,texture=engine['_paper'].texture
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture)
  captureManagedBindings(gl,buffer,typeof texture==='undefined'?null:texture)
  const gate=openBrushGlRestoreGate(pair.callbackScope,gl,pair.owner),restore=saveBrushGlState(gl,[],null,null,1,false,gate),buffers=vi.spyOn(gl,'isBuffer'),textures=vi.spyOn(gl,'isTexture')
  restore();expect(buffers).not.toHaveBeenCalledWith(buffer);expect(textures).not.toHaveBeenCalledWith(texture)
  const prior={physical:engine['_physicalGeneration'],scene:engine['_glSceneGeneration'],initialized:engine['_glInitializedGeneration'],destroyed:engine['_destroyed'],lost:engine['_contextLost']}
  try{
   if(mutation==='physical')engine['_physicalGeneration']++
   if(mutation==='scene')engine['_glSceneGeneration']++
   if(mutation==='initialized')engine['_glInitializedGeneration']=-1
   if(mutation==='destroyed')engine['_destroyed']=true
   if(mutation==='lost')engine['_contextLost']=true
   expect(engine['_screenBuf']).toBe(buffer);restore()
   expect(buffers).toHaveBeenCalledWith(buffer);expect(textures).toHaveBeenCalledWith(texture)
  }finally{engine['_physicalGeneration']=prior.physical;engine['_glSceneGeneration']=prior.scene;engine['_glInitializedGeneration']=prior.initialized;engine['_destroyed']=prior.destroyed;engine['_contextLost']=prior.lost;closeBrushGlRestoreGate(gate)}
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('actual GL rollback invalidates positive ownership before clearing a deleted screen-buffer pointer',async()=>{
 const issuer=indexedSocketFixture([paintedIndexedPreviewFrame(1,0,true)],1),read=await issuer.open(),{engine}=engineFor(read)
 try{
  await engine.paperReady();await engine.restoreCanonicalIndexedRoom(read)
  const rollback=engine['_initGL'](),pair=engine['_createCanonicalGlOwner'](),gl=engine['gl'],buffer=engine['_screenBuf']!
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer)
  captureManagedBindings(gl,buffer)
  const gate=openBrushGlRestoreGate(pair.callbackScope,gl,pair.owner),restore=saveBrushGlState(gl,[],null,null,0,false,gate),buffers=vi.spyOn(gl,'isBuffer')
  restore();expect(buffers).not.toHaveBeenCalledWith(buffer)
  rollback();expect(engine['_glInitializedGeneration']).toBe(-1);expect(engine['_screenBuf']).toBe(buffer)
  restore();expect(buffers).toHaveBeenCalledWith(buffer);closeBrushGlRestoreGate(gate)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
