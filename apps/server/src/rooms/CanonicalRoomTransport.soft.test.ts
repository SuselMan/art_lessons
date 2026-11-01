import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_RASTER_PROFILE,unpackCanonicalMaterial,isBrushLibrary,sourceStampRequiredCurves,SOURCE_STAMP_MAPPED_COMPILER_PROFILE,type BrushDescriptor,type CanonicalStrokeBeginResult,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type CanonicalStrokeFrameEnvelope} from '@grafetto/shared'
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
import {joinRoom,leaveRoom,captureCurrentRoomSeat} from './rooms.js'
import {prepareAuthorizedJoin} from './roomAccess.js'
import {prepareSnapshotReplay} from './snapshotReplayLoader.js'
import {getCanonicalGesturePrefixWithRows,visitCanonicalGesturePrefixRows,type CanonicalGesturePrefixVisit} from './snapshotStore.js'
import {CanonicalBrushCapabilityResolver} from './CanonicalBrushCapabilityResolver.js'
import {CanonicalStrokeAdmission} from './CanonicalStrokeAdmission.js'
const db=vi.hoisted(()=>({$transaction:vi.fn(),$queryRawUnsafe:vi.fn(),$executeRawUnsafe:vi.fn(),roomBlock:{findUnique:vi.fn()},roomParticipant:{upsert:vi.fn()},operation:{count:vi.fn(),findMany:vi.fn(),findUnique:vi.fn(),create:vi.fn()},room:{update:vi.fn()},roomLayerState:{findUnique:vi.fn()},roomLayerSnapshot:{findMany:vi.fn()}}))
db.$transaction=vi.fn(async(run:(connection:typeof db)=>Promise<unknown>)=>run(db))
vi.mock('../db/prisma.js',()=>({prisma:db}))
vi.mock('../db/canonicalIndexedReader.js',()=>({withCanonicalIndexedValidation:async(run:(client:unknown)=>Promise<unknown>)=>run(db)}))
const history=vi.hoisted(()=>({rows:[] as unknown[],canonicalRows:[] as unknown[],close:undefined as import('./snapshotStore.js').CanonicalIndexedCloseEvidence|undefined}))
vi.mock('./snapshotStore.js',async importOriginal=>({...await importOriginal<typeof import('./snapshotStore.js')>(),visitCanonicalGesturePrefixRows:vi.fn(),getCanonicalGesturePrefixWithRows:vi.fn(async()=>({operations:history.rows,canonicalRows:history.canonicalRows,...history.close?{close:history.close}:{}})),getOperationsBefore:vi.fn(async()=>history.rows),getOperationsBeforeWithCanonicalRows:vi.fn(async()=>({operations:history.rows,canonicalRows:history.canonicalRows}))}))
const readAccess=vi.hoisted(()=>({allowed:true,gate:undefined as Promise<void>|undefined,calls:[] as [string,string][]}))
vi.mock('./boardContentAccess.js',()=>({mayReadBoardContent:vi.fn(async(roomId:string,userId:string)=>{readAccess.calls.push([roomId,userId]);await readAccess.gate;return readAccess.allowed})}))
// Existing fixtures keep their bounded-array DB double; dedicated LS1 tests
// below install the ACTUAL page visitor to prove production streaming behavior.
async function boundedPrefixVisitor(roomId:string,selector:{userId:string;strokeId:string},cut:number,input:CanonicalGesturePrefixVisit){
 const prefix=await getCanonicalGesturePrefixWithRows(roomId,selector,cut,input.requiredFrame)
 if(input.afterRead)await input.afterRead()
 for(let n=0;n<prefix.operations.length;n++)input.visit(prefix.operations[n],prefix.canonicalRows[n])
 if(prefix.close)input.visit(prefix.close.operation,prefix.close.row)
 return{lastOperation:prefix.operations.at(-1),lastRow:prefix.canonicalRows.at(-1),...prefix.close?{close:prefix.close}:{}}
}
const dirs:string[]=[]
beforeEach(()=>{db.roomBlock.findUnique.mockResolvedValue(null);vi.mocked(getCanonicalGesturePrefixWithRows).mockReset();vi.mocked(visitCanonicalGesturePrefixRows).mockImplementation(boundedPrefixVisitor);db.roomLayerState.findUnique.mockResolvedValue(null);db.roomLayerSnapshot.findMany.mockResolvedValue([]);readAccess.allowed=true;readAccess.gate=undefined;readAccess.calls=[];db.operation.count.mockResolvedValue(0);db.operation.findUnique.mockResolvedValue(null);db.operation.create.mockResolvedValue({});history.rows=[];history.canonicalRows=[];history.close=undefined})
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
function frames(descriptor:BrushDescriptor,s:CanonicalStrokeSnapshotV2,inputCount=3){
 if(s.material.primarySource.kind==='image')throw Error('Expected procedural source')
 const compiled=sourceStrokeAuthorDescriptor(descriptor,{colorIdentity:'native-black',lodScale:1,coverageProfile:s.material.primarySource.coverageProfile})
 if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const author=new SourceStrokeAuthor(compiled.program);let state=author.createState(4321,7654,.3)
 const material={...s.material,targetGeometry:{pageBounds:{minX:0,minY:0,maxX:64,maxY:64},tileWidth:64,tileHeight:64,maxTargets:64}}
 const adapter=new SourceStrokeMaterialAdapter(compiled.program,material,state),encoder=new SourceCanonicalFrameEncoder({rasterProfile:s.rasterProfile,brush:s.brush,strokeId:s.strokeId,pigmentRgb8:s.pigmentRgb8,composition:s.composition,material})
 const result:CanonicalStrokeFrameEnvelope[]=[]
 const collect=(chunks:readonly{packed:string}[])=>{for(const c of chunks)result.push(encoder.encode(c.packed).envelope)}
 for(let i=0;i<inputCount;i++){
  collect(adapter.beginInput(state));const packet={x:25+(i%8)*3.25,y:29+(i%8)*1.5,t:i*19,pressure:[.25,.65,1][i%3],tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:i===2,mirroredV:false,tiltDirectionOffset:0,hover:false}
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
 await flushRoomWrites('board');db.operation.count.mockResolvedValue(prefix.length);history.rows=prefix;history.canonicalRows=db.operation.create.mock.calls.map(([request])=>request.data).filter(row=>prefix.some(op=>op.id===row.id))
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
  expect(outcome.canonicalCapabilities?.bindings).toEqual([{operationId:op.id,sequence:1,originalUserId:'author',capability:0}])
  expect(outcome.canonicalCapabilities?.capabilities[0].snapshot.material).toEqual(s.material)
 }
 expect(f.board.nextSeq).toBe(2);expect(f.board.operations).toHaveLength(1)
 expect(await transport.recorded(identity,operation(1),()=>true)).toMatchObject({result:{ok:true,seq:2}})
 expect(db.operation.create).toHaveBeenCalledTimes(3);log.mockRestore()
})

it('rejects unsupported outer composition for every auto family before pin or asset access',async()=>{
 const {default:gaussian}=await import(new URL('../../../../packages/shared/src/fixtures/sourceGaussianAutoData/stock.native.ts',import.meta.url).href)
 const policies={...policy,autoSources:{...policy.autoSources,...selected.autoSources,gaussianAuto:{coverageProfile:'neon64-f32-fma-v1' as const,storedScale:1 as const}}}
 const descriptors=[stock.rows[0].descriptor,gaussian.rows.find((r:{index:number})=>r.index===5)!.descriptor,softDescriptor()] as BrushDescriptor[]
 for(const original of descriptors){
  for(const mode of ['normal','multiply','overlay','lighten','colorDodge','color','erase','burnt']){
   const descriptor=structuredClone(original),rendering=descriptor.behavior?.rendering
   if(!rendering)throw Error('Expected explicit rendering')
   if(mode==='erase')Object.assign(descriptor.behavior!,{erase:true})
   else if(mode==='burnt')Object.assign(rendering,{burntEdges:.2})
   else Object.assign(rendering,{blendMode:mode})
   const f=setup(descriptor),asset=vi.spyOn(f.storage,'asset'),pin=vi.spyOn(f.storage,'pin'),transport=new CanonicalRoomTransport(policies)
   const result=await transport.begin(identity,f.input,()=>true)
   if(mode==='normal')expect(result.ok).toBe(true)
   else {expect(result).toEqual({ok:false,reason:'invalid_operation'});expect(pin).not.toHaveBeenCalled();expect(f.board.operations).toEqual([]);expect(f.board.nextSeq).toBe(1)}
   expect(asset).not.toHaveBeenCalled();asset.mockRestore();pin.mockRestore();rooms.clear()
  }
 }
})
it('derives recorded peer capability only from the room pin without granting peer append',async()=>{
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport(selected)
 const s=snapshot(await transport.begin(identity,f.input,()=>true)),frame=frames(f.descriptor,s)[0]
 const saved=await transport.recorded(identity,{type:'canonical_stroke',id:'peer-recorded',userId:'author',timestamp:0,layerId:'layer',frame},()=>true)
 if(!saved.accepted)throw Error('Expected accepted recorded row')
 const operation=saved.accepted,row=db.operation.create.mock.calls[0][0].data
 const conflicting=structuredClone(f.library);conflicting.brushes[0].descriptor.opacity=.123
 f.storage.install('reader',conflicting,new Map())
 const reader={roomId:'board',userId:'reader'},read=new CanonicalBrushCapabilityResolver({storage:f.storage,operator:()=>conflicting,...selected,maxGestures:4})
 const library=vi.spyOn(f.storage,'library'),pin=vi.spyOn(f.storage,'pin'),asset=vi.spyOn(f.storage,'asset')
 const capability=read.readRecordedCapability({roomId:'board',boardEpoch:7,operation,row})
 expect(capability.originalUserId).toBe('author');expect(capability.originalUserId).not.toBe(reader.userId)
 expect(capability.descriptorSha256).toBe(s.descriptorSha256);expect(capability.boardEpoch).toBe(7)
 expect(library.mock.calls.every(([scope,id])=>scope==='rooms'&&id==='board')).toBe(true)
 expect(pin).not.toHaveBeenCalled();expect(asset).not.toHaveBeenCalled();expect(read.size).toBe(0)
 expect(read.resolve(reader,{layerId:'layer',brush:frame.brush,strokeId:frame.strokeId})).toBeUndefined()
 expect(read.resolve(identity,{layerId:'layer',brush:frame.brush,strokeId:frame.strokeId})).toBeUndefined()
 const admission=new CanonicalStrokeAdmission({resolve:read.resolve,retainedFrames:8,maxGestures:4})
 expect(()=>admission.prepare(reader,{type:'canonical_stroke',id:'pretend-peer',layerId:'layer',frame})).toThrow('capability unavailable')
 expect(Object.isFrozen(capability.material.primarySource)).toBe(true)
 if(capability.material.primarySource.kind!=='softAuto')throw Error('Expected soft')
 expect(Object.isFrozen(capability.material.primarySource.radialCurve.coefficients[0])).toBe(true)
 const disabled=new CanonicalBrushCapabilityResolver({storage:f.storage,operator:empty,...policy,maxGestures:4})
 expect(()=>disabled.readRecordedCapability({roomId:'board',boardEpoch:7,operation,row})).toThrow('policy disabled')
 for(const patch of [{roomId:'other'},{userId:'reader'},{id:'other'},{seq:99},{type:'stroke'},{layerId:'other'},{tool:'pencil'},{data:{...operation,frame:{...frame,strokeId:'other'}}}]){
  expect(()=>read.readRecordedCapability({roomId:'board',boardEpoch:7,operation,row:{...row,...patch}})).toThrow('immutable row conflict')
 }
 const malformed=structuredClone(operation);Object.assign(malformed,{frame:null})
 expect(()=>read.readRecordedCapability({roomId:'board',boardEpoch:7,operation:malformed,row:{...row,data:malformed}})).toThrow()
 library.mockReturnValueOnce(empty())
 expect(()=>read.readRecordedCapability({roomId:'board',boardEpoch:7,operation,row})).toThrow('room brush pin unavailable')
 expect(read.size).toBe(0)
})
it('projects one closed recorded batch with temporary gesture dedup and rejects later resource changes atomically',async()=>{
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport(selected)
 const s=snapshot(await transport.begin(identity,f.input,()=>true)),packets=frames(f.descriptor,s)
 const operations:CanonicalStrokeOperation[]=[]
 for(let i=0;i<2;i++){
  const result=await transport.recorded(identity,{type:'canonical_stroke',id:'batch-'+i,userId:'author',timestamp:i,layerId:'layer',frame:packets[i]},()=>true)
  if(!result.accepted)throw Error('Expected recorded operation');operations.push(result.accepted)
 }
 const rows=db.operation.create.mock.calls.map(([request])=>request.data)
 const binder=new CanonicalBrushCapabilityResolver({storage:f.storage,operator:empty,...selected,maxGestures:4}),read=vi.spyOn(binder,'readRecordedCapability'),pin=vi.spyOn(f.storage,'pin')
 const input={roomId:'board',boardEpoch:9,operations,rows}
 const attachment=binder.prepareRecordedAttachment(input)
 expect(attachment.capabilities).toHaveLength(1);expect(attachment.bindings.map(b=>[b.operationId,b.sequence,b.originalUserId,b.capability])).toEqual([['batch-0',1,'author',0],['batch-1',2,'author',0]])
 expect(read).toHaveBeenCalledTimes(1);expect(Object.isFrozen(attachment.bindings[0])).toBe(true);expect(pin).not.toHaveBeenCalled();expect(binder.size).toBe(0)
 const changed=structuredClone(operations[1]);Object.assign(changed.frame,{pigmentRgb8:[99,2,3]})
 expect(()=>binder.prepareRecordedAttachment({...input,operations:[operations[0],changed],rows:[rows[0],{...rows[1],data:changed}]})).toThrow()
 expect(()=>binder.prepareRecordedAttachment({...input,rows:rows.slice(0,1)})).toThrow()
 expect(()=>binder.prepareRecordedAttachment({...input,rows:[rows[1],rows[0]]})).toThrow('immutable row conflict')
 expect(()=>binder.prepareRecordedAttachment({...input,rows:[...rows,rows[1]]})).toThrow('row closure')
 expect(()=>binder.prepareRecordedAttachment({...input,operations:Array(1025).fill(operations[0])})).toThrow('capacity')
 expect(binder.size).toBe(0);expect(pin).not.toHaveBeenCalled();expect(f.board.operations).toHaveLength(2)
})

it('prepares authoritative empty read scope, reuses its epoch for BEGIN, and rejects stale captured scope',async()=>{
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport(selected),reader={roomId:'board',userId:'reader'}
 let current=true
 const first=await transport.prepareReadDelivery(reader,()=>current),empty=first.finish([])
 expect(empty.canonicalReadScope).toEqual(first.scope);expect(empty).not.toHaveProperty('canonicalCapabilities')
 expect(readAccess.calls).toEqual([['board','reader']])
 const second=await transport.prepareReadDelivery(reader,()=>current);expect(second.scope).toEqual(first.scope)
 const begin=snapshot(await transport.begin(identity,f.input,()=>true));expect(begin.boardEpoch).toBe(first.scope.boardEpoch)
 current=false;expect(()=>first.finish([])).toThrow('not_joined')
 current=true;rooms.set('board',{...f.board})
 expect(()=>second.finish([])).toThrow('repair_required')
 const replacement=await transport.prepareReadDelivery(reader,()=>true);expect(replacement.scope.boardEpoch).toBeGreaterThan(first.scope.boardEpoch)
})
it('requires successful actual resident receipt for read delivery, not equal objects or pending writes',async()=>{
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport(selected),s=snapshot(await transport.begin(identity,f.input,()=>true)),frame=frames(f.descriptor,s)[0]
 const write=deferredWrite();db.operation.create.mockReturnValueOnce(write.promise)
 const pending=transport.recorded(identity,{type:'canonical_stroke',id:'resident-read',userId:'author',timestamp:0,layerId:'layer',frame},()=>true)
 await vi.waitFor(()=>expect(f.board.operations).toHaveLength(1))
 const read=await transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>true)
 expect(()=>read.finish(f.board.operations)).toThrow('receipt unavailable')
 write.resolve();const recorded=await pending;if(!recorded.accepted)throw Error('Expected recorded')
 const accepted=recorded.accepted
 const delivered=read.finish([accepted])
 expect(delivered.canonicalCapabilities?.bindings[0]).toEqual({operationId:accepted.id,sequence:accepted.seq,originalUserId:'author',capability:0})
 expect(()=>read.finish([structuredClone(accepted)])).toThrow('receipt unavailable')
 const readAgain=await transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>true)
 setBrushStorage(new BrushStorage(f.storage.root),empty())
 expect(()=>readAgain.finish([accepted])).toThrow('repair_required')
})
it('denies reader policy and captured lifetime changes across asynchronous read permission',async()=>{
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport(selected)
 readAccess.allowed=false
 await expect(transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>true)).rejects.toThrow('not_joined')
 readAccess.allowed=true
 const gate=deferredWrite();readAccess.gate=gate.promise
 let current=true;const pending=transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>current)
 const rejected=expect(pending).rejects.toThrow('not_joined');current=false;gate.resolve();await rejected
 expect(f.board.operations).toHaveLength(0)
})

