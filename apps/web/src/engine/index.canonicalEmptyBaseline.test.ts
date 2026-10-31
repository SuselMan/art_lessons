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
 try{engine.initLayer('background');engine.initLayer('layer-1');const result=await engine.restoreCanonicalEmptyRoom(read,tail);expect(result.committed).toBe(true);expect(engine.rasterVersion).toBe('straight-rgba8-v1');expect(engine.getOperations()).toHaveLength(0)}finally{engine.destroy()}
})
it('rejects copied original-owner metadata before touching the canvas',()=>{
 const p=original(true),get=vi.fn(()=>{throw Error('Canvas touched')}),canvas=new Proxy({} as HTMLCanvasElement,{get})
 expect(()=>new PencilEngine(canvas,{rasterVersion:'straight-rgba8-v1',pageWidth:8,pageHeight:8,canonicalEmptyRoom:{read:{...p.canonicalRead},tail:p.tailOperations}})).toThrow('Canonical empty history base unavailable');expect(get).not.toHaveBeenCalled()
})
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
it('runs a real ended source frame through the actual RebuildJob/coordinator/services and publishes original log proof with straight pixels',async()=>{
 const p=original(),{engine}=engineFor(p),old=engine['_layers'],draw=vi.spyOn(engine['gl'],'drawArrays'),visible=vi.spyOn(engine['_passes'],'transform'),finish=vi.spyOn(engine['gl'],'finish')
 try{
  const result=await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  expect(result.committed).toBe(true);expect(result.cleanupFailures).toEqual([]);expect(draw).toHaveBeenCalled();engine['_drawCompositeItem'](exactFrame({x:0,y:0,width:8,height:8}),'layer-1',1,engine['_assemblyFBO'].fbo,8,8);expect(visible).toHaveBeenCalled();expect(finish).not.toHaveBeenCalled()
  expect(engine['_layers']).not.toBe(old);expect(engine['_layers'].get('layer-1')?.pixelEncoding).toBe('straight-rgba8')
  expect(engine['_log'].entries[0].canonicalInput).toBe(p.canonicalRead.preparedAtoms[0]);expect(engine['_log'].entries[0].serverSeq).toBe(1)
  expect(engine['_rebuildJobs'].size).toBe(0);expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)
 }finally{engine.destroy()}
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
 }finally{engine.destroy()}
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
 }finally{engine.destroy()}
})
it('returns a committed result with cleanup diagnostics and attempts all old owners after one old retirement fails',async()=>{
 const p=original(),{engine}=engineFor(p),old=engine['_layers'],primary=new Error('old layer retirement failed'),buffers=[...old.values()],retire=buffers[0].destroy.bind(buffers[0])
 vi.spyOn(buffers[0],'destroy').mockImplementation(()=>{retire();old.delete('layer-1');throw primary});const second=vi.spyOn(buffers[1],'destroy')
 try{
  const result=await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  expect(result.committed).toBe(true);expect(result.cleanupFailures).toContain(primary);expect(second).toHaveBeenCalledOnce()
  expect(engine['_layers']).not.toBe(old);expect(engine['_log'].entries).toHaveLength(1);expect(engine['_log'].entries[0].serverSeq).toBe(1)
 }finally{engine.destroy()}
})

it('keeps a committed original prefix closed after context restoration instead of silently running legacy replay',async()=>{
 const p=original(),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const replay=vi.spyOn(engine,'_syncBuffersToLog' as never),init=vi.spyOn(engine,'_initGL' as never),texture=vi.spyOn(engine['gl'],'deleteTexture'),framebuffer=vi.spyOn(engine['gl'],'deleteFramebuffer')
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}))
  vi.spyOn(engine['gl'],'isTexture').mockReturnValue(false);Object.assign(engine['gl'],{isProgram:()=>false});vi.spyOn(engine['gl'],'isBuffer').mockReturnValue(false)
  engine['_handleContextRestored']()
  expect(engine['_contextLost']).toBe(true);expect(init).not.toHaveBeenCalled();expect(replay).not.toHaveBeenCalled()
  expect(engine['_log'].entries[0].serverSeq).toBe(1);expect(engine.bakeNetworkSnapshot('layer-1')).toBeNull()
  expect(()=>engine['_makeTileRebuilder']('layer-1')()).toThrow('recovery required')
  texture.mockClear();framebuffer.mockClear();engine.destroy()
  expect(texture.mock.calls.every(([name])=>name===null)).toBe(true);expect(framebuffer.mock.calls.every(([name])=>name===null)).toBe(true)
 }finally{engine.destroy()}
})
it('preserves a real GPU draw failure and retires partially written unpublished storage before rejecting',async()=>{
 const p=original(),{engine}=engineFor(p),old=engine['_layers'],primary=new Error('canonical draw failed')
 await engine.paperReady
 const draw=CanonicalRgba8CompositePass.prototype.drawSource
 vi.spyOn(CanonicalRgba8CompositePass.prototype,'drawSource').mockImplementationOnce(function(this:CanonicalRgba8CompositePass,...args){draw.apply(this,args);throw primary})
 try{
  await expect(engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)).rejects.toBe(primary)
  expect(engine['_layers']).toBe(old);expect(engine['_log'].entries).toHaveLength(0)
  expect(engine['_rebuildJobs'].size).toBe(0);expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)
 }finally{engine.destroy()}
})

it('retires an adopted first candidate when creating the second implicit layer fails before publication',async()=>{
 const p=original(),{engine}=engineFor(p),old=engine['_layers'],primary=new Error('second implicit candidate failed'),make=engine['_makeLayerBuffer'].bind(engine),first=make(),destroy=vi.spyOn(first,'destroy')
 engine['_makeLayerBuffer']=vi.fn<typeof engine['_makeLayerBuffer']>().mockImplementationOnce(()=>first).mockImplementationOnce(()=>{throw primary})
 try{
  await expect(engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)).rejects.toBe(primary)
  expect(destroy).toHaveBeenCalledOnce();expect(engine['_layers']).toBe(old);expect(engine['_log'].entries).toHaveLength(0)
  expect(engine['_rebuildJobs'].size).toBe(0);expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes.live).toBe(0)
 }finally{engine.destroy()}
})
