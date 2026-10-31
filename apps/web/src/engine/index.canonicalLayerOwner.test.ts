import {createHash} from 'node:crypto'
import {attachCanonicalRecordedDelivery} from '../pages/Room/net/canonicalRecordedDelivery'
import {parseCanonicalStrokeCloseOperation,prepareCanonicalRecordedAttachment,canonicalDefaultAutoSourceBinding,type BrushDescriptor} from '@grafetto/shared'
import nativeDefaultStock from '../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import {exactFrame} from './src/raster/cameraFrame'
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

function original(empty=false,ended=true,isCurrent=()=>true){const {state:s}=state(ended);s.canonicalHistoryBase={kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:empty?0:1,operationCount:empty?0:1};if(empty){s.tailOperations=[];s.canonicalCapabilities=undefined}return prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent})}
function engineFor(prepared:ReturnType<typeof original>){
 const result=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:8,pageHeight:8,canonicalEmptyRoom:{read:prepared.canonicalRead,tail:prepared.tailOperations}},{width:8,height:8}),gl=result.engine['gl'],get=gl.getParameter.bind(gl),mock=result.canvas.getContext('webgl')!
 const extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
 // Local state observation supplements only; real engine/services/jobs execute.
 Object.assign(gl,{getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,
  getAttribLocation:(_program:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),
  getShaderPrecisionFormat:()=>({precision:23}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},
  getTexParameter:(_target:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,
  getParameter:(key:number)=>key===9001?[0,0,8,8]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
 for(const id of ['background','layer-1'])result.engine.initLayer(id)
 result.engine.setCompositeOrder([{id:'layer-1',opacity:1}])
 return result
}
function recorded(p:ReturnType<typeof original>,seq:number,strokeId:string,ended:boolean,ordinal=0,diameter=8,angle=0,subX=0,subY=0,control=false){
 const f=fixture(ended,diameter,angle,subX,subY),snapshot={...f.attachment.capabilities[0].snapshot,strokeId},op:CanonicalStrokeOperation={...f.op,id:'frame-'+seq,seq,frame:{...f.op.frame,strokeId,frameOrdinal:ordinal}}
 if(control)op.frame={...op.frame,materialPacked:buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},snapshot.material).packed}
 if(ordinal)op.frame={...op.frame,materialPacked:buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{at:0,kind:'gestureEnd'}]},snapshot.material).packed}
 const attachment:CanonicalRecordedAttachmentV1={...f.attachment,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:op.id,sequence:seq,originalUserId:'author',capability:0}]}
 const prepared=prepareCanonicalRecordedAttachment(attachment,[op],p.canonicalRead.scope)[0],input=attachCanonicalRecordedDelivery(prepared,p.canonicalRead.scope)
 if(!('delivery'in input))throw Error('Missing original recorded input')
 return input
}
it('keeps the actual layer owner/open presentation alive after its existing job drains, then reuses warm resources for the next gesture',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const stable=engine['_layers'].get('layer-1')
  engine.appendOriginalRecorded(recorded(p,1,'first',false))
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0))
  const owner=engine['_canonicalLayerOwner']!
  expect(owner.coordinator?.presentationReady).toBe(true);expect(engine['_layers'].get('layer-1')).toBe(stable);expect(owner.derived).toBeDefined()
  const prepass=owner.prepass,composite=owner.composite,compile=vi.spyOn(engine['gl'],'createProgram')
  engine.appendOriginalRecorded(recorded(p,2,'first',true,1))
  await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined())
  expect(owner.derived).toBeUndefined();expect(owner.prepass).toBe(prepass);expect(owner.composite).toBe(composite)
  engine.appendOriginalRecorded(recorded(p,3,'second',true))
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0))
  expect(engine['_canonicalLayerOwner']).toBe(owner);expect(compile).not.toHaveBeenCalled();expect(engine['_log'].entries.map(e=>e.serverSeq)).toEqual([1,2,3])
  expect(engine['_brushMipCache'].reservedBytes).toBeGreaterThan(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('uses derived tiles only for actual display and stable tiles for export while a recorded wash remains open',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);engine.appendOriginalRecorded(recorded(p,1,'open',false))
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0))
  expect(await engine.exportPNG()).toBeNull();expect(await engine.exportReviewImage()).toBeNull();expect(await engine.bakePreview()).toBeNull()
  const owner=engine['_canonicalLayerOwner']!,transform=vi.spyOn(engine['_passes'],'transform'),frame=exactFrame({x:0,y:0,width:8,height:8})
  engine['_drawCompositeItem'](frame,'layer-1',1,engine['_assemblyFBO'].fbo,8,8)
  expect(transform).toHaveBeenCalled();expect(transform.mock.calls[0][0]).toBe(owner.derived!.resolveVisible({minX:0,minY:0,maxX:8,maxY:8})[0].buffer)
  transform.mockClear();engine['_drawCompositeItem'](frame,'layer-1',1,engine['_assemblyFBO'].fbo,8,8,false)
  expect(transform).toHaveBeenCalled();expect(transform.mock.calls[0][0]).toBe(owner.stable.resolveVisible({minX:0,minY:0,maxX:8,maxY:8})[0].buffer)
 }finally{engine.destroy()}
})
it('rejects copied delivery before journal mutation and refuses stale initial recovery after new confirmed pixels',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const input=recorded(p,1,'new',true)
  expect(()=>engine.appendOriginalRecorded({...input})).toThrow();expect(engine['_log'].entries).toHaveLength(0)
  if(!('delivery'in input))throw Error('Missing original recorded delivery')
  engine.appendOriginalRecorded(input);await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0))
  const repair=vi.fn();engine['_onCanonicalRecoveryRequired']=repair
  const entries=engine['_log'].entries,init=vi.spyOn(engine,'_initGL' as never)
  vi.spyOn(engine['gl'],'isContextLost').mockReturnValue(true);engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));vi.mocked(engine['gl'].isContextLost).mockReturnValue(false)
  engine['_handleContextRestored']()
  expect(init).not.toHaveBeenCalled();expect(engine['_canonicalPixelsReady']).toBe(false);expect(engine['_log'].entries).toBe(entries);expect(entries[0].serverSeq).toBe(1)
  await vi.waitFor(()=>expect(repair).toHaveBeenCalledTimes(1))
  expect(String(repair.mock.calls[0][0])).toContain('Newest canonical full baseline required')
  engine['_handleContextRestored']();await Promise.resolve();expect(repair).toHaveBeenCalledTimes(1)
 }finally{engine.destroy()}
})

