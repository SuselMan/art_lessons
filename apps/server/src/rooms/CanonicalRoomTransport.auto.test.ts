import {mkdtempSync,rmSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,canonicalBrushDescriptorJSON,CANONICAL_STROKE_RASTER_PROFILE,isBrushLibrary,canonicalMaterialGeometryCost,decodeCanonicalStrokeFrame,buildCanonicalMaterial,type BrushDescriptor,type CanonicalStrokeBeginResult,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type CanonicalStrokeFrameEnvelope} from '@grafetto/shared'
// Test-only dynamic source imports keep browser compiler code OUT of the
// server production/NodeNext build graph while exercising actual author glue.
const {default:stock}=await import(new URL('../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native.ts',import.meta.url).href)
const {SourceStrokeAuthor}=await import(new URL('../../../web/src/engine/src/presets/sourceStrokeAuthor.ts',import.meta.url).href)
const {sourceStrokeAuthorDescriptor}=await import(new URL('../../../web/src/engine/src/presets/sourceStrokeAuthorDescriptor.ts',import.meta.url).href)
const {SourceStrokeMaterialAdapter}=await import(new URL('../../../web/src/engine/src/presets/sourceStrokeMaterialAdapter.ts',import.meta.url).href)
const {SourceCanonicalFrameEncoder}=await import(new URL('../../../web/src/engine/src/presets/sourceCanonicalFrameEncoder.ts',import.meta.url).href)
import {BrushStorage,empty,setBrushStorage} from '../brushLibrary/storage.js'
import {rooms,flushRoomWrites,type RoomRecord} from './roomRegistry.js'
import {CanonicalRoomTransport} from './CanonicalRoomTransport.js'
import {getCanonicalGesturePrefixWithRows} from './snapshotStore.js'
import {recordOperation} from './operationLog.js'
import {CanonicalBrushCapabilityResolver} from './CanonicalBrushCapabilityResolver.js'
import {CanonicalStrokeAdmission} from './CanonicalStrokeAdmission.js'
const db=vi.hoisted(()=>({operation:{count:vi.fn(),findMany:vi.fn(),findUnique:vi.fn(),create:vi.fn()},room:{update:vi.fn(),findUnique:vi.fn()}}))
vi.mock('../db/prisma.js',()=>({prisma:db}))
const history=vi.hoisted(()=>({rows:[] as unknown[],canonicalRows:[] as unknown[]}))
vi.mock('./snapshotStore.js',async importOriginal=>({...await importOriginal<typeof import('./snapshotStore.js')>(),getCanonicalGesturePrefixWithRows:vi.fn(async()=>({operations:history.rows,canonicalRows:history.canonicalRows})),getOperationsBeforeWithCanonicalRows:vi.fn(async()=>({operations:history.rows,canonicalRows:history.canonicalRows}))}))
const dirs:string[]=[]
beforeEach(()=>{db.operation.count.mockResolvedValue(0);db.operation.findUnique.mockResolvedValue(null);db.operation.create.mockResolvedValue({});history.rows=[];history.canonicalRows=[]})
afterEach(async()=>{for(const id of rooms.keys())await flushRoomWrites(id);rooms.clear();for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});vi.restoreAllMocks();vi.clearAllMocks()})
function resident():RoomRecord{
 const record:RoomRecord={room:{id:'board',name:'Board',ownerId:'author',paper:'coarse',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-29T00:00:00Z',rasterVersion:'straight-rgba8-v1'},lessonId:null,sockets:new Set(),boards:[],assignments:[],activeAssignmentId:null,spotlightBoardId:null,handsRaised:new Set(),assignmentStarting:false,passwordHash:undefined,operations:[],participants:new Map(),nextSeq:1,layerStateSeq:null,layerStateIds:null,coveredSeqByLayer:new Map(),palette:[],roomFrozen:false,frozenUserIds:new Set(),lockedLayerIds:new Set(),sharedLockedLayerIds:new Set(),aliveIds:new Set(['layer']),deletedIds:new Set(),operationsById:new Map(),structuralLog:[]}
 record.participants.set('author',{userId:'author',name:'A',role:'owner',color:'#000000',frozen:false,boardId:'board'});rooms.set('board',record);return record
}
const identity={roomId:'board',userId:'author'}
const policy={rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,alphaDarkenVariants:['creamy','hard'] as const,autoSources:{defaultAuto:{coverageProfile:'neon64-f32-fma-v1' as const,storedScale:1 as const}}}
function setup(descriptor=stock.rows[0].descriptor as unknown as BrushDescriptor){
 const dir=mkdtempSync(join(tmpdir(),'server-auto-v2-'));dirs.push(dir);const storage=new BrushStorage(dir)
 const library={schemaVersion:1,brushes:[{name:'Actual auto',source:'fixture.kpp',warnings:[],descriptor}],assets:[],skipped:[]}
 if(!isBrushLibrary(library))throw Error('Invalid real descriptor fixture')
 storage.install('author',library,new Map());setBrushStorage(storage,empty());const board=resident()
 const input={layerId:'layer',brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:'gesture',pigmentRgb8:[183,47,211] as [number,number,number],outerResourceOpacity:.73,alphaDarken:'creamy' as const}
 return{storage,library,board,input,descriptor}
}
function snapshot(result:CanonicalStrokeBeginResult):CanonicalStrokeSnapshotV2{if(!result.ok||!('materialVersion'in result.snapshot)||result.snapshot.materialVersion!==2)throw Error(JSON.stringify(result));return result.snapshot}
function frames(descriptor:BrushDescriptor,s:CanonicalStrokeSnapshotV2,inputCount=3,controlFirst=false){
 if(s.material.primarySource.kind==='image')throw Error('Expected procedural source')
 const compiled=sourceStrokeAuthorDescriptor(descriptor,{colorIdentity:'native-black',lodScale:1,coverageProfile:s.material.primarySource.coverageProfile})
 if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const author=new SourceStrokeAuthor(compiled.program);let state=author.createState(4321,7654,.3)
 const material={...s.material,targetGeometry:{pageBounds:{minX:0,minY:0,maxX:64,maxY:64},tileWidth:64,tileHeight:64,maxTargets:64}}
 const adapter=new SourceStrokeMaterialAdapter(compiled.program,material,state),encoder=new SourceCanonicalFrameEncoder({rasterProfile:s.rasterProfile,brush:s.brush,strokeId:s.strokeId,pigmentRgb8:s.pigmentRgb8,composition:s.composition,material})
 const result:CanonicalStrokeFrameEnvelope[]=[]
 const collect=(chunks:readonly{packed:string}[])=>{for(const c of chunks)result.push(encoder.encode(c.packed).envelope)}
 for(let i=0;i<inputCount;i++){
  collect(adapter.beginInput(state));if(controlFirst&&i===0){const cut=adapter.flush();if(cut)collect([cut])}const packet={x:25+(i%3)*3.25,y:29+(i%3)*1.5,t:i*19,pressure:[.25,.65,1][i%3],tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:i===2,mirroredV:false,tiltDirectionOffset:0,hover:false}
  const iterator=author.plan(state,packet);while(true){const n=iterator.next();if(n.done){state=n.value;break}collect(adapter.accept(n.value));const cut=adapter.flush();if(cut)collect([cut])}
 }
 collect(adapter.finish(state));expect(encoder.ended).toBe(true);return result
}
it('binds actual seven no-CAS descriptors, accepts actual adapter/encoder live+record bytes and reconstructs bounded persisted prefixes',async()=>{
 for(const row of stock.rows){
  const f=setup(row.descriptor as unknown as BrushDescriptor),asset=vi.spyOn(f.storage,'asset'),pin=vi.spyOn(f.storage,'pin')
  let transport=new CanonicalRoomTransport(policy)
  const s=snapshot(await transport.begin(identity,f.input,()=>true));expect(s.material.assets).toEqual([]);expect(s.assets).toEqual([]);expect(asset).not.toHaveBeenCalled()
  const packets=frames(f.descriptor,s),prefix:CanonicalStrokeOperation[]=[]
  for(let i=0;i<packets.length;i++){
   const live=transport.live(identity,{layerId:'layer',frame:packets[i]});expect(live.result).toEqual({ok:true,duplicate:false})
   expect(transport.live(identity,{layerId:'layer',frame:packets[i]}).result).toEqual({ok:true,duplicate:true})
   const op:CanonicalStrokeOperation={type:'canonical_stroke',id:'op'+i,userId:'author',timestamp:i,layerId:'layer',frame:packets[i]}
   const saved=await transport.recorded(identity,op,()=>true);expect(saved.result).toMatchObject({ok:true,seq:i+1});expect(saved.accepted!.frame).toEqual(packets[i]);prefix.push(saved.accepted!)
   const pins=pin.mock.calls.length;expect((await transport.recorded(identity,op,()=>true)).result).toMatchObject({ok:true,duplicate:true,seq:i+1});expect(pin.mock.calls.length).toBe(pins)
   if(i===1){
    await flushRoomWrites('board');db.operation.count.mockResolvedValue(prefix.length);history.rows=[...prefix];history.canonicalRows=prefix.map(op=>[...db.operation.create.mock.calls].reverse().find(([request])=>request.data.id===op.id&&request.data.data.frame.brush===op.frame.brush)![0].data)
    transport=new CanonicalRoomTransport(policy)
    expect(await transport.begin(identity,f.input,()=>true)).toMatchObject({ok:true,recordedNext:2,liveNext:2,ended:false})
   }
  }
  await flushRoomWrites('board');expect(asset).not.toHaveBeenCalled();expect(pin).toHaveBeenCalled();expect(f.storage.library('rooms','board').brushes[0].descriptor).toEqual(JSON.parse(JSON.stringify(f.descriptor)))
  db.operation.count.mockResolvedValue(prefix.length);history.rows=prefix;history.canonicalRows=prefix.map(op=>[...db.operation.create.mock.calls].reverse().find(([request])=>request.data.id===op.id&&request.data.data.frame.brush===op.frame.brush)![0].data)
  const cold=new CanonicalRoomTransport(policy),replayed=await cold.begin(identity,f.input,()=>true)
  expect(replayed).toMatchObject({ok:true,recordedNext:packets.length,liveNext:packets.length,ended:true});expect(snapshot(replayed).material).toEqual(s.material)
  history.rows=prefix.slice(1);expect(await new CanonicalRoomTransport(policy).begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'canonical_repair_required'})
  db.operation.count.mockResolvedValue(0);history.rows=[];asset.mockRestore();pin.mockRestore();await flushRoomWrites('board');rooms.clear()
 }
})
it('repeated begin exposes only recorded closure after actual seven live terminal frames',async()=>{
 for(const row of stock.rows){
  const f=setup(row.descriptor as unknown as BrushDescriptor),transport=new CanonicalRoomTransport(policy)
  const s=snapshot(await transport.begin(identity,f.input,()=>true)),packets=frames(f.descriptor,s)
  expect(packets.length).toBeGreaterThanOrEqual(2)
  for(let i=0;i<packets.length;i++){
   expect(transport.live(identity,{layerId:'layer',frame:packets[i]}).result.ok).toBe(true)
   if(i===packets.length-2)expect(transport.live(identity,{layerId:'layer',frame:packets[i+1]}).result.ok).toBe(true)
   // The terminal live frame is already known, but the last record is absent.
   if(i===packets.length-1)expect(await transport.begin(identity,f.input,()=>true)).toMatchObject({ok:true,ended:false,recordedNext:i})
   const op:CanonicalStrokeOperation={type:'canonical_stroke',id:'closure-'+i,userId:'author',timestamp:i,layerId:'layer',frame:packets[i]}
   expect((await transport.recorded(identity,op,()=>true)).result.ok).toBe(true)
  }
  expect(await transport.begin(identity,f.input,()=>true)).toMatchObject({ok:true,ended:true,recordedNext:packets.length})
  await flushRoomWrites('board');rooms.clear();db.operation.count.mockResolvedValue(0);history.rows=[]
 }
})
it('defaults auto OFF and rejects legacy rooms, malformed material policies and changed permissions before pin/store',async()=>{
 const f=setup(),pin=vi.spyOn(f.storage,'pin'),asset=vi.spyOn(f.storage,'asset')
 expect(await new CanonicalRoomTransport().begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'invalid_operation'})
 expect(db.operation.create).not.toHaveBeenCalled();expect(pin).not.toHaveBeenCalled();expect(asset).not.toHaveBeenCalled()
 f.board.room.rasterVersion='legacy-pm8-v1';expect(await new CanonicalRoomTransport(policy).begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'invalid_operation'});expect(pin).not.toHaveBeenCalled()
 f.board.room.rasterVersion='straight-rgba8-v1';vi.mocked(getCanonicalGesturePrefixWithRows).mockImplementationOnce(async()=>{f.board.aliveIds.delete('layer');return {operations:[],canonicalRows:[]}})
 expect(await new CanonicalRoomTransport(policy).begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'invalid_operation'});expect(pin).not.toHaveBeenCalled()
})
it('pins full auto context/profile/version immutably across lanes, with no assets or weak callback fallback',()=>{
 const f=setup(),binder=new CanonicalBrushCapabilityResolver({storage:f.storage,operator:empty,...policy,maxGestures:4}),grant=binder.beginGesture(identity,f.input)
 let current=grant;const admission=new CanonicalStrokeAdmission({resolve:()=>current,maxGestures:1,retainedFrames:8})
 if(!('version'in grant.material)||grant.material.version!==2||grant.material.primarySource.kind!=='defaultAuto')throw Error('Missing V2 auto pin')
 const s:CanonicalStrokeSnapshotV2={...grant,materialVersion:2,material:grant.material,assets:[]},packet=frames(f.descriptor,s)[0]
 admission.prepare(identity,{type:'canonical_stroke_live',layerId:'layer',frame:packet}).commit()
 const before=admission.cursor(identity,'gesture')
 for(const patch of [{...grant.material,primarySource:{...grant.material.primarySource,coverageProfile:'scalar-f64-fma-v1' as const}},
  {...grant.material,primarySource:{...grant.material.primarySource,source:{...grant.material.primarySource.source,horizontalFade:.123}}},
  {...grant.material,primarySource:{...grant.material.primarySource,descriptorSha256:'b'.repeat(64)}},
  {...grant.material,preflightDefinition:canonicalMaterialGeometryCost},
  {assets:[],primaryAsset:'fake',budget:grant.material.budget,preflightDefinition:canonicalMaterialGeometryCost}]){
  current={...grant,material:patch};expect(()=>admission.prepare(identity,{type:'canonical_stroke',id:'record',layerId:'layer',frame:packet})).toThrow();expect(admission.cursor(identity,'gesture')).toEqual(before)
 }
 current=grant;expect(()=>admission.prepare(identity,{type:'canonical_stroke',id:'record',layerId:'layer',frame:packet}).commit()).not.toThrow()
})

