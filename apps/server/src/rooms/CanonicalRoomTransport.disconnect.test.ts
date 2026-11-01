import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_RASTER_PROFILE,isBrushLibrary,sourceAutoGeometry,buildCanonicalMaterial,type BrushDescriptor,type CanonicalStrokeBeginResult,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type CanonicalStrokeFrameEnvelope} from '@grafetto/shared'
// Existing retained data fixture only; no browser compiler/renderer enters the server graph.
const {default:stock}:{default:{rows:{index:number;descriptor:BrushDescriptor}[]}}=await import(new URL('../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native.ts',import.meta.url).href)
import {BrushStorage,empty,setBrushStorage} from '../brushLibrary/storage.js'
import {rooms,flushRoomWrites,type RoomRecord} from './roomRegistry.js'
import {joinRoom,leaveRoom,captureCurrentRoomSeat,assertCurrentRoomSeat} from './rooms.js'
import type {CanonicalStoredOperationRow} from './roomPersistence.js'
import {CanonicalRoomTransport} from './CanonicalRoomTransport.js'
const db=vi.hoisted(()=>({operation:{count:vi.fn(),findMany:vi.fn(),findUnique:vi.fn(),create:vi.fn(),deleteMany:vi.fn()},roomParticipant:{upsert:vi.fn()},room:{update:vi.fn()}}))
vi.mock('../db/prisma.js',()=>({prisma:db}))
const dirs:string[]=[]
const rows:CanonicalStoredOperationRow[]=[]
beforeEach(()=>{
 rows.length=0;db.roomParticipant.upsert.mockResolvedValue({});db.operation.count.mockResolvedValue(0)
 db.operation.findUnique.mockImplementation(async({where})=>rows.find(row=>row.id===where.id)??null)
 db.operation.create.mockImplementation(async({data})=>{rows.push(data)})
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(row=>{
  if(row.roomId!==where.roomId||row.seq<=where.seq.gt||row.seq>where.seq.lte)return false
  const op=row.data as import('@grafetto/shared').Operation,selector=where.OR?.[0]
  return !selector||op.type==='canonical_stroke'&&op.userId===selector.userId&&op.frame.strokeId===selector.data.equals
    ||op.type==='canonical_stroke_close'&&op.targetUserId===selector.userId&&op.strokeId===selector.data.equals
 }).slice(0,take))
})
afterEach(async()=>{for(const id of rooms.keys())await flushRoomWrites(id);leaveRoom('board','author','new');leaveRoom('board','author','old');rooms.clear();for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});vi.restoreAllMocks();vi.clearAllMocks()})
function resident():RoomRecord{
 const record:RoomRecord={room:{id:'board',name:'Board',ownerId:'author',paper:'coarse',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-29T00:00:00Z',rasterVersion:'straight-rgba8-v1'},lessonId:null,sockets:new Set(),boards:[],assignments:[],activeAssignmentId:null,spotlightBoardId:null,handsRaised:new Set(),assignmentStarting:false,passwordHash:undefined,operations:[],participants:new Map(),nextSeq:1,layerStateSeq:null,layerStateIds:null,coveredSeqByLayer:new Map(),palette:[],roomFrozen:false,frozenUserIds:new Set(),lockedLayerIds:new Set(),sharedLockedLayerIds:new Set(),aliveIds:new Set(['layer']),deletedIds:new Set(),operationsById:new Map(),structuralLog:[]}
 record.participants.set('author',{userId:'author',name:'A',role:'owner',color:'#000000',frozen:false,boardId:'board'});rooms.set('board',record);return record
}
function setup(descriptor=stock.rows[0].descriptor as unknown as BrushDescriptor){
 const dir=mkdtempSync(join(tmpdir(),'server-auto-v2-'));dirs.push(dir);const storage=new BrushStorage(dir)
 const library={schemaVersion:1,brushes:[{name:'Actual auto',source:'fixture.kpp',warnings:[],descriptor}],assets:[],skipped:[]}
 if(!isBrushLibrary(library))throw Error('Invalid real descriptor fixture')
 storage.install('author',library,new Map());setBrushStorage(storage,empty());const board=resident()
 const input={layerId:'layer',brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:'gesture',pigmentRgb8:[183,47,211] as [number,number,number],outerResourceOpacity:.73,alphaDarken:'creamy' as const}
 return{storage,library,board,input,descriptor}
}
function snapshot(result:CanonicalStrokeBeginResult):CanonicalStrokeSnapshotV2{if(!result.ok||!('materialVersion'in result.snapshot)||result.snapshot.materialVersion!==2)throw Error(JSON.stringify(result));return result.snapshot}

function packet(s:CanonicalStrokeSnapshotV2,ended=false,ordinal=0):CanonicalStrokeFrameEnvelope{
 const pin=s.material.primarySource
 if(pin.kind!=='defaultAuto')throw Error('Expected exact Basic2 source')
 const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:pin.source.diameter,ratio:pin.source.ratio,spikes:2,scale:pin.brushScale,angle:pin.brushAngle},{scale:1,ratio:1,rotation:0},0,0)
 const recipe={kind:'defaultAuto' as const,source:pin.source,coverageProfile:pin.coverageProfile,brushScale:pin.brushScale,brushAngle:pin.brushAngle,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:false}
 const materialPacked=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:1,y:2,opacity:.7,flow:.8}],fences:[{kind:'segmentBegin',at:0,group:ordinal},{kind:'primaryEnd',at:1,group:ordinal},{kind:'segmentEnd',at:1,group:ordinal},...(ended?[{kind:'gestureEnd' as const,at:1}]:[])]},s.material).packed
 const common={brush:s.brush,strokeId:s.strokeId,frameOrdinal:ordinal,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked}
 return s.rasterProfile===CANONICAL_STROKE_RASTER_PROFILE?{...common,version:1,rasterProfile:s.rasterProfile}:{...common,version:2,rasterProfile:s.rasterProfile}
}
const identity={roomId:'board',userId:'author'}
const nativePolicy={rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,alphaDarkenVariants:['creamy'] as const,autoSources:{defaultAuto:{coverageProfile:'neon64-f32-fma-v1' as const,storedScale:1 as const}}}

