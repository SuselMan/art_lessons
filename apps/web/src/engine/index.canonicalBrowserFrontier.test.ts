import {createHash} from 'node:crypto'
import stock from '../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import {installBrushLibrary} from './src/presets/importedBrushes'
import {attachCanonicalRecordedDelivery} from '../pages/Room/net/canonicalRecordedDelivery'
import type {PointerData} from './src/input/PointerInput'
import {CanonicalRgba8CompositePass} from './src/dabs/CanonicalRgba8CompositePass'
afterEach(()=>vi.restoreAllMocks())
import {afterEach,expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as browser,canonicalBrushDescriptorJSON,canonicalDefaultAutoSourceBinding,prepareCanonicalRecordedAttachment,type CanonicalRecordedAttachmentV1,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type BrushDescriptor,type CanonicalStrokeBegin,type CanonicalStrokeBeginResult,type Operation,type ServerToClientEvents} from '@grafetto/shared'
import {prepareCanonicalRoomState} from '../pages/Room/net/canonicalRoomState'
import {PencilEngine} from './index'
import {createTestEngine} from './testing/engineTestUtils'

function original(tail:CanonicalStrokeOperation[]=[],capabilities?:CanonicalRecordedAttachmentV1){
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:8,canvasHeight:8,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:2,allowedRasterProfiles:[browser]},canonicalAuthorRasterProfile:browser,canonicalHistoryBase:{kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:0,operationCount:0}}
 state.tailOperations=tail;state.canonicalCapabilities=capabilities;state.canonicalHistoryBase={kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:tail.length,operationCount:tail.length}
 const p=prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent:()=>true})
 return p
}
it('rejects mismatched geometry before canvas access for the original browser read',()=>{
 const p=original()
 const get=vi.fn(()=>{throw Error('Canvas touched')}),canvas=new Proxy({}as HTMLCanvasElement,{get})
 expect(()=>new PencilEngine(canvas,{rasterVersion:'straight-rgba8-v1',pageWidth:9,pageHeight:8,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations}})).toThrow('Canonical original room geometry mismatch')
 expect(get).not.toHaveBeenCalled()
})

it('admits the original browser empty room into the actual engine and restores its empty stable layer',async()=>{const p=original(),{engine}=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:8,pageHeight:8,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations}},{width:8,height:8});try{engine.initLayer('background');engine.initLayer('layer-1');await engine.paperReady();await expect(engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)).resolves.toMatchObject({committed:true});expect(engine['_canonicalLayerOwner']?.plan.profile).toBe(browser)}finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}})

const descriptor=stock.rows.find(row=>row.index===4)!.descriptor as unknown as BrushDescriptor
const preset='brush:'+descriptor.id+'@'+descriptor.version
const sha=createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex')
const pin=canonicalDefaultAutoSourceBinding(descriptor,sha,'browser-number-coverage-v1',browser)
function verdict(request:CanonicalStrokeBegin):CanonicalStrokeBeginResult{return{ok:true,recordedNext:0,liveNext:0,ended:false,snapshot:{layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,boardEpoch:2,descriptorSha256:sha,rasterProfile:browser,composition:{mode:'wash',alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity,outerBlend:'over'},assets:[],materialVersion:2,material:{version:2,assets:[],primarySource:pin,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}}}}
function packet(x:number,timeStamp:number):PointerData{return{x,y:2,pressure:.5,tiltX:0,tiltY:0,speed:0,pointerType:'pen',timeStamp,dispatchTime:timeStamp}}
async function harness(begin:(request:CanonicalStrokeBegin,lifetime:{signal:AbortSignal;isCurrent:()=>boolean})=>Promise<CanonicalStrokeBeginResult>,selected=descriptor,p=original()){
 installBrushLibrary({schemaVersion:1,brushes:[{descriptor:selected,name:'native Basic2Opacity',source:'native',warnings:[]}],assets:[],skipped:[]})
 const snapshots=new Map<string,CanonicalStrokeSnapshotV2>()
 const acceptedBegin=async(request:CanonicalStrokeBegin,lifetime:{signal:AbortSignal;isCurrent:()=>boolean})=>{const reply=await begin(request,lifetime);if(reply.ok&&'materialVersion'in reply.snapshot&&reply.snapshot.materialVersion===2)snapshots.set(request.strokeId,reply.snapshot);return reply}
 const operations:Operation[]=[],r=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:8,pageHeight:8,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations},canonicalAuthor:{begin:acceptedBegin},onLocalOperation:op=>operations.push(op)},{width:8,height:8}),engine=r.engine,gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
 Object.assign(gl,{getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,getAttribLocation:(_p:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),getShaderPrecisionFormat:()=>({precision:23}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},getTexParameter:(_t:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,getParameter:(key:number)=>key===9001?[0,0,8,8]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
 engine.initLayer('background');engine.initLayer('layer-1');engine.setCompositeOrder([{id:'layer-1',opacity:1}]);engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil('brush:'+selected.id+'@'+selected.version);engine.setSize(40);engine.setLocked(false)
 await engine.paperReady();await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
 return{engine,operations,p,snapshots}
}
function confirmed(h:Awaited<ReturnType<typeof harness>>,op:Operation,seq:number){
 if(op.type!=='canonical_stroke')throw Error('Expected outgoing source frame')
 const snapshot=h.snapshots.get(op.frame.strokeId);if(!snapshot)throw Error('Missing actual accepted BEGIN snapshot')
 const operation:CanonicalStrokeOperation={...op,seq}
 const atom=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:op.userId,snapshot}],bindings:[{operationId:op.id,sequence:seq,originalUserId:op.userId,capability:0}]},[operation],h.p.canonicalRead.scope)[0]
 const input=attachCanonicalRecordedDelivery(atom,h.p.canonicalRead.scope)
 if(!('delivery'in input))throw Error('Missing original confirmed delivery')
 return input
}