it('rejects inconsistent saved auto data and nonexplicit policies without CAS, pin or persistence',async()=>{
 const changes=((d:BrushDescriptor)=>{Object.assign(d.sourceStamp!.settings,{PaintOpAction:'1'})})
 const badMode=structuredClone(stock.rows[0].descriptor) as BrushDescriptor;changes(badMode)
 const badScale=structuredClone(stock.rows[0].descriptor) as BrushDescriptor;Object.assign(badScale.sourceStamp!.brush,{scale:.2})
 const badCurves=structuredClone(stock.rows.at(-1)!.descriptor) as BrushDescriptor;Object.assign(badCurves.sourceStamp!,{compiled:undefined})
 expect(()=>setup(badScale)).toThrow('Invalid real descriptor fixture')
 for(const descriptor of [badMode,badCurves]){
  const f=setup(descriptor),pin=vi.spyOn(f.storage,'pin'),asset=vi.spyOn(f.storage,'asset')
  expect(await new CanonicalRoomTransport(policy).begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'invalid_operation'})
  expect(pin).not.toHaveBeenCalled();expect(asset).not.toHaveBeenCalled();expect(f.board.operations).toEqual([])
 }
 const f=setup(),pin=vi.spyOn(f.storage,'pin')
 expect(()=>new CanonicalRoomTransport({...policy,autoSources:{defaultAuto:{coverageProfile:'unknown' as never,storedScale:1}}})).toThrow('explicit auto policy')
 expect(await new CanonicalRoomTransport(policy).begin(identity,{...f.input,sourceProfile:'neon64-f32-fma-v1'} as never,()=>true)).toEqual({ok:false,reason:'invalid_operation'})
 const inherited=Object.create({coverageProfile:'neon64-f32-fma-v1'});inherited.storedScale=1;inherited.extra=true
 expect(()=>new CanonicalBrushCapabilityResolver({storage:f.storage,operator:empty,...policy,autoSources:{defaultAuto:inherited},maxGestures:4})).toThrow('explicit auto policy')
 expect(pin).not.toHaveBeenCalled();expect(db.operation.create).not.toHaveBeenCalled()
})
it('rejects changed live/record pigment, recipe profile and malformed packed frames before pin/store',async()=>{
 const f=setup(),transport=new CanonicalRoomTransport(policy),s=snapshot(await transport.begin(identity,f.input,()=>true)),valid=frames(f.descriptor,s)[0],pin=vi.spyOn(f.storage,'pin')
 for(const frame of [{...valid,pigmentRgb8:[0,0,0]},{...valid,rasterProfile:'fake'},{...valid,materialPacked:valid.materialPacked.slice(0,-1)}]){
  expect(transport.live(identity,{layerId:'layer',frame} as never).result).toEqual({ok:false,reason:'invalid_operation'})
  expect((await transport.recorded(identity,{type:'canonical_stroke',id:'bad',userId:'author',timestamp:0,layerId:'layer',frame},()=>true)).result).toEqual({ok:false,reason:'invalid_operation'})
 }
 expect(pin).not.toHaveBeenCalled();expect(f.board.operations).toEqual([])
})