it('projects cold row and resident receipt in the SAME read epoch without adopting synthetic resident authority',async()=>{
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport(selected)
 const s=snapshot(await transport.begin(identity,f.input,()=>true)),packets=frames(f.descriptor,s)
 const operations:CanonicalStrokeOperation[]=[]
 for(let i=0;i<2;i++){
  const recorded=await transport.recorded(identity,{type:'canonical_stroke',id:'mixed-'+i,userId:'author',timestamp:i,layerId:'layer',frame:packets[i]},()=>true)
  if(!recorded.accepted)throw Error('Expected durable recorded');operations.push(recorded.accepted)
 }
 const cold=structuredClone(operations[1]),row=db.operation.create.mock.calls[1][0].data
 const read=await transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>true)
 expect(read.scope.boardEpoch).toBe(s.boardEpoch)
 const legacyLane=structuredClone(operations[0]);Object.assign(legacyLane.frame,{materialPacked:'1|historical-closed-lane'})
 expect(read.finish([legacyLane])).not.toHaveProperty('canonicalCapabilities')
 expect(()=>read.finish([legacyLane,cold],[row])).toThrow() // never grants a partial V2 batch
 const mixed=read.finish([operations[0],cold],[row])
 expect(mixed.canonicalCapabilities?.capabilities).toHaveLength(1)
 expect(mixed.canonicalCapabilities?.bindings.map(b=>b.operationId)).toEqual(['mixed-0','mixed-1'])
 expect(()=>read.finish([cold])).toThrow('receipt unavailable')
 expect(()=>read.finish([operations[0],cold],[{...row,userId:'reader'}])).toThrow('immutable row conflict')
 expect(()=>read.finish([operations[0],cold],[row,row])).toThrow('duplicate')
 expect(()=>read.finish([operations[0]],[row])).toThrow('row closure')
 const page=await transport.prepareHistoryPage({roomId:'board',userId:'reader'},{operations:[structuredClone(operations[0]),cold],canonicalRows:db.operation.create.mock.calls.map(([request])=>request.data)},()=>true)
 expect(page.canonicalCapabilities).toEqual(mixed.canonicalCapabilities)
 expect(Object.isFrozen(page)).toBe(true)
 // Actual HTTP registration shares this existing transport and its epoch.
 // SQL boundary returns the actual indexed write rows; no synthetic receipt.
 const {default:Fastify}=await import('fastify')
 const {registerSnapshotRoutes}=await import('../roomRoutes/snapshotRoutes.js')
 const app=Fastify();app.addHook('preHandler',async request=>{request.userId='reader'})
 registerSnapshotRoutes(app,transport)
 history.rows=page.operations;history.canonicalRows=db.operation.create.mock.calls.map(([request])=>request.data)
 const writes=db.operation.create.mock.calls.length
 try{
  const response=await app.inject({method:'GET',url:'/api/rooms/board/operations?beforeSeq=3'})
  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual(page)
  expect(db.operation.create).toHaveBeenCalledTimes(writes)
 }finally{await app.close()}
 const denied=new CanonicalRoomTransport({...selected,autoSources:{}})
 await expect(denied.prepareHistoryPage({roomId:'board',userId:'reader'},{operations:[cold],canonicalRows:[row]},()=>true)).rejects.toThrow()
 let current=true;const pending=transport.prepareHistoryPage({roomId:'board',userId:'reader'},{operations:[cold],canonicalRows:[row]},()=>current)
 current=false;await expect(pending).rejects.toThrow('not_joined')
})

const genericProfile='installed-arm64-scalar-fused-generic-sc-u8-fpcr0-v2' as const
it.each(['multiply','lighten','colorDodge','overlay'] as const)('binds explicit GenericSC %s through SAME author/encoder/live/durable lane, never from a received frame',async outerBlend=>{
 const descriptor=softDescriptor()
 const behavior=descriptor.behavior,rendering=behavior?.rendering
 if(!behavior||!rendering)throw Error('Expected saved rendering')
 descriptor.behavior={...behavior,rendering:{...rendering,mode:'buildUp',blendMode:outerBlend}}
 if(!descriptor.sourceStamp)throw Error('Expected saved source')
 Object.assign(descriptor.sourceStamp.flags,{indirectPainting:true});Object.assign(descriptor.sourceStamp.settings,{PaintOpAction:'0'})
 const f=setup(descriptor),newPolicy={authorRasterProfile:genericProfile,allowedRecordedRasterProfiles:[CANONICAL_STROKE_RASTER_PROFILE,genericProfile],alphaDarkenVariants:['creamy','hard'] as const,autoSources:selected.autoSources}
 expect(await new CanonicalRoomTransport(selected).begin(identity,f.input,()=>true)).toMatchObject({ok:false})
 const transport=new CanonicalRoomTransport(newPolicy),s=snapshot(await transport.begin(identity,f.input,()=>true))
 expect(s.rasterProfile).toBe(genericProfile);expect(s.composition).toMatchObject({mode:'wash',outerBlend})
 const packet=frames(f.descriptor,s)[0]
 expect(transport.live(identity,{layerId:'layer',frame:{...packet,version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE}},).result.ok).toBe(false)
 expect(transport.live(identity,{layerId:'layer',frame:packet}).result.ok).toBe(true)
 const recorded=await transport.recorded(identity,{type:'canonical_stroke',id:'generic-recorded',userId:'author',timestamp:0,layerId:'layer',frame:packet},()=>true)
 expect(recorded.result.ok).toBe(true);expect(recorded.canonicalCapabilities?.capabilities[0].snapshot.rasterProfile).toBe(genericProfile)
 const read=await transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>true),fields=read.finish([recorded.accepted!])
 expect(fields.canonicalAuthorRasterProfile).toBe(genericProfile);expect(fields.canonicalReadScope.allowedRasterProfiles).toEqual(newPolicy.allowedRecordedRasterProfiles)
})
it('resumes the verified old-profile ROOM prefix under a new author default without reading conflicting personal data',async()=>{
 const f=setup(softDescriptor()),old=new CanonicalRoomTransport(selected),s=snapshot(await old.begin(identity,f.input,()=>true)),packets=frames(f.descriptor,s)
 const prefix:CanonicalStrokeOperation[]=[]
 for(let i=0;i<2;i++){
  const saved=await old.recorded(identity,{type:'canonical_stroke',id:'old-'+i,userId:'author',timestamp:i,layerId:'layer',frame:packets[i]},()=>true)
  if(!saved.accepted)throw Error('Expected durable row');prefix.push(saved.accepted)
 }
 history.rows=prefix;history.canonicalRows=db.operation.create.mock.calls.map(([request])=>request.data)
 db.operation.count.mockResolvedValue(2)
 const allowed=[CANONICAL_STROKE_RASTER_PROFILE,genericProfile],policy={authorRasterProfile:genericProfile,allowedRecordedRasterProfiles:allowed,alphaDarkenVariants:['creamy','hard'] as const,autoSources:selected.autoSources}
 const transport=new CanonicalRoomTransport(policy);allowed.splice(0,1)
 const library=f.storage.library.bind(f.storage),read=vi.spyOn(f.storage,'library').mockImplementation((domain,owner)=>{if(domain==='owners')throw Error('conflicting personal must not be consulted on resume');return library(domain,owner)})
 const resumed=snapshot(await transport.begin(identity,f.input,()=>true))
 expect(resumed.rasterProfile).toBe(CANONICAL_STROKE_RASTER_PROFILE);expect(resumed.material).toEqual(s.material)
 expect(read.mock.calls.some(([domain])=>domain==='owners')).toBe(false)
 const scope=(await transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>true)).scope
 expect(scope.allowedRasterProfiles).toEqual([CANONICAL_STROKE_RASTER_PROFILE,genericProfile]);expect(Object.isFrozen(scope.allowedRasterProfiles)).toBe(true)
 const denied=new CanonicalRoomTransport({...policy,allowedRecordedRasterProfiles:[genericProfile]})
 expect(await denied.begin(identity,f.input,()=>true)).toMatchObject({ok:false})
 const changed={...db.operation.create.mock.calls[0][0].data,userId:'reader'};history.canonicalRows=[changed,history.canonicalRows[1]]
 expect(await new CanonicalRoomTransport({...policy,allowedRecordedRasterProfiles:[CANONICAL_STROKE_RASTER_PROFILE,genericProfile]}).begin(identity,f.input,()=>true)).toMatchObject({ok:false})
})
it('rejects ambiguous, unknown, empty and duplicate server profile policies before any grant',()=>{
 const base={alphaDarkenVariants:['creamy'] as const,autoSources:{}}
 for(const allowedRecordedRasterProfiles of [[],[genericProfile,genericProfile],['foreign'],[CANONICAL_STROKE_RASTER_PROFILE,genericProfile,genericProfile],null]){
  expect(()=>Reflect.construct(CanonicalRoomTransport,[{...base,authorRasterProfile:genericProfile,allowedRecordedRasterProfiles}])).toThrow()
 }
 expect(()=>new CanonicalRoomTransport({...base,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,authorRasterProfile:genericProfile})).toThrow('ambiguous')
 expect(()=>new CanonicalRoomTransport({...base,authorRasterProfile:genericProfile,allowedRecordedRasterProfiles:[CANONICAL_STROKE_RASTER_PROFILE]})).toThrow('unavailable')
})

it('prepares complete read and closed undo prefixes from actual query rows and ROOM binding without granting the absent author append',async()=>{
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport(selected)
 const s=snapshot(await transport.begin(identity,f.input,()=>true)),packets=frames(f.descriptor,s),operations:CanonicalStrokeOperation[]=[]
 for(let n=0;n<packets.length;n++){
  const saved=await transport.recorded(identity,{id:'readprefix'+n,type:'canonical_stroke',userId:'author',timestamp:n,layerId:'layer',frame:packets[n]},()=>true)
  if(!saved.accepted)throw Error('Expected persisted canonical frame');operations.push(saved.accepted)
 }
 const rows=db.operation.create.mock.calls.map(([request])=>request.data),query=vi.mocked(getCanonicalGesturePrefixWithRows),previous=query.getMockImplementation()!
 const actual=await vi.importActual<typeof import('./snapshotStore.js')>('./snapshotStore.js')
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(row=>row.seq>where.seq.gt&&row.seq<=where.seq.lte).slice(0,take))
 query.mockImplementation(actual.getCanonicalGesturePrefixWithRows)
 f.board.participants.delete('author')
 const conflicting=structuredClone(f.library);conflicting.brushes[0].descriptor.opacity=.123;f.storage.install('reader',conflicting,new Map())
 const library=vi.spyOn(f.storage,'library'),pin=vi.spyOn(f.storage,'pin'),writes=db.operation.create.mock.calls.length
 let current=true
 try{
  const read=await transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>current)
  const input={anchor:operations.at(-1)!,row:rows.at(-1)!,throughSeq:f.board.nextSeq-1,purpose:'undo-redo' as const}
  const prepared=await read.preparePrefix(input)
  expect(prepared.summary).toMatchObject({recordedNext:packets.length,ended:true,firstSeq:1,lastSeq:packets.length})
  expect(prepared.operations.map(op=>op.frame)).toEqual(packets)
  expect(library.mock.calls.every(([domain,owner])=>domain==='rooms'&&owner==='board')).toBe(true)
  expect(pin).not.toHaveBeenCalled();expect(db.operation.create).toHaveBeenCalledTimes(writes)
  const binder=new CanonicalBrushCapabilityResolver({storage:f.storage,operator:()=>conflicting,...selected,maxGestures:4})
  const pure={roomId:'board',boardEpoch:read.scope.boardEpoch,anchor:input.anchor,row:input.row,operations:prepared.operations,rows:prepared.canonicalRows,purpose:'undo-redo' as const}
  expect(binder.readRecordedPrefix(pure).ended).toBe(true);expect(binder.size).toBe(0)
  expect(binder.resolve(identity,{layerId:'layer',brush:s.brush,strokeId:s.strokeId})).toBeUndefined()
  expect(()=>Reflect.apply(binder.readRecordedPrefix,binder,[{...pure,purpose:'unknown'}])).toThrow('purpose')
  await expect(Reflect.apply(read.preparePrefix,null,[{...input,purpose:undefined}])).rejects.toThrow()
  const open={anchor:operations[0],row:rows[0],throughSeq:1,purpose:'read' as const}
  expect((await read.preparePrefix(open)).summary.ended).toBe(false)
  await expect(read.preparePrefix({...open,purpose:'undo-redo'})).rejects.toThrow('prefix is open')
  const original=rows[1].data;rows[1]={...rows[1],data:{...original,frame:{...original.frame,pigmentRgb8:[9,9,9]}}}
  await expect(read.preparePrefix(input)).rejects.toThrow();rows[1]={...rows[1],data:original}
  readAccess.allowed=false;await expect(read.preparePrefix(input)).rejects.toThrow();readAccess.allowed=true
  db.operation.findMany.mockImplementationOnce(async()=>{current=false;return rows})
  await expect(read.preparePrefix(input)).rejects.toThrow()
  expect(pin).not.toHaveBeenCalled();expect(db.operation.create).toHaveBeenCalledTimes(writes)
 }finally{query.mockImplementation(previous)}
})

it('classifies canonical undo before legacy duplicates and waits for the SAME durable metadata receipt',async()=>{
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport(selected)
 const s=snapshot(await transport.begin(identity,f.input,()=>true)),packets=frames(f.descriptor,s)
 const prefix:CanonicalStrokeOperation[]=[]
 for(let i=0;i<packets.length;i++)prefix.push((await transport.recorded(identity,{type:'canonical_stroke',id:'undo-frame-'+i,userId:'author',timestamp:i,layerId:'layer',frame:packets[i]},()=>true)).accepted!)
 history.rows=prefix;history.canonicalRows=db.operation.create.mock.calls.map(([request])=>request.data)
 const undo={type:'operation_undo' as const,id:'durable-undo',userId:'author',timestamp:99,targetOpId:prefix.at(-1)!.id}
 const write=deferredWrite();db.operation.create.mockReturnValueOnce(write.promise)
 const settled=vi.fn(),pending=transport.metadata(identity,undo,()=>true);void pending.then(settled)
 await vi.waitFor(()=>expect(f.board.operationsById.has(undo.id)).toBe(true))
 const accepted=f.board.operationsById.get(undo.id)!,seq=f.board.nextSeq
 expect(Object.isFrozen(accepted)).toBe(true);expect(settled).not.toHaveBeenCalled()
 const again=transport.metadata(identity,undo,()=>true)
 write.resolve()
 expect(await pending).toMatchObject({result:{ok:true,seq:accepted.seq},accepted})
 expect(await again).toMatchObject({result:{ok:true,seq:accepted.seq,duplicate:true}})
 expect(f.board.nextSeq).toBe(seq)
 expect(await transport.metadata(identity,{...undo,targetOpId:'different'},()=>true)).toMatchObject({result:{ok:false,reason:'invalid_operation'}})
})
it('rejects unresolved, cyclic and open canonical targets without legacy fallback or append',async()=>{
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport(selected)
 const s=snapshot(await transport.begin(identity,f.input,()=>true)),packet=frames(f.descriptor,s)[0]
 const frame=(await transport.recorded(identity,{type:'canonical_stroke',id:'open-target',userId:'author',timestamp:0,layerId:'layer',frame:packet},()=>true)).accepted!
 history.rows=[frame];history.canonicalRows=db.operation.create.mock.calls.map(([request])=>request.data)
 const undo={type:'operation_undo' as const,id:'denied-undo',userId:'author',timestamp:99,targetOpId:frame.id},count=f.board.operations.length
 expect(await transport.metadata(identity,undo,()=>true)).toMatchObject({result:{ok:false,reason:'canonical_repair_required'}})
 expect(await transport.metadata(identity,{...undo,targetOpId:'missing'},()=>true)).toMatchObject({result:{ok:false,reason:'canonical_repair_required'}})
 const cyclic={...undo,id:'cycle',targetOpId:'cycle',seq:1};f.board.operationsById.set('cycle',cyclic)
 db.operation.findUnique.mockImplementation(async({where})=>where.id==='cycle'?{id:cyclic.id,roomId:'board',userId:cyclic.userId,type:cyclic.type,seq:cyclic.seq,layerId:null,tool:null,data:cyclic}:null)
 expect(await transport.metadata(identity,{...undo,targetOpId:'cycle'},()=>true)).toMatchObject({result:{ok:false,reason:'canonical_repair_required'}})
 expect(f.board.operations).toHaveLength(count)
})

