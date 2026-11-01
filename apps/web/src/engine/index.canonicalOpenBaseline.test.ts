import {CanonicalWashLayerCoordinator} from './src/dabs/CanonicalWashLayerCoordinator'
import {attachCanonicalRecordedDelivery} from '../pages/Room/net/canonicalRecordedDelivery'
import {parseCanonicalStrokeCloseOperation,prepareCanonicalRecordedAttachment} from '@grafetto/shared'
import {afterEach,expect,it,vi} from 'vitest'
import {sourceAutoGeometry,canonicalSoftAutoSourcePin,buildCanonicalMaterial,CANONICAL_STROKE_RASTER_PROFILE,type CanonicalStrokeOperation,type CanonicalStrokeSnapshotV2,type CanonicalRecordedAttachmentV1,type ServerToClientEvents} from '@grafetto/shared'
import {prepareCanonicalRoomState} from '../pages/Room/net/canonicalRoomState'
import {createTestEngine} from './testing/engineTestUtils'
afterEach(()=>vi.restoreAllMocks())
function fixture(ended=true,diameter=8,angle=0,subX=0,subY=0){
 const curve={text:'0,1;1,0',points:[{x:0,y:1,corner:false},{x:1,y:0,corner:false}]}
 const primarySource=canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,descriptorId:'soft',descriptorVersion:1,descriptorSha256:'a'.repeat(64),source:{kind:'softAuto',generator:'soft',shape:'circle',diameter,ratio:1,horizontalFade:1,verticalFade:1,antialias:false,spikes:2,randomness:0,density:1,softnessCurve:curve},brushScale:1,brushAngle:angle,coverageProfile:'neon64-f32-fma-v1',reader:'krita-bd6e8d0-v1',compilerProfile:'eigen-5.0.1-mapped-arm64-f64-v3',buildId:'b'.repeat(64),radialCurve:{source:curve,coefficients:[[0,0,-1,1]]}})
 const material={version:2 as const,assets:[],primarySource,budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'layer-1',brush:'brush:soft@1',strokeId:'S',boardEpoch:2,descriptorSha256:'a'.repeat(64),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},assets:[],materialVersion:2,material}
 const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter,ratio:1,spikes:2,scale:1,angle},{scale:1,ratio:1,rotation:0},subX,subY)
 const recipe={kind:'softAuto' as const,sourceSlot:0 as const,source:primarySource.source,coverageProfile:primarySource.coverageProfile,brushScale:1,brushAngle:angle,scale:1,ratio:1,rotation:0,subX,subY,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:false}
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

function original(isCurrent=()=>true,interleaved=false){const {state:s}=state(false);
 if(interleaved){const f=fixture(true),snapshot={...f.attachment.capabilities[0].snapshot,strokeId:'B'},op={...f.op,id:'op-B',seq:2,frame:{...f.op.frame,strokeId:'B'}};s.tailOperations.push(op);s.canonicalCapabilities={...s.canonicalCapabilities!,capabilities:[...s.canonicalCapabilities!.capabilities,{originalUserId:'author',snapshot}],bindings:[...s.canonicalCapabilities!.bindings,{operationId:'op-B',sequence:2,originalUserId:'author',capability:1}]}}
 s.canonicalHistoryBase={kind:'full-room-prefix-v2',roomId:'room',boardEpoch:2,throughSeq:s.tailOperations.length,operationCount:s.tailOperations.length};return prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent})}