it('fails closed on a malformed runtime operator source before CAS or any published grant',()=>{
 const f=setup(),library=structuredClone(f.library)
 Object.assign(library.brushes[0].descriptor.sourceStamp!,{source:undefined})
 const bad=new CanonicalBrushCapabilityResolver({storage:f.storage,operator:()=>library,...policy,maxGestures:4})
 const asset=vi.spyOn(f.storage,'asset'),pin=vi.spyOn(f.storage,'pin')
 let error:unknown;try{bad.beginGesture(identity,f.input)}catch(e){error=e}
 expect(error).toBeInstanceOf(Error);expect(error).not.toBeInstanceOf(TypeError)
 expect(bad.size).toBe(0);expect(asset).not.toHaveBeenCalled();expect(pin).not.toHaveBeenCalled();expect(f.board.operations).toEqual([])
})

it('preserves packed dynamic negative zero/F64 through server decode while normalizing static zero at the trusted binding',async()=>{
 const descriptor=structuredClone(stock.rows[0].descriptor) as BrushDescriptor
 Object.assign(descriptor.sourceStamp!.brush,{angle:-0})
 const f=setup(descriptor),transport=new CanonicalRoomTransport(policy),s=snapshot(await transport.begin(identity,f.input,()=>true))
 if(s.material.primarySource.kind!=='defaultAuto')throw Error('Expected auto source')
 expect(Object.is(s.material.primarySource.brushAngle,0)).toBe(true)
 const original=frames(f.descriptor,s)[0],decoded=decodeCanonicalStrokeFrame(original,{...s,frameOrdinal:0}),r=decoded.frame.definitions[0]
 if(r.kind!=='defaultAuto')throw Error('Expected auto recipe')
 expect(r.rotation).toBe(0)
 const edited={...r,rotation:-0,subX:-0,subY:-0}
 const packed=buildCanonicalMaterial({masked:false,entry:decoded.frame.entry,draws:decoded.frame.draws.map(({definition:_definition,...d})=>({...d,recipe:edited})),fences:decoded.frame.fences},s.material).packed
 const frame={...original,materialPacked:packed},accepted=transport.live(identity,{layerId:'layer',frame})
 expect(accepted.result).toEqual({ok:true,duplicate:false});expect(accepted.accepted!.frame.materialPacked).toBe(packed)
 const after=decodeCanonicalStrokeFrame(JSON.parse(JSON.stringify(accepted.accepted!.frame)),{...s,frameOrdinal:0}).frame.definitions[0]
 expect(Object.is(after.rotation,-0)).toBe(true);expect(Object.is(after.subX,-0)).toBe(true)
})
it('publishes neither grant nor lane progress after pin failures and rejects a missing known resident prefix',async()=>{
 const f=setup(),transport=new CanonicalRoomTransport(policy),pin=vi.spyOn(f.storage,'pin')
 pin.mockImplementationOnce(()=>{throw Error('injected pin failure')})
 expect(await transport.begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'server_error'})
 const input={...f.input,pigmentRgb8:[7,8,9] as [number,number,number]},s=snapshot(await transport.begin(identity,input,()=>true)),frame=frames(f.descriptor,s)[0]
 pin.mockImplementationOnce(()=>{throw Error('injected live pin failure')})
 expect(transport.live(identity,{layerId:'layer',frame}).result).toEqual({ok:false,reason:'server_error'})
 expect(transport.live(identity,{layerId:'layer',frame}).result).toEqual({ok:true,duplicate:false})
 const op:CanonicalStrokeOperation={type:'canonical_stroke',id:'retry',userId:'author',timestamp:0,layerId:'layer',frame}
 pin.mockImplementationOnce(()=>{throw Error('injected record pin failure')})
 expect((await transport.recorded(identity,op,()=>true)).result).toEqual({ok:false,reason:'server_error'});expect(f.board.operations).toEqual([]);expect(f.board.nextSeq).toBe(1)
 expect((await transport.recorded(identity,op,()=>true)).result).toMatchObject({ok:true,seq:1})
 await flushRoomWrites('board');pin.mockClear() // Known resident frame is absent from the query mock; it must not become fresh0.
 expect(await new CanonicalRoomTransport(policy).begin(identity,input,()=>true)).toEqual({ok:false,reason:'canonical_repair_required'});expect(pin).not.toHaveBeenCalled()
})

