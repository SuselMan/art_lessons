import {afterEach,expect,it,vi} from 'vitest'
import {inflateSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import fixture from './src/presets/fixtures/sourcePngWholePath/guiStroke.native.json'
import {canonicalBrushDescriptorJSON,canonicalSourceStrokeSnapshotV2,canonicalSourceMaterialTipGradient,decodeCanonicalStrokeFrame,prepareCanonicalRecordedAttachmentV8,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,type BrushDescriptor,type CanonicalStrokeBegin,type CanonicalStrokeBeginResult,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type Operation,type ServerToClientEvents} from '@grafetto/shared'
import {createTestEngine} from './testing/engineTestUtils'
import type {CanonicalSourceAuthorService} from './index'
import {installBrushLibrary,installBrushPixels} from './src/presets/importedBrushes'
import {prepareCanonicalRoomState} from '../pages/Room/net/canonicalRoomState'
import {attachCanonicalRecordedDelivery} from '../pages/Room/net/canonicalRecordedDelivery'
import {CanonicalMaskSourceBank} from './src/dabs/CanonicalMaskSourceBank'
import type {PointerData} from './src/input/PointerInput'

afterEach(()=>vi.restoreAllMocks())
const gray='asset:'+'ab'.repeat(32)
const selectedGradient=()=>({kind:'srgb8-linear-stops-v1' as const,stops:[{position:0,rgba:[19,83,221,31] as const},{position:.4,rgba:[240,17,61,127] as const},{position:1,rgba:[33,249,108,230] as const}]})
const packet=(x:number,timeStamp:number):PointerData=>({x,y:2,pressure:.6,tiltX:0,tiltY:0,speed:0,pointerType:'pen',timeStamp,dispatchTime:timeStamp})
function original(spatial:boolean,unequal=false){
 const d=structuredClone(fixture.descriptor) as unknown as BrushDescriptor
 // Each derived immutable original has a distinct catalog identity.
 d.id='imported-'+(unequal?'e3':spatial?'e1':'e2').repeat(16)
 d.tip.material={kind:'gradient',gray:gray as `asset:${string}`};delete d.tip.imageSampling
 if(!d.sourceStamp)throw Error('Existing compiled2 fixture required')
 // New named Pixel image admission consumes the explicit version2 source tag;
 // legacy untagged metadata must stay on its historical closed route.
 Object.assign(d.sourceStamp,{version:2,source:{kind:'image'}})
 const xml=d.sourceStamp.settings.brush_definition.split(String.fromCharCode(92,34)).join('"')
 Object.assign(d.sourceStamp.settings,{brush_definition:xml.replace(/brushApplication="[^"]*"/,'').replace(/<Brush\b/,'<Brush brushApplication="3"'),'ColorSource/Type':spatial?'total_random':'plain'})
 if(unequal){d.tip.animation={mode:'text-sequence-v1',frames:[d.tip.mask as `asset:${string}`,d.tip.mask as `asset:${string}`],sequence:[0,1,0,1],frameBounds:[{x:53/256,y:53/256,width:150/256,height:150/256},{x:10/256,y:20/256,width:12/256,height:200/256}]};d.tip.material={kind:'gradient',gray:gray as `asset:${string}`,grayFrames:[gray as `asset:${string}`,gray as `asset:${string}`]}}
 return d
}
async function setup(spatial:boolean,begin:CanonicalSourceAuthorService['begin'],unequal=false){
 const descriptor=original(spatial,unequal),preset='brush:'+descriptor.id+'@'+descriptor.version,sha=createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex')
 installBrushLibrary({schemaVersion:1,brushes:[{descriptor,name:'Derived Gradient integration fixture',source:'compiled2 mechanism variant',warnings:[]}],assets:[{id:fixture.asset.id as `asset:${string}`,size:256,file:fixture.asset.id.slice(6)+'.bin'},{id:gray as `asset:${string}`,size:256,file:gray.slice(6)+'.bin'}],skipped:[]})
 installBrushPixels(fixture.asset.id,new Uint8Array(inflateSync(Buffer.from(fixture.asset.deflateBase64,'base64'))))
 installBrushPixels(gray,Uint8Array.from({length:256*256},(_,i)=>(i*37+Math.floor(i/256)*11)%256))
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:32,canvasHeight:32,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalAuthorRasterProfile:G,canonicalImageMaterialSource:'pixel-image-material-v1',canonicalAuthorImageMaterialSource:'pixel-image-material-v1',canonicalReadScope:{roomId:'room',boardEpoch:2,allowedRasterProfiles:[G]},canonicalHistoryBase:{kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:0,operationCount:0}}
 const p=prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent:()=>true}),operations:Operation[]=[]
 const r=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:32,pageHeight:32,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations},canonicalAuthor:{authorImageMaterialSource:'pixel-image-material-v1',begin},onLocalOperation:op=>operations.push(op)},{width:32,height:32}),engine=r.engine
 const gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
 Object.assign(gl,{bufferSubData:vi.fn(),getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,getAttribLocation:(_p:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),getShaderPrecisionFormat:()=>({precision:23,rangeMin:127,rangeMax:127}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},getTexParameter:(_t:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,getParameter:(key:number)=>key===9001?[0,0,32,32]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
 engine.initLayer('background');engine.initLayer('layer-1');engine.setCompositeOrder([{id:'layer-1',opacity:1}]);engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(12);engine.setLocked(false)
 await engine.paperReady();await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
 return{engine,p,operations,preset,sha}
}
function verdict(request:CanonicalStrokeBegin,lifetime:Parameters<CanonicalSourceAuthorService['begin']>[1]):CanonicalStrokeBeginResult{
 const material=lifetime.expectedSourceMaterialContext2;if(!material)throw Error('Real START must provide original material')
 const snapshot=canonicalSourceStrokeSnapshotV2({layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,boardEpoch:2,descriptorSha256:lifetime.expectedDescriptorSha256,rasterProfile:G,pigmentRgb8:request.pigmentRgb8,composition:{mode:'wash',alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity,outerBlend:'over'},assets:material.assets,materialVersion:2,material},2,G)
 return{ok:true,snapshot,recordedNext:0,liveNext:0,ended:false}
}

it('captures real START tip/spatial resources before BEGIN and preserves them through accepted frames and original replay',async()=>{
 let resolve!:(value:CanonicalStrokeBeginResult)=>void,request!:CanonicalStrokeBegin,lifetime!:Parameters<CanonicalSourceAuthorService['begin']>[1],snapshot!:CanonicalStrokeSnapshotV2
 const begin=vi.fn((r:CanonicalStrokeBegin,l:Parameters<CanonicalSourceAuthorService['begin']>[1])=>{request=r;lifetime=l;return new Promise<CanonicalStrokeBeginResult>(done=>{resolve=done})})
 const h=await setup(true,begin),{engine}=h
 try{
  const selected=selectedGradient();engine.setSourceGradient(selected)
  expect((await engine.prepareBrush(h.preset)).status).toBe('ready')
  const prepared=engine['_canonicalPreparedAuthor']!;expect(prepared.sourceContext2?.primarySource).not.toHaveProperty('imageMaterial')
  const allocations=vi.spyOn(engine['gl'],'createTexture'),before=allocations.mock.calls.length
  engine['_onStart'](packet(2,100));engine['_onMove'](packet(7,112));engine['_onEnd'](packet(7,124))
  expect(allocations.mock.calls.length).toBe(before)
  await vi.waitFor(()=>expect(begin).toHaveBeenCalledTimes(1),{timeout:5000})
  expect(request.sourceColorFields).toEqual({primary:{kind:'total-random-rgb8-hash-v1'}})
  expect(request.sourceTipGradient?.rgba).toHaveLength(1024)
  const captured=canonicalSourceMaterialTipGradient(lifetime.expectedSourceMaterialContext2!)!
  expect(captured).toEqual(request.sourceTipGradient);expect(captured.rgba.slice(0,4)).toEqual([19,83,221,31])
  expect(engine['_authorProducer']?.source?.root7?.isReady()).toBe(true)
  expect(h.operations).toHaveLength(0)
  engine.setSourceGradient({kind:'srgb8-linear-stops-v1',stops:[{position:0,rgba:[255,0,0,255]},{position:1,rgba:[0,0,255,255]}]})
  const reply=verdict(request,lifetime);if(!reply.ok||!('materialVersion'in reply.snapshot)||reply.snapshot.materialVersion!==2)throw Error('Source2 snapshot required');snapshot=reply.snapshot
  resolve(reply)
  await vi.waitFor(()=>expect(engine.hasActiveCanonicalAuthor()).toBe(false),{timeout:5000})
  if(engine['_authorInputError']!==undefined)throw engine['_authorInputError']
  expect(h.operations.length).toBeGreaterThan(0)
  let draws=0
  for(const [i,op]of h.operations.entries()){
   if(op.type!=='canonical_stroke')throw Error('Expected encoded DRAW frame')
   expect(op.frame.sourceTipGradient).toEqual(captured);expect(op.frame.sourceColorFields).toEqual(request.sourceColorFields)
   const decoded=decodeCanonicalStrokeFrame(op.frame,{materialVersion:2,rasterProfile:G,brush:snapshot.brush,strokeId:snapshot.strokeId,frameOrdinal:op.frame.frameOrdinal,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,material:snapshot.material});draws+=decoded.frame.draws.length
   const recorded:CanonicalStrokeOperation={...op,seq:i+1}
   const atom=prepareCanonicalRecordedAttachmentV8({version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:op.userId,snapshot}],bindings:[{operationId:op.id,sequence:i+1,originalUserId:op.userId,capability:0}]},[recorded],h.p.canonicalRead.scope)[0]
   const input=attachCanonicalRecordedDelivery(atom,h.p.canonicalRead.scope);if(!('delivery'in input))throw Error('Original delivery required')
   await engine.prepareOriginalRecorded(input);engine.appendOriginalRecorded(input)
  }
  expect(draws).toBeGreaterThan(0);expect(canonicalSourceMaterialTipGradient(snapshot.material)).toEqual(captured)
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0),{timeout:5000})
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
})

