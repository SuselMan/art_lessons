import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_RASTER_PROFILE,isBrushLibrary,sourceStampRequiredCurves,SOURCE_STAMP_MAPPED_COMPILER_PROFILE,type BrushDescriptor,type CanonicalStrokeBeginResult,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type CanonicalStrokeFrameEnvelope} from '@grafetto/shared'
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
const policy={rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,alphaDarkenVariants:['creamy','hard'] as const,autoSources:{defaultAuto:{coverageProfile:'neon64-f32-fma-v1' as const,storedScale:1 as const}}}
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
 if(s.material.primarySource.kind==='image')throw Error('Expected procedural source')
 const compiled=sourceStrokeAuthorDescriptor(descriptor,{colorIdentity:'native-black',lodScale:1,coverageProfile:s.material.primarySource.coverageProfile})
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

const {default:soft}=await import(new URL('../../../../packages/shared/src/fixtures/sourceSoftAutoData/stock.native.ts',import.meta.url).href)
function softDescriptor():BrushDescriptor{
 const data=structuredClone(soft.rows.find((r:{index:number})=>r.index===72)!.sourceStamp)
 const entry=(source:typeof data.source.softnessCurve)=>({source,coefficients:Array.from({length:source.points.length-1},()=>[0,0,0,0])})
 return {...stock.rows[0].descriptor,sourceStamp:{...data,unsupported:[],role:'primary',source:{...data.source,ratio:1,spikes:2,antialias:false,randomness:0,density:1},
  brush:{...data.brush,scale:1},flags:{...data.flags,materialFixed1:true,textureEnabled:false},
  compiled:{version:2,reader:data.reader,profile:SOURCE_STAMP_MAPPED_COMPILER_PROFILE,buildId:'b'.repeat(64),curves:sourceStampRequiredCurves(data.options).map(entry),radialCurve:entry(data.source.softnessCurve)}}} as unknown as BrushDescriptor
}
const selected={...policy,autoSources:{softAuto:{coverageProfile:'neon64-f32-fma-v1' as const,storedScale:1 as const}}}
it('keeps soft execution default OFF and retains historical unsupported reasons',async()=>{
 const f=setup(softDescriptor()),asset=vi.spyOn(f.storage,'asset'),pin=vi.spyOn(f.storage,'pin')
 expect(await new CanonicalRoomTransport(policy).begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'invalid_operation'})
 expect(asset).not.toHaveBeenCalled();expect(pin).not.toHaveBeenCalled()
 for(const autoSources of [{softAuto:{coverageProfile:'scalar-bionic-f64-fma-v1',storedScale:1}},{softAuto:{coverageProfile:'neon64-f32-fma-v1',storedScale:2}},{softAuto:{coverageProfile:'neon64-f32-fma-v1',storedScale:1,extra:true}}])expect(()=>new CanonicalRoomTransport({...policy,autoSources} as never)).toThrow('explicit auto policy')
 const fenced=softDescriptor();Object.assign(fenced.sourceStamp!,{unsupported:['soft-auto-raster-author-unavailable']});rooms.clear()
 const blocked=setup(fenced)
 expect(await new CanonicalRoomTransport(selected).begin(identity,blocked.input,()=>true)).toEqual({ok:false,reason:'invalid_operation'})
})
it('transports synthetic mapped soft through SAME snapshot/author/encoder/live/record/cold-reconnect',async()=>{
 const f=setup(softDescriptor()),asset=vi.spyOn(f.storage,'asset')
 const transport=new CanonicalRoomTransport(selected),s=snapshot(await transport.begin(identity,f.input,()=>true))
 if(s.material.primarySource.kind!=='softAuto')throw Error('Expected soft pin')
 expect(s.material.primarySource.sourceSlot).toBe(0);expect(Object.isFrozen(s.material.primarySource.radialCurve.coefficients[0])).toBe(true)
 const packets=frames(f.descriptor,s),prefix:CanonicalStrokeOperation[]=[]
 for(let i=0;i<packets.length;i++){
  expect(transport.live(identity,{layerId:'layer',frame:packets[i]}).result).toEqual({ok:true,duplicate:false})
  const op:CanonicalStrokeOperation={type:'canonical_stroke',id:'soft-'+i,userId:'author',timestamp:i,layerId:'layer',frame:packets[i]}
  const saved=await transport.recorded(identity,op,()=>true);expect(saved.result).toMatchObject({ok:true,seq:i+1});prefix.push(saved.accepted!)
  expect((await transport.recorded(identity,op,()=>true)).result).toMatchObject({ok:true,duplicate:true,seq:i+1})
 }
 await flushRoomWrites('board');db.operation.count.mockResolvedValue(prefix.length);history.rows=prefix
 const cold=await new CanonicalRoomTransport(selected).begin(identity,f.input,()=>true)
 expect(cold).toMatchObject({ok:true,ended:true,recordedNext:packets.length,liveNext:packets.length})
 expect(snapshot(cold).material).toEqual(s.material);expect(asset).not.toHaveBeenCalled()
})
it('pins full soft compiler/radial signature and rejects trusted mutations without admission advance',()=>{
 const f=setup(softDescriptor()),binder=new CanonicalBrushCapabilityResolver({storage:f.storage,operator:empty,...selected,maxGestures:4})
 const grant=binder.beginGesture(identity,f.input)
 if(!('version' in grant.material))throw Error('Expected wire2')
 const material=grant.material,pin=material.primarySource
 if(pin.kind!=='softAuto')throw Error('Expected soft')
 const s={materialVersion:2,material,brush:grant.brush,strokeId:grant.strokeId,pigmentRgb8:grant.pigmentRgb8,composition:grant.composition} as CanonicalStrokeSnapshotV2
 const packets=frames(f.descriptor,s)
 let current=grant
 const admission=new CanonicalStrokeAdmission({resolve:()=>current,retainedFrames:8,maxGestures:4})
 const candidate=(i:number)=>({type:'canonical_stroke_live',layerId:'layer',frame:packets[i]})
 admission.prepare(identity,candidate(0)).commit()
 for(const patch of [{buildId:'c'.repeat(64)},{coverageProfile:'scalar-f64-fma-v1' as const},{sourceSlot:1 as const},{radialCurve:{...pin.radialCurve,coefficients:pin.radialCurve.coefficients.map(c=>[c[0],c[1],c[2],c[3]+.01] as const)}}]){
  current={...grant,material:{...material,primarySource:{...pin,...patch}}}
  expect(()=>admission.prepare(identity,candidate(1))).toThrow()
  expect(admission.cursor(identity,grant.strokeId).liveNext).toBe(1)
 }
})
function deferredWrite(){let resolve!:()=>void,reject!:(error:Error)=>void;const promise=new Promise<void>((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
it('withholds soft ACK until durability and repairs the identical failed frame without repinning',async()=>{
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport(selected)
 const s=snapshot(await transport.begin(identity,f.input,()=>true)),packets=frames(f.descriptor,s)
 const operation=(i:number):CanonicalStrokeOperation=>({type:'canonical_stroke',id:'durable-soft-'+i,userId:'author',timestamp:i,layerId:'layer',frame:packets[i]})
 const pin=vi.spyOn(f.storage,'pin'),first=deferredWrite(),log=vi.spyOn(console,'error').mockImplementation(()=>{})
 db.operation.create.mockReturnValueOnce(first.promise)
 const op=operation(0),pending=transport.recorded(identity,op,()=>true),settled=vi.fn();void pending.then(settled)
 await vi.waitFor(()=>expect(f.board.operations).toHaveLength(1))
 expect(settled).not.toHaveBeenCalled();expect(f.board.nextSeq).toBe(2)
 const duplicate=transport.recorded(identity,op,()=>true),begin=transport.begin(identity,f.input,()=>true)
 const next=transport.recorded(identity,operation(1),()=>true)
 first.reject(new Error('soft insert failed after admission'))
 for(const outcome of await Promise.all([pending,duplicate,next]))expect(outcome).toEqual({result:{ok:false,reason:'canonical_repair_required'}})
 expect(await begin).toEqual({ok:false,reason:'canonical_repair_required'})
 expect(await new CanonicalRoomTransport(selected).begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'canonical_repair_required'})
 expect(f.board.operations).toHaveLength(1);expect(db.operation.create).toHaveBeenCalledTimes(1)
 const repair=deferredWrite(),pins=pin.mock.calls.length;db.operation.create.mockReturnValueOnce(repair.promise)
 const a=transport.recorded(identity,op,()=>true),b=transport.recorded(identity,op,()=>true)
 await vi.waitFor(()=>expect(db.operation.create).toHaveBeenCalledTimes(2));expect(pin).toHaveBeenCalledTimes(pins)
 repair.resolve()
 for(const outcome of await Promise.all([a,b])){
  expect(outcome.result).toEqual({ok:true,seq:1,duplicate:true});expect(outcome.accepted).toBe(f.board.operations[0])
  expect(outcome.accepted!.frame.materialPacked).toBe(op.frame.materialPacked)
 }
 expect(f.board.nextSeq).toBe(2);expect(f.board.operations).toHaveLength(1)
 expect(await transport.recorded(identity,operation(1),()=>true)).toMatchObject({result:{ok:true,seq:2}})
 expect(db.operation.create).toHaveBeenCalledTimes(3);log.mockRestore()
})
