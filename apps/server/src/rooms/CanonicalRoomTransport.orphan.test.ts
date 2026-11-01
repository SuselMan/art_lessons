import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_RASTER_PROFILE,isBrushLibrary,sourceAutoGeometry,buildCanonicalMaterial,type BrushDescriptor,type CanonicalStrokeBeginResult,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type CanonicalStrokeFrameEnvelope} from '@grafetto/shared'
// Existing retained data fixture only; no browser compiler/renderer enters the server graph.
const {default:stock}:{default:{rows:{index:number;descriptor:BrushDescriptor}[]}}=await import(new URL('../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native.ts',import.meta.url).href)
import {BrushStorage,empty,setBrushStorage} from '../brushLibrary/storage.js'
import {rooms,flushRoomWrites,type RoomRecord} from './roomRegistry.js'
import {joinRoom,leaveRoom,captureEmptyBoardSeats} from './rooms.js'
import {prepareAuthorizedJoin} from './roomAccess.js'
import {recordOperation,adoptLoadedCanonicalWrites} from './operationLog.js'
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
afterEach(async()=>{for(const id of rooms.keys())await flushRoomWrites(id);for(const [user,socket] of [['author','new'],['author','old'],['peer','peer-socket']])leaveRoom('board',user,socket);rooms.clear();for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});vi.restoreAllMocks();vi.clearAllMocks()})
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


// Hydrate a new resident object and a fresh transport from actual persisted
// rows, retaining the existing brush storage but NO admitted writer Session.
async function cold(ended=false){
 const f=setup(),writer=new CanonicalRoomTransport(nativePolicy),s=snapshot(await writer.begin(identity,f.input,()=>true))
 const op:CanonicalStrokeOperation={type:'canonical_stroke',id:'frame-0',userId:'author',timestamp:1,layerId:'layer',frame:packet(s,ended)}
 expect((await writer.recorded(identity,op,()=>true)).result.ok).toBe(true)
 await flushRoomWrites('board')
 const loaded:RoomRecord={...f.board,operations:structuredClone(f.board.operations),operationsById:new Map(),participants:new Map(),sockets:new Set()}
 for(const operation of loaded.operations)loaded.operationsById.set(operation.id,operation)
 rooms.set('board',loaded);adoptLoadedCanonicalWrites(loaded,rows.map(row=>({...row,data:loaded.operationsById.get(row.id)!})))
 const transport=new CanonicalRoomTransport({...nativePolicy,fullHistoryFormat:'mixed-v2'})
 return {...f,board:loaded,transport,s}
}
async function preparation(current=()=>true){
 const result=await prepareAuthorizedJoin('board','author','Owner',undefined,'new',current)
 if(!result.ok)throw Error('Expected original authorized pre-seat join: '+result.error)
 return result.preparation
}
async function full(f:Awaited<ReturnType<typeof cold>>,p:Awaited<ReturnType<typeof preparation>>,current=()=>true){
 const read=await f.transport.prepareJoinReadDelivery(p,current)
 const receipt=await read.prepareFullHistory({throughSeq:f.board.nextSeq-1,floor:0})
 return {read,receipt,fields:read.finish(receipt.operations,receipt.canonicalRows,receipt)}
}
it('durably seals an indexed orphan before first seat commit, with a fresh transport and no fabricated END or Session',async()=>{
 const f=await cold(),p=await preparation(),first=rows[0].data
 expect(f.board.sockets.size).toBe(0);expect(f.board.participants.size).toBe(0)
 const result=await full(f,p)
 expect(rows.map(row=>row.type)).toEqual(['canonical_stroke','canonical_stroke_close'])
 expect(rows[0].data).toBe(first)
 expect(rows[1].data).toMatchObject({type:'canonical_stroke_close',seq:2,targetUserId:'author',strokeId:'gesture',recordedNext:1,firstFrameOpId:'frame-0',lastFrameOpId:'frame-0',disposition:'commitPartial'})
 expect(result.fields.canonicalHistoryBase).toMatchObject({kind:'full-room-prefix-v2',throughSeq:2,operationCount:2})
 expect(f.board.sockets.size).toBe(0)
 expect(p.commit().ok).toBe(true);expect(f.board.sockets.has('new')).toBe(true)
})
it('does not replace a normal durable END with a redundant close',async()=>{
 const f=await cold(true),p=await preparation()
 await full(f,p);expect(rows.map(row=>row.type)).toEqual(['canonical_stroke']);expect(f.board.nextSeq).toBe(2)
})
it('does not seal a live author seat even if public presence mirrors are empty',async()=>{
 const f=await cold();expect(joinRoom('board','author','A','old').ok).toBe(true)
 // Private currentSocketForParticipant/boardOfSocket still own the seat.
 f.board.sockets.clear();f.board.participants.clear()
 const p=await preparation();await full(f,p)
 expect(rows.map(row=>row.type)).toEqual(['canonical_stroke'])
})
it('rejects a copied authorized join instead of minting orphan authority from readable fields',async()=>{
 const f=await cold(),p=await preparation()
 expect(()=>f.transport.prepareJoinReadDelivery({...p},()=>true)).toThrow()
 expect(rows).toHaveLength(1)
})
it('aborts if a new real board seat appears during indexed prefix verification',async()=>{
 const f=await cold(),p=await preparation(),query=db.operation.findMany.getMockImplementation()!
 let release!:()=>void,entered=false
 db.operation.findMany.mockImplementationOnce(async args=>{entered=true;await new Promise<void>(resolve=>{release=resolve});return query(args)})
 const pending=full(f,p),rejected=expect(pending).rejects.toThrow()
 await vi.waitFor(()=>expect(entered).toBe(true))
 expect(joinRoom('board','peer','Peer','peer-socket').ok).toBe(true);release();await rejected
 expect(rows).toHaveLength(1)
})
it('aborts if the room cut advances while the orphan prefix is being verified',async()=>{
 const f=await cold(),p=await preparation(),query=db.operation.findMany.getMockImplementation()!
 let release!:()=>void,entered=false
 db.operation.findMany.mockImplementationOnce(async args=>{entered=true;await new Promise<void>(resolve=>{release=resolve});return query(args)})
 const pending=full(f,p),rejected=expect(pending).rejects.toThrow()
 await vi.waitFor(()=>expect(entered).toBe(true));f.board.nextSeq++;release();await rejected
 expect(rows).toHaveLength(1)
})
it('rejects inconsistent indexed native frame bytes without closing an unverifiable orphan',async()=>{
 const f=await cold(),p=await preparation();rows[0]={...rows[0],userId:'forged-index'}
 await expect(full(f,p)).rejects.toThrow();expect(rows).toHaveLength(1)
})
it('reuses a durably closed indexed prefix on a second pre-seat read without appending another close',async()=>{
 const f=await cold(),p=await preparation()
 await full(f,p)
 expect(rows.filter(row=>row.type==='canonical_stroke_close')).toHaveLength(1)
 const close=rows.find(row=>row.type==='canonical_stroke_close')!
 const again=new CanonicalRoomTransport({...nativePolicy,fullHistoryFormat:'mixed-v2'}),second={...f,transport:again}
 await full(second,await preparation())
 expect(rows.filter(row=>row.type==='canonical_stroke_close')).toEqual([close]);expect(f.board.nextSeq).toBe(3)
})
it.each(['record','storage','epoch','cancelled'] as const)('revokes orphan authority on %s change during indexed verification',async change=>{
 const f=await cold(),p=await preparation(),query=db.operation.findMany.getMockImplementation()!
 let current=true,release!:()=>void,entered=false
 db.operation.findMany.mockImplementationOnce(async args=>{entered=true;await new Promise<void>(resolve=>{release=resolve});return query(args)})
 const pending=full(f,p,()=>current),rejected=expect(pending).rejects.toThrow()
 await vi.waitFor(()=>expect(entered).toBe(true))
 if(change==='record')rooms.set('board',{...f.board})
 else if(change==='storage')setBrushStorage(new BrushStorage(f.storage.root),empty())
 else if(change==='epoch')f.transport['binder']!['epochs'].delete(f.board)
 else current=false
 release();await rejected;expect(rows).toHaveLength(1)
})
it('repairs a resident failed close using its SAME operation ID before accepting the next full read',async()=>{
 const f=await cold(),p=await preparation(),create=db.operation.create.getMockImplementation()!,failure=Error('orphan close disk failed'),error=vi.spyOn(console,'error').mockImplementation(()=>{})
 db.operation.create.mockImplementationOnce(()=>{throw failure})
 await expect(full(f,p)).rejects.toThrow()
 const close=f.board.operations.find(op=>op.type==='canonical_stroke_close')!
 expect(close).toBeDefined();expect(rows).toHaveLength(1)
 db.operation.create.mockImplementation(create)
 await full(f,await preparation())
 expect(rows.filter(row=>row.type==='canonical_stroke_close').map(row=>row.id)).toEqual([close.id]);expect(f.board.nextSeq).toBe(3)
 expect(error).toHaveBeenCalled()
})
it('lets only one concurrent empty-board recovery append at the same cut',async()=>{
 const f=await cold(),p=await preparation(),other=await preparation()
 const results=await Promise.allSettled([full(f,p),full(f,other)])
 expect(results.some(result=>result.status==='fulfilled')).toBe(true)
 expect(rows.filter(row=>row.type==='canonical_stroke_close')).toHaveLength(1);expect(f.board.nextSeq).toBe(3)
})