function engineFor(prepared:ReturnType<typeof original>){
 const result=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:8,pageHeight:8,canonicalEmptyRoom:{read:prepared.canonicalRead,tail:prepared.tailOperations}},{width:8,height:8}),gl=result.engine['gl'],get=gl.getParameter.bind(gl),mock=result.canvas.getContext('webgl')!
 const extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
 // Local state observation supplements only; real engine/services/jobs execute.
 Object.assign(gl,{getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,
  getAttribLocation:(_program:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),
  getShaderPrecisionFormat:()=>({precision:23,rangeMin:127,rangeMax:127}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},
  getTexParameter:(_target:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,
  getParameter:(key:number)=>key===9001?[0,0,8,8]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
 for(const id of ['background','layer-1'])result.engine.initLayer(id)
 result.engine.setCompositeOrder([{id:'layer-1',opacity:1}])
 return result
}
function recorded(p:ReturnType<typeof original>,seq:number,strokeId:string,ended:boolean,ordinal=0,diameter=8,angle=0,subX=0,subY=0,control=false){
 const f=fixture(ended,diameter,angle,subX,subY),originalSnapshot=f.attachment.capabilities[0].snapshot
 if(originalSnapshot.materialVersion!==2)throw Error('Expected V2 fixture')
 const snapshot={...originalSnapshot,strokeId},op:CanonicalStrokeOperation={...f.op,id:'frame-'+seq,seq,frame:{...f.op.frame,strokeId,frameOrdinal:ordinal}}
 if(control)op.frame={...op.frame,materialPacked:buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},snapshot.material).packed}
 if(ordinal)op.frame={...op.frame,materialPacked:buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{at:0,kind:'gestureEnd'}]},snapshot.material).packed}
 const attachment:CanonicalRecordedAttachmentV1={...f.attachment,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:op.id,sequence:seq,originalUserId:'author',capability:0}]}
 const prepared=prepareCanonicalRecordedAttachment(attachment,[op],p.canonicalRead.scope)[0],input=attachCanonicalRecordedDelivery(prepared,p.canonicalRead.scope)
 if(!('delivery'in input))throw Error('Missing original recorded input')
 return input
}

it('publishes a verified open full baseline as readable provisional ink using the candidate coordinator and charged storage',async()=>{
 const p=original(),{engine}=engineFor(p),created:CanonicalWashLayerCoordinator[]=[],advance=CanonicalWashLayerCoordinator.prototype.advance
 vi.spyOn(CanonicalWashLayerCoordinator.prototype,'advance').mockImplementation(function(this:CanonicalWashLayerCoordinator){if(!created.includes(this))created.push(this);return advance.call(this)})
 try{
  expect((await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)).cleanupFailures).toEqual([])
  const owner=engine['_canonicalLayerOwner']!
  expect(created).toHaveLength(1);expect(owner.coordinator).toBe(created[0]);expect(owner.derived).toBeDefined()
  expect(owner.coordinator!.presentationReady).toBe(true);expect(owner.coordinator!.checkpointReady).toBe(false)
  expect(owner.outstanding).toBeGreaterThan(0);expect(engine['_canonicalReadable']()).toBe(true);expect(engine['_canonicalExportReady']()).toBe(false)
  expect(engine['_log'].entries[0].canonicalInput).toBe(p.canonicalRead.preparedAtoms[0])
  const same=owner.coordinator,enqueue=vi.spyOn(same!,'enqueueRecorded')
  engine.appendOriginalRecorded(recorded(p,2,'S',true,1))
  await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined())
  expect(enqueue).toHaveBeenCalledOnce();expect(engine['_canonicalLayerOwner']).toBe(owner);expect(owner.outstanding).toBe(0);expect(engine['_canonicalExportReady']()).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)}
})

