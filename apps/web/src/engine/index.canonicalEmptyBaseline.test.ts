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
function engineFor(prepared:ReturnType<typeof original>,side=8){
 const result=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:side,pageHeight:side,canonicalEmptyRoom:{read:prepared.canonicalRead,tail:prepared.tailOperations}},{width:side,height:side}),gl=result.engine['gl'],get=gl.getParameter.bind(gl),mock=result.canvas.getContext('webgl')!
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