it('authors browser pointer40 local ink before original ACK, promotes without redeposit, and closes stale recovery safely',async()=>{
 const h=await harness(async request=>verdict(request)),{engine,operations}=h
 try{
  expect((await engine.prepareBrush(preset)).status).toBe('ready')
  const draw=vi.spyOn(CanonicalRgba8CompositePass.prototype,'drawSource')
  engine['_onStart'](packet(1,100));engine['_onMove'](packet(5,110));engine['_onEnd'](packet(5,120))
  await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false),{timeout:5000});await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0),{timeout:5000})
  expect(operations.length).toBeGreaterThan(0);expect(engine['_log'].entries).toHaveLength(0);expect(engine['_canonicalLayerOwner']?.coordinator?.presentationReady).toBe(true)
  for(const op of operations){if(op.type!=='canonical_stroke')throw Error('Frame expected');expect(op.frame.rasterProfile).toBe(browser);expect(op.frame.version).toBe(2)}
  expect(draw.mock.calls.some(([r])=>r.operation.kind==='alphaDarkenBrowserFloat')).toBe(true)
  const deposited=()=>draw.mock.calls.filter(([r])=>r.source.kind==='maskRgb').length,before=deposited()
  for(let i=0;i<operations.length;i++)engine.appendOriginalRecorded(confirmed(h,operations[i],i+1))
  await vi.waitFor(()=>expect(engine['_canonicalLayerOwner']?.coordinator).toBeUndefined(),{timeout:5000})
  expect(deposited()).toBe(before);expect(engine['_log'].entries.map(e=>e.op.id)).toEqual(operations.map(op=>op.id))
  const repair=vi.fn();engine['_onCanonicalRecoveryRequired']=repair
  const lost=vi.spyOn(engine['gl'],'isContextLost').mockReturnValue(true)
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));lost.mockReturnValue(false);engine['_handleContextRestored']()
  await vi.waitFor(()=>expect(repair).toHaveBeenCalledOnce());expect(engine['_canonicalPixelsReady']).toBe(false);expect(String(repair.mock.calls[0][0])).toContain('Newest canonical full baseline required')
  const tail=operations.map((op,i)=>{if(op.type!=='canonical_stroke')throw Error('Frame expected');return{...op,seq:i+1}})
  const snapshot=h.snapshots.get(tail[0].frame.strokeId);if(!snapshot)throw Error('Captured BEGIN required')
  const full=original(tail,{version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:tail[0].userId,snapshot}],bindings:tail.map(op=>({operationId:op.id,sequence:op.seq,originalUserId:op.userId,capability:0}))})
  const fresh=await harness(async request=>verdict(request),descriptor,full),restored=fresh.engine
  try{
    const entries=restored['_log'].entries,revision=restored['_log'].revision,finish=vi.spyOn(restored['gl'],'finish')
    restored['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));restored['_handleContextRestored']()
    await vi.waitFor(()=>expect(restored['_canonicalPixelsReady']).toBe(true),{timeout:5000})
    expect(restored['_log'].entries).toBe(entries);expect(restored['_log'].revision).toBe(revision);expect(entries.map(e=>e.op.id)).toEqual(tail.map(op=>op.id));expect(finish).not.toHaveBeenCalled();expect(restored['_canonicalLayerOwner']?.plan.profile).toBe(browser)
  }finally{restored.destroy();expect(restored['_brushMipCache'].reservedBytes).toBe(0)}

 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
})
it('cancels browser BEGIN before emission without local ink or journal effects',async()=>{
 let resolve!:(v:CanonicalStrokeBeginResult)=>void,request!:CanonicalStrokeBegin
 const {engine,operations}=await harness(r=>{request=r;return new Promise(done=>{resolve=done})})
 try{await engine.prepareBrush(preset);engine['_onStart'](packet(1,100));engine.setTool('pencil');resolve(verdict(request));await Promise.resolve();expect(operations).toHaveLength(0);expect(engine['_log'].entries).toHaveLength(0);expect(engine.hasActiveCanonicalAuthor()).toBe(false)}finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('rejects native coverage substituted into a browser BEGIN before local deposition or emission',async()=>{
 const nativePin=canonicalDefaultAutoSourceBinding(descriptor,sha,'neon64-f32-fma-v1')
 const {engine,operations}=await harness(async request=>{const result=verdict(request);if(!result.ok||!('materialVersion'in result.snapshot)||result.snapshot.materialVersion!==2)throw Error('V2 fixture');return{...result,snapshot:{...result.snapshot,material:{...result.snapshot.material,primarySource:nativePin}}}})
 try{await engine.prepareBrush(preset);const before=engine['_brushMipCache'].reservedBytes,draw=vi.spyOn(CanonicalRgba8CompositePass.prototype,'drawSource');engine['_onStart'](packet(1,100));engine['_onEnd'](packet(2,110));await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false));expect(operations).toHaveLength(0);expect(draw).not.toHaveBeenCalled();expect(engine['_log'].entries).toHaveLength(0);expect(engine['_brushMipCache'].reservedBytes).toBe(before)}finally{engine.destroy()}
})
