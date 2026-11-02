/// <reference types="node" />
import {OperationLog} from './src/oplog/OperationLog'
import * as paired7Assets from '../lib/api/brushLibrary'
import * as paired7Shared from '@grafetto/shared'
import paired7Def from '../../../../packages/shared/src/fixtures/sourceDefaultAutoData/textureReptile.pressure.compiled3.metadata.json' with {type:'json'}
import paired7Soft from '../../../../packages/shared/src/fixtures/sourceSoftAutoData/texturePressure.native-default.compiled4.metadata.json' with {type:'json'}
import {installBrushLibrary,installBrushPixels,importedAssetPixels,isBrushAssetReady} from './src/presets/importedBrushes'
import type {CanonicalSourceAuthorService} from './index'
import type {PointerData} from './src/input/PointerInput'
import type {CanonicalIndexedRead} from './src/oplog/CanonicalRecordedDelivery'
import {indexedSocketFixture,indexedFrame} from './testing/canonicalIndexedReadFixture'
import {PencilEngine} from './index'
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
function fixture(ended=true,diameter=8,angle=0,subX=0,subY=0,rotation=0,ratio=1,mirrorH=false){
 const curve={text:'0,1;1,0',points:[{x:0,y:1,corner:false},{x:1,y:0,corner:false}]}
 const primarySource=canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,descriptorId:'soft',descriptorVersion:1,descriptorSha256:'a'.repeat(64),source:{kind:'softAuto',generator:'soft',shape:'circle',diameter,ratio:1,horizontalFade:1,verticalFade:1,antialias:false,spikes:2,randomness:0,density:1,softnessCurve:curve},brushScale:1,brushAngle:angle,coverageProfile:'neon64-f32-fma-v1',reader:'krita-bd6e8d0-v1',compilerProfile:'eigen-5.0.1-mapped-arm64-f64-v3',buildId:'b'.repeat(64),radialCurve:{source:curve,coefficients:[[0,0,-1,1]]}})
 const material={version:2 as const,assets:[],primarySource,budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'layer-1',brush:'brush:soft@1',strokeId:'S',boardEpoch:2,descriptorSha256:'a'.repeat(64),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},assets:[],materialVersion:2,material}
 const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter,ratio:1,spikes:2,scale:1,angle},{scale:1,ratio,rotation},subX,subY)
 const recipe={kind:'softAuto' as const,sourceSlot:0 as const,source:primarySource.source,coverageProfile:primarySource.coverageProfile,brushScale:1,brushAngle:angle,scale:1,ratio,rotation,subX,subY,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH,mirrorV:false}
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
function engineFor(prepared:ReturnType<typeof original>|CanonicalIndexedRead){
 const result=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:8,pageHeight:8,...('canonicalRead'in prepared?{canonicalEmptyRoom:{read:prepared.canonicalRead,tail:prepared.tailOperations}}:{canonicalIndexedRoom:prepared})},{width:8,height:8}),gl=result.engine['gl'],get=gl.getParameter.bind(gl),mock=result.canvas.getContext('webgl')!
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
 if(ordinal)op.frame={...op.frame,materialPacked:buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:ended?[{at:0,kind:'gestureEnd'}]:[]},snapshot.material).packed}
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
  expect(owner.stable.resolveVisible({minX:0,minY:0,maxX:8,maxY:8})[0].contentRect).toBeNull()
  expect(transform).not.toHaveBeenCalled() // Known-blank stable target: OPEN ink lives only in derived.
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
  const f=fixture(),originalSnapshot=f.attachment.capabilities[0].snapshot
  if(originalSnapshot.materialVersion!==2)throw Error('Expected V2 fixture')
  const material={...originalSnapshot.material,primarySource:pin,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}},snapshot={...originalSnapshot,brush:'brush:'+descriptor.id+'@'+descriptor.version,descriptorSha256:pin.descriptorSha256,material}
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
  expect(engine['_log'].entries.map(e=>e.state)).toEqual(['undone','done'])
  engine.appendOriginalRecorded(recorded(p,3,'new',true))
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0))
  // A new gesture by the same author makes the earlier undone branch unreachable.
  expect(engine['_log'].entries.map(e=>e.state)).toEqual(['gone','done','done'])
  expect(engine['_log'].redoTarget('author')).toBeNull()
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

it('keeps legacy rotated/anisotropic/mirrored originals closed before canvas admission',()=>{
 for(const transform of [{rotation:.4,ratio:1,mirrorH:false},{rotation:0,ratio:.5,mirrorH:false},{rotation:0,ratio:1,mirrorH:true}]){
  const f=fixture(true,8,0,0,0,transform.rotation,transform.ratio,transform.mirrorH),wire=state().state
  wire.tailOperations=[f.op];wire.canonicalCapabilities=f.attachment;wire.canonicalHistoryBase={kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:1,operationCount:1}
  const p=prepareCanonicalRoomState(wire,{expectedBoardId:'room',isCurrent:()=>true}),get=vi.fn(()=>{throw Error('Canvas touched')}),canvas=new Proxy({} as HTMLCanvasElement,{get})
  expect(()=>new PencilEngine(canvas,{rasterVersion:'straight-rgba8-v1',pageWidth:8,pageHeight:8,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations}})).toThrow('Unsupported fixed canonical layer transform')
  expect(get).not.toHaveBeenCalled()
 }
})


it('publishes hidden wash preview with the same owner while latest read/export/checkpoint stay closed',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!
  owner.previewPublication=true
  engine.appendOriginalRecorded(recorded(p,1,'preview-open',false))
  await vi.waitFor(()=>expect(owner.coordinator?.completedPresentationRevision).toBeGreaterThanOrEqual(0))
  expect(engine['_canonicalLayerOwner']).toBe(owner)
  expect(owner.coordinator!.publishedPresentationReady).toBe(true)
  expect(owner.coordinator!.presentationReady).toBe(false)
  expect(owner.coordinator!.checkpointReady).toBe(false)
  expect(engine['_canonicalDisplayReady']()).toBe(true)
  expect(engine['_canonicalReadReady']()).toBe(false)
  expect(engine['_canonicalExportReady']()).toBe(false)
  expect(owner.orderParked).toBe(true)
  const previous=owner.derived,revision=owner.coordinator!.completedPresentationRevision
  engine.appendOriginalRecorded(recorded(p,2,'preview-open',false,1))
  await vi.waitFor(()=>expect(owner.coordinator!.completedPresentationRevision).toBeGreaterThan(revision))
  expect(owner.derived).not.toBe(previous)
  expect(engine['_log'].entries).toHaveLength(2)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it.each(['allocation','render']as const)('parks candidate %s failure without retiring oldP and recovers on one newer genuine frame',async mode=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!
  owner.previewPublication=true
  engine.appendOriginalRecorded(recorded(p,1,'preview-fault',false))
  await vi.waitFor(()=>expect(owner.coordinator?.completedPresentationRevision).toBeGreaterThanOrEqual(0))
  await vi.waitFor(()=>expect(owner.orderParked).toBe(true))
  const oldP=owner.derived!,oldRevision=owner.coordinator!.completedPresentationRevision,primary=Error('candidate-only '+mode)
  const poisonHook={poison:engine['_poisonCanonicalLayer'].bind(engine)};engine['_poisonCanonicalLayer']=(error)=>poisonHook.poison(error);const poison=vi.spyOn(poisonHook,'poison')
  const stage=engine['_stageCanonicalPreview'].bind(engine)
  const stageHook={stage};engine['_stageCanonicalPreview']=(o,bytes)=>stageHook.stage(o,bytes)
  const failing=vi.spyOn(stageHook,'stage').mockImplementation((o,bytes)=>{
   if(mode==='allocation')throw primary
   const candidate=stage(o,bytes),prepare=candidate.buffer.preparePaintTargetRects.bind(candidate.buffer)
   vi.spyOn(candidate.buffer,'preparePaintTargetRects').mockImplementationOnce(()=>{throw primary})
   void prepare
   return candidate
  })
  engine.appendOriginalRecorded(recorded(p,2,'preview-fault',false,1))
  await vi.waitFor(()=>expect(owner.previewFailureRevision).toBeDefined())
  expect(engine['_canonicalLayerOwner']).toBe(owner);expect(owner.derived).toBe(oldP)
  expect(owner.coordinator!.completedPresentationRevision).toBe(oldRevision)
  expect(poison).not.toHaveBeenCalled();expect(owner.orderParked).toBe(true)
  expect(engine['_canonicalDisplayReady']()).toBe(true);expect(engine['_canonicalReadReady']()).toBe(false)
  const attempts=failing.mock.calls.length
  for(let i=0;i<4;i++)expect(owner.coordinator!.advance()).toMatchObject({kind:'preview-failed'})
  expect(failing).toHaveBeenCalledTimes(attempts)
  failing.mockRestore()
  engine.appendOriginalRecorded(recorded(p,3,'preview-fault-retry',false,0))
  await vi.waitFor(()=>expect(owner.coordinator!.completedPresentationRevision).toBeGreaterThan(oldRevision))
  expect(owner.derived).not.toBe(oldP);expect(poison).not.toHaveBeenCalled()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})


