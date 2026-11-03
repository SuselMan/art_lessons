import {afterEach,expect,it,vi} from 'vitest'
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
async function setup(kind:'dual'|'texture',begin:CanonicalSourceAuthorService['begin']){
 const row=originals.rows[kind==='dual'?0:1],descriptor=structuredClone(row.descriptor) as unknown as BrushDescriptor
 descriptor.id='imported-'+(kind==='dual'?'c1':'c2').repeat(16)
 let assets=row.assets.map(a=>({...a}))
 if('coverage'in row&&row.coverage)installBrushPixels(row.coverage.id,new Uint8Array(inflateSync(Buffer.from(row.coverage.deflateBase64,'base64'))))
 if(kind==='texture'){
  // Keep original compiled2 queries/geometry; explicitly replace only artwork
  // with a self-authored L8 pattern and a distinct immutable descriptor ID.
  const pixels=Uint8Array.from({length:8*8},(_,i)=>(i*31+17)%256),id='asset:'+createHash('sha256').update(pixels).digest('hex')
  const t=descriptor.texture!;descriptor.texture={id:id as `asset:${string}`,strength:t.strength,periodPx:8,patternSize:{width:8,height:8},offset:{x:0,y:0,randomX:false,randomY:false},application:t.application!}
  assets=assets.filter(a=>a.id!==t.id);assets.push({id:id as `asset:${string}`,size:8,file:id.slice(6)+'.bin'});installBrushPixels(id,pixels)
 }
 const preset='brush:'+descriptor.id+'@'+descriptor.version,sha=createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex')
 installBrushLibrary({schemaVersion:1,brushes:[{descriptor,name:'Derived '+kind+' browser integration',source:'actual compiled2 metadata, derived resource identity',warnings:[]}],assets,skipped:[]})
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:32,canvasHeight:32,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalAuthorRasterProfile:B,canonicalPrimaryGrainSource:'primary-grain-image-v1',canonicalAuthorPrimaryGrainSource:'primary-grain-image-v1',canonicalPixelMaskedSource:'pixel-masked-v1',canonicalAuthorPixelMaskedSource:'pixel-masked-v1',canonicalReadScope:{roomId:'room',boardEpoch:2,allowedRasterProfiles:[B]},canonicalHistoryBase:{kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:0,operationCount:0}}
 const p=prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent:()=>true}),operations:Operation[]=[]
 const r=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:32,pageHeight:32,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations},canonicalAuthor:{authorPrimaryGrainSource:'primary-grain-image-v1',authorPixelMaskedSource:'pixel-masked-v1',begin},onLocalOperation:op=>operations.push(op)},{width:32,height:32}),engine=r.engine
 const gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
 Object.assign(gl,{bufferSubData:vi.fn(),getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,getAttribLocation:(_p:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),getShaderPrecisionFormat:()=>({precision:23,rangeMin:127,rangeMax:127}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},getTexParameter:(_t:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,getParameter:(key:number)=>key===9001?[0,0,32,32]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
 engine.initLayer('background');engine.initLayer('layer-1');engine.setCompositeOrder([{id:'layer-1',opacity:1}]);engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(12);engine.setLocked(false)
 await engine.paperReady();await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
 return{engine,p,operations,preset,sha,descriptor}
}
it.each(['dual','texture'] as const)('prepares actual browser %s and carries its bound source through real START and encoded END',async kind=>{
 let snapshot!:CanonicalStrokeSnapshotV2|CanonicalStrokeSnapshotV8
 const begin=vi.fn(async(request:CanonicalStrokeBegin,lifetime:Parameters<CanonicalSourceAuthorService['begin']>[1]):Promise<CanonicalStrokeBeginResult>=>{
  const material=lifetime.expectedSourceMaterialContext2??lifetime.expectedMaterialContext8
  if(!material)throw Error('Actual START material required')
  const composition=canonicalPixelSourceComposition(h.descriptor,B);if(!composition)throw Error('Original composition required')
  const raw={layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,boardEpoch:2,descriptorSha256:lifetime.expectedDescriptorSha256,rasterProfile:B,pigmentRgb8:request.pigmentRgb8,composition:{...composition,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity},assets:material.assets,materialVersion:material.version,material}
  snapshot=material.version===8?canonicalStandaloneStrokeSnapshotV8(raw,2,B):canonicalSourceStrokeSnapshotV2(raw,2,B)
  return{ok:true,snapshot,recordedNext:0,liveNext:0,ended:false}
 })
 const h=await setup(kind,begin),{engine}=h
 try{
  expect(await engine.prepareBrush(h.preset)).toEqual({status:'ready'})
  const prepared=engine['_canonicalPreparedAuthor']!;expect(prepared.material.kind).toBe(kind==='dual'?'masked':'pixelTexture')
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