async function metadataFixture(){
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport(selected)
 const s=snapshot(await transport.begin(identity,f.input,()=>true)),packets=frames(f.descriptor,s),prefix:CanonicalStrokeOperation[]=[]
 for(let i=0;i<packets.length;i++)prefix.push((await transport.recorded(identity,{type:'canonical_stroke',id:'metadata-frame-'+i,userId:'author',timestamp:i,layerId:'layer',frame:packets[i]},()=>true)).accepted!)
 history.rows=prefix;history.canonicalRows=db.operation.create.mock.calls.map(([request])=>request.data)
 const undo={type:'operation_undo' as const,id:'metadata-undo',userId:'author',timestamp:99,targetOpId:prefix.at(-1)!.id}
 return{...f,transport,prefix,undo}
}
it('repairs failed canonical undo in place; conflicting immutable DB metadata never succeeds',async()=>{
 const f=await metadataFixture(),pin=vi.spyOn(f.storage,'pin'),write=deferredWrite(),log=vi.spyOn(console,'error').mockImplementation(()=>{})
 db.operation.create.mockReturnValueOnce(write.promise)
 const pending=f.transport.metadata(identity,f.undo,()=>true)
 await vi.waitFor(()=>expect(f.board.operationsById.has(f.undo.id)).toBe(true));const seq=f.board.nextSeq
 write.reject(new Error('undo insert failed'))
 expect(await pending).toEqual({result:{ok:false,reason:'canonical_repair_required'}})
 const op=f.board.operationsById.get(f.undo.id)!,row={id:op.id,roomId:'board',userId:op.userId,type:op.type,seq:op.seq!,layerId:null,tool:null,data:op}
 const queries=db.operation.findUnique.mock.calls.length
 f.board.sharedLockedLayerIds.add('layer')
 expect(await f.transport.metadata(identity,f.undo,()=>true)).toEqual({result:{ok:false,reason:'invalid_operation'}})
 expect(db.operation.findUnique).toHaveBeenCalledTimes(queries)
 f.board.sharedLockedLayerIds.delete('layer')
 db.operation.findUnique.mockResolvedValueOnce({...row,userId:'foreign'})
 expect(await f.transport.metadata(identity,f.undo,()=>true)).toEqual({result:{ok:false,reason:'canonical_repair_required'}})
 db.operation.findUnique.mockResolvedValueOnce(row)
 expect(await f.transport.metadata(identity,f.undo,()=>true)).toMatchObject({result:{ok:true,duplicate:true,seq:op.seq},accepted:op})
 expect(f.board.nextSeq).toBe(seq);expect(f.board.operations.filter(o=>o.id===op.id)).toEqual([op]);expect(pin).not.toHaveBeenCalled();log.mockRestore()
})
it.each(['disconnect','room','operator','closed','layer-locked','layer-deleted'])('publishes no durable metadata success after %s changes during the write',async kind=>{
 const f=await metadataFixture(),write=deferredWrite();db.operation.create.mockReturnValueOnce(write.promise)
 let current=true;const pending=f.transport.metadata(identity,f.undo,()=>current)
 await vi.waitFor(()=>expect(f.board.operationsById.has(f.undo.id)).toBe(true))
 if(kind==='disconnect')current=false
 else if(kind==='room')rooms.set('board',{...f.board})
 else if(kind==='operator')setBrushStorage(f.storage,empty())
 else if(kind==='layer-locked')f.board.sharedLockedLayerIds.add('layer')
 else if(kind==='layer-deleted'){f.board.aliveIds.delete('layer');f.board.deletedIds.add('layer')}
 else f.board.room.closedAt='2026-10-31T00:00:00Z'
 write.resolve();expect(await pending).toMatchObject({result:{ok:false}})
 expect(f.board.operations.filter(o=>o.id===f.undo.id)).toHaveLength(1)
})
it('binds cold indexed chain without adoption and rejects indexed identity tampering',async()=>{
 const f=await metadataFixture(),anchor=f.prefix.at(-1)!,canonicalRow=history.canonicalRows.at(-1)!
 f.board.operationsById.delete(anchor.id)
 const chain={type:'operation_undo' as const,id:'indexed-undo',seq:f.board.nextSeq++,userId:'author',timestamp:90,targetOpId:anchor.id}
 const chainRow={id:chain.id,roomId:'board',userId:chain.userId,type:chain.type,seq:chain.seq,layerId:null,tool:null,data:chain}
 const redo={...f.undo,type:'operation_redo' as const,targetOpId:chain.id}
 db.operation.findUnique.mockImplementation(async({where})=>where.id===chain.id?{...chainRow,seq:chain.seq+1}:where.id===anchor.id?canonicalRow:null)
 expect(await f.transport.metadata(identity,redo,()=>true)).toMatchObject({result:{ok:false}})
 db.operation.findUnique.mockImplementation(async({where})=>where.id===chain.id?chainRow:where.id===anchor.id?canonicalRow:null)
 expect(await f.transport.metadata(identity,redo,()=>true)).toMatchObject({result:{ok:true}})
 expect(f.board.operationsById.has(anchor.id)).toBe(false);expect(f.board.operationsById.has(chain.id)).toBe(false)
})
it('preserves explicit V1 and legacy classification but refuses missing or excessive target chains',async()=>{
 const f=await metadataFixture(),anchor=f.prefix[0]
 f.board.operationsById.set('v1',{...anchor,id:'v1',frame:{...anchor.frame,materialPacked:'1|historical'}})
 expect(await f.transport.metadata(identity,{...f.undo,targetOpId:'v1'},()=>true)).toEqual({legacy:true})
 f.board.operationsById.set('legacy',{type:'layer_add',id:'legacy',seq:1,userId:'author',timestamp:0,layerId:'layer',name:'Layer'})
 expect(await f.transport.metadata(identity,{...f.undo,targetOpId:'legacy'},()=>true)).toEqual({legacy:true})
 for(let i=0;i<65;i++)f.board.operationsById.set('chain-'+i,{type:'operation_undo',id:'chain-'+i,userId:'author',timestamp:i,seq:i+1,targetOpId:i?'chain-'+(i-1):'legacy'})
 f.board.nextSeq=100
 db.operation.findUnique.mockImplementation(async({where})=>{const op=f.board.operationsById.get(where.id);return op?{id:op.id,roomId:'board',userId:op.userId,type:op.type,seq:op.seq,layerId:null,tool:null,data:op}:null})
 const queriesBefore=db.operation.findUnique.mock.calls.length
 expect(await f.transport.metadata(identity,{...f.undo,targetOpId:'chain-64'},()=>true)).toEqual({result:{ok:false,reason:'canonical_repair_required'}})
 expect(db.operation.findUnique.mock.calls.length-queriesBefore).toBe(65)
})
it('rechecks actor policy after awaited read proof and never treats a query error as legacy',async()=>{
 const f=await metadataFixture(),count=f.board.operations.length
 let release!:()=>void;readAccess.gate=new Promise<void>(resolve=>{release=resolve})
 const pending=f.transport.metadata(identity,f.undo,()=>true)
 await vi.waitFor(()=>expect(readAccess.calls.length).toBeGreaterThan(0))
 f.board.room.closedAt='2026-10-31T00:00:00Z';release()
 expect(await pending).toMatchObject({result:{ok:false,reason:'invalid_operation'}})
 expect(f.board.operations).toHaveLength(count)
 f.board.room.closedAt=undefined;readAccess.gate=undefined
 db.operation.findUnique.mockRejectedValueOnce(new Error('actual query failed'))
 expect(await f.transport.metadata(identity,{...f.undo,targetOpId:'unknown'},()=>true)).toEqual({result:{ok:false,reason:'server_error'}})
 expect(f.board.operations).toHaveLength(count)
})
it('does not grant canonical metadata through read policy OFF or another actor target',async()=>{
 const f=await metadataFixture(),count=f.board.operations.length
 expect(await new CanonicalRoomTransport(policy).metadata(identity,f.undo,()=>true)).toMatchObject({result:{ok:false}})
 f.board.participants.set('other',{userId:'other',name:'Other',role:'owner',color:'#000000',frozen:false,boardId:'board'})
 expect(await f.transport.metadata({roomId:'board',userId:'other'},{...f.undo,userId:'other'},()=>true)).toMatchObject({result:{ok:false}})
 expect(f.board.operations).toHaveLength(count)
})
it('rejects a changed resident target chain while prefix proof awaits',async()=>{
 const f=await metadataFixture(),chain={type:'operation_undo' as const,id:'resident-chain',seq:f.board.nextSeq++,timestamp:98,userId:'author',targetOpId:f.prefix.at(-1)!.id}
 f.board.operationsById.set(chain.id,chain)
 db.operation.findUnique.mockImplementation(async({where})=>where.id===chain.id?{id:chain.id,roomId:'board',userId:chain.userId,type:chain.type,seq:chain.seq,layerId:null,tool:null,data:{...chain}}:null)
 let release!:()=>void;readAccess.gate=new Promise<void>(resolve=>{release=resolve})
 const count=f.board.operations.length,pending=f.transport.metadata(identity,{...f.undo,type:'operation_redo',targetOpId:chain.id},()=>true)
 await vi.waitFor(()=>expect(readAccess.calls.length).toBeGreaterThan(0))
 chain.targetOpId='other';release()
 expect(await pending).toMatchObject({result:{ok:false,reason:'canonical_repair_required'}})
 expect(f.board.operations).toHaveLength(count)
})

it.each(['locked','deleted'])('rechecks verified target layer %s after indexed metadata duplicate await',async kind=>{
 const f=await metadataFixture(),stored={...f.undo,seq:f.board.nextSeq++}
 f.board.operations.push(stored);f.board.operationsById.set(stored.id,stored)
 const row={id:stored.id,roomId:'board',userId:stored.userId,type:stored.type,seq:stored.seq,layerId:null,tool:null,data:stored}
 let resolve!:(value:typeof row)=>void,entered=false
 db.operation.findUnique.mockImplementation(async()=>{entered=true;return new Promise<typeof row>(done=>{resolve=done})})
 const pending=f.transport.metadata(identity,f.undo,()=>true)
 await vi.waitFor(()=>expect(entered).toBe(true))
 if(kind==='locked')f.board.sharedLockedLayerIds.add('layer')
 else{f.board.aliveIds.delete('layer');f.board.deletedIds.add('layer')}
 resolve(row)
 expect(await pending).toEqual({result:{ok:false,reason:'invalid_operation'}})
 expect(f.board.operations.filter(op=>op.id===stored.id)).toEqual([stored])
})
it('projects verified untracked indexed metadata immutably without adopting a receipt',async()=>{
 const f=await metadataFixture(),stored={...f.undo,seq:f.board.nextSeq++}
 f.board.operations.push(stored);f.board.operationsById.set(stored.id,stored)
 db.operation.findUnique.mockResolvedValueOnce({id:stored.id,roomId:'board',userId:stored.userId,type:stored.type,seq:stored.seq,layerId:null,tool:null,data:{...stored}})
 const result=await f.transport.metadata(identity,f.undo,()=>true)
 if('legacy'in result||!result.accepted)throw Error('Expected verified metadata duplicate')
 expect(result.result).toMatchObject({ok:true,duplicate:true});expect(Object.isFrozen(result.accepted)).toBe(true)
 expect(result.accepted).not.toBe(stored)
 stored.targetOpId='changed-after-read';expect(result.accepted.targetOpId).toBe(f.undo.targetOpId)
 const {knownCanonicalWrite}=await import('./operationLog.js')
 expect(knownCanonicalWrite(stored)).toBeUndefined();expect(knownCanonicalWrite(result.accepted)).toBeUndefined()
})
it.each(['valid','missing','tampered'])('uses actual indexed proof for a fresh undo after cold resident hydration (%s)',async kind=>{
 const f=await metadataFixture(),anchor=f.prefix.at(-1)!,cold=structuredClone(anchor),index=f.board.operations.indexOf(anchor)
 f.board.operations[index]=cold;f.board.operationsById.set(cold.id,cold)
 const row=history.canonicalRows.at(-1) as {id:string;roomId:string;userId:string;seq:number;type:string;layerId:string;tool:null;data:unknown}
 db.operation.findUnique.mockImplementation(async({where})=>where.id===cold.id?(kind==='missing'?null:kind==='tampered'?{...row,userId:'foreign'}:row):null)
 const count=f.board.operations.length,transport=new CanonicalRoomTransport(selected)
 const result=await transport.metadata(identity,f.undo,()=>true)
 expect(result).toMatchObject(kind==='valid'?{result:{ok:true}}:{result:{ok:false,reason:'canonical_repair_required'}})
 expect(f.board.operations).toHaveLength(count+(kind==='valid'?1:0))
 const {knownCanonicalWrite}=await import('./operationLog.js')
 expect(f.board.operationsById.get(cold.id)).toBe(cold);expect(knownCanonicalWrite(cold)).toBeUndefined()
})
it('rejects a verified cold indexed metadata duplicate whose target is not earlier than that metadata',async()=>{
 const f=await metadataFixture(),anchor=f.prefix.at(-1)!,stored={...f.undo,seq:anchor.seq!}
 const row={id:stored.id,roomId:'board',userId:stored.userId,type:stored.type,seq:stored.seq,layerId:null,tool:null,data:stored}
 db.operation.findUnique.mockImplementation(async({where})=>where.id===stored.id?row:null)
 const count=f.board.operations.length,result=await f.transport.metadata(identity,f.undo,()=>true)
 expect(result).toEqual({result:{ok:false,reason:'canonical_repair_required'}})
 expect(f.board.operations).toHaveLength(count);expect(f.board.operationsById.has(stored.id)).toBe(false)
 const {knownCanonicalWrite}=await import('./operationLog.js')
 expect(knownCanonicalWrite(stored)).toBeUndefined()
})

it.each(['valid','missing','tampered'])('requires actual indexed durability for an untracked intermediate resident undo (%s)',async kind=>{
 const f=await metadataFixture(),chain={...f.undo,id:'untracked-intermediate',seq:f.board.nextSeq++}
 f.board.operations.push(chain);f.board.operationsById.set(chain.id,chain)
 const row={id:chain.id,roomId:'board',userId:chain.userId,type:chain.type,seq:chain.seq,layerId:null,tool:null,data:{...chain}}
 db.operation.findUnique.mockImplementation(async({where})=>where.id===chain.id?(kind==='missing'?null:kind==='tampered'?{...row,data:{...chain,targetOpId:'foreign'}}:row):null)
 const count=f.board.operations.length,result=await f.transport.metadata(identity,{...f.undo,id:'new-redo',type:'operation_redo',targetOpId:chain.id},()=>true)
 expect(result).toMatchObject(kind==='valid'?{result:{ok:true}}:{result:{ok:false,reason:'canonical_repair_required'}})
 expect(f.board.operations).toHaveLength(count+(kind==='valid'?1:0))
 const {knownCanonicalWrite}=await import('./operationLog.js');expect(knownCanonicalWrite(chain)).toBeUndefined()
})
it('awaits a pending intermediate metadata outcome and never repairs its failed different ID',async()=>{
 const f=await metadataFixture(),write=deferredWrite(),log=vi.spyOn(console,'error').mockImplementation(()=>{})
 db.operation.create.mockReturnValueOnce(write.promise)
 const undo=f.transport.metadata(identity,f.undo,()=>true)
 await vi.waitFor(()=>expect(f.board.operationsById.has(f.undo.id)).toBe(true))
 const nextSeq=f.board.nextSeq,redo={...f.undo,id:'dependent-redo',type:'operation_redo' as const,targetOpId:f.undo.id}
 const settled=vi.fn(),pending=f.transport.metadata(identity,redo,()=>true);void pending.then(settled)
 await new Promise<void>(resolve=>setTimeout(resolve,10));expect(settled).not.toHaveBeenCalled();expect(f.board.operationsById.has(redo.id)).toBe(false)
 write.reject(new Error('intermediate undo failed'))
 expect(await undo).toMatchObject({result:{ok:false,reason:'canonical_repair_required'}})
 expect(await pending).toMatchObject({result:{ok:false,reason:'canonical_repair_required'}})
 const writes=db.operation.create.mock.calls.length
 expect(await f.transport.metadata(identity,redo,()=>true)).toMatchObject({result:{ok:false,reason:'canonical_repair_required'}})
 expect(db.operation.create).toHaveBeenCalledTimes(writes);expect(f.board.nextSeq).toBe(nextSeq)
 log.mockRestore()
})


async function recordedCloseReadFixture(){
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport(selected),s=snapshot(await transport.begin(identity,f.input,()=>true)),all=frames(f.descriptor,s),operations:CanonicalStrokeOperation[]=[]
 for(let n=0;n<all.length-1;n++){
  const result=await transport.recorded(identity,{type:'canonical_stroke',id:'close-prefix-'+n,userId:'author',timestamp:n,layerId:'layer',frame:all[n]},()=>true)
  if(!result.accepted)throw Error('Expected real persisted source prefix');operations.push(result.accepted)
 }
 const {recordCanonicalCloseOperation,ensureCanonicalWrite}=await import('./operationLog.js')
 const close=recordCanonicalCloseOperation('board',{type:'canonical_stroke_close',id:'read-close',userId:'owner',timestamp:99,layerId:'layer',targetUserId:'author',strokeId:'gesture',disposition:'commitPartial',recordedNext:operations.length,firstFrameOpId:operations[0].id,lastFrameOpId:operations.at(-1)!.id})
 expect(await ensureCanonicalWrite(f.board,close)).toMatchObject({ok:true})
 const rows=db.operation.create.mock.calls.map(([request])=>request.data),canonicalRows=rows.filter(row=>row.type==='canonical_stroke'),closeRow=rows.find(row=>row.id===close.id)!
 history.rows=operations;history.canonicalRows=canonicalRows;history.close={operation:close,row:closeRow}
 return{...f,transport,operations,canonicalRows,close,closeRow,all}
}
it('binds actual ROOM source prefix plus a distinct metadata seal without author grant, fake end or personal lookup',async()=>{
 const f=await recordedCloseReadFixture(),binder=new CanonicalBrushCapabilityResolver({storage:f.storage,operator:empty,...selected,maxGestures:4})
 f.board.participants.delete('author')
 const personal=structuredClone(f.library);personal.brushes[0].descriptor.opacity=.123;f.storage.install('reader',personal,new Map())
 const library=vi.spyOn(f.storage,'library'),pin=vi.spyOn(f.storage,'pin'),writes=db.operation.create.mock.calls.length,scope=binder.captureReadScope('board')
 const input={roomId:'board',boardEpoch:scope.boardEpoch,anchor:f.operations.at(-1)!,row:f.canonicalRows.at(-1)!,operations:f.operations,rows:f.canonicalRows,purpose:'undo-redo' as const,close:history.close}
 const summary=binder.readRecordedPrefix(input)
 expect(summary.ended).toBe(false);expect(summary.endSeq).toBeUndefined();expect(summary.closeSeal).toMatchObject({recordedNext:f.operations.length,closeOperationId:f.close.id,closeSeq:f.close.seq})
 expect(Object.isFrozen(summary.closeSeal)).toBe(true);expect(binder.size).toBe(0)
 expect(binder.resolve({roomId:'board',userId:'reader'},{layerId:'layer',brush:f.input.brush,strokeId:'gesture'})).toBeUndefined()
 expect(library.mock.calls.every(([kind])=>kind==='rooms')).toBe(true);expect(pin).not.toHaveBeenCalled();expect(db.operation.create).toHaveBeenCalledTimes(writes)
 for(const operation of [{...f.close,recordedNext:f.operations.length+1},{...f.close,seq:f.operations.at(-1)!.seq!},{...f.close,targetUserId:'reader'}])expect(()=>binder.readRecordedPrefix({...input,close:{operation,row:{...f.closeRow,data:operation,seq:operation.seq!}}})).toThrow()
 expect(()=>new CanonicalBrushCapabilityResolver({storage:f.storage,operator:empty,...policy,maxGestures:4}).readRecordedPrefix(input)).toThrow()
})
it('keeps source execution/read/begin closed on actual indexed close presence, including existing session and metadata-only finish',async()=>{
 const f=await recordedCloseReadFixture(),query=vi.mocked(getCanonicalGesturePrefixWithRows),previous=query.getMockImplementation()!,actual=await vi.importActual<typeof import('./snapshotStore.js')>('./snapshotStore.js')
 const rows=db.operation.create.mock.calls.map(([request])=>request.data)
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(row=>row.seq>where.seq.gt&&row.seq<=where.seq.lte).slice(0,take))
 query.mockImplementation(actual.getCanonicalGesturePrefixWithRows)
 const pin=vi.spyOn(f.storage,'pin'),writes=db.operation.create.mock.calls.length
 try{
  expect(await f.transport.begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'canonical_repair_required'})
  await expect(f.transport.prepareReadDelivery(identity,()=>true)).rejects.toThrow('canonical_repair_required')
  readAccess.allowed=false
  await expect(f.transport.prepareReadDelivery(identity,()=>true)).rejects.toThrow('not_joined')
  readAccess.allowed=true
  // Cold/nonresident close is actual indexed evidence, never a receipt adoption.
  f.board.operations=f.board.operations.filter(op=>op.id!==f.close.id);f.board.operationsById.delete(f.close.id)
  expect(await new CanonicalRoomTransport(selected).begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'canonical_repair_required'})
  const read=await f.transport.prepareReadDelivery(identity,()=>true)
  await expect(read.preparePrefix({anchor:f.operations.at(-1)!,row:f.canonicalRows.at(-1)!,throughSeq:f.board.nextSeq-1,purpose:'read'})).rejects.toThrow('canonical_repair_required')
  expect(()=>read.finish([f.close])).toThrow('canonical_repair_required')
  f.board.operations.push(f.close);f.board.operationsById.set(f.close.id,f.close)
  expect(()=>read.finish([])).toThrow('canonical_repair_required')
  expect(pin).not.toHaveBeenCalled();expect(db.operation.create).toHaveBeenCalledTimes(writes)
  const {knownCanonicalWrite}=await import('./operationLog.js')
  const projected=await actual.getCanonicalGesturePrefixWithRows('board',{userId:'author',strokeId:'gesture'},f.board.nextSeq-1,f.operations.at(-1)!)
  expect(knownCanonicalWrite(projected.close!.operation)).toBeUndefined()
 }finally{query.mockImplementation(previous)}
})

