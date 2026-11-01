import {BrushMipCache} from './src/dabs/BrushMipCache'
import {afterEach,expect,it,vi} from 'vitest'
import {inflateSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {buildCanonicalMaterial,canonicalBrushDescriptorJSON,canonicalImageSourceBinding,canonicalImagePipeSourceBinding,sourceImageTransformMetadata,sourcePngRasterShape,isBrushLibrary,CANONICAL_STROKE_RASTER_PROFILE as P,type Operation,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type ServerToClientEvents} from '@grafetto/shared'
import basic from './src/presets/fixtures/sourcePngWholePath/guiStroke.native.json'
import graphite from './src/presets/fixtures/sourceImagePipe/pencilRandom.native.json'
import mountains from './src/presets/fixtures/sourceImagePipe/mountains.native.json'
import {installBrushPixels,clearImportedBrushPixels} from './src/presets/importedBrushes'
import {prepareCanonicalRoomState} from '../pages/Room/net/canonicalRoomState'
import {prepareCanonicalRecordedAttachment} from '@grafetto/shared'
import {attachCanonicalRecordedDelivery} from '../pages/Room/net/canonicalRecordedDelivery'
import {createTestEngine} from './testing/engineTestUtils'
const fixtures=[{name:'Basic6',data:basic,assets:[basic.asset]},{name:'Graphite',data:graphite,assets:graphite.assets},{name:'Mountains',data:mountains,assets:mountains.assets}]
afterEach(()=>{vi.restoreAllMocks();clearImportedBrushPixels()})
function captures(){
 const library:unknown={schemaVersion:1,assets:fixtures.flatMap(f=>f.assets.map(a=>({id:a.id,size:a.size,file:a.id.slice(6)+'.bin'}))),skipped:[],brushes:fixtures.map(f=>({descriptor:f.data.descriptor,name:f.name,source:'original.kpp',warnings:[]}))}
 if(!isBrushLibrary(library))throw Error('Invalid retained actual source fixtures')
 return fixtures.map((f,index)=>{
  const descriptor=library.brushes[index].descriptor,assets=f.assets.map(({id,size,x,y,width,height})=>({id,size,x,y,width,height})),pin=descriptor.tip.animation?canonicalImagePipeSourceBinding(descriptor,assets):canonicalImageSourceBinding(descriptor,assets[0])
  for(const a of f.assets){const bytes=new Uint8Array(inflateSync(Buffer.from(a.deflateBase64,'base64'),{maxOutputLength:a.size*a.size}));expect('asset:'+createHash('sha256').update(bytes).digest('hex')).toBe(a.id);installBrushPixels(a.id,bytes)}
  const material={version:2 as const,...pin,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}
  const snapshot:CanonicalStrokeSnapshotV2={layerId:'layer-1',brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:'required-'+index,boardEpoch:1,descriptorSha256:createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex'),rasterProfile:P,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'},assets:material.assets,materialVersion:2,material}
  return{snapshot,pin,descriptor}
 })
}
function operations(c:ReturnType<typeof captures>[number],offset=0,scale=1){
 const s=c.snapshot,asset=c.pin.assets[0],source=c.pin.primarySource,m=sourceImageTransformMetadata(asset.width,asset.height,sourcePngRasterShape({width:asset.width,height:asset.height,scale:source.brushScale,angle:source.brushAngle},{scale,ratio:1,rotation:0}),0,0)
 const recipe={kind:'image' as const,asset:asset.id,brushScale:source.brushScale,brushAngle:source.brushAngle,scale,ratio:1,rotation:0,subX:0,subY:0,width:m.width,height:m.height,mirrorH:false,mirrorV:false}
 return[0,1].map((ordinal):CanonicalStrokeOperation=>({id:'source-'+offset+'-'+ordinal,userId:'author',timestamp:ordinal,seq:offset+ordinal+1,type:'canonical_stroke',layerId:'layer-1',frame:{version:1,rasterProfile:P,brush:s.brush,strokeId:s.strokeId,frameOrdinal:ordinal,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked:buildCanonicalMaterial(ordinal===0?{masked:false,entry:{phase:'between'},draws:[],fences:[]}:{masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:0,y:0,opacity:.7,flow:.6}],fences:[{at:0,kind:'segmentBegin',group:0},{at:1,kind:'primaryEnd',group:0},{at:1,kind:'segmentEnd',group:0},{at:1,kind:'gestureEnd'}]},s.material).packed}}))
}
function original(cs:ReturnType<typeof captures>,tail:Operation[]=cs.flatMap((c,i)=>operations(c,i*2)),current=()=>true){
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:512,canvasHeight:512,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:tail,participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:1},canonicalHistoryBase:{kind:'full-room-prefix-v2',roomId:'room',boardEpoch:1,throughSeq:tail.length,operationCount:tail.length},...(tail.length?{canonicalCapabilities:{version:1 as const,roomId:'room',boardEpoch:1,capabilities:cs.map(c=>({originalUserId:'author',snapshot:c.snapshot})),bindings:tail.flatMap(op=>op.type==='canonical_stroke'?[{operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:cs.findIndex(c=>c.snapshot.strokeId===op.frame.strokeId)}]:[])}}:{})}
 return prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent:current})
}
function engineFor(p:ReturnType<typeof original>,author=false){
 const r=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:512,pageHeight:512,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations},...(author?{canonicalAuthor:{begin:async()=>{throw Error('Unexpected BEGIN')}},onLocalOperation:vi.fn()}: {})},{width:512,height:512}),engine=r.engine,gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
 Object.assign(gl,{bufferSubData:vi.fn(),getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,getAttribLocation:(_p:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),getShaderPrecisionFormat:()=>({precision:23}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},getTexParameter:(_t:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,getParameter:(key:number)=>key===9001?[0,0,512,512]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
 engine.initLayer('background');engine.initLayer('layer-1');engine.setCompositeOrder([{id:'layer-1',opacity:1}]);return r
}


it('restores all3 original image pins using91 original source levels within existing budgets',async()=>{
 const cs=captures(),p=original(cs),{engine}=engineFor(p)
 try{await engine.paperReady();await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!
  expect(bank.jobs).toHaveLength(91);expect(bank.gpuBytes).toBe(5673304);expect(owner.coordinator).toBeUndefined();expect(engine['_canonicalExportReady']()).toBe(true)
  expect(engine['_log'].entries).toHaveLength(6);for(const [i,entry]of engine['_log'].entries.entries())expect(entry.canonicalInput).toBe(p.canonicalRead.preparedAtoms[i])
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('adds empty then nonempty original hot image input to the same sufficiently warm owner',async()=>{
 const all=captures(),cs=all.slice(0,1),large=all[2],p=original([large],operations(large)),{engine}=engineFor(p)
 try{await engine.paperReady();await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const before=engine['_canonicalLayerOwner']!.bank!,epoch=engine['_canonicalLayerOwner']!.prepass.preparedCapacity().epoch
  const ops=operations(cs[0],2),scope=p.canonicalRead.scope
  for(const op of ops){const atom=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot:cs[0].snapshot}],bindings:[{operationId:op.id,sequence:op.seq!,originalUserId:'author',capability:0}]},[op],scope)[0],input=attachCanonicalRecordedDelivery(atom,scope)
   if(!('delivery'in input))throw Error('Missing original input')
   expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});expect(engine['_canonicalLayerOwner']!.bank).toBe(before);expect(before.gpuBytes).toBe(5658656+816);expect(before.jobs).toHaveLength(49);expect(engine['_canonicalLayerOwner']!.prepass.preparedCapacity().epoch).toBe(epoch)
   engine.appendOriginalRecorded(input);await vi.waitFor(()=>expect(engine['_canonicalLayerOwner']!.coordinator?.pending??false).toBe(false),{timeout:12000})
  }
  expect(engine['_log'].entries).toHaveLength(4);expect(engine['_canonicalExportReady']()).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('does not admit a wider shared scale recipe merely because its high source level exists',()=>{
 const cs=captures().slice(0,1),p=original(cs,operations(cs[0],0,2))
 expect(()=>engineFor(p)).toThrow('admitted source')
})

it('releases lexical source metadata on constructor failure and preserves an undefined first error over cleanup failure',()=>{
 const cs=captures().slice(0,1),p=original(cs),reserve=BrushMipCache.prototype.reserve,cleanup=Error('later metadata release failed');const captured:{owner?:BrushMipCache}={};let caught=false,failure:unknown='not thrown'
 vi.spyOn(BrushMipCache.prototype,'reserve').mockImplementation(function(this:BrushMipCache,bytes:number){
  captured.owner=this
  if(bytes===1024)throw undefined
  const release=reserve.call(this,bytes)
  return()=>{release();if(bytes===16384+1536)throw cleanup}
 })
 try{engineFor(p)}catch(error){caught=true;failure=error}
 expect(caught).toBe(true);expect(failure).toBeUndefined();expect(captured.owner?.reservedBytes).toBe(0)
})

it('merges two synthetic original pins sharing one CAS crop at different admitted native scales',async()=>{
 const first=captures()[0],primarySource={...first.pin.primarySource,brushScale:.1},material={...first.snapshot.material,primarySource}
 const second={...first,pin:{...first.pin,primarySource},snapshot:{...first.snapshot,strokeId:'second-native-size',material}}
 const p=original([first,second]),{engine}=engineFor(p)
 try{await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);const bank=engine['_canonicalLayerOwner']!.bank!;expect(bank.jobs).toHaveLength(6);expect(bank.gpuBytes).toBe(2580);expect(new Set(bank.jobs.map(j=>{if(j.kind!=='native-image')throw new Error('Expected native image source');return j.resource.id}))).toEqual(new Set([first.pin.assets[0].id]));expect(engine['_log'].entries.map(e=>e.canonicalInput)).toEqual(p.canonicalRead.preparedAtoms)}finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it.each([false,true])('retains the whole source suffix union across original undo and redo metadata (redo=%s)',async redo=>{
 const cs=captures(),tail:Operation[]=cs.flatMap((c,i)=>operations(c,i*2)),targetOpId=tail[0].id
 tail.push({type:'operation_undo',id:'undo',userId:'author',timestamp:10,seq:tail.length+1,targetOpId})
 if(redo)tail.push({type:'operation_redo',id:'redo',userId:'author',timestamp:11,seq:tail.length+1,targetOpId})
 const p=original(cs,tail),{engine}=engineFor(p)
 try{await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);const owner=engine['_canonicalLayerOwner']!;expect(owner.bank!.gpuBytes).toBe(5673304);expect(owner.bank!.jobs).toHaveLength(91);expect(engine['_log'].entries).toHaveLength(tail.length);expect(engine['_canonicalExportReady']()).toBe(true)}finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