it('cancels actual START gradient resource preparation before BEGIN without retaining the LUT or emitting frames',async()=>{
 const begin=vi.fn(async(r:CanonicalStrokeBegin,l:Parameters<CanonicalSourceAuthorService['begin']>[1])=>verdict(r,l)),h=await setup(false,begin),{engine}=h
 try{
  engine.setSourceGradient(selectedGradient());await engine.prepareBrush(h.preset)
  let cancelled=false
  const prepare=CanonicalMaskSourceBank.prototype.prepareRoot
  vi.spyOn(CanonicalMaskSourceBank.prototype,'prepareRoot').mockImplementation(function(this:CanonicalMaskSourceBank,...args:Parameters<CanonicalMaskSourceBank['prepareRoot']>){
   const ticket=prepare.apply(this,args)
   return{get status(){return ticket.status},jobs:ticket.jobs,
    prepareJob(index:number){if(!cancelled){cancelled=true;engine.setTool('pencil')}return ticket.prepareJob(index)},
    assertCurrent:()=>ticket.assertCurrent(),assertPreparedPublication:()=>ticket.assertPreparedPublication(),preparedResources:()=>ticket.preparedResources(),publish:()=>ticket.publish(),finalizeCleanup:()=>ticket.finalizeCleanup(),cancel:(lost?:boolean)=>ticket.cancel(lost)}
  })
  engine['_onStart'](packet(2,100));engine['_onMove'](packet(7,112))
  await vi.waitFor(()=>{if(!cancelled&&engine['_authorInputError']!==undefined)throw engine['_authorInputError'];expect(cancelled).toBe(true)},{timeout:1000})
  await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false),{timeout:5000})
  expect(begin).not.toHaveBeenCalled();expect(h.operations).toHaveLength(0);expect(engine['_authorProducer']).toBeUndefined()
  expect(engine['_canonicalLayerOwner']?.resourceCandidate).toBeUndefined()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
})