it('builds internal full empty-baseline evidence from actual DB rows including an entirely omitted source gesture',async()=>{
 const f=await metadataFixture(),pin=vi.spyOn(f.storage,'pin')
 history.rows=[];history.canonicalRows=[]
 const hiddenInput={...f.input,strokeId:'hidden'}
 const bound=snapshot(await f.transport.begin(identity,hiddenInput,()=>true))
 const packet={...frames(f.descriptor,bound)[0],strokeId:'hidden'}
 const hidden=(await f.transport.recorded(identity,{type:'canonical_stroke',id:'entire-hidden-gesture',userId:'author',timestamp:100,layerId:'layer',frame:packet},()=>true)).accepted!
 await flushRoomWrites('board')
 const rows=db.operation.create.mock.calls.map(([q])=>q.data),cut=f.board.nextSeq-1,writes=db.operation.create.mock.calls.length,pins=pin.mock.calls.length
 f.board.operations=f.board.operations.filter(op=>op.id!==hidden.id);f.board.operationsById.delete(hidden.id)
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>r.seq>where.seq.gt&&r.seq<=where.seq.lte).slice(0,take))
 const read=await f.transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>true)
 const replay=await prepareSnapshotReplay('board',{canonicalFloor:0,prepareFullCanonicalHistory:read.prepareFullHistory})
 expect(replay.watermark).toBe(cut);expect(replay.operations.map(op=>op.id)).toContain(hidden.id)
 expect(replay.fullCanonicalHistory).toBeDefined();expect(replay.index).toBeNull()
 const fields=read.finish(replay.operations,replay.canonicalRows,replay.fullCanonicalHistory)
 expect(fields.canonicalCapabilities?.bindings).toHaveLength(rows.length)
 expect(fields.canonicalHistoryBase).toEqual({kind:'empty-room-prefix-v1',roomId:'board',boardEpoch:read.scope.boardEpoch,throughSeq:cut,operationCount:rows.length});expect(Object.isFrozen(fields.canonicalHistoryBase)).toBe(true);expect(Object.keys(fields)).not.toContain('fullCanonicalHistory')
 expect(read.finish(replay.operations,replay.canonicalRows)).not.toHaveProperty('canonicalHistoryBase')
 expect(pin).toHaveBeenCalledTimes(pins);expect(db.operation.create).toHaveBeenCalledTimes(writes)
 expect(()=>read.finish(replay.operations.slice(1),replay.canonicalRows,replay.fullCanonicalHistory)).toThrow()
 expect(()=>read.finish(replay.operations,replay.canonicalRows,{...replay.fullCanonicalHistory!})).toThrow()
})
it('requires actual empty-query evidence at cut zero and refuses stale/copy/foreign read-owner receipts',async()=>{
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport(selected)
 db.operation.findMany.mockResolvedValue([])
 const read=await transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>true),request={throughSeq:0,floor:0},receipt=await read.prepareFullHistory(request)
 request.floor=1 // The receipt owns the captured floor, not this caller object.
 expect(db.operation.findMany).toHaveBeenCalledTimes(1);expect(read.finish([],[],receipt).canonicalCapabilities).toBeUndefined()
 expect(read.finish([],[],receipt).canonicalHistoryBase).toEqual({kind:'empty-room-prefix-v1',roomId:'board',boardEpoch:read.scope.boardEpoch,throughSeq:0,operationCount:0})
 expect(read.finish([])).not.toHaveProperty('canonicalHistoryBase')
 const other=await transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>true)
 expect(()=>other.finish([],[],receipt)).toThrow();expect(()=>read.finish([],[],{...receipt})).toThrow()
 f.board.nextSeq=2;expect(()=>read.finish([],[],receipt)).toThrow()
})
it('refuses partial-floor, snapshot-covered and unsupported interleaved-writer baseline requests before publication',async()=>{
 const f=await metadataFixture(),rows=db.operation.create.mock.calls.map(([q])=>q.data),read=await f.transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>true),cut=f.board.nextSeq-1
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>r.seq>where.seq.gt&&r.seq<=where.seq.lte).slice(0,take))
 await expect(read.prepareFullHistory({throughSeq:cut,floor:1})).rejects.toThrow();expect(db.operation.findMany).not.toHaveBeenCalled()
 f.board.layerStateSeq=1;await expect(read.prepareFullHistory({throughSeq:cut,floor:0})).rejects.toThrow();f.board.layerStateSeq=null
 rows.push({id:'legacy-writer',seq:f.board.nextSeq++,roomId:'board',userId:'author',type:'stroke',layerId:'layer',tool:'pencil',data:{type:'stroke'}})
 await expect(read.prepareFullHistory({throughSeq:cut+1,floor:0})).rejects.toThrow()
})
it('rechecks cut and authorization after DB awaits and refuses loader full readiness on nonzero floor',async()=>{
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport(selected),read=await transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>true)
 db.operation.findMany.mockImplementationOnce(async()=>{f.board.nextSeq=2;return []})
 await expect(read.prepareFullHistory({throughSeq:0,floor:0})).rejects.toThrow()
 f.board.nextSeq=1;db.operation.findMany.mockImplementationOnce(async()=>{readAccess.allowed=false;return []})
 await expect(read.prepareFullHistory({throughSeq:0,floor:0})).rejects.toThrow()
 readAccess.allowed=true
 await expect(prepareSnapshotReplay('board',{canonicalFloor:1,prepareFullCanonicalHistory:read.prepareFullHistory})).rejects.toThrow()
})

it('keeps full baseline readiness unavailable for stored snapshot metadata and missing indexed frames',async()=>{
 const f=await metadataFixture(),rows=db.operation.create.mock.calls.map(([q])=>q.data),read=await f.transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>true)
 db.roomLayerState.findUnique.mockResolvedValueOnce({seq:1,state:{}})
 await expect(prepareSnapshotReplay('board',{canonicalFloor:0,prepareFullCanonicalHistory:read.prepareFullHistory})).rejects.toThrow()
 db.operation.findMany.mockResolvedValue([])
 await expect(prepareSnapshotReplay('board',{canonicalFloor:0,prepareFullCanonicalHistory:read.prepareFullHistory})).rejects.toThrow()
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>r.seq>where.seq.gt&&r.seq<=where.seq.lte).slice(0,take))
 const replay=await prepareSnapshotReplay('board',{canonicalFloor:0,prepareFullCanonicalHistory:read.prepareFullHistory})
 const alternate=await read.prepareFullHistory({throughSeq:replay.watermark,floor:0})
 expect(()=>read.finish([...alternate.operations],alternate.canonicalRows,replay.fullCanonicalHistory)).toThrow()
 f.board.coveredSeqByLayer.set('layer',1)
 expect(()=>read.finish(replay.operations,replay.canonicalRows,replay.fullCanonicalHistory)).toThrow()
})

it('checks the captured operator owner after full-history DB awaits, not a freshly blessed read owner',async()=>{
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport(selected),read=await transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>true)
 db.operation.findMany.mockImplementationOnce(async()=>{setBrushStorage(f.storage,empty());return []})
 await expect(read.prepareFullHistory({throughSeq:0,floor:0})).rejects.toThrow()
})

it('waits for the existing durable queue before querying a complete cut and never invents pending-row evidence',async()=>{
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport(selected),s=snapshot(await transport.begin(identity,f.input,()=>true)),write=deferredWrite()
 db.operation.create.mockReturnValueOnce(write.promise)
 const saving=transport.recorded(identity,{type:'canonical_stroke',id:'pending-full-frame',userId:'author',timestamp:0,layerId:'layer',frame:frames(f.descriptor,s)[0]},()=>true)
 await vi.waitFor(()=>expect(db.operation.create).toHaveBeenCalledTimes(1))
 const rows=db.operation.create.mock.calls.map(([q])=>q.data)
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>r.seq>where.seq.gt&&r.seq<=where.seq.lte).slice(0,take))
 const read=await transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>true),preparing=read.prepareFullHistory({throughSeq:1,floor:0})
 await Promise.resolve();expect(db.operation.findMany).not.toHaveBeenCalled()
 write.resolve();expect((await saving).result.ok).toBe(true)
 const receipt=await preparing;expect(receipt.operations).toHaveLength(1);expect(read.finish(receipt.operations,receipt.canonicalRows,receipt).canonicalCapabilities?.bindings).toHaveLength(1)
})

it('attests the complete actual two-frame DB tail only with its original receipt, never a partial suffix',async()=>{
 const base=setup(softDescriptor()),transport=new CanonicalRoomTransport(selected),bound=snapshot(await transport.begin(identity,base.input,()=>true))
 for(const [n,frame] of frames(base.descriptor,bound).slice(0,2).entries())expect((await transport.recorded(identity,{type:'canonical_stroke',id:`full-two-${n}`,userId:'author',timestamp:n,layerId:'layer',frame},()=>true)).result.ok).toBe(true)
 const f={transport},rows=db.operation.create.mock.calls.map(([q])=>q.data)
 expect(rows).toHaveLength(2)
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>r.seq>where.seq.gt&&r.seq<=where.seq.lte).slice(0,take))
 let alive=true
 const read=await f.transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>alive)
 const receipt=await read.prepareFullHistory({throughSeq:2,floor:0})
 expect(read.finish(receipt.operations,receipt.canonicalRows,receipt).canonicalHistoryBase?.operationCount).toBe(2)
 expect(read.finish(receipt.operations.slice(1),receipt.canonicalRows.slice(1))).not.toHaveProperty('canonicalHistoryBase')
 expect(()=>read.finish(receipt.operations.slice(1),receipt.canonicalRows.slice(1),receipt)).toThrow()
 alive=false;expect(()=>read.finish(receipt.operations,receipt.canonicalRows,receipt)).toThrow()
})

it('projects explicit mixed full history from actual indexed frames, close and undo/redo without reopening suffix reads',async()=>{
 const f=await recordedCloseReadFixture()
 const {recordCanonicalMetadataOperation,ensureCanonicalWrite}=await import('./operationLog.js')
 for(const op of [{type:'operation_undo' as const,id:'full-undo',targetOpId:f.operations[0].id},{type:'operation_redo' as const,id:'full-redo',targetOpId:'full-undo'}]){
  const saved=recordCanonicalMetadataOperation('board',{...op,userId:'author',timestamp:100})
  expect(await ensureCanonicalWrite(f.board,saved)).toMatchObject({ok:true})
 }
 const rows=db.operation.create.mock.calls.map(([q])=>q.data),writes=rows.length,pin=vi.spyOn(f.storage,'pin')
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>r.seq>where.seq.gt&&r.seq<=where.seq.lte).slice(0,take))
 const transport=new CanonicalRoomTransport({...selected,fullHistoryFormat:'mixed-v2'})
 const read=await transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>true)
 const replay=await prepareSnapshotReplay('board',{canonicalFloor:0,prepareFullCanonicalHistory:read.prepareFullHistory})
 expect(replay.operations.map(op=>op.id)).toEqual(rows.map(r=>r.id));expect(replay.fullCanonicalHistory).toMatchObject({kind:'mixed-canonical-history-v2'})
 const result=read.finish(replay.operations,replay.canonicalRows,replay.fullCanonicalHistory)
 expect(result.canonicalHistoryBase).toEqual({kind:'full-room-prefix-v2',roomId:'board',boardEpoch:read.scope.boardEpoch,throughSeq:writes,operationCount:writes})
 expect(result.canonicalCapabilities?.bindings).toHaveLength(f.operations.length)
 expect(()=>read.finish(replay.operations,replay.canonicalRows)).toThrow()
 expect(()=>read.finish([],[])).toThrow()
 expect(()=>read.finish(replay.operations.slice(1),replay.canonicalRows,replay.fullCanonicalHistory)).toThrow()
 expect(()=>read.finish(replay.operations,replay.canonicalRows,{...replay.fullCanonicalHistory!})).toThrow()
 expect(pin).not.toHaveBeenCalled();expect(db.operation.create).toHaveBeenCalledTimes(writes)
 await expect(read.preparePrefix({anchor:f.operations.at(-1)!,row:f.canonicalRows.at(-1)!,throughSeq:writes,purpose:'read'})).rejects.toThrow()
})
it('keeps mixed full-history policy closed by default and validates its explicit selector',async()=>{
 const f=await recordedCloseReadFixture()
 await expect(f.transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>true)).rejects.toThrow()
 expect(()=>new CanonicalRoomTransport({...selected,fullHistoryFormat:'unknown'} as unknown as import('./canonicalExecutionPolicy.js').CanonicalRoomExecutionPolicy)).toThrow('full history')
})
it('requires actual terminal empty evidence for the explicit mixed cut-zero receipt',async()=>{
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport({...selected,fullHistoryFormat:'mixed-v2'})
 db.operation.findMany.mockResolvedValue([])
 let current=true
 const read=await transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>current),receipt=await read.prepareFullHistory({throughSeq:0,floor:0})
 expect(db.operation.findMany).toHaveBeenCalledOnce();expect(receipt).toMatchObject({kind:'mixed-canonical-history-v2',operations:[],orderedRows:[]})
 expect(read.finish([],[],receipt)).toMatchObject({canonicalHistoryBase:{kind:'full-room-prefix-v2',throughSeq:0,operationCount:0}})
 expect(read.finish([])).not.toHaveProperty('canonicalHistoryBase')
 const other=await transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>true)
 expect(()=>other.finish([],[],receipt)).toThrow()
 current=false;expect(()=>read.finish([],[],receipt)).toThrow();expect(f.board.nextSeq).toBe(1)
})
it.each(['closeBody','missingFrame','futureUndo','postCloseFrame']as const)('refuses actual mixed full-range corruption (%s) without minting a read receipt',async kind=>{
 const f=await recordedCloseReadFixture(),rows=db.operation.create.mock.calls.map(([q])=>structuredClone(q.data))
 if(kind==='closeBody'){const row=rows.at(-1)!;row.data={...row.data,lastFrameOpId:'wrong'}}
 if(kind==='missingFrame')rows.splice(0,1)
 if(kind==='futureUndo'){
  const seq=f.board.nextSeq++;rows.push({id:'bad-undo',roomId:'board',userId:'author',type:'operation_undo',seq,data:{type:'operation_undo',id:'bad-undo',userId:'author',timestamp:100,seq,targetOpId:'future'}})
 }
 if(kind==='postCloseFrame'){
  const seq=f.board.nextSeq++,source=rows[0];rows.push({...source,id:'late-frame',seq,data:{...source.data,id:'late-frame',seq}})
 }
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>r.seq>where.seq.gt&&r.seq<=where.seq.lte).slice(0,take))
 const read=await new CanonicalRoomTransport({...selected,fullHistoryFormat:'mixed-v2'}).prepareReadDelivery({roomId:'board',userId:'reader'},()=>true)
 await expect(read.prepareFullHistory({throughSeq:f.board.nextSeq-1,floor:0})).rejects.toThrow()
})

it.each(['revoke','context','cut']as const)('rechecks the SAME mixed owner after a real full-range query await (%s)',async kind=>{
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport({...selected,fullHistoryFormat:'mixed-v2'})
 const read=await transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>true)
 let resolveQuery!:(rows:never[])=>void
 const query=new Promise<never[]>(resolve=>{resolveQuery=resolve})
 db.operation.findMany.mockReturnValue(query)
 const work=read.prepareFullHistory({throughSeq:0,floor:0})
 await vi.waitFor(()=>expect(db.operation.findMany).toHaveBeenCalled())
 if(kind==='revoke')readAccess.allowed=false
 if(kind==='context')setBrushStorage(f.storage,{...empty()})
 if(kind==='cut')f.board.nextSeq=2
 resolveQuery([])
 await expect(work).rejects.toThrow(kind==='revoke'?'not_joined':'canonical_repair_required')
})
it('never accepts a metadata-only mixed cut without its complete actual source prefix',async()=>{
 const f=await recordedCloseReadFixture(),close={...f.close,seq:1},row={...f.closeRow,seq:1,data:close}
 f.board.operations=[close];f.board.operationsById=new Map([[close.id,close]]);f.board.nextSeq=2
 db.operation.findMany.mockImplementation(async({where})=>where.seq.gt===0?[row]:[])
 const read=await new CanonicalRoomTransport({...selected,fullHistoryFormat:'mixed-v2'}).prepareReadDelivery({roomId:'board',userId:'reader'},()=>true)
 await expect(read.prepareFullHistory({throughSeq:1,floor:0})).rejects.toThrow()
})

