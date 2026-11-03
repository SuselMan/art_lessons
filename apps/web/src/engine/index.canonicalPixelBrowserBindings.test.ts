import {afterEach,expect,it,vi} from 'vitest'
import {SourceStrokeAuthor} from './src/presets/sourceStrokeAuthor'
import {SourceStrokeMaterialAdapter,createPixelTextureMaterialAdapter} from './src/presets/sourceStrokeMaterialAdapter'
import {SourceCanonicalFrameEncoder,createPixelTextureFrameEncoder} from './src/presets/sourceCanonicalFrameEncoder'
import {createHash} from 'node:crypto'
import {inflateSync} from 'node:zlib'
import originals from './src/presets/fixtures/pixelBrowserBindings.native.json'
import {canonicalBrushDescriptorJSON,canonicalSourceStrokeSnapshotV2,canonicalSourceMaterialContext,canonicalStandaloneStrokeSnapshotV8,canonicalPixelSourceComposition,decodeCanonicalRecordedSnapshotFrameV8,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as B,type BrushDescriptor,type CanonicalStrokeBegin,type CanonicalStrokeBeginResult,type CanonicalStrokeSnapshotV2,type CanonicalStrokeSnapshotV8,type Operation,type ServerToClientEvents} from '@grafetto/shared'
import {createTestEngine} from './testing/engineTestUtils'
import type {CanonicalSourceAuthorService} from './index'
import {installBrushLibrary,installBrushPixels} from './src/presets/importedBrushes'
import {prepareCanonicalRoomState} from '../pages/Room/net/canonicalRoomState'
import type {PointerData} from './src/input/PointerInput'
afterEach(()=>vi.restoreAllMocks())
const packet=(x:number,timeStamp:number):PointerData=>({x,y:2,pressure:.6,tiltX:15,tiltY:20,speed:0,pointerType:'pen',timeStamp,dispatchTime:timeStamp})
async function setup(kind:'dual'|'texture'|'bitmap-auto',begin:CanonicalSourceAuthorService['begin'],modifiers=false,maskedAuthor=true,recordedColor=false){
 const row=originals.rows[kind==='dual'?0:kind==='texture'?1:2],descriptor=structuredClone(row.descriptor) as unknown as BrushDescriptor
 if(recordedColor){if(!descriptor.sourceStamp)throw Error('Original source required');Object.assign(descriptor.sourceStamp.settings,{'ColorSource/Type':'uniform_random'});const mask=descriptor.behavior?.dual?.brush.sourceStamp;if(mask)Object.assign(mask.settings,{'ColorSource/Type':'uniform_random'})}
 if(kind!=='bitmap-auto')descriptor.id='imported-'+(kind==='dual'?(recordedColor?'c3':'c1'):'c2').repeat(16)
 let assets=row.assets.map(a=>{if(!a.id.startsWith('asset:'))throw Error('Original CAS asset required');return{...a,id:a.id as `asset:${string}`}})
 if('coverage'in row&&row.coverage)installBrushPixels(row.coverage.id,new Uint8Array(inflateSync(Buffer.from(row.coverage.deflateBase64,'base64'))))
 if(kind==='texture'){
  // Keep original compiled2 queries/geometry; explicitly replace only artwork
  // with a self-authored L8 pattern and a distinct immutable descriptor ID.
  const pixels=Uint8Array.from({length:8*8},(_,i)=>(i*31+17)%256),id='asset:'+createHash('sha256').update(pixels).digest('hex')
  const t=descriptor.texture!;descriptor.texture={id:id as `asset:${string}`,strength:t.strength,periodPx:8,patternSize:{width:8,height:8},offset:{x:0,y:0,randomX:false,randomY:false},application:t.application!}
  assets=assets.filter(a=>a.id!==t.id);assets.push({id:id as `asset:${string}`,size:8,file:id.slice(6)+'.bin'});installBrushPixels(id,pixels)
 }
 const preset='brush:'+descriptor.id+'@'+descriptor.version+(modifiers?':flat:fixed':''),sha=createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex')
 installBrushLibrary({schemaVersion:1,brushes:[{descriptor,name:'Derived '+kind+' browser integration',source:'actual compiled2 metadata, derived resource identity',warnings:[]}],assets,skipped:[]})
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:32,canvasHeight:32,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalAuthorRasterProfile:B,canonicalImageMaterialSource:'pixel-image-material-v1',canonicalAuthorImageMaterialSource:'pixel-image-material-v1',canonicalPlainAutoGeometrySource:'dynamic-auto-geometry-v1',canonicalAuthorPlainAutoGeometrySource:'dynamic-auto-geometry-v1',canonicalPrimaryGrainSource:'primary-grain-image-v1',canonicalAuthorPrimaryGrainSource:'primary-grain-image-v1',canonicalPixelMaskedSource:'pixel-masked-v1',...maskedAuthor?{canonicalAuthorPixelMaskedSource:'pixel-masked-v1' as const}:{},canonicalReadScope:{roomId:'room',boardEpoch:2,allowedRasterProfiles:[B]},canonicalHistoryBase:{kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:0,operationCount:0}}
 const p=prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent:()=>true}),operations:Operation[]=[]
 const r=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:32,pageHeight:32,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations},canonicalAuthor:{authorImageMaterialSource:'pixel-image-material-v1',authorPlainAutoGeometrySource:'dynamic-auto-geometry-v1',authorPrimaryGrainSource:'primary-grain-image-v1',...maskedAuthor?{authorPixelMaskedSource:'pixel-masked-v1' as const}:{},begin},onLocalOperation:op=>operations.push(op)},{width:32,height:32}),engine=r.engine
 const gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
 Object.assign(gl,{bufferSubData:vi.fn(),getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,getAttribLocation:(_p:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),getShaderPrecisionFormat:()=>({precision:23,rangeMin:127,rangeMax:127}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},getTexParameter:(_t:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,getParameter:(key:number)=>key===9001?[0,0,32,32]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
 engine.initLayer('background');engine.initLayer('layer-1');engine.setCompositeOrder([{id:'layer-1',opacity:1}]);engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(12);engine.setLocked(false)
 await engine.paperReady();await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
 return{engine,p,operations,preset,sha,descriptor}
}
it.each([{kind:'dual',modifiers:false},{kind:'dual',modifiers:true},{kind:'texture',modifiers:false},{kind:'bitmap-auto',modifiers:false}] as const)('prepares actual browser $kind (UI modifiers=$modifiers) under all named policies through START and encoded END',async({kind,modifiers})=>{
 let snapshot!:CanonicalStrokeSnapshotV2|CanonicalStrokeSnapshotV8
 const begin=vi.fn(async(request:CanonicalStrokeBegin,lifetime:Parameters<CanonicalSourceAuthorService['begin']>[1]):Promise<CanonicalStrokeBeginResult>=>{
  const material=lifetime.expectedSourceMaterialContext2??lifetime.expectedMaterialContext8
  if(!material)throw Error('Actual START material required')
  const composition=canonicalPixelSourceComposition(h.descriptor,B);if(!composition)throw Error('Original composition required')
  const raw={layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,boardEpoch:2,descriptorSha256:lifetime.expectedDescriptorSha256,rasterProfile:B,pigmentRgb8:request.pigmentRgb8,composition:{...composition,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity},assets:material.assets,materialVersion:material.version,material}
  snapshot=material.version===8?canonicalStandaloneStrokeSnapshotV8(raw,2,B):canonicalSourceStrokeSnapshotV2(raw,2,B)
  return{ok:true,snapshot,recordedNext:0,liveNext:0,ended:false}
 })
 const h=await setup(kind,begin,modifiers),{engine}=h
 try{
  expect(await engine.prepareBrush(h.preset)).toEqual({status:'ready'})
  const prepared=engine['_canonicalPreparedAuthor']!;expect(prepared.material.kind).toBe(kind==='dual'?'masked':kind==='texture'?'pixelTexture':'auto')
  if(kind==='bitmap-auto'){expect(h.descriptor.tip.kind).toBe('bitmap');expect(prepared.material.kind).toBe('auto');expect(prepared.imageLease).toBeUndefined();if(prepared.material.kind==='auto')expect(prepared.material.pin.coverageProfile).toBe('seeded-auto-mask-browser-v1')}
  if(prepared.material.kind==='masked'){
   const p=prepared.material.context.primarySource,m=prepared.material.context.maskSource!
   if(m.kind!=='softAuto')throw Error('Original Auto+Soft dual required')
   if(p.kind!=='image')expect(p.coverageProfile).toBe('browser-number-coverage-v1');expect(m.coverageProfile).toBe('browser-number-coverage-v1')
   expect(m.compilerProfile).toBe(h.descriptor.behavior!.dual!.brush.sourceStamp!.compiled!.profile)
  }else if(prepared.material.kind==='pixelTexture')expect(prepared.material.binding.source.kind!=='image'&&prepared.material.binding.source.coverageProfile).toBe('browser-number-coverage-v1')
  engine['_onStart'](packet(2,100));engine['_onMove'](packet(8,112));engine['_onEnd'](packet(8,124))
  await vi.waitFor(()=>{if(engine['_authorInputError']!==undefined)throw engine['_authorInputError'];expect(begin).toHaveBeenCalledOnce()},{timeout:5000})
  await vi.waitFor(()=>{if(engine['_authorInputError']!==undefined)throw engine['_authorInputError'];expect(engine.hasActiveCanonicalAuthor()).toBe(false);expect(h.operations.length).toBeGreaterThan(0)},{timeout:5000})
  const frames=h.operations.map(op=>{if(op.type!=='canonical_stroke')throw Error('Actual source operation required');expect(op.frame.rasterProfile).toBe(B);return decodeCanonicalRecordedSnapshotFrameV8(op.frame,snapshot,op.frame.frameOrdinal).frame})
  expect(frames.reduce((n,f)=>n+f.draws.length,0)).toBeGreaterThan(0);expect(frames.flatMap(f=>f.fences).filter(f=>f.kind==='gestureEnd')).toHaveLength(1)
  if(kind==='bitmap-auto')for(const recipe of frames.flatMap(f=>[...f.definitions])){if(!('kind'in recipe)||recipe.kind!=='defaultAuto')throw Error('Actual default Auto recipe required');expect(recipe.coverageProfile).toBe('seeded-auto-mask-browser-v1');expect(Number.isInteger(recipe.maskSeed)).toBe(true);expect(recipe.sourceSlot).toBe(0)}
  if(kind==='dual')expect(new Set(frames.flatMap(f=>f.draws).map(d=>d.role))).toEqual(new Set(['primary','mask']))
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
},15000)

it('rejects a changed original mask in a real browser dual BEGIN before local frames',async()=>{
 const begin=vi.fn(async(request:CanonicalStrokeBegin,lifetime:Parameters<CanonicalSourceAuthorService['begin']>[1]):Promise<CanonicalStrokeBeginResult>=>{
  const original=lifetime.expectedSourceMaterialContext2
  if(!original?.maskSource||original.maskSource.kind!=='softAuto')throw Error('Actual Soft mask required')
  const material=canonicalSourceMaterialContext({...original,maskSource:{...original.maskSource,brushAngle:original.maskSource.brushAngle+.1}})
  const composition=canonicalPixelSourceComposition(h.descriptor,B);if(!composition)throw Error('Original composition required')
  const snapshot=canonicalSourceStrokeSnapshotV2({layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,boardEpoch:2,descriptorSha256:lifetime.expectedDescriptorSha256,rasterProfile:B,pigmentRgb8:request.pigmentRgb8,composition:{...composition,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity},assets:material.assets,materialVersion:2,material},2,B)
  return{ok:true,snapshot,recordedNext:0,liveNext:0,ended:false}
 })
 const h=await setup('dual',begin),{engine}=h
 try{
  expect(await engine.prepareBrush(h.preset)).toEqual({status:'ready'})
  engine['_onStart'](packet(2,100));engine['_onMove'](packet(8,112));engine['_onEnd'](packet(8,124))
  await vi.waitFor(()=>expect(begin).toHaveBeenCalledOnce(),{timeout:5000})
  await vi.waitFor(()=>expect(engine.hasActiveCanonicalAuthor()).toBe(false),{timeout:5000})
  expect(engine['_authorInputError']).toBeDefined();expect(h.operations).toHaveLength(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
},15000)

it('does not use the image author grant as a fallback for a bitmap dual when masked author is absent',async()=>{
 const begin=vi.fn(),h=await setup('dual',begin,false,false),{engine}=h
 try{await expect(engine.prepareBrush(h.preset)).rejects.toThrow('Masked author original policy missing');expect(begin).not.toHaveBeenCalled();expect(h.operations).toHaveLength(0)}finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})


it.each(['dual','texture','bitmap-auto'] as const)('coalesces only named Pixel %s remainders and preserves independently decoded source DRAW/fence/pigment/RNG order',async kind=>{
 let snapshot!:CanonicalStrokeSnapshotV2|CanonicalStrokeSnapshotV8
 const begin=vi.fn(async(request:CanonicalStrokeBegin,lifetime:Parameters<CanonicalSourceAuthorService['begin']>[1]):Promise<CanonicalStrokeBeginResult>=>{
  const material=lifetime.expectedSourceMaterialContext2??lifetime.expectedMaterialContext8
  if(!material)throw Error('Actual named START context required')
  const composition=canonicalPixelSourceComposition(h.descriptor,B);if(!composition)throw Error('Captured composition required')
  const raw={layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,boardEpoch:2,descriptorSha256:lifetime.expectedDescriptorSha256,rasterProfile:B,pigmentRgb8:request.pigmentRgb8,composition:{...composition,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity},assets:material.assets,materialVersion:material.version,material}
  snapshot=material.version===8?canonicalStandaloneStrokeSnapshotV8(raw,2,B):canonicalSourceStrokeSnapshotV2(raw,2,B)
  return{ok:true,snapshot,recordedNext:0,liveNext:0,ended:false}
 })
 const h=await setup(kind,begin,false,true,kind==='dual'),{engine}=h
 const clock=vi.spyOn(performance,'now').mockReturnValue(0),inputs=[packet(1,100),{...packet(100,110),pressure:.85}]
 try{
  await engine.prepareBrush(h.preset)
  const prepared=engine['_canonicalPreparedAuthor']!
  engine['_onStart'](inputs[0]);const session=engine['_authorProducer']!;engine['_onMove'](inputs[1]);engine['_onEnd']({...inputs[1],timeStamp:120})
  await vi.waitFor(()=>{if(engine['_authorInputError']!==undefined)throw engine['_authorInputError'];expect(engine.hasActiveCanonicalAuthor()).toBe(false);expect(h.operations.length).toBeGreaterThan(0)},{timeout:5000})
  const operations=h.operations.filter((op):op is Extract<Operation,{type:'canonical_stroke'}>=>op.type==='canonical_stroke'),decoded=operations.map(op=>decodeCanonicalRecordedSnapshotFrameV8(op.frame,snapshot,op.frame.frameOrdinal).frame)
  expect(decoded.reduce((n,f)=>n+f.draws.length,0)).toBeGreaterThan(12)
  expect(decoded.find(f=>f.draws.length)!.draws).toHaveLength(1) // First material is never delayed for a larger cut.
  expect(decoded.some(f=>f.draws.length>=3)).toBe(true) // RED: old pump cuts cannot batch this remainder.
  expect(operations.map(o=>o.frame.frameOrdinal)).toEqual(operations.map((_,i)=>i))
  const source=session.source!,author=new SourceStrokeAuthor(prepared.program),seeded=prepared.program.roles.some(role=>role.geometry&&role.geometry.kind!=='image'&&role.geometry.coverageProfile==='seeded-auto-mask-browser-v1')
  let state=author.createState(source.seeds.sequentialSeed,source.seeds.strokeSeed,source.state!.initialAngle,source.authorColors,seeded?{strokeId:snapshot.strokeId,descriptorSha256:prepared.sha}:undefined)
  const adapter=snapshot.materialVersion===8?createPixelTextureMaterialAdapter(prepared.program,snapshot.material,state):new SourceStrokeMaterialAdapter(prepared.program,snapshot.material,state)
  const encoder=snapshot.materialVersion===8?createPixelTextureFrameEncoder({brush:snapshot.brush,strokeId:snapshot.strokeId,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,rasterProfile:snapshot.rasterProfile,materialVersion:8,material:snapshot.material}):new SourceCanonicalFrameEncoder(snapshot)
  const baseline:typeof decoded=[]
  const capture=(chunks:ReadonlyArray<ReturnType<typeof adapter.finish>[number]>)=>{for(const chunk of chunks)baseline.push(decodeCanonicalRecordedSnapshotFrameV8(encoder.encode(chunk.packed).envelope,snapshot,encoder.nextFrameOrdinal-1).frame)}
  const consume=(iterator:ReturnType<typeof author.plan>)=>{for(;;){const step=iterator.next();if(step.done){state=step.value;return}state=step.value.state;capture(adapter.accept(step.value));const cut=adapter.flush();if(cut)capture([cut])}}
  for(const input of inputs){capture(adapter.beginInput(state));consume(author.plan(state,{x:input.x,y:input.y,t:input.timeStamp-source.timestamp,pressure:input.pressure,tiltX:input.tiltX,tiltY:input.tiltY,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false}))}
  capture(adapter.beginInput(state));consume(author.finish(state));capture(adapter.finish(state))
  const events=(frames:typeof decoded)=>frames.flatMap(frame=>Array.from({length:frame.draws.length+1},(_,at)=>[...frame.fences.filter(f=>f.at===at).map(({at:_offset,...fence})=>({fence})),...at<frame.draws.length?[{draw:{...frame.draws[at],definition:undefined,recipe:frame.definitions[frame.draws[at].definition]}}]:[]]).flat())
  expect(events(decoded)).toEqual(events(baseline));expect(source.state).toEqual(state);expect(decoded.length).toBeLessThan(baseline.length)
  expect(decoded.flatMap(f=>f.fences).filter(f=>f.kind==='gestureEnd')).toHaveLength(1)
  if(kind==='dual'){expect(new Set(decoded.flatMap(f=>f.draws).map(d=>d.role))).toEqual(new Set(['primary','mask']));expect(new Set(decoded.flatMap(f=>f.draws).map(d=>JSON.stringify(d.sourcePigmentRGB))).size).toBeGreaterThan(1);expect(snapshot.material.colorParams).toBe('source-pigment-rgb8-v1')}
  expect(engine['_authorInput'].pending).toBe(false);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)
 }finally{clock.mockRestore();engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
