import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_RASTER_PROFILE,isBrushLibrary,canonicalMaterialGeometryCost,decodeCanonicalStrokeFrame,buildCanonicalMaterial,type BrushDescriptor,type CanonicalStrokeBeginResult,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type CanonicalStrokeFrameEnvelope} from '@grafetto/shared'
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
import {CanonicalBrushCapabilityResolver} from './CanonicalBrushCapabilityResolver.js'
import {CanonicalStrokeAdmission} from './CanonicalStrokeAdmission.js'
const db=vi.hoisted(()=>({operation:{count:vi.fn(),findUnique:vi.fn(),create:vi.fn()},room:{update:vi.fn()}}))
vi.mock('../db/prisma.js',()=>({prisma:db}))
const history=vi.hoisted(()=>({rows:[] as unknown[]}))
vi.mock('./snapshotStore.js',()=>({getOperationsBefore:vi.fn(async()=>history.rows)}))
const dirs:string[]=[]
beforeEach(()=>{db.operation.count.mockResolvedValue(0);db.operation.findUnique.mockResolvedValue(null);db.operation.create.mockResolvedValue({});history.rows=[]})
afterEach(async()=>{for(const id of rooms.keys())await flushRoomWrites(id);rooms.clear();for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});vi.restoreAllMocks();vi.clearAllMocks()})
function resident():RoomRecord{
 const record:RoomRecord={room:{id:'board',name:'Board',ownerId:'author',paper:'coarse',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-29T00:00:00Z',rasterVersion:'straight-rgba8-v1'},lessonId:null,sockets:new Set(),boards:[],assignments:[],activeAssignmentId:null,spotlightBoardId:null,handsRaised:new Set(),assignmentStarting:false,passwordHash:undefined,operations:[],participants:new Map(),nextSeq:1,layerStateSeq:null,layerStateIds:null,coveredSeqByLayer:new Map(),palette:[],roomFrozen:false,frozenUserIds:new Set(),lockedLayerIds:new Set(),sharedLockedLayerIds:new Set(),aliveIds:new Set(['layer']),deletedIds:new Set(),operationsById:new Map(),structuralLog:[]}
 record.participants.set('author',{userId:'author',name:'A',role:'owner',color:'#000000',frozen:false,boardId:'board'});rooms.set('board',record);return record
}
const identity={roomId:'board',userId:'author'}
const policy={rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,alphaDarkenVariants:['creamy','hard'] as const,defaultAuto:{coverageProfile:'neon64-f32-fma-v1' as const,storedScale:1 as const}}
function setup(descriptor=stock.rows[0].descriptor as unknown as BrushDescriptor){
 const dir=mkdtempSync(join(tmpdir(),'server-auto-v2-'));dirs.push(dir);const storage=new BrushStorage(dir)
 const library={schemaVersion:1,brushes:[{name:'Actual auto',source:'fixture.kpp',warnings:[],descriptor}],assets:[],skipped:[]}
 if(!isBrushLibrary(library))throw Error('Invalid real descriptor fixture')
 storage.install('author',library,new Map());setBrushStorage(storage,empty());const board=resident()
 const input={layerId:'layer',brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:'gesture',pigmentRgb8:[183,47,211] as [number,number,number],outerResourceOpacity:.73,alphaDarken:'creamy' as const}
 return{storage,library,board,input,descriptor}
}
function snapshot(result:CanonicalStrokeBeginResult):CanonicalStrokeSnapshotV2{if(!result.ok||!('materialVersion'in result.snapshot))throw Error(JSON.stringify(result));return result.snapshot}
function frames(descriptor:BrushDescriptor,s:CanonicalStrokeSnapshotV2){
 const compiled=sourceStrokeAuthorDescriptor(descriptor,{colorIdentity:'native-black',lodScale:1,coverageProfile:'neon64-f32-fma-v1'})
 if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const author=new SourceStrokeAuthor(compiled.program);let state=author.createState(4321,7654,.3)
 const material={...s.material,targetGeometry:{pageBounds:{minX:0,minY:0,maxX:64,maxY:64},tileWidth:64,tileHeight:64,maxTargets:64}}
 const adapter=new SourceStrokeMaterialAdapter(compiled.program,material,state),encoder=new SourceCanonicalFrameEncoder({brush:s.brush,strokeId:s.strokeId,pigmentRgb8:s.pigmentRgb8,composition:s.composition,material})
 const result:CanonicalStrokeFrameEnvelope[]=[]
 const collect=(chunks:readonly{packed:string}[])=>{for(const c of chunks)result.push(encoder.encode(c.packed).envelope)}
 for(let i=0;i<3;i++){
  collect(adapter.beginInput(state));const packet={x:25+i*3.25,y:29+i*1.5,t:i*19,pressure:[.25,.65,1][i],tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:i===2,mirroredV:false,tiltDirectionOffset:0,hover:false}
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
  expect(packets.length).toBeLessThanOrEqual(32)
  for(let i=0;i<packets.length;i++){
   const live=transport.live(identity,{layerId:'layer',frame:packets[i]});expect(live.result).toEqual({ok:true,duplicate:false})
   expect(transport.live(identity,{layerId:'layer',frame:packets[i]}).result).toEqual({ok:true,duplicate:true})
   const op:CanonicalStrokeOperation={type:'canonical_stroke',id:'op'+i,userId:'author',timestamp:i,layerId:'layer',frame:packets[i]}
   const saved=await transport.recorded(identity,op,()=>true);expect(saved.result).toMatchObject({ok:true,seq:i+1});expect(saved.accepted!.frame).toEqual(packets[i]);prefix.push(saved.accepted!)
   const pins=pin.mock.calls.length;expect((await transport.recorded(identity,op,()=>true)).result).toMatchObject({ok:true,duplicate:true,seq:i+1});expect(pin.mock.calls.length).toBe(pins)
   if(i===1){
    await flushRoomWrites('board');db.operation.count.mockResolvedValue(prefix.length);history.rows=[...prefix]
    transport=new CanonicalRoomTransport(policy)
    expect(await transport.begin(identity,f.input,()=>true)).toMatchObject({ok:true,recordedNext:2,liveNext:2,ended:false})
   }
  }
  await flushRoomWrites('board');expect(asset).not.toHaveBeenCalled();expect(pin).toHaveBeenCalled();expect(f.storage.library('rooms','board').brushes[0].descriptor).toEqual(JSON.parse(JSON.stringify(f.descriptor)))
  db.operation.count.mockResolvedValue(prefix.length);history.rows=prefix
  const cold=new CanonicalRoomTransport(policy),replayed=await cold.begin(identity,f.input,()=>true)
  expect(replayed).toMatchObject({ok:true,recordedNext:packets.length,liveNext:packets.length,ended:true});expect(snapshot(replayed).material).toEqual(s.material)
  history.rows=prefix.slice(1);expect(await new CanonicalRoomTransport(policy).begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'canonical_repair_required'})
  db.operation.count.mockResolvedValue(0);history.rows=[];asset.mockRestore();pin.mockRestore();await flushRoomWrites('board');rooms.clear()
 }
})
it('defaults auto OFF and rejects legacy rooms, malformed material policies and changed permissions before pin/store',async()=>{
 const f=setup(),pin=vi.spyOn(f.storage,'pin'),asset=vi.spyOn(f.storage,'asset')
 expect(await new CanonicalRoomTransport().begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'invalid_operation'})
 expect(db.operation.count).not.toHaveBeenCalled();expect(pin).not.toHaveBeenCalled();expect(asset).not.toHaveBeenCalled()
 f.board.room.rasterVersion='legacy-pm8-v1';expect(await new CanonicalRoomTransport(policy).begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'invalid_operation'});expect(pin).not.toHaveBeenCalled()
 f.board.room.rasterVersion='straight-rgba8-v1';db.operation.count.mockImplementationOnce(async()=>{f.board.aliveIds.delete('layer');return 0})
 expect(await new CanonicalRoomTransport(policy).begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'invalid_operation'});expect(pin).not.toHaveBeenCalled()
})
it('pins full auto context/profile/version immutably across lanes, with no assets or weak callback fallback',()=>{
 const f=setup(),binder=new CanonicalBrushCapabilityResolver({storage:f.storage,operator:empty,...policy,maxGestures:4}),grant=binder.beginGesture(identity,f.input)
 let current=grant;const admission=new CanonicalStrokeAdmission({resolve:()=>current,maxGestures:1,retainedFrames:8})
 if(!('version'in grant.material)||grant.material.primarySource.kind!=='defaultAuto')throw Error('Missing V2 auto pin')
 const s={...grant,materialVersion:2 as const,material:grant.material,assets:[]} as CanonicalStrokeSnapshotV2,packet=frames(f.descriptor,s)[0]
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
 expect(await new CanonicalRoomTransport({...policy,defaultAuto:{coverageProfile:'unknown' as never,storedScale:1}}).begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'invalid_operation'})
 expect(await new CanonicalRoomTransport(policy).begin(identity,{...f.input,sourceProfile:'neon64-f32-fma-v1'} as never,()=>true)).toEqual({ok:false,reason:'invalid_operation'})
 const inherited=Object.create({coverageProfile:'neon64-f32-fma-v1'});inherited.storedScale=1;inherited.extra=true
 expect(()=>new CanonicalBrushCapabilityResolver({storage:f.storage,operator:empty,...policy,defaultAuto:inherited,maxGestures:4})).toThrow('explicit auto policy')
 expect(pin).not.toHaveBeenCalled();expect(db.operation.count).not.toHaveBeenCalled()
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
it('publishes neither begin grant nor live/record ordinal after pin failures and preserves existing prefix bounds',async()=>{
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
 await flushRoomWrites('board');pin.mockClear();db.operation.count.mockResolvedValue(33)
 expect(await new CanonicalRoomTransport(policy).begin(identity,input,()=>true)).toEqual({ok:false,reason:'canonical_repair_required'});expect(pin).not.toHaveBeenCalled()
})
