import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_RASTER_PROFILE,isBrushLibrary,sourcePngMaskExtent,buildCanonicalMaterial,type BrushDescriptor,type CanonicalStrokeBeginResult,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type CanonicalStrokeFrameEnvelope} from '@grafetto/shared'
import {inflateSync} from 'node:zlib'
import {BrushStorage,empty,setBrushStorage} from '../brushLibrary/storage.js'
import {rooms,flushRoomWrites,type RoomRecord} from './roomRegistry.js'
import {CanonicalBrushCapabilityResolver} from './CanonicalBrushCapabilityResolver.js'
import {CanonicalRoomTransport} from './CanonicalRoomTransport.js'
const db=vi.hoisted(()=>({operation:{count:vi.fn(),findMany:vi.fn(),findUnique:vi.fn(),create:vi.fn()},room:{update:vi.fn()}}))
vi.mock('../db/prisma.js',()=>({prisma:db}))
vi.mock('./snapshotStore.js',async original=>({...await original<typeof import('./snapshotStore.js')>(),getCanonicalGesturePrefixWithRows:vi.fn(async()=>({operations:[],canonicalRows:[]}))}))
const dirs:string[]=[]
beforeEach(()=>{db.operation.count.mockResolvedValue(0);db.operation.findUnique.mockResolvedValue(null);db.operation.create.mockResolvedValue({})})
afterEach(async()=>{for(const id of rooms.keys())await flushRoomWrites(id);rooms.clear();for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});vi.restoreAllMocks();vi.clearAllMocks()})
function resident():RoomRecord{
 const record:RoomRecord={room:{id:'board',name:'Board',ownerId:'author',paper:'coarse',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-29T00:00:00Z',rasterVersion:'straight-rgba8-v1'},lessonId:null,sockets:new Set(),boards:[],assignments:[],activeAssignmentId:null,spotlightBoardId:null,handsRaised:new Set(),assignmentStarting:false,passwordHash:undefined,operations:[],participants:new Map(),nextSeq:1,layerStateSeq:null,layerStateIds:null,coveredSeqByLayer:new Map(),palette:[],roomFrozen:false,frozenUserIds:new Set(),lockedLayerIds:new Set(),sharedLockedLayerIds:new Set(),aliveIds:new Set(['layer']),deletedIds:new Set(),operationsById:new Map(),structuralLog:[]}
 record.participants.set('author',{userId:'author',name:'A',role:'owner',color:'#000000',frozen:false,boardId:'board'});rooms.set('board',record);return record
}
const fixture=JSON.parse(readFileSync(new URL('../../../web/src/engine/src/presets/fixtures/sourcePngWholePath/guiStroke.native.json',import.meta.url),'utf8'))
function setup(descriptor:BrushDescriptor=fixture.descriptor){
 const dir=mkdtempSync(join(tmpdir(),'server-auto-v2-'));dirs.push(dir);const storage=new BrushStorage(dir)
 const library={schemaVersion:1,brushes:[{name:'Actual auto',source:'fixture.kpp',warnings:[],descriptor}],assets:[{id:fixture.asset.id,size:fixture.asset.size,file:fixture.asset.id.slice(6)+'.bin'}],skipped:[]}
 if(!isBrushLibrary(library))throw Error('Invalid real descriptor fixture')
 storage.install('author',library,new Map([[fixture.asset.id.slice(6),inflateSync(Buffer.from(fixture.asset.deflateBase64,'base64'),{maxOutputLength:65536})]]));setBrushStorage(storage,empty());const board=resident()
 const input={layerId:'layer',brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:'gesture',pigmentRgb8:[183,47,211] as [number,number,number],outerResourceOpacity:.73,alphaDarken:'creamy' as const}
 return{storage,library,board,input,descriptor,dir}
}
function snapshot(result:CanonicalStrokeBeginResult):CanonicalStrokeSnapshotV2{if(!result.ok||!('materialVersion'in result.snapshot))throw Error(JSON.stringify(result));return result.snapshot}


const identity={roomId:'board',userId:'author'}
const policy={rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,alphaDarkenVariants:['creamy'] as const,primaryImageSource:'single-inverse-gray-v2' as const}
it('binds actual ROOM Basic6 original150/crop/scale.05 to V2, durably records and cold-reads the same indexed source without granting append',async()=>{
 const f=setup(),transport=new CanonicalRoomTransport(policy)
 const s=snapshot(await transport.begin(identity,f.input,()=>true)),p=s.material.primarySource
 expect(p).toMatchObject({kind:'image',asset:fixture.asset.id,brushScale:.05})
 expect(s.assets).toEqual([{id:fixture.asset.id,size:256,x:53,y:53,width:150,height:150}])
 const shape=sourcePngMaskExtent({width:150,height:150,scale:.05,angle:0},{scale:.5,ratio:1,rotation:.3},0,0)
 const recipe={kind:'image' as const,asset:fixture.asset.id,brushScale:.05,brushAngle:0,scale:.5,ratio:1,rotation:.3,subX:0,subY:0,width:shape[0],height:shape[1],mirrorH:false,mirrorV:false}
 const materialPacked=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:1,y:2,opacity:.7,flow:1}],fences:[{at:0,kind:'segmentBegin',group:0},{at:1,kind:'primaryEnd',group:0},{at:1,kind:'segmentEnd',group:0},{at:1,kind:'gestureEnd'}]},s.material).packed
 const frame:CanonicalStrokeFrameEnvelope={version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked}
 const operation:CanonicalStrokeOperation={id:'image-op',userId:'author',timestamp:1,type:'canonical_stroke',layerId:'layer',frame}
 const saved=await transport.recorded(identity,operation,()=>true)
 expect(saved.result).toMatchObject({ok:true,seq:1});expect(saved.canonicalCapabilities).toBeDefined()
 const row=db.operation.create.mock.calls[0][0].data,accepted=saved.accepted!
 const cold=new CanonicalBrushCapabilityResolver({...policy,storage:f.storage,operator:()=>empty(),maxGestures:8})
 const read=cold.readRecordedCapability({roomId:'board',boardEpoch:s.boardEpoch,operation:accepted,row})
 expect(read.material).toEqual(s.material);expect(cold.resolve(identity,{strokeId:s.strokeId,brush:s.brush,layerId:'layer'})).toBeUndefined()
 expect(cold.readRecordedPrefix({roomId:'board',boardEpoch:s.boardEpoch,anchor:accepted,row,operations:[accepted],rows:[row],purpose:'read'}).ended).toBe(true)
})
it('keeps default image BEGIN in its historical V1 lane without V2 delivery',async()=>{
 const f=setup(),transport=new CanonicalRoomTransport({rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,alphaDarkenVariants:['creamy']})
 const result=await transport.begin(identity,f.input,()=>true)
 expect(result.ok).toBe(true);if(result.ok)expect('materialVersion'in result.snapshot).toBe(false)
 const enabled=new CanonicalRoomTransport(policy),s=snapshot(await enabled.begin(identity,f.input,()=>true))
 const materialPacked=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{at:0,kind:'gestureEnd'}]},s.material).packed
 const operation:CanonicalStrokeOperation={id:'new-v2',userId:'author',timestamp:0,type:'canonical_stroke',layerId:'layer',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked}}
 expect((await transport.recorded(identity,operation,()=>true)).result.ok).toBe(false)
 expect(f.board.operations).toEqual([]);expect(db.operation.create).not.toHaveBeenCalled()
})

