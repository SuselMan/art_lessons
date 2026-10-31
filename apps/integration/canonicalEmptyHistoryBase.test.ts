import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_RASTER_PROFILE,isBrushLibrary,isSourceStampData,type SourceStampCurveData,sourceStampRequiredCurves,SOURCE_STAMP_MAPPED_COMPILER_PROFILE,type BrushDescriptor,type CanonicalStrokeBeginResult,type CanonicalStrokeSnapshotV2,type CanonicalStrokeFrameEnvelope,type ServerToClientEvents} from '@grafetto/shared'
import soft from '../../packages/shared/src/fixtures/sourceSoftAutoData/stock.native'
import stock from '../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import {SourceStrokeAuthor} from '../web/src/engine/src/presets/sourceStrokeAuthor'
import {sourceStrokeAuthorDescriptor} from '../web/src/engine/src/presets/sourceStrokeAuthorDescriptor'
import {SourceStrokeMaterialAdapter} from '../web/src/engine/src/presets/sourceStrokeMaterialAdapter'
import {SourceCanonicalFrameEncoder} from '../web/src/engine/src/presets/sourceCanonicalFrameEncoder'
import {prepareCanonicalRoomState} from '../web/src/pages/Room/net/canonicalRoomState'
import {BrushStorage,empty,setBrushStorage} from '../server/src/brushLibrary/storage'
import {rooms,flushRoomWrites,type RoomRecord} from '../server/src/rooms/roomRegistry'
import {CanonicalRoomTransport} from '../server/src/rooms/CanonicalRoomTransport'
vi.mock('@sentry/react',()=>({captureException:vi.fn()}))
const db=vi.hoisted(()=>({operation:{count:vi.fn(),findMany:vi.fn(),findUnique:vi.fn(),create:vi.fn()},room:{update:vi.fn()},roomLayerState:{findUnique:vi.fn()},roomLayerSnapshot:{findMany:vi.fn()}}))
vi.mock('../server/src/db/prisma.js',()=>({prisma:db}))
vi.mock('../server/src/rooms/boardContentAccess.js',()=>({mayReadBoardContent:vi.fn(async()=>true)}))
const dirs:string[]=[]
beforeEach(()=>{db.operation.findMany.mockResolvedValue([]);db.operation.count.mockResolvedValue(0);db.operation.findUnique.mockResolvedValue(null);db.operation.create.mockResolvedValue({})})
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


function softDescriptor():BrushDescriptor{
 const raw:unknown=structuredClone(soft.rows.find(r=>r.index===72)!.sourceStamp)
 if(!isSourceStampData(raw)||raw.source?.kind!=='softAuto')throw Error('Invalid fixture source')
 const data=raw,source=data.source
 if(source?.kind!=='softAuto')throw Error('Invalid soft fixture')
 const entry=(source:SourceStampCurveData)=>({source,coefficients:Array.from({length:source.points.length-1},()=>[0,0,0,0])})
 return {...stock.rows[0].descriptor,sourceStamp:{...data,unsupported:[],role:'primary',source:{...source,ratio:1,spikes:2,antialias:false,randomness:0,density:1},
  brush:{...data.brush,scale:1},flags:{...data.flags,materialFixed1:true,textureEnabled:false},
  compiled:{version:2,reader:data.reader,profile:SOURCE_STAMP_MAPPED_COMPILER_PROFILE,buildId:'b'.repeat(64),curves:sourceStampRequiredCurves(data.options).map(entry),radialCurve:entry(source.softnessCurve)}}} as unknown as BrushDescriptor
}
const selected={...policy,autoSources:{softAuto:{coverageProfile:'neon64-f32-fma-v1' as const,storedScale:1 as const}}}

function wireState(board:RoomRecord,fields:ReturnType<Awaited<ReturnType<CanonicalRoomTransport['prepareReadDelivery']>>['finish']>,operations:readonly unknown[]){
 return JSON.parse(JSON.stringify({room:board.room,latestSnapshotSeq:null,tailOperations:operations,participants:[],palette:[],frozen:false,lesson:{id:'board',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},...fields})) as Parameters<ServerToClientEvents['room_state']>[0]
}
it.each([false,true])('carries actual durable complete history to the original client owner (empty=%s)',async emptyHistory=>{
 const f=setup(softDescriptor()),transport=new CanonicalRoomTransport(selected)
 if(!emptyHistory){
  const bound=snapshot(await transport.begin(identity,f.input,()=>true))
  for(const [n,frame] of frames(f.descriptor,bound).slice(0,2).entries())expect((await transport.recorded(identity,{type:'canonical_stroke',id:`actual-${n}`,userId:'author',timestamp:n,layerId:'layer',frame},()=>true)).result.ok).toBe(true)
 }
 await flushRoomWrites('board')
 const rows=db.operation.create.mock.calls.map(([q])=>q.data),cut=f.board.nextSeq-1
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>r.seq>where.seq.gt&&r.seq<=where.seq.lte).slice(0,take))
 const serverRead=await transport.prepareReadDelivery({roomId:'board',userId:'reader'},()=>true)
 const receipt=await serverRead.prepareFullHistory({throughSeq:cut,floor:0})
 expect(db.operation.findMany).toHaveBeenLastCalledWith(expect.objectContaining({where:{roomId:'board',seq:{gt:cut,lte:cut}}}))
 const fields=serverRead.finish(receipt.operations,receipt.canonicalRows,receipt)
 let current=true
 const prepared=prepareCanonicalRoomState(wireState(f.board,fields,receipt.operations),{expectedBoardId:'board',isCurrent:()=>current}),read=prepared.canonicalRead
 expect(read.assertEmptyHistoryBase(prepared.tailOperations)).toEqual(fields.canonicalHistoryBase)
 expect(()=>read.assertEmptyHistoryBase([...prepared.tailOperations])).toThrow()
 expect(()=>read.assertEmptyHistoryBase.call({...read},prepared.tailOperations)).toThrow()
 if(!emptyHistory){
  const partial=wireState(f.board,fields,receipt.operations.slice(1))
  expect(()=>prepareCanonicalRoomState(partial,{expectedBoardId:'board',isCurrent:()=>true})).toThrow()
 }
 current=false;expect(()=>read.assertEmptyHistoryBase(prepared.tailOperations)).toThrow()
})