function recordedSeal(p:ReturnType<typeof original>,seq=2){
 const operation=parseCanonicalStrokeCloseOperation({type:'canonical_stroke_close',id:'seal-'+seq,userId:'author',timestamp:seq,seq,layerId:'layer-1',targetUserId:'author',strokeId:'S',disposition:'commitPartial',recordedNext:1,firstFrameOpId:'op',lastFrameOpId:'op'})
 const input=attachCanonicalRecordedDelivery(Object.freeze({operation}),p.canonicalRead.scope)
 if(!('delivery'in input))throw Error('Missing original seal delivery')
 return input
}
it('transfers the exact derived buffer and routes a late typed partial close through the same coordinator',async()=>{
 const p=original(),{engine}=engineFor(p),publish=engine['_publishCanonicalEmpty'].bind(engine)
 let derived:unknown,coordinator:unknown
 engine['_publishCanonicalEmpty']=tx=>{derived=tx.jobs[0].derived;coordinator=tx.jobs[0].coordinator;publish(tx)}
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,same=owner.coordinator!,seal=vi.spyOn(same,'enqueueRecordedSeal')
  expect(same).toBe(coordinator);expect(owner.derived).toBe(derived)
  const charged=owner.outstanding;expect(charged).toBeGreaterThan(0)
  engine.appendOriginalRecorded(recordedSeal(p))
  await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined())
  expect(seal).toHaveBeenCalledOnce();expect(owner.outstanding).toBe(0);expect(engine['_canonicalExportReady']()).toBe(true)
  expect(engine['_log'].entries.map(e=>e.serverSeq)).toEqual([1,2]);expect(engine['_canonicalLayerOwner']).toBe(owner)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)}
})
it('retains an open earlier wash and a later ended wash, then commits both in recorded order on the original close',async()=>{
 const p=original(()=>true,true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,same=owner.coordinator!,enqueue=vi.spyOn(same,'enqueueRecorded')
  expect(same.presentationReady).toBe(true);expect(same.checkpointReady).toBe(false)
  // A new gesture after publication uses the existing global bounded capacity,
  // not the two gestures captured in the original baseline.
  engine.appendOriginalRecorded(recorded(p,3,'C',true))
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0))
  expect(owner.coordinator).toBe(same);expect(enqueue).toHaveBeenCalledOnce()
  engine.appendOriginalRecorded(recordedSeal(p,4))
  await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined())
  expect(owner.outstanding).toBe(0);expect(engine['_log'].entries.map(e=>e.serverSeq)).toEqual([1,2,3,4])
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)}
})
it('releases the transferred account on context loss and reconstructs the same accepted open prefix without journal duplication',async()=>{
 const p=original(),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,entries=engine['_log'].entries,revision=engine['_log'].revision
  expect(owner.outstanding).toBeGreaterThan(0)
  const lost=vi.spyOn(engine['gl'],'isContextLost').mockReturnValue(true)
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}))
  expect(owner.outstanding).toBe(0);expect(engine['_brushMipCache'].reservedBytes).toBe(0)
  lost.mockReturnValue(false);engine['_handleContextRestored']()
  await vi.waitFor(()=>expect(engine['_canonicalPixelsReady']).toBe(true))
  const restored=engine['_canonicalLayerOwner']!
  expect(restored).not.toBe(owner);expect(restored.coordinator!.presentationReady).toBe(true);expect(restored.coordinator!.checkpointReady).toBe(false)
  expect(engine['_log'].entries).toBe(entries);expect(engine['_log'].revision).toBe(revision);expect(entries).toHaveLength(1)
  engine.appendOriginalRecorded(recordedSeal(p));await vi.waitFor(()=>expect(restored.coordinator).toBeUndefined());expect(restored.outstanding).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)}
})
it('rolls back a fully rendered open candidate if original authority expires before atomic publication',async()=>{
 let current=true;const p=original(()=>current),{engine}=engineFor(p),old=engine['_layers'],publish=engine['_publishCanonicalEmpty'].bind(engine)
 engine['_publishCanonicalEmpty']=tx=>{current=false;publish(tx)}
 try{
  await expect(engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)).rejects.toThrow('Stale')
  expect(engine['_layers']).toBe(old);expect(engine['_log'].entries).toHaveLength(0);expect(engine['_canonicalLayerOwner']).toBeUndefined()
  expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)
 }finally{engine.destroy()}
})
it('cancels only the unpublished open candidate and leaves old layers and journal intact',async()=>{
 const p=original(),{engine}=engineFor(p),old=engine['_layers']
 try{
  const pending=engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations),rejected=expect(pending).rejects.toThrow('cancelled')
  engine['_cancelRebuildJob']('layer-1');await rejected
  expect(engine['_layers']).toBe(old);expect(engine['_log'].entries).toHaveLength(0);expect(engine['_canonicalLayerOwner']).toBeUndefined()
  expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)
 }finally{engine.destroy()}
})
it('poisons the published open owner on a real later composite failure and releases its transferred storage exactly once',async()=>{
 const p=original(),{engine}=engineFor(p),repair=vi.fn()
 engine['_onCanonicalRecoveryRequired']=repair
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,primary=Error('late open commit failed')
  vi.spyOn(owner.composite,'drawSource').mockImplementationOnce(()=>{throw primary})
  engine.appendOriginalRecorded(recordedSeal(p))
  await vi.waitFor(()=>expect(repair).toHaveBeenCalledOnce())
  expect(repair.mock.calls[0][0]).toBe(primary);expect(engine['_canonicalLayerOwner']).toBeUndefined();expect(engine['_canonicalPixelsReady']).toBe(false)
  expect(owner.outstanding).toBe(0);expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)
  expect(engine['_log'].entries).toHaveLength(2)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