it('keeps the empty-seat proof lexical and revokes it when an actual private seat is created',async()=>{
 const f=await cold(),proof=captureEmptyBoardSeats('board')!
 expect(proof.assertCurrent()).toBe(f.board);expect(()=>({...proof}).assertCurrent()).toThrow()
 expect(joinRoom('board','author','A','old').ok).toBe(true)
 f.board.sockets.clear();f.board.participants.clear()
 expect(captureEmptyBoardSeats('board')).toBeUndefined();expect(()=>proof.assertCurrent()).toThrow()
})

it('drains the existing durable write queue before deriving the orphan cut and close bounds',async()=>{
 const f=await cold(),p=await preparation()
 let release!:()=>void,settled=false
 db.operation.create.mockImplementationOnce(({data})=>new Promise<void>(resolve=>{release=()=>{rows.push(data);resolve()}}))
 recordOperation('board',{type:'canonical_stroke',id:'frame-1',userId:'author',timestamp:2,layerId:'layer',frame:packet(f.s,false,1)})
 await vi.waitFor(()=>expect(release).toBeTypeOf('function'))
 const pending=full(f,p).finally(()=>{settled=true})
 await Promise.resolve();await Promise.resolve()
 expect(settled).toBe(false);expect(rows).toHaveLength(1);expect(f.board.nextSeq).toBe(3)
 release();await pending
 expect(rows.map(row=>row.type)).toEqual(['canonical_stroke','canonical_stroke','canonical_stroke_close'])
 expect(rows[2].data).toMatchObject({seq:3,recordedNext:2,firstFrameOpId:'frame-0',lastFrameOpId:'frame-1'})
})