it.each([0,17,89])('admits fixed geometry at near-one subpixel offsets with intrinsic angle %s without resizing the warm workspace',async(angle)=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  engine.appendOriginalRecorded(recorded(p,1,'control',false,0,8,angle))
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0))
  const owner=engine['_canonicalLayerOwner']!,mask=owner.mask
  // A new closed gesture uses the same full source bound, not its first
  // packet's smaller allocation at an integral origin.
  engine.appendOriginalRecorded(recorded(p,2,'control',true,1,8,angle))
  await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined())
  engine.appendOriginalRecorded(recorded(p,3,'fractional',true,0,8,angle,1-Number.EPSILON,1-Number.EPSILON))
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0))
  expect(engine['_canonicalPixelsReady']).toBe(true);expect(owner.mask).toBe(mask);expect(engine['_log'].entries).toHaveLength(3)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('closes an overflowing confirmed source before journal or GPU mutation and notifies repair only after all warm resources retire',async()=>{
 const p=original(true),{engine}=engineFor(p),repair=vi.fn(()=>{
  expect(engine['_canonicalLayerOwner']).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_rebuildJobs'].size).toBe(0)
 })
 engine['_onCanonicalRecoveryRequired']=repair
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  engine.appendOriginalRecorded(recorded(p,1,'small',true));await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0))
  const entries=engine['_log'].entries,revision=engine['_log'].revision,draw=vi.spyOn(engine['gl'],'drawArrays'),allocate=vi.spyOn(engine['gl'],'texImage2D')
  expect(()=>engine.appendOriginalRecorded(recorded(p,2,'larger',true,0,32))).toThrow('exceeds warm workspace')
  expect(engine['_log'].entries).toBe(entries);expect(engine['_log'].revision).toBe(revision);expect(draw).not.toHaveBeenCalled();expect(allocate).not.toHaveBeenCalled()
  expect(engine['_canonicalPixelsReady']).toBe(false);expect(repair).toHaveBeenCalledTimes(1)
  expect(()=>engine.appendOriginalRecorded(recorded(p,2,'again',true,0,32))).toThrow('owner unavailable');expect(repair).toHaveBeenCalledTimes(1)
 }finally{engine.destroy()}
})