it('does not grant Gaussian descriptors through the default-auto execution policy',async()=>{
 const {default:gaussian}=await import(new URL('../../../../packages/shared/src/fixtures/sourceGaussianAutoData/stock.native.ts',import.meta.url).href)
 for(const index of [2,5,6,7,10,11,22]){
  const row=gaussian.rows.find((r:{index:number})=>r.index===index)!
  const f=setup(row.descriptor as BrushDescriptor),pin=vi.spyOn(f.storage,'pin'),asset=vi.spyOn(f.storage,'asset')
  expect(await new CanonicalRoomTransport(policy).begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'invalid_operation'})
  expect(pin).not.toHaveBeenCalled();expect(asset).not.toHaveBeenCalled()
  expect(f.board.operations).toEqual([]);expect(f.board.nextSeq).toBe(1)
  expect(f.storage.library('rooms','board')).toEqual(empty())
  rooms.clear()
 }
 expect(db.operation.create).not.toHaveBeenCalled()
})


it.each(['scalar-bionic-f64-fma-v1','neon64-f32-fma-v1'] as const)('binds six Gaussian paint sources through the SAME live/record/reconnect lane: %s',async coverageProfile=>{
 const {default:gaussian}=await import(new URL('../../../../packages/shared/src/fixtures/sourceGaussianAutoData/stock.native.ts',import.meta.url).href)
 const selected={...policy,autoSources:{...policy.autoSources,gaussianAuto:{coverageProfile,storedScale:1 as const}}}
 for(const index of [5,6,7,10,11,22]){
  const row=gaussian.rows.find((r:{index:number})=>r.index===index)!,f=setup(row.descriptor as BrushDescriptor)
  const asset=vi.spyOn(f.storage,'asset'),pin=vi.spyOn(f.storage,'pin')
  let transport=new CanonicalRoomTransport(selected)
  const begin=await transport.begin(identity,f.input,()=>true),s=snapshot(begin)
  expect(s.material.primarySource.kind).toBe('gaussianAuto');expect(s.material.assets).toEqual([]);expect(s.assets).toEqual([])
  if(s.material.primarySource.kind!=='gaussianAuto')throw Error('Expected Gaussian pin')
  expect(s.material.primarySource.coverageProfile).toBe(coverageProfile)
  const packets=frames(f.descriptor,s),prefix:CanonicalStrokeOperation[]=[]
  for(let i=0;i<packets.length;i++){
   expect(transport.live(identity,{layerId:'layer',frame:packets[i]}).result).toEqual({ok:true,duplicate:false})
   const op:CanonicalStrokeOperation={type:'canonical_stroke',id:'gauss-'+i,userId:'author',timestamp:i,layerId:'layer',frame:packets[i]}
   const saved=await transport.recorded(identity,op,()=>true);expect(saved.result).toMatchObject({ok:true,seq:i+1});prefix.push(saved.accepted!)
   expect((await transport.recorded(identity,op,()=>true)).result).toMatchObject({ok:true,duplicate:true,seq:i+1})
   if(i===1){
    await flushRoomWrites('board');db.operation.count.mockResolvedValue(prefix.length);history.rows=[...prefix];history.canonicalRows=prefix.map(op=>[...db.operation.create.mock.calls].reverse().find(([request])=>request.data.id===op.id&&request.data.data.frame.brush===op.frame.brush)![0].data)
    transport=new CanonicalRoomTransport(selected)
    expect(await transport.begin(identity,f.input,()=>true)).toMatchObject({ok:true,recordedNext:2,liveNext:2,ended:false})
   }
  }
  await flushRoomWrites('board');db.operation.count.mockResolvedValue(prefix.length);history.rows=prefix;history.canonicalRows=prefix.map(op=>[...db.operation.create.mock.calls].reverse().find(([request])=>request.data.id===op.id&&request.data.data.frame.brush===op.frame.brush)![0].data)
  const cold=await new CanonicalRoomTransport(selected).begin(identity,f.input,()=>true)
  expect(cold).toMatchObject({ok:true,ended:true,recordedNext:packets.length,liveNext:packets.length})
  expect(snapshot(cold).material).toEqual(s.material)
  expect(asset).not.toHaveBeenCalled();expect(pin).toHaveBeenCalled()
  history.rows=prefix.slice(1)
  expect(await new CanonicalRoomTransport(selected).begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'canonical_repair_required'})
  db.operation.count.mockResolvedValue(0);history.rows=[];asset.mockRestore();pin.mockRestore();rooms.clear()
 }
})
it('keeps Gaussian erase/effects and both generator policies explicitly closed',async()=>{
 const {default:gaussian}=await import(new URL('../../../../packages/shared/src/fixtures/sourceGaussianAutoData/stock.native.ts',import.meta.url).href)
 const erase=gaussian.rows.find((r:{index:number})=>r.index===2)!,f=setup(erase.descriptor as BrushDescriptor)
 const pin=vi.spyOn(f.storage,'pin'),asset=vi.spyOn(f.storage,'asset')
 const selected={...policy,autoSources:{gaussianAuto:{coverageProfile:'neon64-f32-fma-v1' as const,storedScale:1 as const}}}
 expect(await new CanonicalRoomTransport(selected).begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'invalid_operation'})
 expect(pin).not.toHaveBeenCalled();expect(asset).not.toHaveBeenCalled();expect(f.board.operations).toEqual([]);expect(f.board.nextSeq).toBe(1)
 for(const autoSources of [
  {gaussianAuto:{coverageProfile:'scalar-f64-fma-v1',storedScale:1}},
  {defaultAuto:{coverageProfile:'scalar-bionic-f64-fma-v1',storedScale:1}},
  {gaussianAuto:{coverageProfile:'neon64-f32-fma-v1',storedScale:2}},
  {gaussianAuto:{coverageProfile:'neon64-f32-fma-v1',storedScale:1,extra:true}},
  {unknown:{coverageProfile:'neon64-f32-fma-v1',storedScale:1}},
  Object.create({gaussianAuto:{coverageProfile:'neon64-f32-fma-v1',storedScale:1}}),
 ])expect(()=>new CanonicalRoomTransport({...policy,autoSources} as never)).toThrow('explicit auto policy')
})