it('treats actual candidate render plus borrowed-batch cleanup failure as fatal, preserving the primary',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!;owner.previewPublication=true
  engine.appendOriginalRecorded(recorded(p,1,'preview-cleanup',false))
  await vi.waitFor(()=>expect(owner.coordinator?.completedPresentationRevision).toBeGreaterThanOrEqual(0))
  await vi.waitFor(()=>expect(owner.orderParked).toBe(true))
  const primary=Error('candidate render'),cleanup=Error('batch owner cleanup'),poisonHook={poison:engine['_poisonCanonicalLayer'].bind(engine)};engine['_poisonCanonicalLayer']=(error)=>poisonHook.poison(error);const poison=vi.spyOn(poisonHook,'poison')
  const draw=owner.composite.drawSource.bind(owner.composite)
  vi.spyOn(owner.composite,'drawSource').mockImplementation((request,frame)=>{
   if(request.source.kind==='straightRgba8'){
    if(!frame)throw Error('Expected genuine borrowed frame')
    frame.holdGroup(()=>{throw cleanup});throw primary
   }
   return draw(request,frame)
  })
  engine.appendOriginalRecorded(recorded(p,2,'preview-cleanup',false,1))
  await vi.waitFor(()=>expect(poison).toHaveBeenCalled())
  expect(poison.mock.calls[0][0]).toBe(primary)
  expect(engine['_canonicalLayerOwner']).toBeUndefined()
  expect(engine['_canonicalReadReady']()).toBe(false)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})


it('finishes only the captured ordinary head despite between-turn refill, then gives candidate the exclusive lane',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!;owner.previewPublication=true
  engine['_scheduleCanonicalRebuild']=()=>{}
  engine.appendOriginalRecorded(recorded(p,1,'preview-head',false,0,64))
  const job=owner.job!;engine['_stepCanonicalLayer'](job)
  const coordinator=owner.coordinator!,head=coordinator['queue'][0]
  if('kind' in head)throw Error('Expected ordinary wash head')
  expect(head.executor.pendingFrameCount).toBe(1)
  // A genuine later original enters between synchronous turns, never inside
  // coordinator.busy. It must not extend the captured head-frame boundary.
  engine.appendOriginalRecorded(recorded(p,2,'preview-refill',false,0,64))
  const later=coordinator['queue'].at(-1)!
  if('kind' in later)throw Error('Expected ordinary wash refill')
  const advance=vi.spyOn(later.executor,'advance')
  const originalStage=engine['_stageCanonicalPreview'].bind(engine)
  let staged=false,callsAtStage=-1
  const stageHook={stage:originalStage};engine['_stageCanonicalPreview']=(o,bytes)=>stageHook.stage(o,bytes)
  vi.spyOn(stageHook,'stage').mockImplementation((o,bytes)=>{
   expect(later.executor.pendingFrameCount).toBe(1)
   staged=true;callsAtStage=advance.mock.calls.length
   return originalStage(o,bytes)
  })
  for(let i=0;i<1024&&!staged;i++)engine['_stepCanonicalLayer'](job)
  expect(staged).toBe(true);expect(callsAtStage).toBe(0)
  for(let i=0;i<1024&&coordinator.completedPresentationRevision<0;i++)engine['_stepCanonicalLayer'](job)
  expect(coordinator.completedPresentationRevision).toBeGreaterThanOrEqual(0)
  expect(advance).toHaveBeenCalledTimes(callsAtStage)
  expect(later.executor.pendingFrameCount).toBe(1)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})


it('recovers an actual candidate drawSource throw ONLY when borrowed batch/turn cleanup succeeds',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!;owner.previewPublication=true
  engine.appendOriginalRecorded(recorded(p,1,'preview-real-render',false))
  await vi.waitFor(()=>expect(owner.coordinator?.completedPresentationRevision).toBeGreaterThanOrEqual(0))
  await vi.waitFor(()=>expect(owner.orderParked).toBe(true))
  const oldP=owner.derived!,revision=owner.coordinator!.completedPresentationRevision,primary=Error('actual candidate draw')
  const poisonHook={poison:engine['_poisonCanonicalLayer'].bind(engine)};engine['_poisonCanonicalLayer']=error=>poisonHook.poison(error)
  const poison=vi.spyOn(poisonHook,'poison'),draw=owner.composite.drawSource.bind(owner.composite)
  const fault=vi.spyOn(owner.composite,'drawSource').mockImplementation((request,frame)=>{if(request.source.kind==='straightRgba8')throw primary;return draw(request,frame)})
  engine.appendOriginalRecorded(recorded(p,2,'preview-real-render',false,1))
  await vi.waitFor(()=>expect(owner.previewFailureRevision).toBeDefined())
  expect(owner.derived).toBe(oldP);expect(owner.coordinator!.completedPresentationRevision).toBe(revision)
  expect(poison).not.toHaveBeenCalled();expect(engine['_canonicalReadReady']()).toBe(false);expect(engine['_canonicalExportReady']()).toBe(false)
  fault.mockRestore();engine.appendOriginalRecorded(recorded(p,3,'preview-real-render-retry',false))
  await vi.waitFor(()=>expect(owner.coordinator!.completedPresentationRevision).toBeGreaterThan(revision))
  expect(owner.derived).not.toBe(oldP);expect(poison).not.toHaveBeenCalled()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('commits the new pointer before old cleanup, then treats any retirement failure as fatal without rollback',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!;owner.previewPublication=true
  engine.appendOriginalRecorded(recorded(p,1,'preview-retire-fault',false))
  await vi.waitFor(()=>expect(owner.coordinator?.completedPresentationRevision).toBeGreaterThanOrEqual(0))
  await vi.waitFor(()=>expect(owner.orderParked).toBe(true))
  const oldP=owner.derived!,destroy=oldP.destroy.bind(oldP),primary=Error('old backing retirement'),observed:unknown[]=[]
  vi.spyOn(oldP,'destroy').mockImplementation(()=>{destroy();throw primary})
  const poison=engine['_poisonCanonicalLayer'].bind(engine)
  engine['_poisonCanonicalLayer']=error=>{observed.push(owner.derived);expect(error).toBe(primary);return poison(error)}
  engine.appendOriginalRecorded(recorded(p,2,'preview-retire-fault',false,1))
  await vi.waitFor(()=>expect(observed).toHaveLength(1))
  expect(observed[0]).not.toBe(oldP);expect(engine['_canonicalLayerOwner']).toBeUndefined()
  expect(engine['_canonicalReadReady']()).toBe(false)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})