async function closeWriterFixture(){
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport(selected),s=snapshot(await transport.begin(identity,f.input,()=>true)),all=frames(f.descriptor,s),operations:CanonicalStrokeOperation[]=[]
 for(const [n,frame]of all.slice(0,-1).entries()){
  const result=await transport.recorded(identity,{type:'canonical_stroke',id:'writer-frame-'+n,userId:'author',timestamp:n,layerId:'layer',frame},()=>true)
  if(!result.accepted)throw Error('Missing actual recorded prefix');operations.push(result.accepted)
 }
 const rows=db.operation.create.mock.calls.map(([q])=>q.data)
 const request={operationId:'writer-close',layerId:'layer',targetUserId:'author',strokeId:'gesture',disposition:'commitPartial' as const,expectedRecordedNext:operations.length,expectedLastFrameOpId:operations.at(-1)!.id}
 history.rows=operations;history.canonicalRows=rows
 return{...f,transport,all,operations,rows,request}
}
it('durably closes only an actual own-user indexed prefix and keeps material ordinals unchanged',async()=>{
 const f=await closeWriterFixture(),seq=f.board.nextSeq,pin=vi.spyOn(f.storage,'pin'),writes=db.operation.create.mock.calls.length
 const result=await f.transport.close(identity,f.request,()=>true)
 expect(result.result).toEqual({ok:true,seq});expect(result.accepted).toMatchObject({type:'canonical_stroke_close',seq,firstFrameOpId:f.operations[0].id,lastFrameOpId:f.request.expectedLastFrameOpId,recordedNext:f.operations.length})
 expect(f.board.nextSeq).toBe(seq+1);expect(db.operation.create).toHaveBeenCalledTimes(writes+1);expect(pin).not.toHaveBeenCalled()
 expect(await f.transport.close(identity,f.request,()=>true)).toMatchObject({result:{ok:true,seq,duplicate:true}})
 expect(f.board.nextSeq).toBe(seq+1)
 expect((await f.transport.recorded(identity,f.operations[0],()=>true)).result).toMatchObject({ok:true,duplicate:true})
 expect(f.transport.live(identity,{layerId:'layer',frame:f.all.at(-1)!}).result.ok).toBe(false)
 expect((await f.transport.recorded(identity,{type:'canonical_stroke',id:'after-close',userId:'author',timestamp:200,layerId:'layer',frame:f.all.at(-1)!},()=>true)).result.ok).toBe(false)
})
it('waits for close durability, repairs only the exact failed ID and never allocates a second sequence',async()=>{
 const f=await closeWriterFixture(),write=deferredWrite(),log=vi.spyOn(console,'error').mockImplementation(()=>{})
 db.operation.create.mockReturnValueOnce(write.promise)
 const settled=vi.fn(),first=f.transport.close(identity,f.request,()=>true);void first.then(settled)
 await vi.waitFor(()=>expect(f.board.operationsById.has(f.request.operationId)).toBe(true))
 expect(settled).not.toHaveBeenCalled();const seq=f.board.nextSeq,writes=db.operation.create.mock.calls.length
 const duplicate=f.transport.close(identity,f.request,()=>true)
 write.reject(new Error('close write failed'))
 expect(await first).toMatchObject({result:{ok:false,reason:'canonical_repair_required'}})
 expect(await duplicate).toMatchObject({result:{ok:false,reason:'canonical_repair_required'}})
 expect((await f.transport.close(identity,{...f.request,operationId:'other-close'},()=>true)).result.ok).toBe(false)
 expect(await f.transport.close(identity,f.request,()=>true)).toMatchObject({result:{ok:true,seq:seq-1,duplicate:true}})
 expect(f.board.nextSeq).toBe(seq);expect(db.operation.create).toHaveBeenCalledTimes(writes+1)
 log.mockRestore()
})
it.each(['foreign','count','last','missingPrefix','staleCut','layerLock','noSession']as const)('refuses invalid close authority before append (%s)',async kind=>{
 const f=await closeWriterFixture(),request={...f.request},writes=db.operation.create.mock.calls.length,next=f.board.nextSeq
 if(kind==='foreign')request.targetUserId='other'
 if(kind==='count')request.expectedRecordedNext++
 if(kind==='last')request.expectedLastFrameOpId='wrong'
 if(kind==='missingPrefix'){history.rows=history.rows.slice(1);history.canonicalRows=history.canonicalRows.slice(1)}
 let transport=f.transport
 if(kind==='noSession')transport=new CanonicalRoomTransport(selected)
 if(kind==='staleCut'||kind==='layerLock')vi.mocked(getCanonicalGesturePrefixWithRows).mockImplementationOnce(async()=>{
  if(kind==='staleCut')f.board.nextSeq++
  else f.board.sharedLockedLayerIds.add('layer')
  return{operations:f.operations,canonicalRows:f.rows}
 })
 expect((await transport.close(identity,request,()=>true)).result.ok).toBe(false)
 expect(db.operation.create).toHaveBeenCalledTimes(writes);expect(f.board.nextSeq).toBe(next+(kind==='staleCut'?1:0))
})
it('keeps an appended close fail closed if its internal admission commit faults, then repairs the exact receipt',async()=>{
 const f=await closeWriterFixture(),prepare=vi.spyOn(CanonicalStrokeAdmission.prototype,'prepareRecordedClose'),original=CanonicalStrokeAdmission.prototype.prepareRecordedClose
 prepare.mockImplementationOnce(function(this:CanonicalStrokeAdmission,identity,stroke,seal){const ticket=original.call(this,identity,stroke,seal);return{seal:ticket.seal,commit(){throw Error('forced close commit fault')}}})
 const result=await f.transport.close(identity,f.request,()=>true),seq=f.board.nextSeq
 expect(result.result.ok).toBe(false);expect(f.board.operationsById.has(f.request.operationId)).toBe(true)
 // Known resident evidence must fence a different ID even before the query.
 const queryCalls=vi.mocked(getCanonicalGesturePrefixWithRows).mock.calls.length
 expect((await f.transport.close(identity,{...f.request,operationId:'fault-other-close'},()=>true)).result.ok).toBe(false)
 expect(vi.mocked(getCanonicalGesturePrefixWithRows)).toHaveBeenCalledTimes(queryCalls);expect(f.board.nextSeq).toBe(seq)
 expect(f.transport.live(identity,{layerId:'layer',frame:f.all.at(-1)!}).result.ok).toBe(false)
 expect((await f.transport.recorded(identity,{type:'canonical_stroke',id:'commit-fault-late',userId:'author',timestamp:300,layerId:'layer',frame:f.all.at(-1)!},()=>true)).result.ok).toBe(false)
 expect(await f.transport.close(identity,f.request,()=>true)).toMatchObject({result:{ok:true,duplicate:true}})
 expect(f.board.nextSeq).toBe(seq)
})

it('verifies actual indexed duplicate close without adopting a receipt and rejects a conflicting seal body',async()=>{
 const f=await closeWriterFixture(),saved=await f.transport.close(identity,f.request,()=>true)
 if(!saved.accepted)throw Error('Missing durable close')
 const operation=saved.accepted,row=db.operation.create.mock.calls.map(([q])=>q.data).find(r=>r.id===operation.id)!
 f.board.operations=f.board.operations.filter(op=>op.id!==operation.id);f.board.operationsById.delete(operation.id)
 db.operation.findUnique.mockResolvedValue(row);history.close={operation,row}
 const writes=db.operation.create.mock.calls.length,seq=f.board.nextSeq
 const duplicate=await f.transport.close(identity,f.request,()=>true)
 expect(duplicate).toMatchObject({result:{ok:true,duplicate:true,seq:operation.seq}})
 const {knownCanonicalWrite}=await import('./operationLog.js')
 expect(knownCanonicalWrite(operation)).toBeDefined();expect(knownCanonicalWrite(duplicate.accepted!)).toBeUndefined();expect(f.board.operationsById.has(operation.id)).toBe(false)
 expect(db.operation.create).toHaveBeenCalledTimes(writes);expect(f.board.nextSeq).toBe(seq)
 const bad={...operation,firstFrameOpId:'wrong'}
 db.operation.findUnique.mockResolvedValue({...row,data:bad});history.close={operation:bad,row:{...row,data:bad}}
 expect((await f.transport.close(identity,f.request,()=>true)).result.ok).toBe(false)
})
it('rechecks layer paint policy after the durable close write before ACK while retaining exact repair identity',async()=>{
 const f=await closeWriterFixture(),write=deferredWrite()
 db.operation.create.mockReturnValueOnce(write.promise)
 const work=f.transport.close(identity,f.request,()=>true)
 await vi.waitFor(()=>expect(f.board.operationsById.has(f.request.operationId)).toBe(true))
 const next=f.board.nextSeq;f.board.sharedLockedLayerIds.add('layer');write.resolve()
 expect((await work).result.ok).toBe(false)
 f.board.sharedLockedLayerIds.delete('layer')
 expect(await f.transport.close(identity,f.request,()=>true)).toMatchObject({result:{ok:true,duplicate:true,seq:next-1}})
 expect(f.board.nextSeq).toBe(next)
})
it('refuses accessor close requests without invoking them or resolving any database target',async()=>{
 const f=await closeWriterFixture(),read=vi.fn(()=>f.request.layerId),request={...f.request}
 Object.defineProperty(request,'layerId',{get:read})
 db.operation.findUnique.mockClear();const writes=db.operation.create.mock.calls.length
 expect((await f.transport.close(identity,request,()=>true)).result.ok).toBe(false)
 expect(read).not.toHaveBeenCalled();expect(db.operation.findUnique).not.toHaveBeenCalled();expect(db.operation.create).toHaveBeenCalledTimes(writes)
})

it('admits own undo/redo over the actual indexed partial-close seal without opening generic prefix reads',async()=>{
 const f=await recordedCloseReadFixture(),transport=new CanonicalRoomTransport({...selected,fullHistoryFormat:'mixed-v2'}),undo={type:'operation_undo' as const,id:'sealed-undo',userId:'author',timestamp:200,targetOpId:f.operations[0].id}
 // New redo admission reads the complete indexed cut, including the undo
 // just persisted by this real transport, rather than only its target prefix.
 db.operation.findMany.mockImplementation(async({where,take})=>db.operation.create.mock.calls.map(([q])=>q.data).filter(row=>row.roomId===where.roomId&&row.seq>where.seq.gt&&row.seq<=where.seq.lte).slice(0,take))
 const writes=db.operation.create.mock.calls.length,pin=vi.spyOn(f.storage,'pin')
 expect(await transport.metadata(identity,undo,()=>true)).toMatchObject({result:{ok:true},accepted:{type:'operation_undo'}})
 expect(await transport.metadata(identity,{...undo,id:'sealed-redo',type:'operation_redo',targetOpId:undo.id},()=>true)).toMatchObject({result:{ok:true}})
 expect(db.operation.create).toHaveBeenCalledTimes(writes+2);expect(pin).not.toHaveBeenCalled()
 const read=await transport.prepareReadDelivery(identity,()=>true)
 await expect(read.preparePrefix({anchor:f.operations.at(-1)!,row:f.canonicalRows.at(-1)!,throughSeq:f.board.nextSeq-1,purpose:'undo-redo'})).rejects.toThrow()
 expect(()=>read.finish([])).toThrow()
})
it.each(['noClose','tamperedClose','revoked','layerLock','failedFence']as const)('refuses unproved private sealed undo (%s) without a new write or a different-ID repair',async kind=>{
 const f=await recordedCloseReadFixture(),transport=new CanonicalRoomTransport({...selected,fullHistoryFormat:'mixed-v2'}),writes=db.operation.create.mock.calls.length
 if(kind==='noClose')history.close=undefined
 if(kind==='tamperedClose'){const operation={...f.close,recordedNext:f.operations.length+1};history.close={operation,row:{...f.closeRow,data:operation}}}
 if(kind==='revoked')readAccess.allowed=false
 let restoreQuery:(()=>void)|undefined
 if(kind==='layerLock'){const query=vi.mocked(getCanonicalGesturePrefixWithRows),original=query.getMockImplementation();if(!original)throw Error('Missing actual query fixture');query.mockImplementation(async()=>{f.board.sharedLockedLayerIds.add('layer');return{operations:f.operations,canonicalRows:f.canonicalRows,close:{operation:f.close,row:f.closeRow}}});restoreQuery=()=>{query.mockReset().mockImplementation(original)}}
 if(kind==='failedFence'){
  // Existing failed work fences new metadata; it is never repaired by undo ID.
  const {recordCanonicalMetadataOperation}=await import('./operationLog.js'),log=vi.spyOn(console,'error').mockImplementation(()=>{})
  db.operation.create.mockRejectedValueOnce(new Error('other durable write failed'))
  recordCanonicalMetadataOperation('board',{type:'operation_undo',id:'other-failed',userId:'author',timestamp:100,targetOpId:f.operations[0].id});await flushRoomWrites('board');log.mockRestore()
 }
 try{
  expect((await transport.metadata(identity,{type:'operation_undo',id:'blocked-sealed-undo',userId:'author',timestamp:200,targetOpId:f.operations[0].id},()=>true))).toMatchObject({result:{ok:false}})
  expect(db.operation.create).toHaveBeenCalledTimes(writes+(kind==='failedFence'?1:0))
 }finally{restoreQuery?.()}
})

it('does not justify an existing indexed undo using a close from AFTER its actual server placement',async()=>{
 const f=await recordedCloseReadFixture(),transport=new CanonicalRoomTransport({...selected,fullHistoryFormat:'mixed-v2'})
 const operation={type:'operation_undo' as const,id:'before-seal-undo',userId:'author',timestamp:100,seq:f.close.seq,targetOpId:f.operations[0].id}
 const close={...f.close,seq:f.close.seq+1},closeRow={...f.closeRow,seq:close.seq,data:close}
 f.board.operations=[...f.operations];f.board.operationsById.delete(f.close.id);f.board.nextSeq=close.seq+1
 db.operation.findUnique.mockResolvedValue({id:operation.id,roomId:'board',userId:'author',type:operation.type,seq:operation.seq,layerId:null,tool:null,data:operation})
 const query=vi.mocked(getCanonicalGesturePrefixWithRows),original=query.getMockImplementation();if(!original)throw Error('Missing query fixture')
 query.mockImplementation(async(_room,_selector,cut)=>({operations:f.operations.filter(op=>op.seq!<=cut),canonicalRows:f.canonicalRows.filter(row=>row.seq<=cut),...close.seq<=cut?{close:{operation:close,row:closeRow}}:{}}))
 const writes=db.operation.create.mock.calls.length
 try{
  expect(await transport.metadata(identity,operation,()=>true)).toMatchObject({result:{ok:false,reason:'canonical_repair_required'}})
  expect(query).toHaveBeenLastCalledWith('board',{userId:'author',strokeId:'gesture'},operation.seq-1,expect.objectContaining({id:f.operations[0].id}))
  expect(db.operation.create).toHaveBeenCalledTimes(writes);expect(f.board.operationsById.has(operation.id)).toBe(false)
 }finally{query.mockReset().mockImplementation(original)}
})
it('repairs a failed private sealed undo in place without repairing another operation or allocating seq2',async()=>{
 const f=await recordedCloseReadFixture(),transport=new CanonicalRoomTransport({...selected,fullHistoryFormat:'mixed-v2'}),undo={type:'operation_undo' as const,id:'sealed-failed-undo',userId:'author',timestamp:200,targetOpId:f.operations[0].id}
 const log=vi.spyOn(console,'error').mockImplementation(()=>{})
 try{
  db.operation.create.mockRejectedValueOnce(new Error('sealed undo write failed'))
  expect(await transport.metadata(identity,undo,()=>true)).toMatchObject({result:{ok:false,reason:'canonical_repair_required'}})
  const next=f.board.nextSeq,writes=db.operation.create.mock.calls.length
  expect(await transport.metadata(identity,undo,()=>true)).toMatchObject({result:{ok:true,seq:next-1,duplicate:true}})
  expect(f.board.nextSeq).toBe(next);expect(db.operation.create).toHaveBeenCalledTimes(writes+1)
 }finally{log.mockRestore()}
})
it('reauthorizes private sealed metadata after the indexed query instead of trusting a resident participant',async()=>{
 const f=await recordedCloseReadFixture(),transport=new CanonicalRoomTransport({...selected,fullHistoryFormat:'mixed-v2'}),query=vi.mocked(getCanonicalGesturePrefixWithRows),original=query.getMockImplementation();if(!original)throw Error('Missing query fixture')
 query.mockImplementation(async()=>{readAccess.allowed=false;return{operations:f.operations,canonicalRows:f.canonicalRows,close:{operation:f.close,row:f.closeRow}}})
 const writes=db.operation.create.mock.calls.length
 try{
  expect(await transport.metadata(identity,{type:'operation_undo',id:'revoked-after-query',userId:'author',timestamp:100,targetOpId:f.operations[0].id},()=>true)).toMatchObject({result:{ok:false,reason:'not_joined'}})
  expect(f.board.participants.has('author')).toBe(true);expect(db.operation.create).toHaveBeenCalledTimes(writes)
 }finally{query.mockReset().mockImplementation(original)}
})

it('never classifies a canonical close as a legacy undo terminal or appends poison to the full-history domain',async()=>{
 const f=await closeWriterFixture()
 db.operation.findUnique.mockImplementation(async({where})=>db.operation.create.mock.calls.map(([request])=>request.data).find(row=>row.id===where.id)??null)
 db.operation.findMany.mockImplementation(async({where,take})=>db.operation.create.mock.calls.map(([request])=>request.data).filter(row=>row.roomId===where.roomId&&row.seq>where.seq.gt&&row.seq<=where.seq.lte).slice(0,take))
 const closed=await f.transport.close(identity,f.request,()=>true)
 if(!closed.accepted)throw Error('Missing actual typed close')
 const writes=db.operation.create.mock.calls.length,next=f.board.nextSeq
 expect(await new CanonicalRoomTransport({...selected,fullHistoryFormat:'mixed-v2'}).metadata(identity,{type:'operation_undo',id:'undo-close-meta',userId:'author',timestamp:200,targetOpId:closed.accepted.id},()=>true)).toMatchObject({result:{ok:false,reason:'canonical_repair_required'}})
 expect(db.operation.create).toHaveBeenCalledTimes(writes);expect(f.board.nextSeq).toBe(next)
})

/** Indexed rows are created by the actual writer. Both full-cut and gesture
 * queries below run the real snapshotStore parsers over this tiny DB double. */