function deferredWrite(){let resolve!:()=>void,reject!:(error:Error)=>void;const promise=new Promise<void>((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
function operation(frame:CanonicalStrokeFrameEnvelope,id='durable'):CanonicalStrokeOperation{return{type:'canonical_stroke',id,userId:'author',timestamp:0,layerId:'layer',frame}}
it.each(['defaultAuto','gaussianAuto'] as const)('withholds %s ACK/confirmation until DB success and repairs the SAME failed row',async kind=>{
 const {default:gaussian}=await import(new URL('../../../../packages/shared/src/fixtures/sourceGaussianAutoData/stock.native.ts',import.meta.url).href)
 const descriptor=kind==='defaultAuto'?stock.rows[0].descriptor:gaussian.rows.find((r:{index:number})=>r.index===5)!.descriptor
 const f=setup(descriptor as BrushDescriptor),selected={...policy,autoSources:{...policy.autoSources,gaussianAuto:{coverageProfile:'neon64-f32-fma-v1' as const,storedScale:1 as const}}}
 const transport=new CanonicalRoomTransport(selected),s=snapshot(await transport.begin(identity,f.input,()=>true)),packets=frames(f.descriptor,s)
 const pin=vi.spyOn(f.storage,'pin'),first=deferredWrite(),log=vi.spyOn(console,'error').mockImplementation(()=>{})
 db.operation.create.mockReturnValueOnce(first.promise)
 const op=operation(packets[0]),pending=transport.recorded(identity,op,()=>true),settled=vi.fn();void pending.then(settled)
 await vi.waitFor(()=>expect(f.board.operations).toHaveLength(1))
 expect(settled).not.toHaveBeenCalled();expect(f.board.nextSeq).toBe(2)
 const duplicate=transport.recorded(identity,op,()=>true),begin=transport.begin(identity,f.input,()=>true)
 const next=transport.recorded(identity,operation(packets[1],'next'),()=>true)
 first.reject(new Error('insert failed after admission seal'))
 for(const result of await Promise.all([pending,duplicate,next]))expect(result).toEqual({result:{ok:false,reason:'canonical_repair_required'}})
 expect(await begin).toEqual({ok:false,reason:'canonical_repair_required'})
 expect(f.board.operations).toHaveLength(1);expect(f.board.nextSeq).toBe(2);expect(db.operation.create).toHaveBeenCalledTimes(1)
 expect(await new CanonicalRoomTransport(selected).begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'canonical_repair_required'})
 const repair=deferredWrite(),pins=pin.mock.calls.length;db.operation.create.mockReturnValueOnce(repair.promise)
 const a=transport.recorded(identity,op,()=>true),b=transport.recorded(identity,op,()=>true)
 await vi.waitFor(()=>expect(db.operation.create).toHaveBeenCalledTimes(2));expect(pin).toHaveBeenCalledTimes(pins)
 repair.resolve()
 for(const result of await Promise.all([a,b])){
  expect(result.result).toEqual({ok:true,seq:1,duplicate:true});expect(result.accepted).toBe(f.board.operations[0])
  expect(result.accepted!.frame.materialPacked).toBe(op.frame.materialPacked)
 }
 expect(f.board.nextSeq).toBe(2);expect(f.board.operations).toHaveLength(1)
 expect(await transport.recorded(identity,operation(packets[1],'next'),()=>true)).toMatchObject({result:{ok:true,seq:2}})
 expect(db.operation.create).toHaveBeenCalledTimes(3);log.mockRestore()
})
it('does not publish a later gesture merely because its insert succeeded after an earlier failed row',async()=>{
 const f=setup(),transport=new CanonicalRoomTransport(policy)
 const a=snapshot(await transport.begin(identity,f.input,()=>true)),b=snapshot(await transport.begin(identity,{...f.input,strokeId:'gestureB'},()=>true))
 const first=deferredWrite(),second=deferredWrite(),log=vi.spyOn(console,'error').mockImplementation(()=>{})
 db.operation.create.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
 const opA=operation(frames(f.descriptor,a)[0],'A'),opB=operation(frames(f.descriptor,b)[0],'B')
 const pendingA=transport.recorded(identity,opA,()=>true),pendingB=transport.recorded(identity,opB,()=>true)
 await vi.waitFor(()=>expect(f.board.operations).toHaveLength(2))
 first.reject(new Error('earlier sequence failed'));expect(await pendingA).toEqual({result:{ok:false,reason:'canonical_repair_required'}})
 second.resolve();expect(await pendingB).toEqual({result:{ok:false,reason:'canonical_repair_required'}})
 expect(f.board.nextSeq).toBe(3)
 expect(await transport.recorded(identity,opA,()=>true)).toMatchObject({result:{ok:true,duplicate:true,seq:1},accepted:{id:'A'}})
 expect(await transport.recorded(identity,opB,()=>true)).toMatchObject({result:{ok:true,duplicate:true,seq:2},accepted:{id:'B'}})
 expect(db.operation.create).toHaveBeenCalledTimes(3);expect(f.board.nextSeq).toBe(3);log.mockRestore()
})
it.each(['disconnect','replacement'] as const)('does not publish stale %s confirmation after persistence completes',async change=>{
 const f=setup(),transport=new CanonicalRoomTransport(policy),s=snapshot(await transport.begin(identity,f.input,()=>true)),write=deferredWrite()
 db.operation.create.mockReturnValueOnce(write.promise)
 let current=true
 const pending=transport.recorded(identity,operation(frames(f.descriptor,s)[0]),()=>current)
 await vi.waitFor(()=>expect(f.board.operations).toHaveLength(1))
 if(change==='disconnect')current=false;else resident()
 write.resolve()
 expect(await pending).toEqual({result:{ok:false,reason:change==='disconnect'?'not_joined':'canonical_repair_required'}})
 expect(f.board.operations).toHaveLength(1);expect(f.board.nextSeq).toBe(2)
 if(change==='replacement')expect(rooms.get('board')!.operations).toEqual([])
})

it('recovers a legal >32 forced-cut author stream through the REAL paged indexed query, then detects prefix holes at the same durable cut',async()=>{
 const f=setup(),transport=new CanonicalRoomTransport(policy)
 const query=vi.mocked(getCanonicalGesturePrefixWithRows),previous=query.getMockImplementation()!
 const actual=await vi.importActual<typeof import('./snapshotStore.js')>('./snapshotStore.js')
 const persisted:import('./roomPersistence.js').CanonicalStoredOperationRow[]=[]
 db.operation.create.mockImplementation(async({data})=>{persisted.push(data);return {}})
 db.operation.findMany.mockImplementation(async({where,take})=>persisted.filter(row=>{
  const op=row.data as import('@grafetto/shared').Operation
  const frameBranch=where.OR.find((branch:{type:string})=>branch.type==='canonical_stroke')
  return row.roomId===where.roomId&&row.userId===frameBranch.userId&&row.type===frameBranch.type&&row.seq>where.seq.gt&&row.seq<=where.seq.lte
   &&op.type==='canonical_stroke'&&op.frame.strokeId===frameBranch.data.equals
 }).slice(0,take))
 query.mockImplementation(actual.getCanonicalGesturePrefixWithRows)
 try{
  const s=snapshot(await transport.begin(identity,f.input,()=>true)),packets=frames(f.descriptor,s,100)
  expect(packets.length).toBeGreaterThan(32)
  const save=async(owner:CanonicalRoomTransport,n:number)=>{
   recordOperation('board',{id:'unrelated'+n,type:'paper_dry',userId:'author',timestamp:n})
   const op:CanonicalStrokeOperation={id:'paged'+n,type:'canonical_stroke',userId:'author',timestamp:n,layerId:'layer',frame:packets[n]}
   expect((await owner.recorded(identity,op,()=>true)).result).toMatchObject({ok:true})
  }
  for(let n=0;n<packets.length-1;n++)await save(transport,n)
  await flushRoomWrites('board');db.operation.findMany.mockClear()
  const resumed=new CanonicalRoomTransport(policy),open=await resumed.begin(identity,f.input,()=>true)
  expect(open).toMatchObject({ok:true,recordedNext:packets.length-1,ended:false})
  expect(db.operation.findMany.mock.calls.length).toBeGreaterThan(1)
  await save(resumed,packets.length-1);await flushRoomWrites('board')
  expect(await new CanonicalRoomTransport(policy).begin(identity,f.input,()=>true)).toMatchObject({ok:true,recordedNext:packets.length,ended:true})
  const canonical=persisted.filter(row=>row.type==='canonical_stroke')
  expect(Buffer.byteLength(JSON.stringify(canonical),'utf8')).toBeLessThan(4*1024*1024)
  for(const missing of [canonical[0],canonical[Math.floor(canonical.length/2)],canonical.at(-1)!]){
   const at=persisted.indexOf(missing);persisted.splice(at,1)
   expect(await new CanonicalRoomTransport(policy).begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'canonical_repair_required'})
   persisted.splice(at,0,missing)
  }
  db.operation.findMany.mockImplementationOnce(async()=>[canonical[1],canonical[0]])
  expect(await new CanonicalRoomTransport(policy).begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'canonical_repair_required'})
 }finally{query.mockImplementation(previous)}
})