it.each(['logical','global']as const)('checks independent actual %s overlap domain before hidden allocation without raising the other limit',async domain=>{
 const {transformedMaskPrepassBudget}=await import('./src/dabs/TransformedMaskPrepass')
 const {canonicalRgba8CompositeBudget}=await import('./src/dabs/CanonicalRgba8CompositePass')
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!;owner.previewPublication=true
  engine.appendOriginalRecorded(recorded(p,1,'preview-budget',false))
  await vi.waitFor(()=>expect(owner.coordinator?.completedPresentationRevision).toBeGreaterThanOrEqual(0))
  await vi.waitFor(()=>expect(owner.orderParked).toBe(true))
  const oldP=owner.derived!,oldLogical=owner.logicalBytes,oldGlobal=engine['_gpuBudget']
  const makeHook={make:engine['_makeLayerBuffer'].bind(engine)};engine['_makeLayerBuffer']=id=>makeHook.make(id)
  const allocate=vi.spyOn(makeHook,'make'),stage=engine['_stageCanonicalPreview'].bind(engine),components:number[][]=[]
  engine['_stageCanonicalPreview']=(o,bytes)=>{
   if('transaction'in o)throw Error('Expected existing live preview budget fixture owner')
   const seen=new Set<object>();let backing=0
   for(const layer of [o.stable,o.derived!])for(const item of layer.gpuAllocationSnapshot())if(!seen.has(item.buffer)){seen.add(item.buffer);backing+=item.bytes}
   const companions=transformedMaskPrepassBudget(o.mask).gpuBytes+canonicalRgba8CompositeBudget(o.plan.composite).gpuBytes+o.cache.bytes
   const pool=engine['_washGpuBytes'](),logical=o.outstanding+bytes,total=logical+backing+companions+pool
   components.push([o.outstanding,bytes,backing,companions,pool,total])
   expect(logical).toBeLessThanOrEqual(oldLogical);expect(total).toBeLessThanOrEqual(oldGlobal)
   try{
    if(domain==='logical')Reflect.set(o,'logicalBytes',logical-1)
    else engine['_gpuBudget']=total-1
    return stage(o,bytes)
   }finally{Reflect.set(o,'logicalBytes',oldLogical);engine['_gpuBudget']=oldGlobal}
  }
  engine.appendOriginalRecorded(recorded(p,2,'preview-budget',false,1))
  await vi.waitFor(()=>expect(owner.previewFailureRevision).toBeDefined())
  expect(components).toHaveLength(1);expect(allocate).not.toHaveBeenCalled()
  expect(owner.derived).toBe(oldP);expect(engine['_canonicalLayerOwner']).toBe(owner)
  expect(String(owner.coordinator!['previewFailure']!.error)).toContain(domain)
  expect(owner.logicalBytes).toBe(oldLogical);expect(engine['_gpuBudget']).toBe(oldGlobal)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it.each(['completed-plan','allocation-rollback']as const)('treats actual %s close failure outside GL as fatal after plan refs detach',async mode=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!;owner.previewPublication=true
  engine.appendOriginalRecorded(recorded(p,1,'preview-plan-close',false))
  await vi.waitFor(()=>expect(owner.coordinator?.completedPresentationRevision).toBeGreaterThanOrEqual(0))
  await vi.waitFor(()=>expect(owner.orderParked).toBe(true))
  const oldP=owner.derived!,primary=Error('candidate allocation primary'),cleanup=Error('actual plan close'),observed:unknown[]=[]
  const poison=engine['_poisonCanonicalLayer'].bind(engine)
  engine['_poisonCanonicalLayer']=error=>{observed.push(error);return poison(error)}
  const stage=engine['_stageCanonicalPreview'].bind(engine);let closes=0
  engine['_stageCanonicalPreview']=(o,bytes)=>{
   const candidate=stage(o,bytes),target=mode==='allocation-rollback'?owner.stable:candidate.buffer
   const prepare=target.preparePaintTargetRects.bind(target)
   vi.spyOn(target,'preparePaintTargetRects').mockImplementationOnce(rects=>{
    const plan=prepare(rects),close=plan.close.bind(plan)
    return Object.freeze({...plan,close:()=>{closes++;expect(owner.derived).toBe(oldP);close();throw cleanup}})
   })
   if(mode==='allocation-rollback')vi.spyOn(candidate.buffer,'preparePaintTargetRects').mockImplementationOnce(()=>{throw primary})
   return candidate
  }
  engine.appendOriginalRecorded(recorded(p,2,'preview-plan-close',false,1))
  await vi.waitFor(()=>expect(observed.length).toBeGreaterThanOrEqual(1))
  expect(observed.every(error=>error===(mode==='allocation-rollback'?primary:cleanup))).toBe(true)
  expect(observed[0]).toBe(mode==='allocation-rollback'?primary:cleanup)
  expect(closes).toBe(1);expect(engine['_canonicalLayerOwner']).toBeUndefined()
  expect(engine['_canonicalReadReady']()).toBe(false);expect(engine['_canonicalExportReady']()).toBe(false)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})


it('capacity notification follows actual preview publication and idle notification preserves a genuine wake',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!;owner.previewPublication=true
  const schedule=vi.fn();engine['_scheduleCanonicalRebuild']=schedule
  engine.appendOriginalRecorded(recorded(p,1,'capacity-preview',false))
  const coordinator=owner.coordinator!,job=owner.job!,advance=coordinator.advance.bind(coordinator)
  let ready=false,released=0,resolved=0,accepted=false
  vi.spyOn(coordinator,'advance').mockImplementation(()=>{
   const result=advance()
   if(result?.kind==='preview-ready'){
    ready=true;const previous=owner.derived
    owner.recordedCapacity={promise:Promise.resolve(),resolve:()=>{resolved++},release:()=>{released++;accepted=owner.derived!==previous&&coordinator.publishedPresentationReady}}
   }
   return result
  })
  for(let n=0;n<1024&&!ready;n++)engine['_stepCanonicalLayer'](job)
  expect(ready).toBe(true);expect(released).toBe(1);expect(resolved).toBe(1);expect(accepted).toBe(true)
  owner.recordedCapacity={promise:Promise.resolve(),resolve:()=>{resolved++},release:()=>{released++;engine.appendOriginalRecorded(recorded(p,2,'capacity-wake',false))}}
  engine['_stepCanonicalLayer'](job)
  expect(released).toBe(2);expect(resolved).toBe(2);expect(owner.orderParked).toBe(false)
  expect(owner.job).toBe(job);expect(coordinator.queuedFrameCount).toBeGreaterThan(0)
  expect(schedule).toHaveBeenCalledWith(job)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})


// Ownership/CAS fault probe only: replacement resources are produced by another
// real restore, never admitted/drawn through a fabricated source grant here.
it.each([false,true])('capacity replacement CAS never poisons another restored owner, primary=%s',async throws=>{
 const p=original(true),otherP=original(true),{engine}=engineFor(p),other=engineFor(otherP).engine
 let replacement:NonNullable<typeof engine['_canonicalLayerOwner']>|undefined
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  await other.restoreCanonicalEmptyRoom(otherP.canonicalRead,otherP.tailOperations)
  engine['_scheduleCanonicalRebuild']=()=>{};other['_scheduleCanonicalRebuild']=()=>{}
  other.appendOriginalRecorded(recorded(otherP,1,'replacement',false));replacement=other['_canonicalLayerOwner']!
  engine.appendOriginalRecorded(recorded(p,1,'capacity-old',false))
  const owner=engine['_canonicalLayerOwner']!,job=owner.job!
  let resolved=false,caught=false,primary:unknown=Error('not observed')
  owner.recordedCapacity={promise:Promise.resolve(),resolve:()=>{resolved=true},release:()=>{
   expect(engine['_retireCanonicalLayer'](false)).toEqual([])
   engine['_canonicalLayerOwner']=replacement;engine['_rebuildJobs'].set('layer-1',replacement!.job!)
   if(throws)throw undefined
  }}
  for(let n=0;n<1024&&!resolved;n++)try{engine['_stepCanonicalLayer'](job)}catch(error){caught=true;primary=error}
  expect(resolved).toBe(true);expect(caught).toBe(throws);if(throws)expect(primary).toBeUndefined()
  expect(engine['_canonicalLayerOwner']).toBe(replacement);expect(replacement.failed).toBe(false)
  expect(replacement.coordinator).toBeDefined();expect(engine['_rebuildJobs'].get('layer-1')).toBe(replacement.job)
  expect(owner.coordinator).toBeUndefined();expect(owner.outstanding).toBe(0)
 }finally{
  // Probe never transfers the other engine's actual resource ownership.
  if(engine['_canonicalLayerOwner']===replacement)engine['_canonicalLayerOwner']=undefined
  engine['_rebuildJobs'].clear();engine.destroy();other.destroy()
  expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(other['_brushMipCache'].reservedBytes).toBe(0)
 }
})

