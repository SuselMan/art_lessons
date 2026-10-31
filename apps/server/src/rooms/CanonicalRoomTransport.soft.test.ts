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
const history=vi.hoisted(()=>({rows:[] as unknown[],canonicalRows:[] as unknown[]}))
vi.mock('./snapshotStore.js',async importOriginal=>({...await importOriginal<typeof import('./snapshotStore.js')>(),getCanonicalGesturePrefixWithRows:vi.fn(async()=>({operations:history.rows,canonicalRows:history.canonicalRows})),getOperationsBefore:vi.fn(async()=>history.rows),getOperationsBeforeWithCanonicalRows:vi.fn(async()=>({operations:history.rows,canonicalRows:history.canonicalRows}))}))
const readAccess=vi.hoisted(()=>({allowed:true,gate:undefined as Promise<void>|undefined,calls:[] as [string,string][]}))
vi.mock('./boardContentAccess.js',()=>({mayReadBoardContent:vi.fn(async(roomId:string,userId:string)=>{readAccess.calls.push([roomId,userId]);await readAccess.gate;return readAccess.allowed})}))
const dirs:string[]=[]
beforeEach(()=>{readAccess.allowed=true;readAccess.gate=undefined;readAccess.calls=[];db.operation.count.mockResolvedValue(0);db.operation.findUnique.mockResolvedValue(null);db.operation.create.mockResolvedValue({});history.rows=[];history.canonicalRows=[]})
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
 const adapter=new SourceStrokeMaterialAdapter(compiled.program,material,state),encoder=new SourceCanonicalFrameEncoder({rasterProfile:s.rasterProfile,brush:s.brush,strokeId:s.strokeId,pigmentRgb8:s.pigmentRgb8,composition:s.composition,material})
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