async function redoBranchFixture(){
 const f=setup(softDescriptor()),persisted=new Map<string,import('./roomPersistence.js').CanonicalStoredOperationRow>()
 db.operation.create.mockReset().mockImplementation(async({data})=>{const row=structuredClone(data);persisted.set(row.id,row);return structuredClone(row)})
 db.operation.findUnique.mockImplementation(async({where})=>structuredClone(persisted.get(where.id)??null))
 db.operation.findMany.mockImplementation(async({where,take})=>[...persisted.values()].filter(row=>{
  if(row.roomId!==where.roomId||row.seq<=where.seq.gt||row.seq>where.seq.lte)return false
  if(!where.OR)return true
  const selector=where.OR[0],op=row.data as import('@grafetto/shared').Operation
  return op.type==='canonical_stroke'?op.userId===selector.userId&&op.frame.strokeId===selector.data.equals
   :op.type==='canonical_stroke_close'&&op.targetUserId===selector.userId&&op.strokeId===selector.data.equals
 }).sort((a,b)=>a.seq-b.seq).slice(0,take).map(row=>structuredClone(row)))
 const actual=await vi.importActual<typeof import('./snapshotStore.js')>('./snapshotStore.js')
 vi.mocked(getCanonicalGesturePrefixWithRows).mockImplementation(actual.getCanonicalGesturePrefixWithRows)
 const transport=new CanonicalRoomTransport({...selected,fullHistoryFormat:'mixed-v2'})
 const author=async(strokeId:string,userId='author',inputCount=3)=>{
  const who={roomId:'board',userId},s=snapshot(await transport.begin(who,{...f.input,strokeId},()=>true)),packets=frames(f.descriptor,s,inputCount),accepted:CanonicalStrokeOperation[]=[]
  for(let n=0;n<packets.length;n++){
   const outcome=await transport.recorded(who,{id:strokeId+'-'+n,type:'canonical_stroke',userId,timestamp:n,layerId:'layer',frame:packets[n]},()=>true)
   if(!outcome.accepted)throw Error('Actual branch source rejected: '+JSON.stringify(outcome.result));accepted.push(outcome.accepted)
  }
  return accepted
 }
 const command=(id:string,type:'operation_undo'|'operation_redo',targetOpId:string)=>({id,type,targetOpId,userId:'author',timestamp:200})
 return{...f,transport,persisted,author,command}
}
it('refuses only a new redo after a new own gesture, and a repeated undo cannot revive the discarded branch',async()=>{
 const f=await redoBranchFixture(),first=await f.author('branch-a'),second=await f.author('branch-b')
 const undo=f.command('branch-undo','operation_undo',second[0].id)
 expect(await f.transport.metadata(identity,undo,()=>true)).toMatchObject({result:{ok:true}})
 await f.author('branch-c');const next=f.board.nextSeq,writes=db.operation.create.mock.calls.length
 expect(await f.transport.metadata(identity,f.command('gone-redo','operation_redo',undo.id),()=>true)).toMatchObject({result:{ok:false,reason:'invalid_operation'}})
 expect(f.board.nextSeq).toBe(next);expect(db.operation.create).toHaveBeenCalledTimes(writes)
 const again=f.command('gone-undo','operation_undo',undo.id)
 expect(await f.transport.metadata(identity,again,()=>true)).toMatchObject({result:{ok:true}})
 expect(await f.transport.metadata(identity,f.command('gone-redo-again','operation_redo',again.id),()=>true)).toMatchObject({result:{ok:false,reason:'invalid_operation'}})
 const read=await f.transport.prepareReadDelivery(identity,()=>true),full=await read.prepareFullHistory({throughSeq:f.board.nextSeq-1,floor:0})
 expect(full.operations.some(op=>op.id===first[0].id)).toBe(true);expect(read.finish(full.operations,full.canonicalRows,full).canonicalHistoryBase?.operationCount).toBe(f.board.nextSeq-1)
})
it('does not discard an author redo branch when a different participant starts a gesture',async()=>{
 const f=await redoBranchFixture(),a=await f.author('peer-a'),undo=f.command('peer-undo','operation_undo',a[0].id)
 expect(await f.transport.metadata(identity,undo,()=>true)).toMatchObject({result:{ok:true}})
 f.board.participants.set('peer',{userId:'peer',name:'Peer',role:'member',color:'#fff',frozen:false,boardId:'board'});f.storage.install('peer',f.library,new Map())
 await f.author('peer-c','peer')
 expect(await f.transport.metadata(identity,f.command('peer-redo','operation_redo',undo.id),()=>true)).toMatchObject({result:{ok:true}})
})
it('keeps durable and indexed SAME-ID redo repair valid after a later undo and branch',async()=>{
 const f=await redoBranchFixture(),a=await f.author('repair-a'),undo=f.command('repair-undo','operation_undo',a[0].id),redo=f.command('repair-redo','operation_redo',undo.id)
 expect(await f.transport.metadata(identity,undo,()=>true)).toMatchObject({result:{ok:true}})
 const accepted=await f.transport.metadata(identity,redo,()=>true);expect(accepted).toMatchObject({result:{ok:true}})
 expect(await f.transport.metadata(identity,f.command('repair-undo-again','operation_undo',redo.id),()=>true)).toMatchObject({result:{ok:true}})
 await f.author('repair-c');const next=f.board.nextSeq,writes=db.operation.create.mock.calls.length
 expect(await f.transport.metadata(identity,redo,()=>true)).toMatchObject({result:{ok:true,duplicate:true}})
 f.board.operationsById.delete(redo.id);f.board.operations=f.board.operations.filter(op=>op.id!==redo.id)
 expect(await f.transport.metadata(identity,redo,()=>true)).toMatchObject({result:{ok:true,duplicate:true}})
 expect(await f.transport.metadata(identity,{...redo,targetOpId:'conflict'},()=>true)).toMatchObject({result:{ok:false}})
 expect(f.board.nextSeq).toBe(next);expect(db.operation.create).toHaveBeenCalledTimes(writes)
})
it('rechecks the full original cut when a new own gesture is persisted during the redo read',async()=>{
 const f=await redoBranchFixture(),a=await f.author('race-a'),undo=f.command('race-undo','operation_undo',a[0].id)
 expect(await f.transport.metadata(identity,undo,()=>true)).toMatchObject({result:{ok:true}})
 const query=db.operation.findMany.getMockImplementation()!;let inserted=false
 db.operation.findMany.mockImplementation(async request=>{
  const rows=await query(request)
  if(!request.where.OR&&!inserted){inserted=true;await f.author('race-c')}
  return rows
 })
 const request=f.command('race-redo','operation_redo',undo.id)
 expect(await f.transport.metadata(identity,request,()=>true)).toMatchObject({result:{ok:false,reason:'canonical_repair_required'}})
 expect(inserted).toBe(true);expect(f.board.operationsById.has(request.id)).toBe(false)
 expect(await f.transport.metadata(identity,{...request,id:'race-redo-after'},()=>true)).toMatchObject({result:{ok:false,reason:'invalid_operation'}})
})
it('repairs a concurrent identical redo even when its acceptance moves the full-read cut',async()=>{
 const f=await redoBranchFixture(),a=await f.author('same-a'),undo=f.command('same-undo','operation_undo',a[0].id)
 expect(await f.transport.metadata(identity,undo,()=>true)).toMatchObject({result:{ok:true}})
 const request=f.command('same-redo','operation_redo',undo.id),query=db.operation.findMany.getMockImplementation()!;let nested:Awaited<ReturnType<typeof f.transport.metadata>>|undefined,started=false
 db.operation.findMany.mockImplementation(async input=>{
  const rows=await query(input)
  if(!input.where.OR&&!started){started=true;nested=await f.transport.metadata(identity,request,()=>true)}
  return rows
 })
 const result=await f.transport.metadata(identity,request,()=>true)
 expect(nested).toMatchObject({result:{ok:true}});expect(result).toMatchObject({result:{ok:true,duplicate:true}})
 expect(f.board.operations.filter(op=>op.id===request.id)).toHaveLength(1)
})
it('still reads an old accepted redo after a branch, and a later genuine undo makes that restored gesture redoable again',async()=>{
 const f=await redoBranchFixture(),a=await f.author('historical-a'),undo=f.command('historical-undo','operation_undo',a[0].id)
 expect(await f.transport.metadata(identity,undo,()=>true)).toMatchObject({result:{ok:true}})
 await f.author('historical-c')
 // A durable row from the previous admission law, not a new-policy request.
 const {recordCanonicalMetadataOperation,ensureCanonicalWrite}=await import('./operationLog.js')
 const old=recordCanonicalMetadataOperation('board',f.command('old-accepted-redo','operation_redo',undo.id))
 expect(await ensureCanonicalWrite(f.board,old)).toMatchObject({ok:true})
 const read=await f.transport.prepareReadDelivery(identity,()=>true),full=await read.prepareFullHistory({throughSeq:f.board.nextSeq-1,floor:0})
 expect(read.finish(full.operations,full.canonicalRows,full).canonicalHistoryBase?.operationCount).toBe(full.operations.length)
 const next=f.command('historical-new-undo','operation_undo',old.id)
 expect(await f.transport.metadata(identity,next,()=>true)).toMatchObject({result:{ok:true}})
 expect(await f.transport.metadata(identity,f.command('historical-new-redo','operation_redo',next.id),()=>true)).toMatchObject({result:{ok:true}})
})
it('repairs only the identical failed redo without running a fresh full-cut policy over its unpersisted row',async()=>{
 const f=await redoBranchFixture(),a=await f.author('failed-a'),undo=f.command('failed-undo','operation_undo',a[0].id)
 expect(await f.transport.metadata(identity,undo,()=>true)).toMatchObject({result:{ok:true}})
 const request=f.command('failed-redo','operation_redo',undo.id),log=vi.spyOn(console,'error').mockImplementation(()=>{})
 try{
  db.operation.create.mockRejectedValueOnce(Error('Actual redo durable failure'))
  expect(await f.transport.metadata(identity,request,()=>true)).toMatchObject({result:{ok:false,reason:'canonical_repair_required'}})
  const next=f.board.nextSeq
  await expect(f.author('blocked-while-failed')).rejects.toThrow('canonical_repair_required')
  expect(await f.transport.metadata(identity,request,()=>true)).toMatchObject({result:{ok:true,duplicate:true,seq:next-1}})
  expect(f.board.nextSeq).toBe(next);expect(f.persisted.has(request.id)).toBe(true)
 }finally{log.mockRestore()}
})
it('reauthorizes the full redo read before any new metadata publication',async()=>{
 const f=await redoBranchFixture(),a=await f.author('revoked-a'),undo=f.command('revoked-undo','operation_undo',a[0].id)
 expect(await f.transport.metadata(identity,undo,()=>true)).toMatchObject({result:{ok:true}})
 const query=db.operation.findMany.getMockImplementation()!,writes=db.operation.create.mock.calls.length,next=f.board.nextSeq
 db.operation.findMany.mockImplementation(async request=>{const rows=await query(request);if(!request.where.OR)readAccess.allowed=false;return rows})
 const request=f.command('revoked-redo','operation_redo',undo.id)
 expect(await f.transport.metadata(identity,request,()=>true)).toMatchObject({result:{ok:false,reason:'not_joined'}})
 expect(f.board.nextSeq).toBe(next);expect(db.operation.create).toHaveBeenCalledTimes(writes)
})

it('captures a fresh redo cut after a peer write has completed during its earlier target-prefix preparation',async()=>{
 const f=await redoBranchFixture(),a=await f.author('late-cut-a'),undo=f.command('late-cut-undo','operation_undo',a[0].id)
 expect(await f.transport.metadata(identity,undo,()=>true)).toMatchObject({result:{ok:true}})
 f.board.participants.set('peer',{userId:'peer',name:'Peer',role:'member',color:'#fff',frozen:false,boardId:'board'});f.storage.install('peer',f.library,new Map())
 const oldCut=f.board.nextSeq-1,query=db.operation.findMany.getMockImplementation()!,fullCuts:number[]=[]
 let inserted=false,completedPeerCut=0
 db.operation.findMany.mockImplementation(async input=>{
  const rows=await query(input)
  if(input.where.OR&&!inserted){
   inserted=true;await f.author('late-cut-peer','peer');completedPeerCut=f.board.nextSeq-1
  }
  if(!input.where.OR)fullCuts.push(input.where.seq.lte)
  return rows
 })
 const request=f.command('late-cut-redo','operation_redo',undo.id),result=await f.transport.metadata(identity,request,()=>true)
 expect(inserted).toBe(true);expect(completedPeerCut).toBeGreaterThan(oldCut)
 expect(result).toMatchObject({result:{ok:true,seq:completedPeerCut+1},accepted:{id:request.id,type:'operation_redo'}})
 expect(fullCuts.length).toBeGreaterThan(0);expect(fullCuts.every(cut=>cut===completedPeerCut)).toBe(true)
 expect(f.board.operations.filter(op=>op.id===request.id)).toHaveLength(1)
})


it('consumes actual indexed multi-page undo prefix through a scalar fold without invoking the old array reader',async()=>{
 const f=await redoBranchFixture(),operations=await f.author('stream-prefix','author',70),query=await vi.importActual<typeof import('./snapshotStore.js')>('./snapshotStore.js')
 vi.mocked(visitCanonicalGesturePrefixRows).mockImplementation(query.visitCanonicalGesturePrefixRows)
 const old=vi.mocked(getCanonicalGesturePrefixWithRows),calls=old.mock.calls.length
 expect(operations.length).toBeGreaterThan(64)
 const undo=f.command('stream-undo','operation_undo',operations.at(-1)!.id)
 expect(await f.transport.metadata(identity,undo,()=>true)).toMatchObject({result:{ok:true}})
 expect(old.mock.calls).toHaveLength(calls)
 const binder=new CanonicalBrushCapabilityResolver({storage:f.storage,operator:empty,...selected,maxGestures:4}),scope=binder.captureReadScope('board'),row=f.persisted.get(operations.at(-1)!.id)!
 const input={roomId:'board',boardEpoch:scope.boardEpoch,anchor:operations.at(-1)!,row,purpose:'undo-redo' as const}
 const fold=binder.createRecordedPrefixFold(input)
 for(const op of operations)fold.accept(op,f.persisted.get(op.id)!)
 expect(()=>Reflect.apply(fold.finish,{...fold},[])).toThrow('owner')
 expect(fold.finish()).toMatchObject({recordedNext:operations.length,ended:true})
 expect(()=>fold.finish()).toThrow('owner');expect(binder.size).toBe(0)
 const missing=binder.createRecordedPrefixFold(input)
 missing.accept(operations[0],f.persisted.get(operations[0].id)!)
 expect(()=>missing.finish()).toThrow('anchor')
 const purpose={...input,anchor:operations[0],row:f.persisted.get(operations[0].id)!,purpose:'undo-redo' as 'read'|'undo-redo'},open=binder.createRecordedPrefixFold(purpose)
 open.accept(operations[0],purpose.row);purpose.purpose='read';expect(()=>open.finish()).toThrow('open')
 const failed=binder.createRecordedPrefixFold({...purpose,purpose:'read'})
 failed.accept(operations[0],purpose.row)
 const wrong={...operations[1],frame:{...operations[1].frame,pigmentRgb8:[9,9,9] as [number,number,number]}}
 expect(()=>failed.accept(wrong,{...f.persisted.get(wrong.id)!,data:wrong})).toThrow()
 expect(()=>failed.finish()).toThrow('owner')
})

it('consumes and repairs an actual indexed partial close without the bounded array adapter',async()=>{
 const f=await closeWriterFixture(),actual=await vi.importActual<typeof import('./snapshotStore.js')>('./snapshotStore.js')
 vi.mocked(visitCanonicalGesturePrefixRows).mockImplementation(actual.visitCanonicalGesturePrefixRows)
 db.operation.findMany.mockImplementation(async({where,take})=>db.operation.create.mock.calls.map(([q])=>q.data).filter(row=>row.roomId===where.roomId&&row.seq>where.seq.gt&&row.seq<=where.seq.lte).slice(0,take))
 const old=vi.mocked(getCanonicalGesturePrefixWithRows),before=old.mock.calls.length
 const result=await f.transport.close(identity,f.request,()=>true)
 expect(result).toMatchObject({result:{ok:true},accepted:{type:'canonical_stroke_close',recordedNext:f.operations.length,firstFrameOpId:f.operations[0].id,lastFrameOpId:f.operations.at(-1)!.id}})
 expect(await f.transport.close(identity,f.request,()=>true)).toMatchObject({result:{ok:true,duplicate:true}})
 expect(old.mock.calls).toHaveLength(before)
})

it('indexed offer is closed policy DATA, not an empty legacy baseline or seat grant',async()=>{
 const {board}=setup()
 board.canonicalHistoryResidency='indexed-v1'
 expect(()=>new CanonicalRoomTransport(policy).createIndexedHistoryOffer(identity.roomId)).toThrow()
 const transport=new CanonicalRoomTransport({...policy,fullHistoryFormat:'mixed-indexed-v1'})
 const offer=transport.createIndexedHistoryOffer(identity.roomId)
 expect(offer.kind).toBe('canonical-indexed-history-offer-v1')
 expect(offer.scope.roomId).toBe(identity.roomId)
 expect(offer.scope.allowedRasterProfiles).toContain(CANONICAL_STROKE_RASTER_PROFILE)
 expect(offer.roomGeometry).toEqual({width:64,height:64,infinite:false})
 expect(Object.hasOwn(offer,'tailOperations')).toBe(false)
 expect(board.operations).toEqual([])
 await expect(transport.openIndexedHistory(identity,offer,{roomId:'board',userId:'author',socketId:'copied-seat'},()=>true)).rejects.toThrow()
})

it('indexed cut0 owner consumes actual empty queries, copied receiver refuses, later replacement seat expires it',async()=>{
 const {board}=setup();board.canonicalHistoryResidency='indexed-v1'
 db.roomParticipant.upsert.mockResolvedValue({});db.$executeRawUnsafe.mockResolvedValue(0);db.$queryRawUnsafe.mockResolvedValue([]);db.operation.findMany.mockResolvedValue([])
 expect(joinRoom('board','author','Owner','indexed-original-seat',true).ok).toBe(true)
 const seat=captureCurrentRoomSeat('board','author','indexed-original-seat')
 if(!seat)throw Error('Missing actual seated owner')
 const transport=new CanonicalRoomTransport({...policy,fullHistoryFormat:'mixed-indexed-v1'})
 const offer=transport.createIndexedHistoryOffer('board')
 try{
  const read=await transport.openIndexedHistory(identity,JSON.parse(JSON.stringify(offer)),seat,()=>true)
  expect(read.begin).toMatchObject({floor:0,throughSeq:0,operationCount:0})
  const copies={...read}
  await expect(copies.next(0)).rejects.toThrow()
  const before=db.$queryRawUnsafe.mock.calls.length
  const terminal=await read.next(0)
  expect(db.$queryRawUnsafe.mock.calls.length).toBeGreaterThan(before)
  expect(terminal).toMatchObject({terminal:true,operations:[],nextAfterSeq:0,finish:{lastSeq:0,operationCount:0}})
  expect(joinRoom('board','author','Owner','indexed-new-seat',true).ok).toBe(true)
  expect(()=>read.assertCurrent()).toThrow()
 }finally{leaveRoom('board','author','indexed-original-seat');leaveRoom('board','author','indexed-new-seat')}
})