it('capacity callback context loss retires the real job without rescheduling stale work',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const schedule=vi.fn();engine['_scheduleCanonicalRebuild']=schedule
  engine.appendOriginalRecorded(recorded(p,1,'capacity-loss',false))
  const owner=engine['_canonicalLayerOwner']!,job=owner.job!;let resolved=false,lost=false,calls=0
  owner.recordedCapacity={promise:Promise.resolve(),resolve:()=>{resolved=true},release:()=>{
   lost=true;vi.spyOn(engine['gl'],'isContextLost').mockReturnValue(true)
   engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));calls=schedule.mock.calls.length
  }}
  for(let n=0;n<1024&&!lost;n++)engine['_stepCanonicalLayer'](job)
  expect(lost).toBe(true);expect(resolved).toBe(true);expect(schedule).toHaveBeenCalledTimes(calls)
  expect(engine['_canonicalLayerOwner']).toBeUndefined();expect(engine['_rebuildJobs'].size).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('capacity release failure on the same actual owner remains fatal and resolves its waiter',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  engine['_scheduleCanonicalRebuild']=()=>{}
  engine.appendOriginalRecorded(recorded(p,1,'capacity-fatal',false))
  const owner=engine['_canonicalLayerOwner']!,job=owner.job!;let resolved=false
  owner.recordedCapacity={promise:Promise.resolve(),resolve:()=>{resolved=true},release:()=>{throw undefined}}
  for(let n=0;n<1024&&!resolved;n++)engine['_stepCanonicalLayer'](job)
  expect(resolved).toBe(true);expect(owner.failed).toBe(true);expect(engine['_canonicalLayerOwner']).toBeUndefined()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})