it('preserves the published confirmed journal and closes all owners when actual painting fails after append',async()=>{
 const p=original(true),{engine}=engineFor(p),primary=new Error('actual canonical draw failed'),repair=vi.fn()
 engine['_onCanonicalRecoveryRequired']=repair
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const input=recorded(p,1,'failure',true)
  vi.spyOn(engine['gl'],'drawArrays').mockImplementationOnce(()=>{throw primary})
  engine.appendOriginalRecorded(input)
  const entries=engine['_log'].entries,revision=engine['_log'].revision
  await vi.waitFor(()=>expect(repair).toHaveBeenCalledTimes(1))
  expect(repair).toHaveBeenCalledWith(primary);expect(engine['_log'].entries).toBe(entries);expect(engine['_log'].revision).toBe(revision);expect(entries[0].canonicalInput).toBe(input)
  expect(engine['_canonicalPixelsReady']).toBe(false);expect(engine['_canonicalLayerOwner']).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_rebuildJobs'].size).toBe(0)
  expect(await engine.exportPNG()).toBeNull();expect(engine.pickColor(0,0)).toBeNull()
 }finally{engine.destroy()}
})

it('sizes a first empty control packet from its full trusted source before later fractional painting',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  engine.appendOriginalRecorded(recorded(p,1,'control',false,0,8,17,0,0,true))
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0))
  const owner=engine['_canonicalLayerOwner']!,mask=owner.mask
  expect(mask.width).toBeGreaterThan(1);expect(mask.height).toBeGreaterThan(1)
  engine.appendOriginalRecorded(recorded(p,2,'actual',true,0,8,17,1-Number.EPSILON,1-Number.EPSILON))
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0))
  expect(engine['_canonicalLayerOwner']).toBe(owner);expect(owner.mask).toBe(mask);expect(engine['_canonicalPixelsReady']).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('propagates actual physical loss to the open coordinator and never retires stale GL names on repeated loss',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  engine.appendOriginalRecorded(recorded(p,1,'open',false));await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0))
  const owner=engine['_canonicalLayerOwner']!,cancel=vi.spyOn(owner.coordinator!,'cancel'),gl=engine['gl']
  const deleted=[vi.spyOn(gl,'deleteTexture'),vi.spyOn(gl,'deleteFramebuffer'),vi.spyOn(gl,'deleteProgram'),vi.spyOn(gl,'deleteBuffer')]
  vi.spyOn(gl,'isContextLost').mockReturnValue(true)
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}))
  expect(cancel.mock.calls[0][1]).toEqual({lost:true});expect(engine['_canonicalLayerOwner']).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBe(0)
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}))
  for(const deletion of deleted)expect(deletion).not.toHaveBeenCalled()
 }finally{engine.destroy()}
})

it('admits the actual Basic2Opacity original40 antialiased source pin through the real recorded layer owner',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const row=nativeDefaultStock.rows.find(r=>r.index===4)!,descriptor=row.descriptor as unknown as BrushDescriptor
  expect(row.kppSHA256).toBe('a4256e1954d7b21a6fc1fcbae35b46c0ab747e2f67a1576d9d587b6776e4aa11')
  expect(createHash('sha256').update(JSON.stringify(descriptor)).digest('hex')).toBe('5413745f981351a6621ec85e75311aadcd64220c599f70bacb18a97e0bf6d985')
  const pin=canonicalDefaultAutoSourceBinding(descriptor,'5413745f981351a6621ec85e75311aadcd64220c599f70bacb18a97e0bf6d985','neon64-f32-fma-v1')
  expect(pin.source.antialias).toBe(true);expect(pin.source.diameter).toBe(40)
  const f=fixture(),material={...f.attachment.capabilities[0].snapshot.material,primarySource:pin,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}},snapshot={...f.attachment.capabilities[0].snapshot,brush:'brush:'+descriptor.id+'@'+descriptor.version,descriptorSha256:pin.descriptorSha256,material}
  const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:pin.source.diameter,ratio:pin.source.ratio,spikes:2,scale:pin.brushScale,angle:pin.brushAngle},{scale:1,ratio:1,rotation:0},.999,.999)
  const recipe={kind:'defaultAuto' as const,source:pin.source,coverageProfile:pin.coverageProfile,brushScale:pin.brushScale,brushAngle:pin.brushAngle,scale:1,ratio:1,rotation:0,subX:.999,subY:.999,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:false}
  const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:0,y:0,opacity:1,flow:1}],fences:[{at:0,kind:'segmentBegin',group:0},{at:1,kind:'primaryEnd',group:0},{at:1,kind:'segmentEnd',group:0},{at:1,kind:'gestureEnd'}]},material).packed
  const op:CanonicalStrokeOperation={...f.op,frame:{...f.op.frame,brush:snapshot.brush,materialPacked:packed}},attachment:CanonicalRecordedAttachmentV1={...f.attachment,capabilities:[{originalUserId:'author',snapshot}]}
  const input=attachCanonicalRecordedDelivery(prepareCanonicalRecordedAttachment(attachment,[op],p.canonicalRead.scope)[0],p.canonicalRead.scope)
  if(!('delivery'in input))throw Error('Missing original recorded delivery')
  engine.appendOriginalRecorded(input);await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0))
  expect(engine['_canonicalPixelsReady']).toBe(true);expect(engine['_log'].entries[0].canonicalInput).toBe(input);expect(engine['_canonicalLayerOwner']?.mask.width).toBeGreaterThanOrEqual(recipe.width)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