async function indexedReadFixture(){
 const {board,input,descriptor}=setup(),writer=new CanonicalRoomTransport(policy)
 const s=snapshot(await writer.begin(identity,input,()=>true)),encoded=frames(descriptor,s)
 const persisted:import('./roomPersistence.js').CanonicalStoredOperationRow[]=[]
 db.operation.create.mockImplementation(async({data})=>{persisted.push(data);return data})
 for(let i=0;i<encoded.length;i++)expect((await writer.recorded(identity,{type:'canonical_stroke',id:`indexed-frame-${i}`,userId:'author',timestamp:i,layerId:input.layerId,frame:encoded[i]},()=>true)).result.ok).toBe(true)
 await flushRoomWrites('board')
 const cut=board.nextSeq-1
 expect(cut).toBe(encoded.length)
 board.canonicalHistoryResidency='indexed-v1';board.operations=[];board.operationsById.clear()
 let portalCursor=0,portalCut=cut
 db.$executeRawUnsafe.mockImplementation(async(sql:string,...parameters:unknown[])=>{if(sql.startsWith('DECLARE ')){portalCursor=0;portalCut=parameters[1] as number}return 0})
 db.$queryRawUnsafe.mockImplementation(async(sql:string,...parameters:unknown[])=>{
  const scalar=(row:import('./roomPersistence.js').CanonicalStoredOperationRow)=>({id:row.id,seq:row.seq,type:row.type,bytes:Buffer.byteLength(JSON.stringify(row.data),'utf8')})
  if(sql.startsWith('FETCH ')){const selected=persisted.filter(row=>row.seq<=portalCut).slice(portalCursor,portalCursor+64);portalCursor+=selected.length;return selected.map(scalar)}
  const rootEffects=(cut:number,user:unknown,stroke:unknown)=>{
   const ordered=persisted.filter(row=>row.seq<=cut).sort((a,b)=>a.seq-b.seq),members=new Set<string>(),metadata:typeof persisted=[]
   for(const row of ordered){const op=row.data as import('@grafetto/shared').Operation;if(row.userId!==user)continue;if(op.type==='canonical_stroke'&&op.frame.strokeId===stroke)members.add(row.id);else if((op.type==='operation_undo'||op.type==='operation_redo')&&members.has(op.targetOpId)){members.add(row.id);metadata.push(row)}}
   const redo=metadata.filter(row=>row.type==='operation_redo').at(-1),undo=metadata.find(row=>row.type==='operation_undo'&&row.seq>(redo?.seq??0)),branch=undo&&ordered.find(row=>row.userId===user&&row.seq>undo.seq&&row.type==='canonical_stroke'&&(row.data as import('@grafetto/shared').CanonicalStrokeOperation).frame.frameOrdinal===0)
   return {firstMetadata:metadata[0],lastMetadata:metadata.at(-1),latestRedo:redo,firstUndoAfterLatestRedo:undo,ownBranchAfterUndo:branch}
  }
  if(sql.includes("'firstUndoAfterLatestRedo'"))return Object.entries(rootEffects(parameters[1] as number,parameters[2],parameters[3])).flatMap(([role,row])=>row?[{role,id:row.id,seq:row.seq}]:[])
  if(sql.includes('effects.candidate'))return persisted.filter(row=>{
   const op=row.data as import('@grafetto/shared').Operation
   if(row.seq>(parameters[1] as number)||row.seq>=(parameters[3] as number)||row.userId!==parameters[2]||op.type!=='canonical_stroke'||op.frame.frameOrdinal!==0)return false
   const effect=rootEffects(parameters[1] as number,row.userId,op.frame.strokeId),hidden=effect.lastMetadata?.type==='operation_undo'
   return parameters[4]==='undo'?!hidden:hidden&&!!effect.firstUndoAfterLatestRedo&&!effect.ownBranchAfterUndo
  }).sort((a,b)=>b.seq-a.seq).slice(0,64).map(scalar)
  if(sql.startsWith('SELECT id,seq,type,octet_length'))return persisted.filter(row=>{
   if(sql.includes('AND id=$3::text'))return row.id===parameters[2]&&row.seq<=(parameters[1] as number)
   if(sql.includes('ORDER BY seq DESC'))return row.seq<=(parameters[1] as number)&&row.userId===parameters[2]&&row.seq<(parameters[3] as number)&&(row.data as import('@grafetto/shared').CanonicalStrokeOperation).frame?.frameOrdinal===0
   if(row.seq<=(parameters[2] as number)||row.seq>(parameters[1] as number))return false
   const op=row.data as import('@grafetto/shared').Operation
   if(sql.includes("frameOrdinal"))return op.type==='canonical_stroke'&&op.frame.frameOrdinal===0
   if(parameters.length===5)return op.type==='canonical_stroke'&&op.userId===parameters[3]&&op.frame.strokeId===parameters[4]
   return true
  }).sort((a,b)=>sql.includes('ORDER BY seq DESC')?b.seq-a.seq:a.seq-b.seq).slice(0,64).map(scalar)
  return []
 })
 db.roomParticipant.upsert.mockResolvedValue({})
 db.operation.findUnique.mockImplementation(async({where})=>persisted.find(row=>row.id===where.id)??null)
 db.operation.findMany.mockImplementation(async({where,take})=>persisted.filter(row=>{
  if(row.roomId!==where.roomId)return false
  if(where.id)return where.id.in.includes(row.id)
  if(row.seq<=where.seq.gt||row.seq>where.seq.lte)return false
  const op=row.data as import('@grafetto/shared').Operation
  if(where.data?.path?.[1]==='frameOrdinal')return op.type==='canonical_stroke'&&op.frame.frameOrdinal===0
  const selector=where.OR?.[0]
  return !selector||op.type==='canonical_stroke'&&op.userId===selector.userId&&op.frame.strokeId===selector.data.equals
 }).slice(0,take))
 expect(joinRoom('board','author','Owner','indexed-source-seat',true).ok).toBe(true)
 const seat=captureCurrentRoomSeat('board','author','indexed-source-seat')
 if(!seat)throw Error('Missing original source seat')
 const transport=new CanonicalRoomTransport({...policy,fullHistoryFormat:'mixed-indexed-v1'})
 const read=await transport.openIndexedHistory(identity,transport.createIndexedHistoryOffer('board'),seat,()=>true)
 return{board,input,descriptor,writer,persisted,cut,read}
}

it('indexed owner validates and pages actual durable source rows without adopting a full resident history',async()=>{
 const {board,cut,persisted,read}=await indexedReadFixture()
 try{
  expect(read.begin.operationCount).toBe(cut)
  const page=await read.next(0)
  expect(page.terminal).toBe(false)
  expect(page.operations.map(op=>op.id)).toEqual(persisted.map(row=>row.id))
  const first=page.operations[0]
  if(first.type!=='canonical_stroke')throw Error('Expected actual source frame')
  const proof=await read.evidence({originalUserId:first.userId,strokeId:first.frame.strokeId,layerId:first.layerId,firstOperationId:first.id,firstSequence:first.seq!})
  expect(proof.rows[proof.first]).toEqual(first)
  expect(proof.terminal).not.toBeNull()
  expect(proof.lastMetadata).toBeNull()
  const terminal=await read.next(page.nextAfterSeq)
  expect(terminal).toMatchObject({terminal:true,finish:{lastSeq:cut,operationCount:cut}})
  expect(board.operations).toEqual([])
 }finally{leaveRoom('board','author','indexed-source-seat')}
})

it('indexed OPEN scalar checkpoint carries the real source prefix without closing or granting an author session',async()=>{
 const f=await redoBranchFixture(),operations=await f.author('indexed-carry','author',3)
 const binder=new CanonicalBrushCapabilityResolver({storage:f.storage,operator:empty,...selected,maxGestures:4}),scope=binder.captureReadScope('board')
 const first=operations[0],row=f.persisted.get(first.id)!,input={roomId:'board',boardEpoch:scope.boardEpoch,anchor:first,row,purpose:'read' as const}
 const fold=binder.createIndexedRecordedPrefixFold(input)
 fold.accept(first,row)
 expect(fold.checkpoint()).toMatchObject({recordedNext:1,ended:false})
 expect(()=>Reflect.apply(fold.checkpoint,{...fold},[])).toThrow('owner')
 for(const operation of operations.slice(1))fold.accept(operation,f.persisted.get(operation.id)!)
 expect(fold.finish()).toMatchObject({recordedNext:operations.length,ended:true})
 expect(()=>fold.checkpoint()).toThrow('owner')
 expect(binder.size).toBe(0)
 const legacy=binder.createRecordedPrefixFold(input)
 legacy.accept(first,row)
 expect(()=>legacy.checkpoint()).toThrow('indexed')
})

it('forked indexed carry failure never advances the committed original prefix or strands a retry ordinal',async()=>{
 const f=await redoBranchFixture(),operations=await f.author('indexed-fork','author',3)
 const binder=new CanonicalBrushCapabilityResolver({storage:f.storage,operator:empty,...selected,maxGestures:4}),scope=binder.captureReadScope('board')
 const first=operations[0],base=binder.createIndexedRecordedPrefixFold({roomId:'board',boardEpoch:scope.boardEpoch,anchor:first,row:f.persisted.get(first.id)!,purpose:'read'})
 base.accept(first,f.persisted.get(first.id)!)
 const candidate=base.fork()
 expect(()=>Reflect.apply(base.fork,{...base},[])).toThrow('owner')
 const second=operations[1]
 candidate.accept(second,f.persisted.get(second.id)!)
 const wrong={...operations[2],frame:{...operations[2].frame,pigmentRgb8:[8,8,8] as [number,number,number]}}
 expect(()=>candidate.accept(wrong,{...f.persisted.get(wrong.id)!,data:wrong})).toThrow()
 expect(()=>candidate.checkpoint()).toThrow('owner')
 expect(base.checkpoint()).toMatchObject({recordedNext:1,ended:false})
 const retry=base.fork()
 for(const operation of operations.slice(1))retry.accept(operation,f.persisted.get(operation.id)!)
 expect(retry.finish()).toMatchObject({recordedNext:operations.length,ended:true})
 expect(base.checkpoint()).toMatchObject({recordedNext:1,ended:false})
 expect(binder.size).toBe(0)
})

it('failed candidate after an actual typed partial close keeps the committed OPEN carry retryable',async()=>{
 const f=await closeWriterFixture()
 db.operation.findUnique.mockImplementation(async({where})=>db.operation.create.mock.calls.map(([request])=>request.data).find(row=>row.id===where.id)??null)
 db.operation.findMany.mockImplementation(async({where,take})=>db.operation.create.mock.calls.map(([request])=>request.data).filter(row=>row.roomId===where.roomId&&row.seq>where.seq.gt&&row.seq<=where.seq.lte).slice(0,take))
 const closed=await f.transport.close(identity,f.request,()=>true)
 if(!closed.accepted)throw Error('Expected actual durable typed close: '+JSON.stringify(closed.result))
 const row=db.operation.create.mock.calls.map(([request])=>request.data).find(value=>value.id===closed.accepted!.id)
 if(!row)throw Error('Missing actual indexed close row')
 const binder=new CanonicalBrushCapabilityResolver({storage:f.storage,operator:empty,...selected,maxGestures:4}),scope=binder.captureReadScope('board')
 const base=binder.createIndexedRecordedPrefixFold({roomId:'board',boardEpoch:scope.boardEpoch,anchor:f.operations[0],row:f.rows[0],purpose:'read'})
 for(let i=0;i<f.operations.length;i++)base.accept(f.operations[i],f.rows[i])
 const candidate=base.fork()
 candidate.accept(closed.accepted,row)
 expect(candidate.checkpoint().closeSeal).toBeDefined()
 expect(()=>candidate.accept(closed.accepted!,row)).toThrow()
 expect(base.checkpoint()).toMatchObject({recordedNext:f.operations.length,ended:false})
 expect(base.checkpoint().closeSeal).toBeUndefined()
 const retry=base.fork();retry.accept(closed.accepted,row)
 expect(retry.finish().closeSeal).toBeDefined()
 expect(base.checkpoint().closeSeal).toBeUndefined()
})

it('follows actual durable OPEN frames in finite ranges and retries a cancelled candidate without rescanning the committed prefix',async()=>{
 const f=await indexedReadFixture()
 try{
  const firstPage=await f.read.next(0);await f.read.next(firstPage.nextAfterSeq)
  const input={...f.input,strokeId:'long-follow-source'},s=snapshot(await f.writer.begin(identity,input,()=>true)),packets=frames(f.descriptor,s,70)
  expect(packets.length).toBeGreaterThan(64)
  for(let i=0;i<packets.length;i++)expect((await f.writer.recorded(identity,{type:'canonical_stroke',id:`follow-frame-${i}`,userId:'author',timestamp:i,layerId:input.layerId,frame:packets[i]},()=>true)).result.ok).toBe(true)
  await flushRoomWrites('board')
  const finalCut=f.board.nextSeq-1
  const prefixQueries=()=>db.$queryRawUnsafe.mock.calls.filter(([sql,...parameters])=>String(sql).startsWith('SELECT id,seq,type,octet_length')&&parameters.length===5).length
  const originalParent=f.read.begin.streamId
  const before=prefixQueries(),first=await f.read.follow(f.cut)
  expect(first).toMatchObject({floor:f.cut,operationCount:64,throughSeq:f.cut+64,latestObservedSeq:finalCut})
  const cancelled=await f.read.next(f.cut)
  f.read.cancel()
  const retry=await f.read.follow(f.cut)
  expect(retry.floor).toBe(first.floor);expect(retry.throughSeq).toBe(first.throughSeq)
  expect(retry.parentStreamId).toBe(originalParent)
  const retried=await f.read.next(f.cut)
  expect(retried.operations.map(op=>op.id)).toEqual(cancelled.operations.map(op=>op.id))
  const terminal=await f.read.next(retry.throughSeq)
  expect(terminal).toMatchObject({terminal:true,finish:{kind:'canonical-indexed-history-follow-finish-v1',floor:f.cut,lastSeq:retry.throughSeq,operationCount:64}})
  let completed=retry.throughSeq,seen=64
  while(completed<finalCut){
   const range=await f.read.follow(completed)
   expect(range.floor).toBe(completed);expect(range.operationCount).toBeGreaterThan(0);expect(range.operationCount).toBeLessThanOrEqual(64)
   const page=await f.read.next(completed)
   seen+=page.operations.length
   expect(page.operations[0].seq).toBe(completed+1)
   expect((await f.read.next(range.throughSeq)).terminal).toBe(true)
   completed=range.throughSeq
  }
  expect(seen).toBe(packets.length)
  expect(prefixQueries()).toBe(before)
  await expect(f.read.follow(f.cut)).rejects.toThrow()
  const empty=await f.read.follow(completed)
  expect(empty).toMatchObject({floor:completed,throughSeq:completed,operationCount:0})
  expect((await f.read.next(completed)).terminal).toBe(true)
 }finally{leaveRoom('board','author','indexed-source-seat')}
})

it('indexed history selection names an actual first-frame witness and recovery reads the same completed cut',async()=>{
 const f=await indexedReadFixture()
 try{
  const page=await f.read.next(0);await f.read.next(page.nextAfterSeq)
  const selected=await f.read.select('undo')
  expect(selected).not.toBeNull()
  expect(selected!.targetOperationId).toBe(selected!.evidence.rows[selected!.evidence.first].id)
  expect(selected!.targetOperationId).toBe(f.persisted[0].id)
  expect(await f.read.select('redo')).toBeNull()
  await expect(f.read.recover(f.cut+1)).rejects.toThrow()
  const originalStreamId=f.read.begin.streamId
  const recovered=await f.read.recover(f.cut)
  expect(recovered.begin).toMatchObject({kind:'canonical-indexed-history-begin-v1',floor:0,throughSeq:f.cut,operationCount:f.cut})
  expect(recovered.begin.streamId).not.toBe(originalStreamId)
  expect((await recovered.next(0)).operations.map(op=>op.id)).toEqual(page.operations.map(op=>op.id))
 }finally{leaveRoom('board','author','indexed-source-seat')}
})

it('a quiet completed logical parent remains selectable/followable after an actual finite recovery is cancelled',async()=>{
 const f=await indexedReadFixture()
 try{
  const page=await f.read.next(0);await f.read.next(page.nextAfterSeq)
  const parent=f.read.begin.streamId,queries=db.$executeRawUnsafe.mock.calls.filter(([sql])=>sql.startsWith('DECLARE ')).length
  const candidate=await f.read.recover(f.cut)
  await expect(candidate.select('undo',parent)).rejects.toThrow()
  candidate.cancel()
  const selected=await candidate.select('undo',parent)
  expect(selected?.targetOperationId).toBe(f.persisted[0].id)
  expect(selected?.evidence).toMatchObject({streamId:parent,throughSeq:f.cut})
  expect(candidate).toBe(f.read)
  expect(db.$executeRawUnsafe.mock.calls.filter(([sql])=>sql.startsWith('DECLARE ')).length).toBe(queries)
  const follow=await candidate.follow(f.cut,parent)
  expect(follow).toMatchObject({parentStreamId:parent,floor:f.cut,throughSeq:f.cut,operationCount:0})
  candidate.cancel()
  const recovered=await candidate.recover(f.cut)
  expect(recovered).toBe(candidate)
  recovered.cancel()
  expect((await recovered.select('undo',parent))?.evidence.streamId).toBe(parent)
 }finally{leaveRoom('board','author','indexed-source-seat')}
})

it('hydrates a cold indexed writer from more than 1024 actual OPEN frames without a whole-array resume adapter',async()=>{
 const f=await indexedReadFixture()
 try{
  const input={...f.input,strokeId:'indexed-long-resume'},s=snapshot(await f.writer.begin(identity,input,()=>true)),packets=frames(f.descriptor,s,1100).slice(0,-1)
  expect(packets.length).toBeGreaterThan(1024)
  for(let i=0;i<packets.length;i++)expect((await f.writer.recorded(identity,{type:'canonical_stroke',id:`resume-frame-${i}`,userId:'author',timestamp:i,layerId:input.layerId,frame:packets[i]},()=>true)).result.ok).toBe(true)
  await flushRoomWrites('board')
  f.board.operations=[];f.board.operationsById.clear()
  const old=vi.mocked(getCanonicalGesturePrefixWithRows),before=old.mock.calls.length
  old.mockImplementation(async()=>{throw Error('Whole-array resume unavailable in indexed mode')})
  const fresh=new CanonicalRoomTransport({...policy,fullHistoryFormat:'mixed-indexed-v1'})
  const duplicate=await fresh.recorded(identity,{type:'canonical_stroke',id:'resume-frame-0',userId:'author',timestamp:0,layerId:input.layerId,frame:packets[0]},()=>true)
  expect(duplicate.result).toMatchObject({ok:true,duplicate:true})
  expect(duplicate.canonicalCapabilities?.bindings).toHaveLength(1)
  const resumed=await fresh.begin(identity,input,()=>true)
  expect(resumed).toMatchObject({ok:true,recordedNext:packets.length,liveNext:packets.length,ended:false})
  expect(old.mock.calls.length).toBe(before)
  expect(f.board.operations).toEqual([])
  const closed=await fresh.close(identity,{operationId:'long-resume-close',layerId:input.layerId,targetUserId:'author',strokeId:input.strokeId,disposition:'commitPartial',expectedRecordedNext:packets.length,expectedLastFrameOpId:`resume-frame-${packets.length-1}`},()=>true)
  expect(closed.result.ok).toBe(true)
  const coldClose=new CanonicalRoomTransport({...policy,fullHistoryFormat:'mixed-indexed-v1'})
  expect((await coldClose.close(identity,{operationId:'long-resume-close',layerId:input.layerId,targetUserId:'author',strokeId:input.strokeId,disposition:'commitPartial',expectedRecordedNext:packets.length,expectedLastFrameOpId:`resume-frame-${packets.length-1}`},()=>true)).result).toMatchObject({ok:true,duplicate:true})
  const sourceBodies=db.operation.findMany.mock.calls.filter(([request])=>request.where.id)
  expect(sourceBodies.length).toBeGreaterThan(16)
  expect(sourceBodies.every(([request])=>request.take<=64)).toBe(true)
 }finally{leaveRoom('board','author','indexed-source-seat')}
},30000)