it('paired live END adopts SAME finished P as stable and retires old pointers before latest readiness',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!;owner.previewPublication=true
  const stable=owner.stable,destroy=vi.spyOn(stable,'destroy')
  engine.appendOriginalRecorded(recorded(p,1,'paired-open',false))
  await vi.waitFor(()=>expect(owner.coordinator?.publishedPresentationReady).toBe(true))
  const oldP=owner.derived!,drop=vi.spyOn(oldP,'destroy'),cache=owner.cache,prepass=owner.prepass,composite=owner.composite
  expect(engine['_canonicalReadReady']()).toBe(false)
  engine.appendOriginalRecorded(recorded(p,2,'paired-open',true,1))
  await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined())
  expect(owner.stable).not.toBe(stable);expect(owner.stable).not.toBe(oldP)
  expect(engine['_layers'].get('layer-1')).toBe(owner.stable);expect(owner.derived).toBeUndefined()
  expect(destroy).toHaveBeenCalledOnce();expect(drop).toHaveBeenCalledOnce()
  expect(owner.cache).toBe(cache);expect(owner.prepass).toBe(prepass);expect(owner.composite).toBe(composite)
  expect(owner.failed).toBe(false);expect(owner.outstanding).toBe(0)
  expect(engine['_canonicalReadReady']()).toBe(true);expect(engine['_canonicalExportReady']()).toBe(true)
  expect(engine['_rebuildJobs'].size).toBe(0);expect(engine['_log'].entries.map(e=>e.serverSeq)).toEqual([1,2])
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('paired full hidden OPEN publishes display then uses SAME callback owner through real END handoff',async()=>{
 const {state:wire}=state(false)
 wire.canonicalHistoryBase={kind:'full-room-prefix-v2',roomId:'room',boardEpoch:2,throughSeq:1,operationCount:1}
 const p=prepareCanonicalRoomState(wire,{expectedBoardId:'room',isCurrent:()=>true}),{engine}=engineFor(p)
 try{
  const restored=engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const candidate=engine['_canonicalEmptyTransaction']!.jobs[0];candidate.previewPublication=true
  await restored
  const owner=engine['_canonicalLayerOwner']!
  expect(owner.previewPublication).toBe(true);expect(owner.coordinator?.publishedPresentationReady).toBe(true)
  expect(engine['_canonicalReadReady']()).toBe(false)
  engine.appendOriginalRecorded(recorded(p,2,'S',true,1))
  await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined())
  expect(owner.failed).toBe(false);expect(owner.derived).toBeUndefined()
  expect(engine['_layers'].get('layer-1')).toBe(owner.stable)
  expect(engine['_canonicalReadReady']()).toBe(true);expect(owner.outstanding).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('paired indexed zero-DRAW original END consumes ready ticket before SAME minted accepted cut',async()=>{
 const issuer=indexedSocketFixture([indexedFrame(1,'empty-indexed',true)],1),read=await issuer.open()
 const {engine}=engineFor(read)
 try{
  const restored=engine.restoreCanonicalIndexedRoom(read)
  const candidate=engine['_canonicalEmptyTransaction']!.jobs[0];candidate.previewPublication=true
  await restored
  const owner=engine['_canonicalLayerOwner']!
  expect(engine.getCanonicalIndexedCut()?.throughSeq).toBe(1)
  expect(owner.coordinator).toBeUndefined();expect(owner.derived).toBeUndefined()
  expect(engine['_layers'].get('layer-1')).toBe(owner.stable);expect(owner.failed).toBe(false)
  expect(engine['_canonicalReadReady']()).toBe(true);expect(engine['_canonicalExportReady']()).toBe(true)
  expect(issuer.requests.filter(r=>r.event==='canonical_history_stream_next').map(r=>r.body.afterSeq)).toEqual([0,1])
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})


it('paired late original interrupted WASH close recaptures then transfers SAME current original cohort',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!;owner.previewPublication=true
  engine.appendOriginalRecorded(recorded(p,1,'first',false))
  await vi.waitFor(()=>expect(owner.coordinator?.publishedPresentationReady).toBe(true))
  const oldP=owner.derived!,oldStable=owner.stable,compile=vi.spyOn(engine['gl'],'createProgram')
  expect(owner.coordinator!['dirty'].size).toBe(0)
  engine.appendOriginalRecorded(recordedSeal(p))
  await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined())
  expect(owner.stable).not.toBe(oldP);expect(owner.stable).not.toBe(oldStable)
  expect(engine['_layers'].get('layer-1')).toBe(owner.stable);expect(owner.failed).toBe(false)
  expect(engine['_canonicalReadReady']()).toBe(true);expect(engine['_canonicalExportReady']()).toBe(true)
  expect(engine['_log'].entries.map(entry=>entry.op.type)).toEqual(['canonical_stroke','canonical_stroke_close'])
  expect(compile).not.toHaveBeenCalled();expect(owner.outstanding).toBe(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})


it.each([1023,1024])('upfront four-backing full plan respects existing global bound %s before resource preparation',async budget=>{
 const p=original(false,true),{engine}=engineFor(p)
 try{
  await engine.paperReady()
  engine['_gpuBudget']=budget
  const old=engine['_layers'],program=vi.spyOn(engine['gl'],'createProgram'),texture=vi.spyOn(engine['gl'],'createTexture')
  const make=vi.fn(engine['_makeLayerBuffer'].bind(engine));engine['_makeLayerBuffer']=make
  expect(engine['_canonicalEmptyAdmission']!.logicalBytes).toBe(4*8*8*4)
  if(budget<1024){
   await expect(engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)).rejects.toThrow('logical GPU allowance')
   expect(make).not.toHaveBeenCalled();expect(program).not.toHaveBeenCalled();expect(texture).not.toHaveBeenCalled()
   expect(engine['_layers']).toBe(old);expect(engine['_canonicalEmptyTransaction']).toBeUndefined()
   expect(engine['_log'].entries).toHaveLength(0);expect(engine['_rebuildJobs'].size).toBe(0)
  }else{
   await expect(engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)).resolves.toMatchObject({committed:true})
   expect(engine['_canonicalReadReady']()).toBe(true);expect(engine['_log'].entries).toHaveLength(1)
  }
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('hidden known-clean staging denial parks SAME owned prefix without cleanup or RAF retries',async()=>{
 const {state:wire}=state(false)
 wire.canonicalHistoryBase={kind:'full-room-prefix-v2',roomId:'room',boardEpoch:2,throughSeq:1,operationCount:1}
 const p=prepareCanonicalRoomState(wire,{expectedBoardId:'room',isCurrent:()=>true}),{engine}=engineFor(p)
 let restore:Promise<unknown>|undefined
 try{
  const failure=Error('explicit hidden resource denial'),stage=vi.fn(()=>{throw failure})
  engine['_stageCanonicalPreview']=stage
  const old=engine['_layers']
  restore=engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations).then(()=>({completed:true}),error=>({completed:false,error}))
  const tx=engine['_canonicalEmptyTransaction']!,candidate=tx.jobs[0];candidate.previewPublication=true
  await vi.waitFor(()=>expect(candidate.previewFailureRevision).toBeDefined())
  expect(engine['_canonicalEmptyTransaction']).toBe(tx);expect(tx.finished).toBe(false);expect(tx.failures).toHaveLength(0)
  expect(engine['_layers']).toBe(old);expect(engine['_canonicalReadReady']()).toBe(false)
  expect(candidate.coordinator?.poisoned).toBe(false);expect(candidate.coordinator?.queuedFrameCount).toBe(0)
  expect(candidate.wake).toBeUndefined();const calls=stage.mock.calls.length
  await new Promise<void>(done=>requestAnimationFrame(()=>done()))
  expect(stage).toHaveBeenCalledTimes(calls);expect(candidate.coordinator!['entries']).toHaveLength(1)
 }finally{engine.destroy();await restore;expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})


it('closed ticket rejects actual context loss after staged check and final original callbacks before pointer commit',async()=>{
 let armed=false,staged=false,lost=false
 const p=original(true,true,()=>{if(armed&&staged)lost=true;return true}),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!;owner.previewPublication=true
  engine['_scheduleCanonicalRebuild']=vi.fn()
  const real=engine['_stageCanonicalPreview'].bind(engine)
  engine['_stageCanonicalPreview']=(candidate,bytes)=>{
   const work=real(candidate,bytes)
   return Object.freeze({...work,assertCurrent(){work.assertCurrent();if(armed)staged=true}})
  }
  vi.spyOn(engine['gl'],'isContextLost').mockImplementation(()=>lost)
  engine.appendOriginalRecorded(recorded(p,1,'context-at-finish',true))
  await vi.waitFor(()=>expect(owner.coordinator).toBeDefined())
  let ticket:import('./src/dabs/CanonicalWashLayerCoordinator').CanonicalPreviewPublication|undefined
  for(let index=0;index<500&&!ticket;index++){
   const result=owner.coordinator!.advance()
   if(result?.kind==='preview-failed')throw result.error
   if(result?.kind==='preview-ready')ticket=result.ticket
  }
  if(!ticket)throw Error('Actual ready ticket required')
  expect(ticket.disposition).toBe('closed-handoff')
  const stable=owner.stable,previous=owner.derived;armed=true
  let rejected=false
  try{ticket.assertCurrent()}catch{rejected=true}
  expect(lost).toBe(true);expect(rejected).toBe(true)
  expect(owner.stable).toBe(stable);expect(owner.derived).toBe(previous)
  expect(engine['_layers'].get('layer-1')).toBe(stable)
 }finally{armed=false;lost=false;engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})


it('closed handoff notifies SAME pending capacity once and preserves callback-admitted next cycle',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!;owner.previewPublication=true
  const schedule=vi.fn();engine['_scheduleCanonicalRebuild']=schedule
  engine.appendOriginalRecorded(recorded(p,1,'capacity-closed',true))
  const coordinator=owner.coordinator!,job=owner.job!,advance=coordinator.advance.bind(coordinator)
  let ready=false,released=0,resolved=0,atReady=0
  vi.spyOn(coordinator,'advance').mockImplementation(()=>{
   const result=advance()
   if(result?.kind==='preview-ready'){
    ready=true;atReady=schedule.mock.calls.length;const release=engine['_brushMipCache'].reserve(256)
    owner.recordedCapacity={promise:Promise.resolve(),release:()=>{
     released++;release()
     if(!owner.retiring&&engine['_canonicalLayerOwner']===owner)engine.appendOriginalRecorded(recorded(p,2,'capacity-successor',false))
    },resolve:()=>{resolved++}}
   }
   return result
  })
  for(let turn=0;turn<500&&!ready;turn++)engine['_stepCanonicalLayer'](job)
  expect(ready).toBe(true);expect(released).toBe(1);expect(resolved).toBe(1)
  expect(owner.coordinator).toBeDefined();expect(owner.coordinator).not.toBe(coordinator)
  expect(owner.job).toBeDefined();expect(owner.job).not.toBe(job);expect(engine['_rebuildJobs'].get('layer-1')).toBe(owner.job)
  expect(owner.coordinator!.queuedFrameCount).toBe(1);expect(owner.recordedCapacity).toBeUndefined()
  expect(schedule.mock.calls.slice(atReady).every(([scheduled])=>scheduled!==job)).toBe(true)
  expect(schedule).toHaveBeenCalledWith(owner.job);expect(owner.failed).toBe(false)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('closed finish rejects reentrant append and coordinator creation before unrelated successor exists',async()=>{
 const p=original(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!;owner.previewPublication=true
  const old=owner.stable,destroy=old.destroy.bind(old),next=recorded(p,2,'forbidden-retiring',false)
  let witnessed=false,appendRejected=false,coordinatorRejected=false
  vi.spyOn(old,'destroy').mockImplementation(()=>{
   if(owner.retiring){
    witnessed=true
    try{engine.appendOriginalRecorded(next)}catch{appendRejected=true}
    try{engine['_ensureCanonicalLayerCoordinator'](owner)}catch{coordinatorRejected=true}
   }
   destroy()
  })
  engine.appendOriginalRecorded(recorded(p,1,'retiring-current',true))
  await vi.waitFor(()=>expect(witnessed).toBe(true))
  expect(appendRejected).toBe(true);expect(coordinatorRejected).toBe(true)
  expect(owner.coordinator).toBeUndefined();expect(owner.failed).toBe(false)
  expect(engine['_log'].entries).toHaveLength(1);expect(engine['_canonicalReadReady']()).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

// Independent self-authored CAS resource fixture; retained source curves are metadata only.
const paired7Token='textured-auto-material-v7' as const
function paired7Fixture(randomDefault=false,buildup=false){
 const descriptor=structuredClone((randomDefault?paired7Def:paired7Soft).descriptor)as unknown as BrushDescriptor
 // Self-authored resource/composition mechanism paired7Fixture; retained paired7Original curves,
 // geometry and raw options, not a claim to the vendor preset identity/artwork.
 Reflect.set(descriptor,'id','imported-'+createHash('sha256').update('engine7-self-authored-'+randomDefault+'-'+buildup).digest('hex'));Reflect.set(descriptor,'version',1)
 if(randomDefault){Reflect.set(descriptor.texture!.offset!,'randomX',true);Reflect.set(descriptor.texture!.offset!,'randomY',true);Reflect.set(descriptor.texture!.offset!,'x',1);Reflect.set(descriptor.texture!.offset!,'y',65)}
 if(buildup){Reflect.set(descriptor.sourceStamp!.flags,'indirectPainting',false);Reflect.set(descriptor.sourceStamp!.settings,'PaintOpAction','1')}
 const side=randomDefault?256:16,gray=Uint8Array.from({length:side*side},(_,i)=>(i*37+11)%256),id='asset:'+createHash('sha256').update(gray).digest('hex')
 Reflect.set(descriptor.texture!,'id',id)
 const assets=[{id,size:side,file:id.slice(6)+'.bin'},...descriptor.tip.profile?.kind==='radialCurve'?[{id:descriptor.tip.profile.lookup,size:32,file:descriptor.tip.profile.lookup.slice(6)+'.bin'}]:[]]
 const library:unknown={schemaVersion:1,brushes:[{descriptor,name:'Self-authored engine7 mechanism',source:'self-authored-test',warnings:[]}],assets,skipped:[]}
 if(!paired7Shared.isBrushLibrary(library))throw Error('Invalid test library')
 const d=library.brushes[0].descriptor,sha=createHash('sha256').update(paired7Shared.canonicalBrushDescriptorJSON(d)).digest('hex'),data=paired7Shared.extractCanonicalTexturedAutoProgramData(d,{pattern:{id,size:side}});if(!data.supported)throw Error(data.reasons.join(','));if(data.data.version!==2||data.data.source.kind==='image')throw Error('Auto test data required')
 const binding=paired7Shared.canonicalTexturedAutoProgramBinding(d,sha,'neon64-f32-fma-v1',{id,size:side},paired7Shared.CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)
 installBrushPixels(id,gray);installBrushLibrary(library)
 return{buildup,descriptor:d,library,sha,binding,data,preset:'brush:'+d.id+'@1',pattern:{id,size:side},nativeSize:data.data.source.diameter*data.data.brush.scale}
}
function paired7Original(author=true,tail:readonly paired7Shared.Operation[]=[],snapshots:ReadonlyMap<string,ReturnType<typeof paired7Shared.canonicalStrokeSnapshotV7>>=new Map(),isCurrent=()=>true,author4=false,readRouting=false){
 const wire:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:512,canvasHeight:512,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[...tail],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalAuthorRasterProfile:paired7Shared.CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,...author4?{canonicalAuthorTexturedSource:'fixed-default-auto-texture-v4' as const}:{},...author?{canonicalAuthorTexturedAutoSource:paired7Token}:{},...readRouting?{canonicalTexturedAutoSource:paired7Token}:{},canonicalReadScope:{roomId:'room',boardEpoch:1,allowedRasterProfiles:[paired7Shared.CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE]},canonicalHistoryBase:{kind:'full-room-prefix-v2',roomId:'room',boardEpoch:1,throughSeq:tail.length,operationCount:tail.length},canonicalCapabilities:{version:1,roomId:'room',boardEpoch:1,capabilities:[...snapshots.values()].map(snapshot=>({originalUserId:tail.find(op=>op.type==='canonical_stroke'&&op.frame.strokeId===snapshot.strokeId)!.userId,snapshot})),bindings:tail.filter((op):op is CanonicalStrokeOperation=>op.type==='canonical_stroke').map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:[...snapshots.keys()].indexOf(op.frame.strokeId)}))}}
 return prepareCanonicalRoomState(wire,{expectedBoardId:'room',isCurrent})
}
function paired7EngineFor(p:ReturnType<typeof paired7Original>|CanonicalIndexedRead,service?:CanonicalSourceAuthorService,ops:paired7Shared.Operation[]=[]){
 const r=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:512,pageHeight:512,...('canonicalRead'in p?{canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations}}:{canonicalIndexedRoom:p}),...service?{canonicalAuthor:service,onLocalOperation:op=>ops.push(op)}:{}},{width:512,height:512}),engine=r.engine,gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
 Object.assign(gl,{bufferSubData:vi.fn(),getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,getAttribLocation:(_p:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),getShaderPrecisionFormat:()=>({precision:23,rangeMin:127,rangeMax:127}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},getTexParameter:(_t:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D)as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,getParameter:(key:number)=>key===9001?[0,0,512,512]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
 engine.initLayer('background');engine.initLayer('layer-1');engine.setCompositeOrder([{id:'layer-1',opacity:1}]);return engine
}
const paired7Packet=(x:number,t:number,pressure=.5):PointerData=>({x,y:20,pressure,tiltX:0,tiltY:0,speed:0,pointerType:'pen',timeStamp:t,dispatchTime:t})
function paired7Verdict(f:ReturnType<typeof paired7Fixture>,request:paired7Shared.CanonicalStrokeBegin,material:paired7Shared.CanonicalMaterialContextV7):Extract<paired7Shared.CanonicalStrokeBeginResult,{ok:true}>&{snapshot:ReturnType<typeof paired7Shared.canonicalStrokeSnapshotV7>}{expect(request.texturePhase).toEqual(material.primaryTexture.phase);return{ok:true,recordedNext:0,liveNext:0,ended:false,snapshot:paired7Shared.canonicalStrokeSnapshotV7({layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,boardEpoch:1,descriptorSha256:f.sha,rasterProfile:paired7Shared.CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,composition:{mode:f.buildup?'buildup':'wash',outerBlend:'over',alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity},assets:material.assets,materialVersion:7,material},1,paired7Shared.CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)}}

it('rejects future eligible7 buildup preparation before resource reservation without the preselected mixed role',async()=>{
 const f=paired7Fixture(true,true),p=paired7Original(),begin=vi.fn(async()=>{throw Error('Unexpected BEGIN')}),engine=paired7EngineFor(p,{texturedAutoSource:paired7Token,begin})
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(f.preset);engine.setSize(f.nativeSize);engine.setLocked(false)
  const cpu=engine['_brushMipCache'].reservedBytes,reserve=vi.spyOn(engine['_brushMipCache'],'reserve'),prepare=vi.spyOn(engine['_canonicalLayerOwner']!.prepass,'prepare')
  await expect(engine.prepareBrush(f.preset)).rejects.toThrow('preselected mixed owner')
  expect(reserve).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled();expect(begin).not.toHaveBeenCalled();expect(engine['_canonicalPreparedAuthor']).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBe(cpu)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('rechecks the prepared original7 buildup role before START reservation, roots or BEGIN',async()=>{
 const f=paired7Fixture(true,true),p=paired7Original(),begin=vi.fn(async()=>{throw Error('Unexpected BEGIN')}),engine=paired7EngineFor(p,{texturedAutoSource:paired7Token,begin})
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);const owner=engine['_canonicalLayerOwner']!;owner.previewPublication=true
  engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(f.preset);engine.setSize(f.nativeSize);engine.setLocked(false)
  expect(await engine.prepareBrush(f.preset)).toEqual({status:'ready'});expect(engine['_canonicalPreparedAuthor']?.material.kind).toBe('texturedAuto')
  owner.previewPublication=undefined;const cpu=engine['_brushMipCache'].reservedBytes,reserve=vi.spyOn(engine['_brushMipCache'],'reserve')
  expect(()=>engine['_onStart'](paired7Packet(20,0))).toThrow('preselected mixed owner')
  expect(reserve).not.toHaveBeenCalled();expect(begin).not.toHaveBeenCalled();expect(owner.bank).toBeUndefined();expect(engine['_authorInput'].pending).toBe(false);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0);expect(engine['_brushMipCache'].reservedBytes).toBe(cpu)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

async function paired7AcceptedBuildup(routed=false,buildup=true){
 const f=paired7Fixture(true,buildup),p=paired7Original(true,[],new Map(),()=>true,false,routed),ops:paired7Shared.Operation[]=[],snapshots=new Map<string,ReturnType<typeof paired7Shared.canonicalStrokeSnapshotV7>>()
 const engine=paired7EngineFor(p,{texturedAutoSource:paired7Token,begin:async(request,lifetime)=>{const reply=paired7Verdict(f,request,lifetime.expectedMaterialContext7!);snapshots.set(request.strokeId,reply.snapshot);return reply}},ops)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);if(!routed)engine['_canonicalLayerOwner']!.previewPublication=true
  engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(f.preset);engine.setSize(f.nativeSize);engine.setLocked(false)
  expect(await engine.prepareBrush(f.preset)).toEqual({status:'ready'})
  engine['_onStart'](paired7Packet(20,0,.2));engine['_onMove'](paired7Packet(36,10,1));engine['_onEnd'](paired7Packet(36,20,1))
  await vi.waitFor(()=>expect(ops.length).toBeGreaterThan(0),{timeout:10000});await vi.waitFor(()=>expect(engine.hasActiveCanonicalAuthor()).toBe(false),{timeout:10000})
  const frames=ops.filter((op):op is CanonicalStrokeOperation=>op.type==='canonical_stroke').map((op,i)=>({...op,seq:i+1}))
  expect(frames.length).toBe(ops.length);expect(frames.some(op=>paired7Shared.decodeCanonicalRecordedSnapshotFrame(op.frame,snapshots.get(op.frame.strokeId)!,op.frame.frameOrdinal).frame.fences.some(f=>f.kind==='gestureEnd'))).toBe(true)
  expect(frames.every(op=>op.frame.composition.mode===(buildup?'buildup':'wash')&&op.frame.composition.outerBlend==='over')).toBe(true)
  return{f,frames,snapshots}
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
}
it('prepares and closes actual native7 OVER originals through the private live mixed owner',async()=>{
 const {frames,snapshots}=await paired7AcceptedBuildup(),p=paired7Original(false),engine=paired7EngineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);const owner=engine['_canonicalLayerOwner']!;owner.previewPublication=true
  const stable=owner.stable
  for(const op of frames){const scope=p.canonicalRead.scope,attachment=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:op.userId,snapshot:snapshots.get(op.frame.strokeId)!}],bindings:[{operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}]},[op],scope),input=attachCanonicalRecordedDelivery(attachment[0],scope);if(!('delivery'in input))throw Error('Expected issued original7');expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input)}
  await vi.waitFor(()=>expect(engine['_canonicalReadReady']()).toBe(true),{timeout:10000})
  expect(engine['_canonicalLayerOwner']).toBe(owner);expect(owner.stable).not.toBe(stable);expect(engine['_layers'].get('layer-1')).toBe(owner.stable);expect(owner.derived).toBeUndefined();expect(owner.coordinator).toBeUndefined();expect(owner.failed).toBe(false);expect(engine['_log'].entries).toHaveLength(frames.length)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it.each([false,true])('inventories native7 OVER full history but execution requires the preselected private role=%s',async enabled=>{
 const {frames,snapshots}=await paired7AcceptedBuildup(),p=paired7Original(false,frames,snapshots),engine=paired7EngineFor(p)
 try{
  await engine.paperReady();const restored=engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations),tx=engine['_canonicalEmptyTransaction']!,candidate=tx.jobs[0]
  const prepare=vi.spyOn(candidate.prepass,'prepare');if(enabled)candidate.previewPublication=true
  if(!enabled){await expect(restored).rejects.toThrow();expect(prepare).not.toHaveBeenCalled();expect(engine['_log'].entries).toHaveLength(0)}
  else{await restored;const owner=engine['_canonicalLayerOwner']!;expect(owner.previewPublication).toBe(true);expect(owner.coordinator).toBeUndefined();expect(owner.derived).toBeUndefined();expect(engine['_layers'].get('layer-1')).toBe(owner.stable);expect(engine['_canonicalReadReady']()).toBe(true);expect(engine['_log'].entries).toHaveLength(frames.length)}
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('consumes actual native7 indexed originals and publishes the genuine accepted cut through the private role',async()=>{
 const {f,frames,snapshots}=await paired7AcceptedBuildup(),issuer=indexedSocketFixture(frames,64)
 Reflect.set(issuer.offer,'authorRasterProfile',paired7Shared.CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE);Reflect.set(issuer.offer.scope,'allowedRasterProfiles',[paired7Shared.CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE]);issuer.offer.roomGeometry.width=512;issuer.offer.roomGeometry.height=512
 const attachment=(rows:readonly CanonicalStrokeOperation[])=>({version:1 as const,roomId:'room',boardEpoch:2,capabilities:rows.length?[{originalUserId:rows[0].userId,snapshot:paired7Shared.canonicalStrokeSnapshotV7({...snapshots.get(rows[0].frame.strokeId)!,boardEpoch:2},2,paired7Shared.CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)}]:[],bindings:rows.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}))})
 const next=issuer.handlers.canonical_history_stream_next;issuer.handlers.canonical_history_stream_next=async body=>{const reply=await next(body);if(!reply||typeof reply!=='object'||!('value'in reply)||!reply.value||typeof reply.value!=='object')throw Error('Missing issued indexed page');const rows=frames.slice(Number(body.afterSeq),Number(body.afterSeq)+64);return{...reply,value:{...reply.value,canonicalCapabilities:attachment(rows)}}}
 issuer.handlers.canonical_history_stream_evidence=body=>({ok:true,value:{kind:'canonical-indexed-history-root-evidence-v1',streamId:body.streamId,throughSeq:frames.length,root:body.root,rows:[frames[0],frames.at(-1)!],canonicalCapabilities:attachment([frames[0],frames.at(-1)!]),first:0,terminal:1,lastMetadata:null,latestRedo:null,firstUndoAfterLatestRedo:null,ownBranchAfterUndo:null}})
 const resources=vi.spyOn(paired7Assets,'prepareCanonicalImageAssets').mockImplementation(async(room,assets,current)=>{current();expect(room).toBe('room');expect(assets).toHaveLength(1);expect(assets[0]).toMatchObject(f.pattern);expect(isBrushAssetReady(f.pattern.id,f.pattern.size)).toBe(true);expect(createHash('sha256').update(importedAssetPixels(f.pattern.id)).digest('hex')).toBe(f.pattern.id.slice(6));current()})
 const read=await issuer.open(),engine=paired7EngineFor(read)
 try{const restored=engine.restoreCanonicalIndexedRoom(read),candidate=engine['_canonicalEmptyTransaction']!.jobs[0];candidate.previewPublication=true;await restored;expect(engine.getCanonicalIndexedCut()?.throughSeq).toBe(frames.length);expect(resources).toHaveBeenCalled();expect(engine['_canonicalReadReady']()).toBe(true);expect(engine['_canonicalLayerOwner']!.coordinator).toBeUndefined()}
 finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it('keeps historical material2 buildup outside the source7 private inventory path',()=>{
 const {state:wire}=state(),op=wire.tailOperations[0]
 wire.canonicalHistoryBase={kind:'full-room-prefix-v2',roomId:'room',boardEpoch:2,throughSeq:1,operationCount:1}
 if(op.type!=='canonical_stroke')throw Error('Expected actual canonical fixture')
 Reflect.set(op.frame.composition,'mode','buildup')
 const capability=wire.canonicalCapabilities!.capabilities[0];Reflect.set(capability.snapshot.composition,'mode','buildup')
 // Either ingress rejects the historical composition, or the actual engine
 // constructor must reject its inventory before any private role can exist.
 expect(()=>{const p=prepareCanonicalRoomState(wire,{expectedBoardId:'room',isCurrent:()=>true});const {engine}=engineFor(p);try{throw Error('Unexpected historical buildup inventory accepted')}finally{engine.destroy()}}).toThrow(/Unsupported|Invalid|unsupported|invalid/)
})
it('rejects non-OVER native7 originals at the normal captured snapshot boundary',async()=>{
 const {frames,snapshots}=await paired7AcceptedBuildup(),raw=structuredClone(snapshots.get(frames[0].frame.strokeId)!)
 Reflect.set(raw.composition,'outerBlend','multiply')
 expect(()=>paired7Shared.canonicalStrokeSnapshotV7(raw,1,paired7Shared.CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)).toThrow()
})

function routed7Original(author=false,tail:readonly paired7Shared.Operation[]=[],snapshots:ReadonlyMap<string,ReturnType<typeof paired7Shared.canonicalStrokeSnapshotV7>>=new Map()){
 return paired7Original(author,tail,snapshots,()=>true,false,true)
}
it.each([false,true])('selects mixed before first allocation/input from original READ7, author=%s',async author=>{
 const p=routed7Original(author),engine=paired7EngineFor(p)
 try{
  const make=vi.fn(engine['_makeLayerBuffer'].bind(engine));engine['_makeLayerBuffer']=make
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  expect(make).toHaveBeenCalled();expect(engine['_canonicalLayerOwner']!.previewPublication).toBe(true)
  expect(p.canonicalRead.texturedAutoSource).toBe(paired7Token);expect(p.canonicalRead.authorTexturedAutoSource).toBe(author?paired7Token:undefined)
  expect(engine['_canonicalReadReady']()).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('does not select mixed from author7 alone or absent historical marker',async()=>{
 for(const author of [false,true]){
  const p=paired7Original(author),engine=paired7EngineFor(p)
  try{await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);expect(engine['_canonicalLayerOwner']!.previewPublication).toBeUndefined()}
  finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
 }
})
it('routes actual author7 buildup and reader-only live originals without a private flag write',async()=>{
 const {frames,snapshots}=await paired7AcceptedBuildup(true),p=routed7Original(),engine=paired7EngineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!;expect(owner.previewPublication).toBe(true);expect(p.canonicalRead.authorTexturedAutoSource).toBeUndefined()
  for(const op of frames){const scope=p.canonicalRead.scope,attachment=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:op.userId,snapshot:snapshots.get(op.frame.strokeId)!}],bindings:[{operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}]},[op],scope),input=attachCanonicalRecordedDelivery(attachment[0],scope);if(!('delivery'in input))throw Error('Expected issued original');expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input)}
  await vi.waitFor(()=>expect(engine['_canonicalReadReady']()).toBe(true),{timeout:10000});expect(owner.coordinator).toBeUndefined();expect(owner.failed).toBe(false)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('restores actual OVER full originals through original read routing only',async()=>{
 const {frames,snapshots}=await paired7AcceptedBuildup(true),p=routed7Original(false,frames,snapshots),engine=paired7EngineFor(p)
 try{await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);expect(engine['_canonicalLayerOwner']!.previewPublication).toBe(true);expect(engine['_canonicalReadReady']()).toBe(true);expect(engine['_log'].entries).toHaveLength(frames.length)}
 finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it('routes actual native7 indexed originals from original READ7 with authorOFF and no private flag write',async()=>{
 const {f,frames,snapshots}=await paired7AcceptedBuildup(true),issuer=indexedSocketFixture(frames,64)
 Reflect.set(issuer.offer,'authorRasterProfile',paired7Shared.CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE);Reflect.set(issuer.offer.scope,'allowedRasterProfiles',[paired7Shared.CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE]);issuer.offer.roomGeometry.width=512;issuer.offer.roomGeometry.height=512
 const attachment=(rows:readonly CanonicalStrokeOperation[])=>({version:1 as const,roomId:'room',boardEpoch:2,capabilities:rows.length?[{originalUserId:rows[0].userId,snapshot:paired7Shared.canonicalStrokeSnapshotV7({...snapshots.get(rows[0].frame.strokeId)!,boardEpoch:2},2,paired7Shared.CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)}]:[],bindings:rows.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}))})
 const next=issuer.handlers.canonical_history_stream_next;issuer.handlers.canonical_history_stream_next=async body=>{const reply=await next(body);if(!reply||typeof reply!=='object'||!('value'in reply)||!reply.value||typeof reply.value!=='object')throw Error('Missing issued indexed page');const rows=frames.slice(Number(body.afterSeq),Number(body.afterSeq)+64);return{...reply,value:{...reply.value,canonicalCapabilities:attachment(rows)}}}
 issuer.handlers.canonical_history_stream_evidence=body=>({ok:true,value:{kind:'canonical-indexed-history-root-evidence-v1',streamId:body.streamId,throughSeq:frames.length,root:body.root,rows:[frames[0],frames.at(-1)!],canonicalCapabilities:attachment([frames[0],frames.at(-1)!]),first:0,terminal:1,lastMetadata:null,latestRedo:null,firstUndoAfterLatestRedo:null,ownBranchAfterUndo:null}})
 Reflect.set(issuer.offer,'texturedAutoSource',paired7Token)
  for(const event of ['canonical_history_stream_open','canonical_history_stream_reopen']){const previous=issuer.handlers[event];issuer.handlers[event]=async body=>{const reply=await previous(body)as{ok:true;value:object};return{...reply,value:{...reply.value,texturedAutoSource:paired7Token}}}}
  const resources=vi.spyOn(paired7Assets,'prepareCanonicalImageAssets').mockImplementation(async(room,assets,current)=>{current();expect(room).toBe('room');expect(assets).toHaveLength(1);expect(assets[0]).toMatchObject(f.pattern);expect(isBrushAssetReady(f.pattern.id,f.pattern.size)).toBe(true);expect(createHash('sha256').update(importedAssetPixels(f.pattern.id)).digest('hex')).toBe(f.pattern.id.slice(6));current()})
 const read=await issuer.open(),engine=paired7EngineFor(read)
 try{const restored=engine.restoreCanonicalIndexedRoom(read);expect(engine['_canonicalEmptyTransaction']!.jobs[0].previewPublication).toBe(true);await restored;expect(engine.getCanonicalIndexedCut()?.throughSeq).toBe(frames.length);expect(resources).toHaveBeenCalled();expect(engine['_canonicalReadReady']()).toBe(true);expect(engine['_canonicalLayerOwner']!.coordinator).toBeUndefined()}
 finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)


