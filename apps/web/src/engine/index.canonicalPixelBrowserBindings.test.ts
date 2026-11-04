import {installScalarPowerAssetFetch} from './testing/scalarPowerTestAssets'
import {attachCanonicalRecordedDelivery} from '../pages/Room/net/canonicalRecordedDelivery'
import {prepareCanonicalRecordedAttachmentV8} from '@grafetto/shared'
import watercSpreadMetadata from './src/presets/fixtures/pixelWaterCSpreadPreparation.metadata.json'
import charcoalOriginals from './src/presets/fixtures/pixelTexturedDualAvailability.metadata.json'
import {CanonicalFrameExecutor} from './src/dabs/CanonicalFrameExecutor'
import dryCreasesMetadata from './src/presets/fixtures/pixelDryCreasesPreparation.metadata.json'
import {afterEach,expect,it,vi} from 'vitest'
import {SourceStrokeAuthor} from './src/presets/sourceStrokeAuthor'
import {SourceStrokeMaterialAdapter,createPixelTextureMaterialAdapter} from './src/presets/sourceStrokeMaterialAdapter'
import {SourceCanonicalFrameEncoder,createPixelTextureFrameEncoder} from './src/presets/sourceCanonicalFrameEncoder'
import {createHash} from 'node:crypto'
import {inflateSync} from 'node:zlib'
import originals from './src/presets/fixtures/pixelBrowserBindings.native.json'
import pencilMetadata from './src/presets/fixtures/pixelPencilPreparation.metadata.json'
import thickpaintMetadata from './src/presets/fixtures/pixelThickpaintPreparation.metadata.json'
import {canonicalBrushDescriptorJSON,canonicalSourceStrokeSnapshotV2,canonicalSourceMaterialContext,canonicalStandaloneStrokeSnapshotV8,canonicalPixelSourceComposition,decodeCanonicalRecordedSnapshotFrameV8,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as B,type BrushDescriptor,type CanonicalStrokeBegin,type CanonicalStrokeBeginResult,type CanonicalStrokeSnapshotV2,type CanonicalStrokeSnapshotV8,type Operation,type ServerToClientEvents} from '@grafetto/shared'
import {createTestEngine} from './testing/engineTestUtils'
import type {CanonicalSourceAuthorService} from './index'
import {installBrushLibrary,installBrushPixels} from './src/presets/importedBrushes'
import {prepareCanonicalRoomState} from '../pages/Room/net/canonicalRoomState'
import type {PointerData} from './src/input/PointerInput'
afterEach(()=>vi.restoreAllMocks())
const packet=(x:number,timeStamp:number):PointerData=>({x,y:2,pressure:.6,tiltX:15,tiltY:20,speed:0,pointerType:'pen',timeStamp,dispatchTime:timeStamp})
async function setup(kind:'dual'|'texture'|'bitmap-auto'|'pencil3'|'pencil5'|'thickpaint'|'dry-creases'|'charcoal',begin:CanonicalSourceAuthorService['begin'],modifiers=false,maskedAuthor=true,recordedColor=false,charcoalIndex=0,powerMode?:'wash'|'buildup'){
 const row=kind==='charcoal'?{...charcoalOriginals.brushes[charcoalIndex],assets:charcoalOriginals.assets}:kind==='thickpaint'?thickpaintMetadata:kind==='dry-creases'?dryCreasesMetadata.rows[0]:kind==='pencil3'?pencilMetadata.rows[0]:kind==='pencil5'?pencilMetadata.rows[1]:originals.rows[kind==='dual'?0:kind==='texture'?1:2];let descriptor=structuredClone(row.descriptor) as unknown as BrushDescriptor
 if(recordedColor){if(!descriptor.sourceStamp)throw Error('Original source required');Object.assign(descriptor.sourceStamp.settings,{'ColorSource/Type':'uniform_random'});const mask=descriptor.behavior?.dual?.brush.sourceStamp;if(mask)Object.assign(mask.settings,{'ColorSource/Type':'uniform_random'})}
 if(kind!=='bitmap-auto')descriptor.id='imported-'+(kind==='dual'?(recordedColor?'c3':'c1'):'c2').repeat(16)
 let assets=row.assets.map(a=>{if(!a.id.startsWith('asset:'))throw Error('Original CAS asset required');return{...a,id:a.id as `asset:${string}`}})
 if(kind==='dual'&&originals.rows[0].coverage)installBrushPixels(originals.rows[0].coverage.id,new Uint8Array(inflateSync(Buffer.from(originals.rows[0].coverage.deflateBase64,'base64'))))
 if(kind==='texture'){
  // Keep original compiled2 queries/geometry; explicitly replace only artwork
  // with a self-authored L8 pattern and a distinct immutable descriptor ID.
  const pixels=Uint8Array.from({length:8*8},(_,i)=>(i*31+17)%256),id='asset:'+createHash('sha256').update(pixels).digest('hex')
  const t=descriptor.texture!;descriptor.texture={id:id as `asset:${string}`,strength:t.strength,periodPx:8,patternSize:{width:8,height:8},offset:{x:0,y:0,randomX:false,randomY:false},application:t.application!}
  assets=assets.filter(a=>a.id!==t.id);assets.push({id:id as `asset:${string}`,size:8,file:id.slice(6)+'.bin'});installBrushPixels(id,pixels)
 }
 if(kind==='pencil3'||kind==='pencil5'||kind==='dry-creases'||kind==='thickpaint'||kind==='charcoal'){
  // Keep exact original source/compiler/geometry, but use explicitly derived
  // self-authored L8 resources. This is preparation coverage, not native pixels.
  descriptor.id='imported-'+(kind==='thickpaint'?'d2':kind==='pencil3'?'d3':kind==='pencil5'?'d5':kind==='charcoal'?'d'+String(charcoalIndex):'d6').repeat(16)
  for(let index=0;index<assets.length;index++){
   const original=assets[index],pixels=Uint8Array.from({length:original.size*original.size},(_,i)=>(i*17+index*31+3)%256)
   const id='asset:'+createHash('sha256').update(pixels).digest('hex') as `asset:${string}`
   descriptor=JSON.parse(JSON.stringify(descriptor).replaceAll(original.id,id)) as BrushDescriptor
   assets[index]={...original,id,file:id.slice(6)+'.bin'};installBrushPixels(id,pixels)
  }
 }
 if(powerMode){
  if(!descriptor.sourceStamp||!descriptor.behavior?.rendering)throw Error('Derived original source required')
  descriptor.id='imported-'+(powerMode==='wash'?'ae':'af').repeat(16)
  descriptor.sourceStamp={...descriptor.sourceStamp,settings:{...descriptor.sourceStamp.settings,CompositeOp:'easy dodge',PaintOpAction:powerMode==='wash'?'2':'1'}}
  Object.assign(descriptor.sourceStamp.flags,{indirectPainting:powerMode==='wash'})
  descriptor.behavior={...descriptor.behavior,rendering:{...descriptor.behavior.rendering,blendMode:'easyDodge'}}
 }
 const preset='brush:'+descriptor.id+'@'+descriptor.version+(modifiers?':flat:fixed':''),sha=createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex')
 installBrushLibrary({schemaVersion:1,brushes:[{descriptor,name:'Derived '+kind+' browser integration',source:'actual compiled2 metadata, derived resource identity',warnings:[]}],assets,skipped:[]})
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:32,canvasHeight:32,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalAuthorRasterProfile:B,canonicalImageMaterialSource:'pixel-image-material-v1',canonicalAuthorImageMaterialSource:'pixel-image-material-v1',canonicalPlainAutoGeometrySource:'dynamic-auto-geometry-v1',canonicalAuthorPlainAutoGeometrySource:'dynamic-auto-geometry-v1',canonicalPrimaryGrainSource:'primary-grain-image-v1',canonicalAuthorPrimaryGrainSource:'primary-grain-image-v1',canonicalPixelMaskedSource:'pixel-masked-v1',...maskedAuthor?{canonicalAuthorPixelMaskedSource:'pixel-masked-v1' as const}:{},canonicalReadScope:{roomId:'room',boardEpoch:2,allowedRasterProfiles:[B]},canonicalHistoryBase:{kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:0,operationCount:0}}
 const p=prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent:()=>true}),operations:Operation[]=[]
 const r=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:32,pageHeight:32,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations},canonicalAuthor:{authorImageMaterialSource:'pixel-image-material-v1',authorPlainAutoGeometrySource:'dynamic-auto-geometry-v1',authorPrimaryGrainSource:'primary-grain-image-v1',...maskedAuthor?{authorPixelMaskedSource:'pixel-masked-v1' as const}:{},begin},onLocalOperation:op=>operations.push(op)},{width:32,height:32}),engine=r.engine
 const gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
 Object.assign(gl,{bufferSubData:vi.fn(),getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,MAX_TEXTURE_IMAGE_UNITS:9005,UNPACK_COLORSPACE_CONVERSION_WEBGL:9006,getAttribLocation:(_p:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),getShaderPrecisionFormat:()=>({precision:23,rangeMin:127,rangeMax:127}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},getTexParameter:(_t:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,getParameter:(key:number)=>key===9005?8:key===9001?[0,0,32,32]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
 engine.initLayer('background');engine.initLayer('layer-1');engine.setCompositeOrder([{id:'layer-1',opacity:1}]);engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(kind==='thickpaint'?24:12);engine.setLocked(false)
 await engine.paperReady();await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
 return{engine,p,operations,preset,sha,descriptor,assets}
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

// Actual failed sweep metadata; app preparation is absent from the CPU101 chain.
it.each(['pencil3','pencil5'] as const)('prepares actual $kind source geometry through full-policy engine resource ownership',async kind=>{
 const begin=vi.fn(),h=await setup(kind,begin),{engine}=h
 try{
  expect(await engine.prepareBrush(h.preset)).toEqual({status:'ready'})
  const prepared=engine['_canonicalPreparedAuthor']
  if(!prepared||prepared.material.kind!=='pixelTexture'||!prepared.material.texture)throw Error('Actual neutral8 preparation required')
  const texture=prepared.material.texture,source=texture.primarySource
  expect(source.kind).toBe(kind==='pencil5'?'image':'gaussianAuto')
  if(source.kind==='image'){
   expect(source.frameBounds).toEqual([{x:18,y:18,width:220,height:220}])
   // The original V8 context must retain descriptor identity; only the internal
   // V2 resource projection is identity-free. No shared guard is relaxed.
   expect(source.descriptorSha256).toBe(h.sha)
   expect(()=>canonicalSourceMaterialContext({version:2,assets:texture.assets.filter(a=>a.id===source.asset),primarySource:source,budget:texture.budget})).toThrow()
  }
  expect(begin).not.toHaveBeenCalled();expect(h.operations).toHaveLength(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})


it('admits actual Pencil3 Gaussian V8 START through full-policy BEGIN and local DRAW/END',async()=>{
 let snapshot!:CanonicalStrokeSnapshotV8
 const begin=vi.fn(async(request:CanonicalStrokeBegin,lifetime:Parameters<CanonicalSourceAuthorService['begin']>[1]):Promise<CanonicalStrokeBeginResult>=>{
  const material=lifetime.expectedMaterialContext8
  if(!material||material.primarySource.kind!=='gaussianAuto')throw Error('Actual Gaussian V8 context required')
  const composition=canonicalPixelSourceComposition(h.descriptor,B);if(!composition)throw Error('Actual composition required')
  snapshot=canonicalStandaloneStrokeSnapshotV8({layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,boardEpoch:2,descriptorSha256:lifetime.expectedDescriptorSha256,rasterProfile:B,pigmentRgb8:request.pigmentRgb8,composition:{...composition,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity},assets:material.assets,materialVersion:8,material},2,B)
  return{ok:true,snapshot,recordedNext:0,liveNext:0,ended:false}
 })
 const h=await setup('pencil3',begin),{engine}=h
 try{
  engine.setSize(24);expect(await engine.prepareBrush(h.preset)).toEqual({status:'ready'})
  engine['_onStart'](packet(2,100));engine['_onMove'](packet(8,112));engine['_onEnd'](packet(8,124))
  await vi.waitFor(()=>{if(engine['_authorInputError']!==undefined)throw engine['_authorInputError'];expect(begin).toHaveBeenCalledOnce();expect(engine.hasActiveCanonicalAuthor()).toBe(false);expect(h.operations.length).toBeGreaterThan(0)},{timeout:5000})
  const frames=h.operations.map(op=>{if(op.type!=='canonical_stroke')throw Error('Source frame required');return decodeCanonicalRecordedSnapshotFrameV8(op.frame,snapshot,op.frame.frameOrdinal).frame})
  expect(frames.flatMap(f=>f.draws).length).toBeGreaterThan(0)
  expect(frames.flatMap(f=>f.fences).filter(f=>f.kind==='gestureEnd')).toHaveLength(1)
  for(const frame of frames)for(const recipe of frame.definitions){if(!('kind'in recipe)||recipe.kind!=='gaussianAuto')throw Error('Original Gaussian definition required');expect(recipe.source.ratio).toBe(.9);expect(recipe.coverageProfile).toBe('browser-number-coverage-v1')}
  expect(engine['_canonicalLayerOwner']?.coordinator?.poisoned).toBe(false)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
})


it.each([{name:'near-limit accumulated bank',retained:300000,ready:true},{name:'genuine CPU overbudget',retained:800000,ready:false}])('charges actual Dry Creases preparation once with $name',async({retained,ready})=>{
 const begin=vi.fn(),h=await setup('dry-creases',begin),{engine}=h
 let release:(()=>void)|undefined,releasePriorRuntime:(()=>void)|undefined,priorRoot:import('./src/dabs/CanonicalMaskSourceBank').CanonicalMaskSourceLease|undefined
 try{
  // Actual existing owner and storage survive the candidate transaction. This
  // retained CPU allocation represents prior admitted metadata, never a cap or
  // reclamation change; the source/pattern bytes are self-authored L8 planes.
  const prior=structuredClone(h.descriptor),priorPixels=Uint8Array.from({length:64},(_,i)=>(i*19+7)%256)
  prior.id='imported-'+'d7'.repeat(16)
  const priorPattern='asset:'+createHash('sha256').update(priorPixels).digest('hex') as `asset:${string}`
  const oldPattern=prior.texture!.id
  prior.texture={...prior.texture!,id:priorPattern,periodPx:8,patternSize:{width:8,height:8},offset:{x:0,y:0,randomX:false,randomY:false}}
  const priorAssets=[...h.assets.filter(a=>a.id!==oldPattern),{id:priorPattern,size:8,file:priorPattern.slice(6)+'.bin'}]
  installBrushPixels(priorPattern,priorPixels)
  const union=[...new Map([...h.assets,...priorAssets].map(a=>[a.id,a])).values()]
  installBrushLibrary({schemaVersion:1,brushes:[{descriptor:h.descriptor,name:'Derived Dry Creases',source:'self-authored L8',warnings:[]},{descriptor:prior,name:'Prior actual image texture owner',source:'self-authored L8',warnings:[]}],assets:union,skipped:[]})
  engine.setPencil('brush:'+prior.id+'@'+prior.version);engine.setSize(24)
  expect(await engine.prepareBrush('brush:'+prior.id+'@'+prior.version)).toEqual({status:'ready'})
  const bank=engine['_canonicalLayerOwner']?.bank;if(!bank)throw Error('Actual prior bank required')
  const priorPrepared=engine['_canonicalPreparedAuthor'];if(!priorPrepared?.imageLease||!priorPrepared.retainPreparedRuntime)throw Error('Actual prior resource/runtime owner required')
  priorRoot=priorPrepared.imageLease.retain();releasePriorRuntime=priorPrepared.retainPreparedRuntime()
  const cpu=engine['_brushMipCache'],baseline=cpu.reservedBytes
  engine.setPencil(h.preset)
  release=cpu.reserve(retained)
  const before=cpu.reservedBytes
  expect(before-baseline).toBe(retained)
  expect(cpu.budgetBytes).toBe(4194304)
  expect(h.descriptor.sourceStamp?.brush.width).toBe(300)
  expect(h.descriptor.tip.imageSampling?.sourceRect).toEqual({x:106,y:106,width:300,height:300})
  const reserves=vi.spyOn(cpu,'reserve'),prepare=engine.prepareBrush(h.preset)
  if(ready){
   expect(await prepare).toEqual({status:'ready'})
   const prepared=engine['_canonicalPreparedAuthor'];if(!prepared||prepared.material.kind!=='pixelTexture')throw Error('Actual retained Pixel preparation required')
   expect(prepared.material.binding.source.kind).toBe('image')
   const nextBank=engine['_canonicalLayerOwner']?.bank;if(!nextBank)throw Error('Extended actual bank required')
   expect(nextBank.jobs.some(job=>job.kind==='raw-pattern-l8'&&job.asset.size===1024)).toBe(true)
   expect(priorRoot.isReady()).toBe(true)
  }else{
   await expect(prepare).rejects.toThrow('Canonical image author union exceeds budget')
   expect(cpu.reservedBytes).toBe(before)
  }
  // A real positive source graph/table reservation occurs before the budget
  // decision; zero charge or blanket omission cannot make this test pass.
  expect(reserves.mock.calls.some(([bytes])=>bytes>=300000&&bytes<=400000)).toBe(true)
  expect(begin).not.toHaveBeenCalled();expect(h.operations).toHaveLength(0)
 }finally{release?.();releasePriorRuntime?.();priorRoot?.release();engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('retains named image-texture frame bounds through capacity and actual Thickpaint START/DRAW/END',async()=>{
 let snapshot!:CanonicalStrokeSnapshotV8
 const begin=vi.fn(async(request:CanonicalStrokeBegin,lifetime:Parameters<CanonicalSourceAuthorService['begin']>[1]):Promise<CanonicalStrokeBeginResult>=>{
  const material=lifetime.expectedMaterialContext8
  if(!material)throw Error('Expected actual image-texture START material')
  const composition=canonicalPixelSourceComposition(h.descriptor,B);if(!composition)throw Error('Original composition required')
  snapshot=canonicalStandaloneStrokeSnapshotV8({layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,boardEpoch:2,descriptorSha256:lifetime.expectedDescriptorSha256,rasterProfile:B,pigmentRgb8:request.pigmentRgb8,composition:{...composition,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity},assets:material.assets,materialVersion:8,material},2,B)
  return{ok:true,snapshot,recordedNext:0,liveNext:0,ended:false}
 })
 const h=await setup('thickpaint',begin),{engine}=h
 try{
  expect(await engine.prepareBrush(h.preset)).toEqual({status:'ready'})
  const material=engine['_canonicalPreparedAuthor']!.material
  if(material.kind!=='pixelTexture'||material.binding.source.kind!=='image'||!material.pin)throw Error('Expected captured image-texture geometry')
  expect(material.pin.primarySource.frameBounds).toEqual(material.binding.source.frameBounds)
  expect(material.pin.primarySource.brushScale).toBe(24/128)
  engine['_onStart']({...packet(2,100),pressure:.3,tiltX:30,tiltY:15})
  engine['_onMove']({...packet(8,112),pressure:.95,tiltX:30,tiltY:15})
  engine['_onEnd']({...packet(8,124),pressure:0,tiltX:30,tiltY:15})
  await vi.waitFor(()=>{if(engine['_authorInputError']!==undefined)throw engine['_authorInputError'];expect(engine.hasActiveCanonicalAuthor()).toBe(false);expect(h.operations.length).toBeGreaterThan(0)},{timeout:5000})
  expect(begin).toHaveBeenCalledOnce()
  const frames=h.operations.map(op=>{if(op.type!=='canonical_stroke')throw Error('Expected source operation');return decodeCanonicalRecordedSnapshotFrameV8(op.frame,snapshot,op.frame.frameOrdinal).frame})
  expect(frames.reduce((n,frame)=>n+frame.draws.length,0)).toBeGreaterThan(0)
  expect(frames.flatMap(frame=>[...frame.definitions]).some(recipe=>'kind'in recipe&&recipe.kind==='image'&&recipe.ratio<1)).toBe(true)
  expect(frames.flatMap(frame=>frame.fences).filter(f=>f.kind==='gestureEnd')).toHaveLength(1)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
},15000)


it.each([0,1,2])('admits original Auto+Auto Charcoal role texture #%s assets through actual full-policy START while rejecting foreign assets',async charcoalIndex=>{
 let snapshot!:CanonicalStrokeSnapshotV2
 const begin=vi.fn(async(request:CanonicalStrokeBegin,lifetime:Parameters<CanonicalSourceAuthorService['begin']>[1]):Promise<CanonicalStrokeBeginResult>=>{
  const material=lifetime.expectedSourceMaterialContext2
  if(!material?.maskSource||!material.roleTextures||material.primarySource.kind==='image'||material.maskSource.kind==='image')throw Error('Actual textured Auto dual required')
  const composition=canonicalPixelSourceComposition(h.descriptor,B);if(!composition)throw Error('Original composition required')
  snapshot=canonicalSourceStrokeSnapshotV2({layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,boardEpoch:2,descriptorSha256:lifetime.expectedDescriptorSha256,rasterProfile:B,pigmentRgb8:request.pigmentRgb8,composition:{...composition,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity},assets:material.assets,materialVersion:2,material},2,B)
  return{ok:true,snapshot,recordedNext:0,liveNext:0,ended:false}
 })
 const h=await setup('charcoal',begin,false,true,false,charcoalIndex),{engine}=h;let negative=0
 const enqueue=CanonicalFrameExecutor.prototype.enqueue
 vi.spyOn(CanonicalFrameExecutor.prototype,'enqueue').mockImplementation(function(this:CanonicalFrameExecutor,input){
  if(!negative&&input.assets.length){
   const before=engine['_brushMipCache'].reservedBytes
   const foreign={...input.assets[0],id:('asset:'+'f'.repeat(64)) as `asset:${string}`}
   expect(()=>Reflect.apply(enqueue,this,[{...input,assets:[...input.assets,foreign]}])).toThrow('Auto-only frame must not supply image assets')
   expect(engine['_brushMipCache'].reservedBytes).toBe(before);negative++
  }
  return Reflect.apply(enqueue,this,[input])
 })
 try{
  console.info('CHARCOAL_STAGE',charcoalIndex,'prepare')
  engine.setSize(24);expect(await engine.prepareBrush(h.preset)).toEqual({status:'ready'})
  console.info('CHARCOAL_STAGE',charcoalIndex,'start')
  engine['_onStart'](packet(2,100));engine['_onMove'](packet(4,112));engine['_onEnd'](packet(4,124))
  await vi.waitFor(()=>{if(engine['_authorInputError']!==undefined)throw engine['_authorInputError'];expect(begin).toHaveBeenCalledOnce();expect(engine.hasActiveCanonicalAuthor()).toBe(false);expect(h.operations.length).toBeGreaterThan(0)},{timeout:5000})
  const frames=h.operations.map(op=>{if(op.type!=='canonical_stroke')throw Error('Actual source frame required');return decodeCanonicalRecordedSnapshotFrameV8(op.frame,snapshot,op.frame.frameOrdinal).frame})
  expect(negative).toBe(1);expect(frames.flatMap(f=>f.draws).length).toBeGreaterThan(0)
  expect(new Set(frames.flatMap(f=>f.draws).map(d=>d.role))).toEqual(new Set(['primary','mask']))
  expect(frames.flatMap(f=>f.fences).filter(f=>f.kind==='gestureEnd')).toHaveLength(1)
  expect(engine['_canonicalLayerOwner']?.coordinator?.poisoned).toBe(false)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
},15000)

function installWaterCSpread(index:0|1|2|3){
 const row=watercSpreadMetadata.rows[index];let descriptor=structuredClone(row.descriptor) as unknown as BrushDescriptor
 descriptor.id='imported-'+['f8','f9','fa','fb'][index].repeat(16)
 const assets=row.assets.map((a,i)=>{
  const pixels=Uint8Array.from({length:a.size*a.size},(_,at)=>(at*13+i*29+index*7)%256),id=('asset:'+createHash('sha256').update(pixels).digest('hex')) as `asset:${string}`
  descriptor=JSON.parse(JSON.stringify(descriptor).replaceAll(a.id,id)) as BrushDescriptor
  installBrushPixels(id,pixels);return{...a,id,file:id.slice(6)+'.bin'}
 })
 installBrushLibrary({schemaVersion:1,brushes:[{descriptor,name:'Derived actual WaterC Spread '+index,source:'original compiled metadata; self-authored L8',warnings:[]}],assets,skipped:[]})
 return{descriptor,preset:'brush:'+descriptor.id+'@'+descriptor.version}
}
it.each(['completed','round-grunge','same-preset','retained-reference','pending-input','true-overbudget'] as const)('replaces only idle sole-reference WaterC author under genuine two-program pressure: %s',async(mode)=>{
 let selected:ReturnType<typeof installWaterCSpread>,snapshot!:CanonicalStrokeSnapshotV2
 const begin:CanonicalSourceAuthorService['begin']=async(request,lifetime)=>{
  const material=lifetime.expectedSourceMaterialContext2;if(!material)throw Error('Actual captured SOURCE2 required')
  const composition=canonicalPixelSourceComposition(selected.descriptor,B);if(!composition)throw Error('Actual original composition required')
  snapshot=canonicalSourceStrokeSnapshotV2({layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,boardEpoch:2,descriptorSha256:lifetime.expectedDescriptorSha256,rasterProfile:B,pigmentRgb8:request.pigmentRgb8,composition:{...composition,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity},assets:material.assets,materialVersion:2,material},2,B)
  return{ok:true,snapshot,recordedNext:0,liveNext:0,ended:false}
 }
 vi.stubGlobal('window',{setTimeout,clearTimeout})
 const h=await setup('dual',begin),{engine}=h;let releaseBaseline:(()=>void)|undefined,releaseReference:(()=>void)|undefined
 try{
  selected=installWaterCSpread(mode==='round-grunge'?2:0);engine.setPencil(selected.preset);engine.setSize(24)
  expect(await engine.prepareBrush(selected.preset)).toEqual({status:'ready'})
  const old=engine['_canonicalPreparedAuthor']!;expect(old.bytes).toBeGreaterThan(1200000)
  engine['_onStart'](packet(2,100));engine['_onMove'](packet(5,112));engine['_onEnd'](packet(5,124))
  await vi.waitFor(()=>{if(engine['_authorInputError']!==undefined)throw engine['_authorInputError'];expect(engine.hasActiveCanonicalAuthor()).toBe(false);expect(h.operations.length).toBeGreaterThan(0)},{timeout:5000})
  for(const op of h.operations){
   if(op.type!=='canonical_stroke')throw Error('Actual canonical source frame required')
   const seq=engine['_log'].entries.length+1,recorded={...op,seq}
   const atom=prepareCanonicalRecordedAttachmentV8({version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:op.userId,snapshot}],bindings:[{operationId:op.id,sequence:seq,originalUserId:op.userId,capability:0}]},[recorded],h.p.canonicalRead.scope)[0]
   const input=attachCanonicalRecordedDelivery(atom,h.p.canonicalRead.scope);if(!('delivery'in input))throw Error('Actual confirmed delivery required')
   engine.appendOriginalRecorded(input)
  }
  await vi.waitFor(()=>{expect(!!engine['_canonicalLayerOwner']?.coordinator?.hasPendingLocal).toBe(false);expect(!!engine['_canonicalLayerOwner']?.coordinator?.pending).toBe(false)},{timeout:5000})
  // Actual source tables/runtime remain owned after the completed gesture.
  expect(engine['_canonicalPreparedAuthor']).toBe(old);if(old.canRetirePreparedRuntime)expect(old.canRetirePreparedRuntime()).toBe(true)
  const cpu=engine['_brushMipCache'],baseline=mode==='true-overbudget'?4194304-100000:mode==='round-grunge'?2297952:mode==='same-preset'?2700000:2566292
  expect(cpu.reservedBytes).toBeLessThanOrEqual(baseline)
  releaseBaseline=cpu.reserve(baseline-cpu.reservedBytes)
  if(mode==='retained-reference')releaseReference=old.retainPreparedRuntime!()
  const pendingSpy=mode==='pending-input'?vi.spyOn(engine['_authorInput'],'pending','get').mockReturnValue(true):undefined
  if(mode==='same-preset')engine.setSize(20);else selected=installWaterCSpread(mode==='round-grunge'?3:1);engine.setPencil(selected.preset)
  const o=engine['_canonicalLayerOwner']!;console.info('WATERC_GATE',mode,{sameOwner:old.owner===o,refs:old.canRetirePreparedRuntime?.(),holds:engine['_canonicalSourceLifetimeHolds'],fifo:engine['_authorInput'].pending,producer:!!engine['_authorProducer'],accepting:o.accepting,inputs:o.inputs.length,outstanding:o.outstanding,job:!!o.job,wake:o.wake,park:o.orderParked,pending:o.coordinator?.pending,local:o.coordinator?.hasPendingLocal,retiring:o.retiring,selected:engine['_opts'].pencilType===selected.preset})
  const before=cpu.reservedBytes,release=vi.spyOn(old,'release')
  if(mode==='completed'||mode==='round-grunge'||mode==='same-preset'){
   expect(await engine.prepareBrush(selected.preset)).toEqual({status:'ready'})
   expect(release).toHaveBeenCalledOnce();expect(engine['_canonicalPreparedAuthor']).not.toBe(old)
   expect(cpu.reservedBytes).toBeLessThan(cpu.budgetBytes)
  }else{
   await expect(engine.prepareBrush(selected.preset)).rejects.toThrow()
   if(mode==='true-overbudget'){expect(release).toHaveBeenCalledOnce();expect(engine['_canonicalPreparedAuthor']).toBeUndefined()}
   else{expect(release).not.toHaveBeenCalled();expect(engine['_canonicalPreparedAuthor']).toBe(old);expect(cpu.reservedBytes).toBe(before)}
  }
  pendingSpy?.mockRestore()
 }catch(error){console.error('WATERC_PRIMARY',mode,error);throw error}finally{releaseReference?.();releaseBaseline?.();engine.destroy();vi.unstubAllGlobals();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},15000)

it('waits for real local queue progress instead of scheduling repeated rejected handoffs',async()=>{
 const begin=vi.fn(async(request:CanonicalStrokeBegin,lifetime:Parameters<CanonicalSourceAuthorService['begin']>[1]):Promise<CanonicalStrokeBeginResult>=>{
  const material=lifetime.expectedSourceMaterialContext2;if(!material)throw Error('Original dual START material required')
  const composition=canonicalPixelSourceComposition(h.descriptor,B);if(!composition)throw Error('Original composition missing')
  const snapshot=canonicalSourceStrokeSnapshotV2({layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,boardEpoch:2,descriptorSha256:lifetime.expectedDescriptorSha256,rasterProfile:B,pigmentRgb8:request.pigmentRgb8,composition:{...composition,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity},assets:material.assets,materialVersion:2,material},2,B)
  return{ok:true,snapshot,recordedNext:0,liveNext:0,ended:false}
 })
 const h=await setup('dual',begin),{engine}=h,callbacks:Array<()=>void>=[]
 const scheduler=vi.spyOn(engine['_authorTasks'],'schedule').mockImplementation(callback=>{callbacks.push(callback);return callbacks.length})
 const originalStep=engine['_stepCanonicalLayer'].bind(engine),resume=()=>{engine['_stepCanonicalLayer']=originalStep}
 engine['_stepCanonicalLayer']=()=>{}
 const clock=vi.spyOn(performance,'now').mockReturnValue(0)
 let firstRejected:Operation|undefined,acceptedSame=false,falseCount=0
 try{
  await engine.prepareBrush(h.preset)
  const coordinator=engine['_ensureCanonicalLayerCoordinator'](engine['_canonicalLayerOwner']!)
  engine['_onStart']({...packet(1,100),pressure:.3});await Promise.resolve();await Promise.resolve()
  engine['_onMove']({...packet(160,112),pressure:.95});engine['_onEnd']({...packet(160,124),pressure:0})
  const enqueue=coordinator.tryEnqueueLocal.bind(coordinator)
  vi.spyOn(coordinator,'tryEnqueueLocal').mockImplementation((author,operation)=>{const accepted=enqueue(author,operation);if(!accepted){falseCount++;firstRejected??=operation}else if(operation===firstRejected)acceptedSame=true;return accepted})
  for(let turns=0;turns<500&&!falseCount;turns++){await Promise.resolve();const callback=callbacks.shift();if(callback)callback()}
  expect(falseCount).toBe(1);expect(coordinator.queuedFrameCount).toBe(8)
  // Drain any already accepted wake. A blocked FIFO must NOT create another.
  for(let turns=0;turns<8&&callbacks.length;turns++){callbacks.shift()!();await Promise.resolve()}
  expect(callbacks).toHaveLength(0);expect(falseCount).toBe(1)
  resume();engine['_stepCanonicalLayer'](engine['_canonicalLayerOwner']!.job!)
  for(let turns=0;turns<10000&&(callbacks.length||engine.hasActiveCanonicalAuthor());turns++){await Promise.resolve();const callback=callbacks.shift();if(callback)callback();else if(!engine.hasActiveCanonicalAuthor())break}
  if(engine['_authorInputError']!==undefined)throw engine['_authorInputError']
  expect(engine.hasActiveCanonicalAuthor()).toBe(false);expect(acceptedSame).toBe(true)
  const frames=h.operations.map(op=>{if(op.type!=='canonical_stroke')throw Error('Source frame required');return op.frame})
  expect(frames.map(frame=>frame.frameOrdinal)).toEqual(frames.map((_,index)=>index));expect(new Set(h.operations.map(op=>op.id)).size).toBe(h.operations.length)
 }finally{resume();scheduler.mockRestore();clock.mockRestore();engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0);expect(engine['_canonicalLayerOwner']?.localCapacity).toBeUndefined()}
},20000)
it('subscribes before the local-capacity revision recheck and removes canceled wait ownership',async()=>{
 const h=await setup('dual',vi.fn()),{engine}=h
 try{
  await engine.prepareBrush(h.preset);const owner=engine['_canonicalLayerOwner']!,coordinator=engine['_ensureCanonicalLayerCoordinator'](owner),revision=coordinator.localCapacityProgressRevision
  const first=engine['_subscribeCanonicalLocalCapacity'](owner,coordinator,revision);expect(owner.localCapacity).toBeDefined();first.release();expect(owner.localCapacity).toBeUndefined()
  // A progress stamp observed after a failed handoff but before subscription
  // must be noticed by the install-then-recheck, with no synchronous pump.
  Object.defineProperty(coordinator,'localCapacityProgressRevision',{configurable:true,get:()=>revision+1})
  let resolved=false;const raced=engine['_subscribeCanonicalLocalCapacity'](owner,coordinator,revision);void raced.promise.then(()=>{resolved=true});expect(resolved).toBe(false);expect(owner.localCapacity).toBeUndefined();await Promise.resolve();expect(resolved).toBe(true)
  Reflect.deleteProperty(coordinator,'localCapacityProgressRevision')
  const retired=engine['_subscribeCanonicalLocalCapacity'](owner,coordinator,revision);engine['_retireCanonicalLayerCycle'](owner,false);await retired.promise;expect(owner.localCapacity).toBeUndefined()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it.each(['wash','buildup'] as const)('prepares the real derived browser dual %s atlas before BEGIN and preserves actual START/DRAW/END',async(mode)=>{
 const restoreFetch=installScalarPowerAssetFetch();let snapshot!:CanonicalStrokeSnapshotV2
 const begin=vi.fn(async(request:CanonicalStrokeBegin,lifetime:Parameters<CanonicalSourceAuthorService['begin']>[1]):Promise<CanonicalStrokeBeginResult>=>{
  const material=lifetime.expectedSourceMaterialContext2;if(!material)throw Error('Actual source2 required')
  const composition=canonicalPixelSourceComposition(h.descriptor,B);if(!composition)throw Error('Actual derived composition required')
  expect(composition.mode).toBe(mode);expect(composition.outerBlend).toBe('easyDodge')
  const owner=h.engine['_canonicalLayerOwner']!,page=owner.composite.scalarAtlasResources('easyDodge')[0]
  expect(page.bytes).toBe(65536);expect(owner.cache.hasResourceLease(page.key)).toBe(true)
  snapshot=canonicalSourceStrokeSnapshotV2({layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,boardEpoch:2,descriptorSha256:lifetime.expectedDescriptorSha256,rasterProfile:B,pigmentRgb8:request.pigmentRgb8,composition:{...composition,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity},assets:material.assets,materialVersion:2,material},2,B)
  return{ok:true,snapshot,recordedNext:0,liveNext:0,ended:false}
 })
 const h=await setup('dual',begin,false,true,false,0,mode),{engine}=h
 try{
  expect(await engine.prepareBrush(h.preset)).toEqual({status:'ready'})
  const owner=engine['_canonicalLayerOwner']!,ordinary=owner.composite.brushGlBatchInfo(),page=owner.composite.scalarAtlasResources('easyDodge')[0]
  expect(ordinary.resources.some(resource=>resource.key===page.key)).toBe(false)
  expect(owner.composite.scalarParticipant('easyDodge').brushGlBatchInfo().resources.some(resource=>resource.key===page.key)).toBe(true)
  engine['_onStart'](packet(2,100));engine['_onMove'](packet(4,112));engine['_onEnd'](packet(4,124))
  await vi.waitFor(()=>{if(engine['_authorInputError']!==undefined)throw engine['_authorInputError'];expect(engine.hasActiveCanonicalAuthor()).toBe(false);expect(h.operations.length).toBeGreaterThan(0)},{timeout:5000})
  expect(begin).toHaveBeenCalledOnce()
  const frames=h.operations.map(op=>{if(op.type!=='canonical_stroke')throw Error('Actual frame required');return decodeCanonicalRecordedSnapshotFrameV8(op.frame,snapshot,op.frame.frameOrdinal).frame})
  expect(frames.flatMap(frame=>frame.draws).length).toBeGreaterThan(0);expect(frames.flatMap(frame=>frame.fences).filter(fence=>fence.kind==='gestureEnd')).toHaveLength(1)
 }finally{engine.destroy();restoreFetch();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},15000)