function recordedSeal(p:ReturnType<typeof original>,seq=2,recordedNext=1){
 const operation=parseCanonicalStrokeCloseOperation({type:'canonical_stroke_close',id:'seal-'+seq,userId:'author',timestamp:seq,seq,layerId:'layer-1',targetUserId:'author',strokeId:'first',disposition:'commitPartial',recordedNext,firstFrameOpId:'frame-1',lastFrameOpId:'frame-1'})
 return attachCanonicalRecordedDelivery(Object.freeze({operation}),p.canonicalRead.scope) as import('./index').CanonicalRecordedInput
}
it('publishes an actual original partial seal through the existing journal and retires its same open wash without an END frame',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  engine.appendOriginalRecorded(recorded(p,1,'first',false))
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0))
  const owner=engine['_canonicalLayerOwner']!,stable=owner.stable,prepass=owner.prepass,seal=recordedSeal(p),program=vi.spyOn(engine['gl'],'createProgram')
  const display=vi.fn(engine['_displayIfNotSuspended'].bind(engine));engine['_displayIfNotSuspended']=display
  engine.appendOriginalRecorded(seal)
  await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined())
  expect(display).toHaveBeenCalled()
  expect(owner.stable).toBe(stable);expect(owner.prepass).toBe(prepass);expect(program).not.toHaveBeenCalled()
  expect(engine['_log'].entries.map(e=>e.op.type)).toEqual(['canonical_stroke','canonical_stroke_close'])
  expect(engine['_log'].entries[1].canonicalInput).toBe(seal);expect(engine['_log'].entries[1].canonicalRead).toBeUndefined()
  engine.appendOriginalRecorded(recorded(p,3,'next',true))
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0))
  expect(engine['_log'].entries.map(e=>e.serverSeq)).toEqual([1,2,3]);expect(program).not.toHaveBeenCalled()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('refuses a copied original seal before poisoning or mutating the healthy open owner',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);engine.appendOriginalRecorded(recorded(p,1,'first',false))
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0))
  const owner=engine['_canonicalLayerOwner'],seal=recordedSeal(p)
  expect(()=>engine.appendOriginalRecorded({...seal})).toThrow()
  expect(engine['_canonicalLayerOwner']).toBe(owner);expect(engine['_log'].entries).toHaveLength(1)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('retires an invalid recorded seal without changing its confirmed source prefix',async()=>{
 const p=original(true),{engine}=engineFor(p),repair=vi.fn();engine['_onCanonicalRecoveryRequired']=repair
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);engine.appendOriginalRecorded(recorded(p,1,'first',false))
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0))
  expect(()=>engine.appendOriginalRecorded(recordedSeal(p,2,2))).toThrow()
  expect(engine['_log'].entries).toHaveLength(1);expect(engine['_canonicalLayerOwner']).toBeUndefined();expect(repair).toHaveBeenCalledOnce();expect(engine['_brushMipCache'].reservedBytes).toBe(0)
 }finally{engine.destroy()}
})
it('continues the same source lane after restoring an original full history with hidden frames',async()=>{
 const {state:s}=state(true)
 s.tailOperations.push({type:'operation_undo',id:'undo',userId:'author',timestamp:2,seq:2,targetOpId:'op'})
 s.canonicalHistoryBase={kind:'full-room-prefix-v2',roomId:'room',boardEpoch:2,throughSeq:2,operationCount:2}
 const p=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>true}),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  expect(engine['_canonicalLayerOwner']?.prepared).toBe(false)
  engine.appendOriginalRecorded(recorded(p,3,'new',true))
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0))
  expect(engine['_log'].entries.map(e=>e.state)).toEqual(['undone','done','done'])
  expect(engine['_log'].pixelOpDoneCount('layer-1')).toBe(1)
  expect(engine['_canonicalLayerOwner']?.coordinator).toBeUndefined()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('shows a completed derived prefix while later frames remain queued, but never an empty or partial presentation',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.paperReady();await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  await new Promise<void>(done=>requestAnimationFrame(()=>done()))
  const stable=engine['_canonicalLayerOwner']!.stable,target=stable.resolveForPaint({minX:0,minY:0,maxX:8,maxY:8})[0]
  target.buffer.restorePixels(Uint8Array.from({length:256},(_,i)=>[17,81,133,151][i%4]));stable.markContentPainted({minX:0,minY:0,maxX:8,maxY:8})
  engine['_scheduleCanonicalRebuild']=()=>{}
  const actualDisplay=engine['_display'].bind(engine),display=vi.fn(actualDisplay);engine['_display']=display
  engine.appendOriginalRecorded(recorded(p,1,'A',false));engine.appendOriginalRecorded(recorded(p,2,'B',false))
  const owner=engine['_canonicalLayerOwner']!,coordinator=owner.coordinator!,job=owner.job!
  engine['_display']();expect(display).toHaveBeenCalledOnce();display.mockClear()
  const compose=vi.spyOn(engine['_compositor'],'runComposite')
  // No completed fold exists yet: the explicit display call must leave the
  // current screen intact instead of sampling the just-created empty derived.
  engine['_display']();expect(compose).not.toHaveBeenCalled();display.mockClear()
  let progressed=false,sawIncomplete=false
  for(let turn=0;turn<400;turn++){
   const before=display.mock.calls.length
   engine['_stepCanonicalLayer'](job)
   await new Promise<void>(done=>requestAnimationFrame(()=>done()))
   if(!coordinator.presentationReady){sawIncomplete=true;expect(display).toHaveBeenCalledTimes(before)}
   if(coordinator.queuedFrameCount>0&&display.mock.calls.length){progressed=true;break}
  }
  expect(progressed).toBe(true);expect(sawIncomplete).toBe(true);expect(coordinator.presentationReady).toBe(true);expect(coordinator.queuedFrameCount).toBeGreaterThan(0);expect(compose).toHaveBeenCalled();expect(owner.job).toBe(job);expect(engine['_rebuildJobs'].get('layer-1')).toBe(job)
  expect(engine.pickColor(1,1)).toBeNull();expect(engine.bakeNetworkSnapshot('layer-1')).toBeNull();expect(engine['_canonicalReadReady']()).toBe(false)
  const displayed=display.mock.calls.length
  // A physical/preparation-only turn cannot redisplay the same publication.
  const advance=coordinator.advance.bind(coordinator);coordinator.advance=()=>{}
  engine['_stepCanonicalLayer'](job);expect(display).toHaveBeenCalledTimes(displayed);coordinator.advance=advance
  const lost=vi.spyOn(engine['gl'],'isContextLost').mockReturnValue(true)
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));lost.mockReturnValue(false)
  expect(engine['_canonicalPixelsReady']).toBe(false);expect(engine['_canonicalLayerOwner']).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('rechecks the same owner after intermediate display reenters context loss and never schedules stale work',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.paperReady();await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  await new Promise<void>(done=>requestAnimationFrame(()=>done()))
  const schedule=vi.fn();engine['_scheduleCanonicalRebuild']=schedule
  engine.appendOriginalRecorded(recorded(p,1,'A',false));engine.appendOriginalRecorded(recorded(p,2,'B',false))
  const owner=engine['_canonicalLayerOwner']!,job=owner.job!,actualDisplay=engine['_display'].bind(engine),lost=vi.spyOn(engine['gl'],'isContextLost').mockReturnValue(false)
  let displayed=false
  engine['_display']=()=>{actualDisplay();displayed=true;lost.mockReturnValue(true);engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}))}
  for(let n=0;n<400&&!displayed;n++){engine['_stepCanonicalLayer'](job);await new Promise<void>(done=>requestAnimationFrame(()=>done()))}
  expect(displayed).toBe(true);const calls=schedule.mock.calls.length
  expect(engine['_canonicalLayerOwner']).toBeUndefined();expect(engine['_rebuildJobs'].size).toBe(0);expect(engine['_canonicalPixelsReady']).toBe(false);expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_log'].entries).toHaveLength(2)
  await Promise.resolve();expect(schedule).toHaveBeenCalledTimes(calls)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('does not display an idle original control-only frame without a published presentation',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.paperReady();await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  await new Promise<void>(done=>requestAnimationFrame(()=>done()))
  const display=vi.fn(engine['_displayIfNotSuspended'].bind(engine));engine['_displayIfNotSuspended']=display
  engine.appendOriginalRecorded(recorded(p,1,'control',false,0,8,0,0,0,true))
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0))
  expect(engine['_canonicalLayerOwner']!.coordinator!.publishedPresentationReady).toBe(false)
  expect(display).not.toHaveBeenCalled();expect(engine['_log'].entries).toHaveLength(1)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