async function start(){
 const f=setup(),transport=new CanonicalRoomTransport(nativePolicy)
 expect(joinRoom('board','author','A','old').ok).toBe(true);await flushRoomWrites('board')
 const snapshotValue=snapshot(await transport.begin(identity,f.input,()=>true)),seat=captureCurrentRoomSeat('board','author','old')!
 const operation=(ordinal=0,end=false):CanonicalStrokeOperation=>({type:'canonical_stroke',id:'frame-'+ordinal,userId:'author',timestamp:1+ordinal,layerId:'layer',frame:packet(snapshotValue,end,ordinal)})
 return {...f,transport,s:snapshotValue,seat,operation}
}
it('uses an original seat and exact immutable session, closes only durable recorded ink despite live ahead, and rejects copied tickets',async()=>{
 const f=await start(),op=f.operation()
 expect((await f.transport.recorded(identity,op,()=>true)).result.ok).toBe(true)
 expect(f.transport.live(identity,{layerId:'layer',frame:op.frame}).result.ok).toBe(true)
 expect(f.transport.live(identity,{layerId:'layer',frame:packet(f.s,true,1)}).result.ok).toBe(true)
 const cleanup=f.transport.prepareDisconnectedClose(f.seat,()=>true)!
 await expect(({...cleanup}).finish()).rejects.toThrow()
 expect(()=>assertCurrentRoomSeat({...f.seat})).toThrow();expect(()=>assertCurrentRoomSeat({...f.seat,roomId:'other'})).toThrow()
 const closed=await cleanup.finish()
 expect(closed).toHaveLength(1);expect(closed[0]).toMatchObject({recordedNext:1,firstFrameOpId:op.id,lastFrameOpId:op.id,seq:2})
 expect(rows.map(row=>row.type)).toEqual(['canonical_stroke','canonical_stroke_close'])
 await expect(cleanup.finish()).rejects.toThrow()
})
it('includes a frame that durably committed while its ACK lifetime expired, without inventing a new frame',async()=>{
 const f=await start(),op=f.operation();let current=true,release!:()=>void
 db.operation.create.mockImplementationOnce(({data})=>new Promise<void>(resolve=>{release=()=>{rows.push(data);resolve()}}))
 const pending=f.transport.recorded(identity,op,()=>current)
 await vi.waitFor(()=>expect(f.board.operationsById.has(op.id)).toBe(true))
 current=false;const cleanup=f.transport.prepareDisconnectedClose(f.seat,()=>!current)!
 release();expect((await pending).result).toEqual({ok:false,reason:'not_joined'})
 expect((await cleanup.finish())[0]).toMatchObject({recordedNext:1,lastFrameOpId:op.id,seq:2});expect(rows).toHaveLength(2)
})
it('does not include a queued frame whose ID lookup had not admitted any mutation at disconnect',async()=>{
 const f=await start();let current=true,release!:(row:null)=>void
 db.operation.findUnique.mockImplementationOnce(()=>new Promise<null>(resolve=>{release=resolve}))
 const pending=f.transport.recorded(identity,f.operation(),()=>current)
 await vi.waitFor(()=>expect(db.operation.findUnique).toHaveBeenCalled())
 current=false;const cleanup=f.transport.prepareDisconnectedClose(f.seat,()=>!current)!
 release(null);expect((await pending).result.ok).toBe(false)
 expect(await cleanup.finish()).toEqual([]);expect(rows).toEqual([]);expect(f.board.nextSeq).toBe(1)
})
it.each([false,true])('does not fabricate a close for zero frames or a normal durable END (%s)',ended=>{
 return(async()=>{const f=await start();if(ended)expect((await f.transport.recorded(identity,f.operation(0,true),()=>true)).result.ok).toBe(true)
 const next=f.board.nextSeq,cleanup=f.transport.prepareDisconnectedClose(f.seat,()=>true)!
 expect(await cleanup.finish()).toEqual([]);expect(f.board.nextSeq).toBe(next)})()
})
it('repairs an already resident failed typed close with the SAME ID before considering the ended cursor',async()=>{
 const f=await start(),op=f.operation();await f.transport.recorded(identity,op,()=>true)
 const error=vi.spyOn(console,'error').mockImplementation(()=>{})
 try{
  db.operation.create.mockRejectedValueOnce(Error('close insert failed'))
  const request={operationId:'client-close',layerId:'layer',targetUserId:'author',strokeId:f.input.strokeId,disposition:'commitPartial' as const,expectedRecordedNext:1,expectedLastFrameOpId:op.id}
  expect((await f.transport.close(identity,request,()=>true)).result.ok).toBe(false)
  const next=f.board.nextSeq,closed=await f.transport.prepareDisconnectedClose(f.seat,()=>true)!.finish()
  expect(closed.map(op=>op.id)).toEqual(['client-close']);expect(f.board.nextSeq).toBe(next)
  expect(rows.filter(row=>row.type==='canonical_stroke_close').map(row=>row.id)).toEqual(['client-close'])
 }finally{error.mockRestore()}
})
it.each(['reconnect','room','storage','locked','deleted','closed']as const)('fails closed if %s changes during the actual prefix query and preserves a new seat',async change=>{
 const f=await start();await f.transport.recorded(identity,f.operation(),()=>true)
 const cleanup=f.transport.prepareDisconnectedClose(f.seat,()=>true)!,find=db.operation.findMany.getMockImplementation()!
 let release!:(rows:CanonicalStoredOperationRow[])=>void
 db.operation.findMany.mockImplementationOnce(()=>new Promise<CanonicalStoredOperationRow[]>(resolve=>{release=resolve}))
 const pending=cleanup.finish()
 await vi.waitFor(()=>expect(release).toBeDefined())
 if(change==='reconnect')expect(joinRoom('board','author','New','new').ok).toBe(true)
 if(change==='room')rooms.set('board',{...f.board})
 if(change==='storage'){const dir=mkdtempSync(join(tmpdir(),'disconnect-new-storage-'));dirs.push(dir);setBrushStorage(new BrushStorage(dir),empty())}
 if(change==='locked')f.board.sharedLockedLayerIds.add('layer')
 if(change==='deleted')f.board.deletedIds.add('layer')
 if(change==='closed')f.board.room.closedAt='2026-10-31T00:00:00Z'
 release([...rows]);await expect(pending).rejects.toThrow()
 expect(rows.filter(row=>row.type==='canonical_stroke_close')).toEqual([])
 if(change==='reconnect'){expect(leaveRoom('board','author','old')).toBe(false);expect(captureCurrentRoomSeat('board','author','new')).toBeDefined()}
 db.operation.findMany.mockImplementation(find)
})
it('does not seal a guessed lower prefix after a frame write failed',async()=>{
 const f=await start(),error=vi.spyOn(console,'error').mockImplementation(()=>{})
 try{db.operation.create.mockRejectedValueOnce(Error('frame insert failed'));expect((await f.transport.recorded(identity,f.operation(),()=>true)).result.ok).toBe(false)
 await expect(f.transport.prepareDisconnectedClose(f.seat,()=>true)!.finish()).rejects.toThrow();expect(rows).toEqual([]);expect(f.board.operations.filter(op=>op.type==='canonical_stroke_close')).toEqual([])
 }finally{error.mockRestore()}
})
it.each(['hole','tamper','query']as const)('retains an unresolved prefix instead of sealing after indexed %s failure',async failure=>{
 const f=await start();await f.transport.recorded(identity,f.operation(),()=>true)
 if(failure==='query')db.operation.findMany.mockRejectedValueOnce(Error('indexed read failed'))
 else if(failure==='hole')db.operation.findMany.mockResolvedValueOnce([])
 else db.operation.findMany.mockResolvedValueOnce([{...rows[0],userId:'other'}])
 await expect(f.transport.prepareDisconnectedClose(f.seat,()=>true)!.finish()).rejects.toThrow()
 expect(f.board.nextSeq).toBe(2);expect(rows.filter(row=>row.type==='canonical_stroke_close')).toEqual([])
})
it('finishes multiple original admitted gestures using each actual indexed prefix without inventing sessions',async()=>{
 const f=await start();await f.transport.recorded(identity,f.operation(),()=>true)
 const nextInput={...f.input,strokeId:'other-gesture'},s=snapshot(await f.transport.begin(identity,nextInput,()=>true))
 expect((await f.transport.recorded(identity,{...f.operation(),id:'other-frame',frame:packet(s)},()=>true)).result.ok).toBe(true)
 const closed=await f.transport.prepareDisconnectedClose(f.seat,()=>true)!.finish()
 expect(closed.map(op=>[op.strokeId,op.recordedNext,op.seq])).toEqual([['gesture',1,3],['other-gesture',1,4]])
 expect(new Set(closed.map(op=>op.id)).size).toBe(2)
})
it('cannot manufacture cleanup from an empty transport or copied/foreign seat',async()=>{
 const f=setup();joinRoom('board','author','A','old');await flushRoomWrites('board')
 const transport=new CanonicalRoomTransport(nativePolicy),seat=captureCurrentRoomSeat('board','author','old')!
 expect(transport.prepareDisconnectedClose(seat,()=>true)).toBeUndefined()
 expect(()=>transport.prepareDisconnectedClose({...seat},()=>true)).toThrow()
 expect(()=>transport.prepareDisconnectedClose({...seat,userId:'other'},()=>true)).toThrow()
 expect(rows).toEqual([]);expect(f.board.nextSeq).toBe(1)
})