it('retires more than 1024 completed indexed gestures while exact old recorded retries remain durable',async()=>{
 const f=await indexedReadFixture(),writer=new CanonicalRoomTransport({...policy,fullHistoryFormat:'mixed-indexed-v1'})
 try{
  let oldest:import('@grafetto/shared').CanonicalStrokeOperation|undefined
  for(let gesture=0;gesture<1025;gesture++){
   const input={...f.input,strokeId:`completed-${gesture}`},s=snapshot(await writer.begin(identity,input,()=>true)),encoded=frames(f.descriptor,s,1)
   expect(encoded.some(frame=>unpackCanonicalMaterial(frame.materialPacked,s.material).draws.length>0)).toBe(true)
   for(let ordinal=0;ordinal<encoded.length;ordinal++){
    const op={type:'canonical_stroke' as const,id:`completed-${gesture}-${ordinal}`,userId:'author',timestamp:gesture,layerId:input.layerId,frame:encoded[ordinal]!}
    oldest??=op
    expect((await writer.recorded(identity,op,()=>true)).result.ok).toBe(true)
   }
   expect(f.board.operations).toHaveLength(0)
   expect(f.board.operationsById.size).toBe(0)
   expect(writer['binder']?.size).toBe(0)
   expect(writer['lifetimes'].get('board')?.sessions.size).toBe(0)
  }
  const duplicate=await writer.recorded(identity,oldest!,()=>true)
  expect(duplicate.result).toMatchObject({ok:true,duplicate:true})
  expect(duplicate.canonicalCapabilities?.bindings).toHaveLength(1)
  const beforeLate=f.board.nextSeq,late=writer.live(identity,{layerId:oldest!.layerId,frame:oldest!.frame})
  expect(late.result.ok).toBe(false)
  expect(late.accepted).toBeUndefined()
  expect(f.board.nextSeq).toBe(beforeLate)
  const undo={type:'operation_undo' as const,id:'retired-root-undo',userId:'author',timestamp:9000,targetOpId:oldest!.id}
  expect(await writer.metadata(identity,undo,()=>true)).toMatchObject({result:{ok:true}})
  expect(f.board.operations).toHaveLength(0)
  expect(await writer.metadata(identity,undo,()=>true)).toMatchObject({result:{ok:true,duplicate:true}})
  const redo={...undo,type:'operation_redo' as const,id:'retired-root-redo',targetOpId:undo.id}
  expect(await writer.metadata(identity,redo,()=>true)).toMatchObject({result:{ok:true}})
  const secondUndo={...undo,id:'retired-root-second-undo',targetOpId:redo.id}
  expect(await writer.metadata(identity,secondUndo,()=>true)).toMatchObject({result:{ok:true}})
  const branchInput={...f.input,strokeId:'retired-root-new-branch'},branchSnapshot=snapshot(await writer.begin(identity,branchInput,()=>true)),branchFrames=frames(f.descriptor,branchSnapshot,0)
  for(let i=0;i<branchFrames.length;i++)expect((await writer.recorded(identity,{type:'canonical_stroke',id:`retired-branch-${i}`,userId:'author',timestamp:9500,layerId:branchInput.layerId,frame:branchFrames[i]},()=>true)).result.ok).toBe(true)
  expect(await writer.metadata(identity,{...redo,id:'retired-root-stale-redo',targetOpId:secondUndo.id},()=>true)).toMatchObject({result:{ok:false,reason:'invalid_operation'}})
  const seat=captureCurrentRoomSeat('board','author','indexed-source-seat')
  if(!seat)throw Error('Missing actual joined seat')
  const reader=new CanonicalRoomTransport({...policy,fullHistoryFormat:'mixed-indexed-v1'})
  const reopened=await reader.openIndexedHistory(identity,reader.createIndexedHistoryOffer('board'),seat,()=>true)
  expect(reopened.begin.operationCount).toBe(f.board.nextSeq-1)
  let after=0,seen=0
  while(true){const page=await reopened.next(after);expect(page.operations.length).toBeLessThanOrEqual(64);seen+=page.operations.length;after=page.nextAfterSeq;if(page.terminal)break}
  expect(seen).toBe(f.board.nextSeq-1)
  expect(f.board.operations).toHaveLength(0)
  expect(reader['binder']?.size).toBe(0)
  expect(f.persisted.length).toBeGreaterThan(1024)
 }finally{leaveRoom('board','author','indexed-source-seat')}
},30000)


it.each(['healthy','new-seat','policy','revoked'] as const)('checks %s while sealing an indexed orphan before the genuine empty-board seat commits',async mode=>{
 const f=await indexedReadFixture()
 try{
  const input={...f.input,strokeId:'indexed-orphan'},s=snapshot(await f.writer.begin(identity,input,()=>true)),encoded=frames(f.descriptor,s,70).slice(0,-1)
  for(let i=0;i<encoded.length;i++)expect((await f.writer.recorded(identity,{type:'canonical_stroke',id:`orphan-frame-${i}`,userId:'author',timestamp:i,layerId:input.layerId,frame:encoded[i]},()=>true)).result.ok).toBe(true)
  await flushRoomWrites('board')
  leaveRoom('board','author','indexed-source-seat')
  // Simulate the bounded cold indexed resident, retaining DB originals only.
  f.board.operations=[];f.board.operationsById.clear();rooms.set('board',f.board)
  const joiningUser=mode==='revoked'?'student':'author'
  const access=await prepareAuthorizedJoin('board',joiningUser,'Owner',undefined,'orphan-new-seat',()=>true)
  if(!access.ok)throw Error(access.error)
  const transport=new CanonicalRoomTransport({...policy,fullHistoryFormat:'mixed-indexed-v1'}),before=f.persisted.length
  await expect(transport.prepareIndexedJoinOrphans({...access.preparation},()=>true)).rejects.toThrow()
  if(mode!=='healthy'){
   const query=db.operation.findMany.getMockImplementation()!
   db.operation.findMany.mockImplementationOnce(async args=>{
    if(mode==='new-seat')expect(joinRoom('board','peer','Peer','orphan-peer-seat').ok).toBe(true)
    else if(mode==='policy')f.board.passwordHash='changed-orphan-policy'
    else db.roomBlock.findUnique.mockResolvedValue({id:'fresh-revoked'})
    return query(args)
   })
   await expect(transport.prepareIndexedJoinOrphans(access.preparation,()=>true)).rejects.toThrow()
   expect(f.persisted).toHaveLength(before)
   expect(f.board.sockets.has('orphan-new-seat')).toBe(false)
   return
  }
  await transport.prepareIndexedJoinOrphans(access.preparation,()=>true)
  expect(f.persisted).toHaveLength(before+1)
  expect(f.persisted.at(-1)?.data).toMatchObject({type:'canonical_stroke_close',strokeId:input.strokeId,recordedNext:encoded.length,firstFrameOpId:'orphan-frame-0',lastFrameOpId:`orphan-frame-${encoded.length-1}`})
  expect(f.board.sockets.size).toBe(0)
  expect(access.preparation.commit().ok).toBe(true)
 }finally{leaveRoom('board','peer','orphan-peer-seat');leaveRoom('board','student','orphan-new-seat');leaveRoom('board','author','orphan-new-seat');leaveRoom('board','author','indexed-source-seat')}
})

it('selects an original eligible root behind hidden roots while OPEN candidates still require actual evidence',async()=>{
 const f=await indexedReadFixture(),writer=new CanonicalRoomTransport({...policy,fullHistoryFormat:'mixed-indexed-v1'})
 try{
  for(let gesture=0;gesture<70;gesture++){
   const input={...f.input,strokeId:`hidden-select-${gesture}`},s=snapshot(await writer.begin(identity,input,()=>true)),encoded=frames(f.descriptor,s,1)
   for(let ordinal=0;ordinal<encoded.length;ordinal++)expect((await writer.recorded(identity,{type:'canonical_stroke',id:`hidden-select-${gesture}-${ordinal}`,userId:'author',timestamp:gesture,layerId:input.layerId,frame:encoded[ordinal]},()=>true)).result.ok).toBe(true)
   expect(await writer.metadata(identity,{type:'operation_undo',id:`hide-select-${gesture}`,userId:'author',timestamp:gesture,targetOpId:`hidden-select-${gesture}-0`},()=>true)).toMatchObject({result:{ok:true}})
  }
  const openInput={...f.input,strokeId:'open-select'},openSnapshot=snapshot(await writer.begin(identity,openInput,()=>true)),prefix=frames(f.descriptor,openSnapshot,1).slice(0,-1)
  for(let ordinal=0;ordinal<prefix.length;ordinal++)expect((await writer.recorded(identity,{type:'canonical_stroke',id:`open-select-${ordinal}`,userId:'author',timestamp:80,layerId:openInput.layerId,frame:prefix[ordinal]},()=>true)).result.ok).toBe(true)
  const seat=captureCurrentRoomSeat('board','author','indexed-source-seat')
  if(!seat)throw Error('Missing actual selection seat')
  const transport=new CanonicalRoomTransport({...policy,fullHistoryFormat:'mixed-indexed-v1'}),read=await transport.openIndexedHistory(identity,transport.createIndexedHistoryOffer('board'),seat,()=>true)
  let after=0
  while(true){const page=await read.next(after);after=page.nextAfterSeq;if(page.terminal)break}
  const effectQueries=()=>db.$queryRawUnsafe.mock.calls.filter(([sql])=>sql.includes("'firstUndoAfterLatestRedo'")).length,before=effectQueries()
  const selected=await read.select('undo')
  expect(selected?.targetOperationId).toBe(f.persisted[0].id)
  expect(selected?.evidence.rows[selected.evidence.first].id).toBe(f.persisted[0].id)
  expect(selected?.evidence.terminal).not.toBeNull()
  expect(selected?.evidence.canonicalCapabilities?.bindings.length).toBeGreaterThan(0)
  // One real OPEN candidate and the actual selected old root; hidden roots
  // never invoke prefix/effect evidence after the metadata prefilter.
  expect(effectQueries()-before).toBe(2)
  expect(writer['lifetimes'].get('board')?.sessions.get(JSON.stringify(['board','author','open-select']))?.admission.cursor(identity,'open-select').ended).toBe(false)
 }finally{leaveRoom('board','author','indexed-source-seat')}
},15000)


async function indexedOrphanCandidateFixture(closedRoots:number,openRoots:number){
 const f=await indexedReadFixture()
 for(let n=1;n<closedRoots+openRoots;n++){
  const input={...f.input,strokeId:`candidate-${n}`},s=snapshot(await f.writer.begin(identity,input,()=>true))
  const encoded=n<closedRoots?frames(f.descriptor,s,0):frames(f.descriptor,s,1).slice(0,-1)
  if(!encoded.length)throw Error('Actual original prefix missing')
  for(let ordinal=0;ordinal<encoded.length;ordinal++)expect((await f.writer.recorded(identity,{type:'canonical_stroke',id:`candidate-${n}-${ordinal}`,userId:'author',timestamp:n,layerId:input.layerId,frame:encoded[ordinal]},()=>true)).result.ok).toBe(true)
 }
 await flushRoomWrites('board');leaveRoom('board','author','indexed-source-seat')
 f.board.operations=[];f.board.operationsById.clear();rooms.set('board',f.board)
 return f
}
it('validates72closed indexed roots once before zero-seat JOIN without repeating their closed prefixes',async()=>{
 const f=await indexedOrphanCandidateFixture(72,0),transport=new CanonicalRoomTransport({...policy,fullHistoryFormat:'mixed-indexed-v1'}),fold=vi.spyOn(CanonicalBrushCapabilityResolver.prototype,'createIndexedRecordedPrefixFold')
 try{
  const access=await prepareAuthorizedJoin('board','author','Owner',undefined,'candidate-seat',()=>true);if(!access.ok)throw Error(access.error)
  const before=f.persisted.length;db.$queryRawUnsafe.mockClear()
  await transport.prepareIndexedJoinOrphans(access.preparation,()=>true)
  expect(fold).toHaveBeenCalledTimes(72);expect(f.persisted).toHaveLength(before)
  // Original whole-cut validation still runs; only the redundant orphan walk disappears.
  expect(db.$queryRawUnsafe.mock.calls.some(([sql])=>String(sql).startsWith('FETCH '))).toBe(true)
  expect(db.$queryRawUnsafe.mock.calls.some(([sql])=>String(sql).includes('AND id=$3::text'))).toBe(false)
  expect(access.preparation.commit().ok).toBe(true)
  const seat=captureCurrentRoomSeat('board','author','candidate-seat');if(!seat)throw Error('Actual seat missing')
  fold.mockClear();const reader=new CanonicalRoomTransport({...policy,fullHistoryFormat:'mixed-indexed-v1'})
  const read=await reader.openIndexedHistory(identity,reader.createIndexedHistoryOffer('board'),seat,()=>true)
  expect(read.begin.operationCount).toBe(before);expect(fold).toHaveBeenCalledTimes(72)
 }finally{leaveRoom('board','author','candidate-seat')}
},30000)
it('freshly reloads and closes only the actual OPEN candidate after validating72closed roots',async()=>{
 const f=await indexedOrphanCandidateFixture(72,1),transport=new CanonicalRoomTransport({...policy,fullHistoryFormat:'mixed-indexed-v1'}),fold=vi.spyOn(CanonicalBrushCapabilityResolver.prototype,'createIndexedRecordedPrefixFold')
 try{
  const access=await prepareAuthorizedJoin('board','author','Owner',undefined,'candidate-seat',()=>true);if(!access.ok)throw Error(access.error)
  const before=f.persisted.length;db.$queryRawUnsafe.mockClear()
  await transport.prepareIndexedJoinOrphans(access.preparation,()=>true)
  expect(fold).toHaveBeenCalledTimes(75) //73 original roots +selected fresh prefix +genuine close core.
  const selected=db.$queryRawUnsafe.mock.calls.filter(([sql])=>String(sql).includes('AND id=$3::text'))
  expect(selected).toHaveLength(1);expect(selected[0][3]).toBe('candidate-72-0')
  expect(f.persisted).toHaveLength(before+1);expect(f.persisted.at(-1)?.data).toMatchObject({type:'canonical_stroke_close',strokeId:'candidate-72'})
 }finally{leaveRoom('board','author','candidate-seat')}
},30000)
it('falls back to the original streaming orphan walk after65OPEN candidates without a new64root refusal',async()=>{
 const f=await indexedOrphanCandidateFixture(1,65),transport=new CanonicalRoomTransport({...policy,fullHistoryFormat:'mixed-indexed-v1'}),fold=vi.spyOn(CanonicalBrushCapabilityResolver.prototype,'createIndexedRecordedPrefixFold')
 try{
  const access=await prepareAuthorizedJoin('board','author','Owner',undefined,'candidate-seat',()=>true);if(!access.ok)throw Error(access.error)
  const before=f.persisted.length;db.$queryRawUnsafe.mockClear()
  await transport.prepareIndexedJoinOrphans(access.preparation,()=>true)
  expect(f.persisted).toHaveLength(before+65)
  expect(f.persisted.slice(before).every(row=>row.type==='canonical_stroke_close')).toBe(true)
  expect(fold).toHaveBeenCalledTimes(66+66+65) //full original validation +unchanged allroot walk +close core.
  expect(db.$queryRawUnsafe.mock.calls.some(([sql])=>String(sql).includes('AND id=$3::text'))).toBe(false)
 }finally{leaveRoom('board','author','candidate-seat')}
},30000)
for(const fault of ['dense','unreachable','revoked-final-root-query','revoked-selected-reload','missing-selected-frame','changed-selected-source'] as const)it(`retains ${fault} checks before candidate closes or seat publication`,async()=>{
 const f=await indexedOrphanCandidateFixture(2,1),transport=new CanonicalRoomTransport({...policy,fullHistoryFormat:'mixed-indexed-v1'})
 try{
  const access=await prepareAuthorizedJoin('board','student','Student',undefined,'candidate-seat',()=>true);if(!access.ok)throw Error(access.error)
  const before=f.persisted.length,query=db.$queryRawUnsafe.getMockImplementation()!
  if(fault==='dense')f.persisted.splice(1,1)
  let selected=false,rootEnded=false,revoked=false
  db.$queryRawUnsafe.mockImplementation(async(sql:string,...parameters:unknown[])=>{
   const result=await query(sql,...parameters)
   if(fault==='unreachable'&&sql.includes('NOT EXISTS(SELECT 1 FROM reached'))return[{id:'unreachable'}]
   if(sql.includes('AND id=$3::text')){
    selected=true
    if(fault==='revoked-selected-reload'){revoked=true;db.roomBlock.findUnique.mockResolvedValue({id:'revoked'})}
    if(fault==='missing-selected-frame'||fault==='changed-selected-source'){
     const index=f.persisted.findIndex(row=>row.id===parameters[2]);if(index<0)throw Error('Actual candidate row missing before injection')
     if(fault==='missing-selected-frame')f.persisted.splice(index,1)
     else{const row=f.persisted[index],op=row.data as CanonicalStrokeOperation;f.persisted[index]={...row,data:{...op,frame:{...op.frame,brush:'brush:missing@1'}}}}
    }
   }
   // Empty final root-keyset query: original full validation is about to complete.
   if(fault==='revoked-final-root-query'&&sql.includes("data#>>'{frame,frameOrdinal}'='0'")&&Array.isArray(result)&&!result.length){rootEnded=true;revoked=true;db.roomBlock.findUnique.mockResolvedValue({id:'revoked'})}
   return result
  })
  await expect(transport.prepareIndexedJoinOrphans(access.preparation,()=>true)).rejects.toThrow()
  expect(f.persisted.length).toBe(fault==='dense'||fault==='missing-selected-frame'?before-1:before)
  expect(f.board.sockets.has('candidate-seat')).toBe(false)
  if(fault==='revoked-selected-reload')expect(selected&&revoked).toBe(true)
  if(fault==='missing-selected-frame'||fault==='changed-selected-source')expect(selected).toBe(true)
  if(fault==='revoked-final-root-query')expect(rootEnded&&revoked).toBe(true)
 }finally{leaveRoom('board','student','candidate-seat')}
})