it('prepares unequal original frame crops sharing one alpha CAS without reducing them to the representative row',async()=>{
 const begin=vi.fn(async(r:CanonicalStrokeBegin,l:Parameters<CanonicalSourceAuthorService['begin']>[1])=>verdict(r,l)),h=await setup(false,begin,true),{engine}=h
 try{
  expect((await engine.prepareBrush(h.preset)).status).toBe('ready')
  const prepared=engine['_canonicalPreparedAuthor'];if(prepared?.material.kind!=='imageMaterial')throw Error('Named image PREP required')
  expect(prepared.material.pin.primarySource.frameBounds).toEqual(prepared.material.binding.source.frameBounds)
  expect(prepared.material.pin.primarySource.frames).toEqual([fixture.asset.id,fixture.asset.id])
  const resources=prepared.imageLease?.preparedResources()??[]
  const frames=resources.filter(r=>r.canonical).map(r=>({frame:r.canonical?.frameIndex,slot:r.canonical?.sourceSlot,width:r.canonical?.asset.width,height:r.canonical?.asset.height}))
  expect(frames).toContainEqual({frame:0,slot:0,width:150,height:150})
  expect(frames).toContainEqual({frame:1,slot:0,width:12,height:200})
  expect(resources.every(r=>r.canonical?.asset.id!==gray)).toBe(true)
  expect(begin).not.toHaveBeenCalled();expect(h.operations).toHaveLength(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