it.each(['corrupt','missing'] as const)('refuses %s original CAS before V2 BEGIN publishes a grant',async kind=>{
 const f=setup(),path=join(f.dir,'assets',fixture.asset.id.slice(6)+'.bin')
 if(kind==='missing')rmSync(path);else writeFileSync(path,Buffer.alloc(65536))
 const transport=new CanonicalRoomTransport(policy)
 expect((await transport.begin(identity,f.input,()=>true)).ok).toBe(false)
 expect(f.board.operations).toEqual([]);expect(db.operation.create).not.toHaveBeenCalled()
})
it('cannot cold-read V2 image via policy-off or a tampered indexed row, and does not pin personal-only sources',async()=>{
 const f=setup(),transport=new CanonicalRoomTransport(policy),s=snapshot(await transport.begin(identity,f.input,()=>true))
 const materialPacked=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{at:0,kind:'gestureEnd'}]},s.material).packed
 const operation:CanonicalStrokeOperation={id:'end',seq:1,userId:'author',timestamp:0,type:'canonical_stroke',layerId:'layer',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked}}
 const row={id:operation.id,seq:1,roomId:'board',userId:'author',type:operation.type,layerId:'layer',tool:null,data:operation}
 const cold=new CanonicalBrushCapabilityResolver({...policy,storage:f.storage,operator:()=>empty(),maxGestures:8})
 expect(()=>cold.readRecordedCapability({roomId:'board',boardEpoch:s.boardEpoch,operation,row:{...row,userId:'reader'}})).toThrow()
 const closed=new CanonicalBrushCapabilityResolver({rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,alphaDarkenVariants:['creamy'],storage:f.storage,operator:()=>empty(),maxGestures:8})
 expect(()=>closed.readRecordedCapability({roomId:'board',boardEpoch:s.boardEpoch,operation,row})).toThrow()
 const personal=setup(),before=personal.storage.library('rooms','board')
 const unpinned=new CanonicalBrushCapabilityResolver({...policy,storage:personal.storage,operator:()=>personal.library,maxGestures:8})
 expect(()=>unpinned.readRecordedCapability({roomId:'board',boardEpoch:s.boardEpoch,operation,row})).toThrow()
 expect(personal.storage.library('rooms','board')).toEqual(before)
})