it('admits actual Marker D only explicitly, preserves zero-draw/live/recorded pins and cold resume',async()=>{
 const fixture=JSON.parse(readFileSync(new URL('../../../web/src/engine/src/presets/fixtures/sourceDefaultAutoWholePath/markerDry.normal.native.json',import.meta.url),'utf8'))
 const descriptor:unknown=fixture.imported.descriptor
 const library:unknown={schemaVersion:1,brushes:[{name:'Marker',source:'Marker.kpp',warnings:[],descriptor}],assets:[],skipped:[]}
 if(!isBrushLibrary(library))throw Error('Invalid actual Marker')
 const f=setup(library.brushes[0].descriptor)
 const combined:unknown={...library,brushes:[...library.brushes,{name:'Basic2',source:'Basic2.kpp',warnings:[],descriptor:stock.rows[0].descriptor}]}
 if(!isBrushLibrary(combined))throw Error('Invalid mixed fixture')
 f.storage.install('author',combined,new Map())
 const p:import('./canonicalExecutionPolicy.js').CanonicalRoomExecutionPolicy={authorRasterProfile:CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,allowedRecordedRasterProfiles:[CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE],fullHistoryFormat:'mixed-v2' as const,alphaDarkenVariants:['creamy'] as const,autoSources:{defaultAuto:{coverageProfile:'neon64-f32-fma-v1',storedScale:1}},seededDefaultAuto:{coverageProfile:CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,storedScale:1 as const},recordedSeededDefaultAutoProfile:CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE}
 expect(await new CanonicalRoomTransport({...p,seededDefaultAuto:false}).begin(identity,f.input,()=>true)).toMatchObject({ok:false})
 const transport=new CanonicalRoomTransport(p),s=snapshot(await transport.begin(identity,f.input,()=>true))
 expect(s.descriptorSha256).toBe(fixture.canonicalDescriptorSHA256)
 expect(canonicalBrushDescriptorJSON(f.descriptor)).toBeTypeOf('string')
 expect(s.material.primarySource).toMatchObject({kind:'defaultAuto',coverageProfile:CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,source:{density:.8}})
 const packets=frames(f.descriptor,s,3,true),prefix:CanonicalStrokeOperation[]=[]
 expect(packets.length).toBeGreaterThan(2)
 expect(decodeCanonicalStrokeFrame(packets[0],{...s,frameOrdinal:0}).frame.draws).toHaveLength(0)
 expect(packets.some((frame,frameOrdinal)=>decodeCanonicalStrokeFrame(frame,{...s,frameOrdinal}).frame.draws.length>0)).toBe(true)
 for(let i=0;i<packets.length;i++){
  expect(transport.live(identity,{layerId:'layer',frame:packets[i]}).result.ok).toBe(true)
  const op:CanonicalStrokeOperation={type:'canonical_stroke',id:'seeded-'+i,userId:'author',timestamp:i,layerId:'layer',frame:packets[i]}
  if(i===0){
   const errors=vi.spyOn(console,'error').mockImplementation(()=>{})
   try{db.operation.create.mockRejectedValueOnce(new Error('seeded durable failure'));expect(await transport.recorded(identity,op,()=>true)).toEqual({result:{ok:false,reason:'canonical_repair_required'}})}finally{errors.mockRestore()}
  }
  const result=await transport.recorded(identity,op,()=>true);expect(result.result).toMatchObject({ok:true,seq:i+1});prefix.push(result.accepted!)
  expect((await transport.recorded(identity,op,()=>true)).result).toMatchObject({ok:true,duplicate:true,seq:i+1})
  if(i===0){
   await flushRoomWrites('board');history.rows=[...prefix];history.canonicalRows=[db.operation.create.mock.calls.find(([request])=>request.data.id===op.id)![0].data];db.operation.count.mockResolvedValue(1)
   const reader=new CanonicalBrushCapabilityResolver({storage:f.storage,operator:empty,...p,seededDefaultAuto:false,maxGestures:4})
   expect(reader.readResidentRecordedCapability({roomId:'board',boardEpoch:3,operation:prefix[0]}).material).toEqual(s.material)
   expect(reader.size).toBe(0)
   expect(await new CanonicalRoomTransport({...p,seededDefaultAuto:false}).begin(identity,f.input,()=>true)).toMatchObject({ok:false})
   expect(snapshot(await new CanonicalRoomTransport(p).begin(identity,f.input,()=>true)).material).toEqual(s.material)
  }
 }
 await flushRoomWrites('board');db.operation.count.mockResolvedValue(prefix.length);history.rows=prefix
 history.canonicalRows=prefix.map(op=>db.operation.create.mock.calls.find(([request])=>request.data.id===op.id)![0].data)
 const cold=await new CanonicalRoomTransport(p).begin(identity,f.input,()=>true)
 expect(cold).toMatchObject({ok:true,ended:true,recordedNext:packets.length});expect(snapshot(cold).material).toEqual(s.material)
 const basic=combined.brushes[1].descriptor,basicInput={...f.input,brush:`brush:${basic.id}@${basic.version}`,strokeId:'native-density-one'}
 history.rows=[];history.canonicalRows=[];db.operation.count.mockResolvedValue(0)
 const native=snapshot(await transport.begin(identity,basicInput,()=>true))
 expect(native.material.primarySource).toMatchObject({kind:'defaultAuto',coverageProfile:'neon64-f32-fma-v1',source:{density:1}})
 const nativeFrames=frames(basic,native)
 for(let i=0;i<nativeFrames.length;i++){
  const op:CanonicalStrokeOperation={type:'canonical_stroke',id:'native-mixed-'+i,userId:'author',timestamp:i,layerId:'layer',frame:nativeFrames[i]}
  expect((await transport.recorded(identity,op,()=>true)).result).toMatchObject({ok:true,seq:prefix.length+i+1})
 }
 await flushRoomWrites('board')
 const readOnly=new CanonicalBrushCapabilityResolver({storage:f.storage,operator:empty,...p,seededDefaultAuto:false,maxGestures:4})
 for(const op of f.board.operations){if(op.type!=='canonical_stroke')throw Error('Unexpected mixed operation')
  const actual=readOnly.readResidentRecordedCapability({roomId:'board',boardEpoch:7,operation:op})
  expect(actual.material.primarySource).toMatchObject({coverageProfile:op.frame.strokeId===f.input.strokeId?CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE:'neon64-f32-fma-v1'})
 }
 const rows=db.operation.create.mock.calls.map(([request])=>request.data).filter((row,index,all)=>all.findIndex(other=>other.id===row.id)===index)
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(row=>row.seq>where.seq.gt&&row.seq<=where.seq.lte).slice(0,take))
 db.room.findUnique.mockResolvedValue({id:'board',lessonId:null,boardOwnerId:null,rasterVersion:'straight-rgba8-v1',ownerId:'author',passwordHash:null,classVisibility:'all',spotlightBoardId:null})
 let readCurrent=true
 const read=await new CanonicalRoomTransport({...p,seededDefaultAuto:false}).prepareReadDelivery(identity,()=>readCurrent)
 const full=await read.prepareFullHistory({throughSeq:f.board.nextSeq-1,floor:0})
 expect(full.operations).toHaveLength(f.board.operations.length)
 const result=read.finish(full.operations,full.canonicalRows,full)
 expect(result.canonicalHistoryBase).toMatchObject({kind:'full-room-prefix-v2',operationCount:f.board.operations.length})
 expect(result.canonicalCapabilities).toBeDefined()
 readCurrent=false;expect(()=>read.finish(full.operations,full.canonicalRows,full)).toThrow()
 const disabled=new CanonicalBrushCapabilityResolver({storage:f.storage,operator:empty,...p,seededDefaultAuto:false,recordedSeededDefaultAutoProfile:false,maxGestures:4})
 expect(()=>disabled.readResidentRecordedCapability({roomId:'board',boardEpoch:7,operation:prefix[0]})).toThrow('recorded policy disabled')
 history.rows=prefix;history.canonicalRows=prefix.map(op=>db.operation.create.mock.calls.find(([request])=>request.data.id===op.id)![0].data);db.operation.count.mockResolvedValue(prefix.length)
 expect(await new CanonicalRoomTransport({...p,seededDefaultAuto:false,recordedSeededDefaultAutoProfile:false}).begin(identity,f.input,()=>true)).toMatchObject({ok:false})
})