it('selects original mixed read before WASH-first history then later buildup7',async()=>{
 const wash=await paired7AcceptedBuildup(true,false),build=await paired7AcceptedBuildup(true),frames=[...wash.frames,...build.frames.map((op,i)=>({...op,seq:wash.frames.length+i+1}))],snapshots=new Map([...wash.snapshots,...build.snapshots]),p=routed7Original(false,frames,snapshots),engine=paired7EngineFor(p)
 try{await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);expect(frames[0].frame.composition.mode).toBe('wash');expect(frames.at(-1)!.frame.composition.mode).toBe('buildup');expect(engine['_canonicalLayerOwner']!.previewPublication).toBe(true);expect(engine['_canonicalReadReady']()).toBe(true);expect(engine['_log'].entries).toHaveLength(frames.length)}
 finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('rejects unsupported routing DATA before hidden buffers or GL preparation',async()=>{
 const p=paired7Original(),engine=paired7EngineFor(p)
 try{
  await engine.paperReady();const old=engine['_layers'],make=vi.fn(engine['_makeLayerBuffer'].bind(engine));engine['_makeLayerBuffer']=make
  const gl=vi.fn(engine['_initGL'].bind(engine));engine['_initGL']=gl
  // A copied interface is intentionally NOT a minted read. This tests the
  // early ownDATA routing boundary and cannot grant reading or publication.
  const candidate=Object.create(p.canonicalRead);Object.defineProperty(candidate,'texturedAutoSource',{value:'textured-auto-material-v7'})
  const plan={...engine['_canonicalEmptyAdmission']!,originalRead:candidate,profile:CANONICAL_STROKE_RASTER_PROFILE}
  await expect(engine['_beginCanonicalEmpty'](plan,old,engine['_log'].revision,new OperationLog())).rejects.toThrow()
  expect(make).not.toHaveBeenCalled();expect(gl).not.toHaveBeenCalled();expect(engine['_layers']).toBe(old);expect(engine['_canonicalEmptyTransaction']).toBeUndefined()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

function routingEmptyIndexed(){
 const f=indexedSocketFixture([])
 Reflect.set(f.offer,'authorRasterProfile',paired7Shared.CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE);Reflect.set(f.offer.scope,'allowedRasterProfiles',[paired7Shared.CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE]);f.offer.roomGeometry.width=512;f.offer.roomGeometry.height=512;Reflect.set(f.offer,'texturedAutoSource',paired7Token)
 for(const event of ['canonical_history_stream_open','canonical_history_stream_reopen']){const previous=f.handlers[event];f.handlers[event]=async body=>{const reply=await previous(body)as{ok:true;value:object};return{...reply,value:{...reply.value,texturedAutoSource:paired7Token}}}}
 return f
}
it.each(['follow','recovery']as const)('rejects copied %s read routing mismatch before next page or hidden allocation',async mode=>{
 const f=routingEmptyIndexed(),read=await f.open(),engine=paired7EngineFor(read)
 try{
  await engine.restoreCanonicalIndexedRoom(read);const cut=engine.getCanonicalIndexedCut()!
  const original=mode==='follow'?await read.lifetime.follow(cut):await read.lifetime.reopen(cut)
  // Explicit copied-interface negative; the underlying original cursor remains
  // genuinely minted. No copy is used to produce inputs or accepted cuts.
  const candidate={...original,assertCurrent(){original.assertCurrent(original)},cancel(){return original.cancel()}}
  Reflect.deleteProperty(candidate,'texturedAutoSource')
  const next=vi.fn(()=>original.nextPage());candidate.nextPage=next
  const make=vi.fn(engine['_makeLayerBuffer'].bind(engine));engine['_makeLayerBuffer']=make
  if(mode==='recovery'){
   const lost=vi.spyOn(engine['gl'],'isContextLost').mockReturnValue(true);engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));lost.mockReturnValue(false)
   await expect(engine.restoreCanonicalIndexedRoom(candidate)).rejects.toThrow()
  }else await expect(engine.appendCanonicalIndexedContinuation(candidate)).rejects.toThrow()
  expect(next).not.toHaveBeenCalled();expect(make).not.toHaveBeenCalled()
  await original.cancel()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
