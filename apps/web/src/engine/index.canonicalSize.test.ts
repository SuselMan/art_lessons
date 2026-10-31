import {afterEach,expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {decodeCanonicalStrokeFrame,CANONICAL_STROKE_RASTER_PROFILE,canonicalBrushDescriptorJSON,canonicalGaussianAutoSourceBinding,prepareCanonicalRecordedAttachment,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type BrushDescriptor,type CanonicalStrokeBegin,type CanonicalStrokeBeginResult,type Operation} from '@grafetto/shared'
import stock from '../../../../packages/shared/src/fixtures/sourceGaussianAutoData/stock.mapped.native'
import {installBrushLibrary} from './src/presets/importedBrushes'
import {attachCanonicalRecordedDelivery} from '../pages/Room/net/canonicalRecordedDelivery'
import {prepareCanonicalRoomState} from '../pages/Room/net/canonicalRoomState'
import {createTestEngine} from './testing/engineTestUtils'
import type {ServerToClientEvents} from '@grafetto/shared'
import type {PointerData} from './src/input/PointerInput'
afterEach(()=>vi.restoreAllMocks())
function original(width=8,tail:CanonicalStrokeOperation[]=[],snapshot?:CanonicalStrokeSnapshotV2){
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:width,canvasHeight:8,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:tail,...snapshot?{canonicalCapabilities:{version:1 as const,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:tail[0].userId,snapshot}],bindings:tail.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}))}}:{},participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:2},canonicalHistoryBase:{kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:tail.length,operationCount:tail.length}}
 return prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent:()=>true})
}
const descriptor=stock.rows.find(row=>row.index===7)!.descriptor as unknown as BrushDescriptor
const preset='brush:'+descriptor.id+'@'+descriptor.version
const sha=createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex')
const pin=canonicalGaussianAutoSourceBinding(descriptor,sha,'neon64-f32-fma-v1')
function verdict(request:CanonicalStrokeBegin):CanonicalStrokeBeginResult{return{ok:true,recordedNext:0,liveNext:0,ended:false,snapshot:{layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,boardEpoch:2,descriptorSha256:sha,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,composition:{mode:'wash',alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity,outerBlend:'over'},assets:[],materialVersion:2,material:{version:2,assets:[],primarySource:pin,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}}}}
function packet(x:number,timeStamp:number):PointerData{return{x,y:2,pressure:.5,tiltX:0,tiltY:0,speed:0,pointerType:'pen',timeStamp,dispatchTime:timeStamp}}
async function harness(begin:(request:CanonicalStrokeBegin,lifetime:{signal:AbortSignal;isCurrent:()=>boolean})=>Promise<CanonicalStrokeBeginResult>,selected=descriptor,width=8,p=original(width)){
 installBrushLibrary({schemaVersion:1,brushes:[{descriptor:selected,name:'native Basic2Opacity',source:'native',warnings:[]}],assets:[],skipped:[]})
 const snapshots=new Map<string,CanonicalStrokeSnapshotV2>()
 const acceptedBegin=async(request:CanonicalStrokeBegin,lifetime:{signal:AbortSignal;isCurrent:()=>boolean})=>{const reply=await begin(request,lifetime);if(reply.ok&&'materialVersion'in reply.snapshot&&reply.snapshot.materialVersion===2)snapshots.set(request.strokeId,reply.snapshot);return reply}
 const operations:Operation[]=[],r=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:width,pageHeight:8,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations},canonicalAuthor:{begin:acceptedBegin},onLocalOperation:op=>operations.push(op)},{width,height:8}),engine=r.engine,gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
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
it('authors pressure-sized Gaussian ink and accepts original recorded deliveries with the same warm workspace',async()=>{
 const h=await harness(async r=>verdict(r)),{engine,operations}=h
 try{
  expect((await engine.prepareBrush(preset)).status).toBe('ready')
  const mask=engine['_canonicalLayerOwner']!.mask
  engine['_onStart']({...packet(1,100),pressure:.25})
  engine['_onMove']({...packet(5,120),pressure:.9})
  engine['_onEnd']({...packet(5,130),pressure:.9})
  await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false))
  expect(operations.length).toBeGreaterThan(0)
  const recipes=operations.flatMap(op=>{
   if(op.type!=='canonical_stroke')throw Error('Expected frame')
   const snapshot=h.snapshots.get(op.frame.strokeId)!
   return decodeCanonicalStrokeFrame(op.frame,{rasterProfile:snapshot.rasterProfile,brush:snapshot.brush,strokeId:snapshot.strokeId,frameOrdinal:op.frame.frameOrdinal,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,material:snapshot.material}).frame.definitions
  })
  expect(recipes.some(r=>r.scale<1)).toBe(true)
  expect(new Set(recipes.map(r=>r.scale)).size).toBeGreaterThan(1)
  expect(recipes.every(r=>r.scale>0&&r.scale<=1&&r.width<=mask.width&&r.height<=mask.height)).toBe(true)
  for(let i=0;i<operations.length;i++)engine.appendOriginalRecorded(confirmed(h,operations[i],i+1))
  await vi.waitFor(()=>expect(engine['_canonicalLayerOwner']?.coordinator).toBeUndefined(),{timeout:5000})
  expect(engine['_canonicalLayerOwner']!.mask).toBe(mask)
  expect(engine['_log'].entries).toHaveLength(operations.length)
  expect(engine['_log'].entries.every(e=>!!e.canonicalInput)).toBe(true)
  const tail=operations.map((op,i)=>{if(op.type!=='canonical_stroke')throw Error('Expected source frame');return {...op,seq:i+1}})
  const read=original(8,tail,h.snapshots.get(tail[0].frame.strokeId)!)
  const rebuilt=await harness(async r=>verdict(r),descriptor,8,read)
  try{expect(rebuilt.engine['_log'].entries.map(e=>e.serverSeq)).toEqual(tail.map(op=>op.seq));expect(rebuilt.engine['_canonicalPixelsReady']).toBe(true)}finally{rebuilt.engine.destroy()}

 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it.each(['oversize','negative','speed','empty','duplicate','rotation','scatter','mirror'] as const)('rejects unsupported Size frontier %s before BEGIN',async kind=>{
 const selected:BrushDescriptor={...descriptor,id:'imported-'+createHash('sha256').update(kind).digest('hex').slice(0,24),sourceStamp:{...descriptor.sourceStamp!,options:descriptor.sourceStamp!.options.map(option=>{
  if(option.id==='Size')return {...option,...kind==='oversize'?{max:2}:kind==='negative'?{min:-1}:kind==='speed'?{sensors:option.sensors.map(sensor=>({...sensor,id:'speed' as const}))}:kind==='empty'?{sensors:[]}:kind==='duplicate'?{sensors:[...option.sensors,...option.sensors]}:{}}
  return ['rotation','scatter','mirror'].includes(kind)&&option.id===({rotation:'Rotation',scatter:'Scatter',mirror:'Mirror'} as Record<string,string>)[kind]?{...option,checked:true}:option
 })}}
 const begin=vi.fn(async(r:CanonicalStrokeBegin)=>verdict(r)),h=await harness(begin,selected)
 const compile=vi.spyOn(h.engine['gl'],'createProgram'),bytes=h.engine['_brushMipCache'].reservedBytes
 try{await expect(h.engine.prepareBrush('brush:'+selected.id+'@'+selected.version)).rejects.toThrow(/Unsupported canonical/);expect(begin).not.toHaveBeenCalled();expect(compile).not.toHaveBeenCalled();expect(h.engine['_brushMipCache'].reservedBytes).toBe(bytes);expect(h.operations).toEqual([])}finally{h.engine.destroy()}
})
