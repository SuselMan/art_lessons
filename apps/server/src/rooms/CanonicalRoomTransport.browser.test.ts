import {canonicalOperationSqlMockRow} from './testing/canonicalOperationSqlMock.js'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as browser,CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE as coverage,isBrushLibrary,sourceAutoGeometry,buildCanonicalMaterial,decodeCanonicalStrokeFrame,type BrushDescriptor,type CanonicalStrokeBeginResult,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type CanonicalStrokeFrameEnvelope} from '@grafetto/shared'
// Existing retained data fixture only; no browser compiler/renderer enters the server graph.
const {default:stock}:{default:{rows:{index:number;descriptor:BrushDescriptor}[]}}=await import(new URL('../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native.ts',import.meta.url).href)
import {BrushStorage,empty,setBrushStorage} from '../brushLibrary/storage.js'
import {rooms,flushRoomWrites,type RoomRecord} from './roomRegistry.js'
import {CanonicalRoomTransport} from './CanonicalRoomTransport.js'
const db=vi.hoisted(()=>({$executeRaw:vi.fn(),operation:{count:vi.fn(),findMany:vi.fn(),findUnique:vi.fn(),create:vi.fn()},room:{update:vi.fn()}}))
vi.mock('../db/prisma.js',()=>({prisma:db}))
vi.mock('./snapshotStore.js',async original=>({...await original<typeof import('./snapshotStore.js')>(),getCanonicalGesturePrefixWithRows:vi.fn(async()=>({operations:[],canonicalRows:[]}))}))
const dirs:string[]=[]
beforeEach(()=>{db.$executeRaw.mockImplementation(async(sql:TemplateStringsArray,...values:unknown[])=>{await db.operation.create({data:canonicalOperationSqlMockRow(sql,values)});return 1});db.operation.count.mockResolvedValue(0);db.operation.findUnique.mockResolvedValue(null);db.operation.create.mockResolvedValue({})})
afterEach(async()=>{for(const id of rooms.keys())await flushRoomWrites(id);rooms.clear();for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});vi.restoreAllMocks();vi.clearAllMocks()})
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

function packet(s:CanonicalStrokeSnapshotV2):CanonicalStrokeFrameEnvelope{
 const pin=s.material.primarySource
 if(pin.kind!=='defaultAuto')throw Error('Expected exact Basic2 source')
 const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:pin.source.diameter,ratio:pin.source.ratio,spikes:2,scale:pin.brushScale,angle:pin.brushAngle},{scale:1,ratio:1,rotation:0},0,0)
 const recipe={kind:'defaultAuto' as const,source:pin.source,coverageProfile:pin.coverageProfile,brushScale:pin.brushScale,brushAngle:pin.brushAngle,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:false}
 const materialPacked=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:1,y:2,opacity:.7,flow:.8}],fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:1,group:0},{kind:'segmentEnd',at:1,group:0},{kind:'gestureEnd',at:1}]},s.material).packed
 const common={brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked}
 return s.rasterProfile===CANONICAL_STROKE_RASTER_PROFILE?{...common,version:1,rasterProfile:s.rasterProfile}:{...common,version:2,rasterProfile:s.rasterProfile}
}
const identity={roomId:'board',userId:'author'}
const browserPolicy={authorRasterProfile:browser,allowedRecordedRasterProfiles:[browser],alphaDarkenVariants:['creamy'] as const,autoSources:{defaultAuto:{coverageProfile:coverage,storedScale:1 as const}}}
const nativePolicy={rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,alphaDarkenVariants:['creamy'] as const,autoSources:{defaultAuto:{coverageProfile:'neon64-f32-fma-v1' as const,storedScale:1 as const}}}
it('explicitly binds exact native Basic2 descriptor to browser coverage byte3 and waits for the same durable recorded write',async()=>{
 const f=setup(),transport=new CanonicalRoomTransport(browserPolicy)
 const s=snapshot(await transport.begin(identity,f.input,()=>true))
 expect(s.rasterProfile).toBe(browser);if(s.material.primarySource.kind==='image')throw Error('Expected auto source');expect(s.material.primarySource.coverageProfile).toBe(coverage)
 const frame=packet(s);expect(frame.version).toBe(2);expect(Buffer.from(frame.materialPacked.slice(2),'base64')[25]).toBe(3)
 expect(decodeCanonicalStrokeFrame(frame,{...s,frameOrdinal:0}).frame.draws).toHaveLength(1)
 let resolve!:(row:unknown)=>void
 db.operation.create.mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
 const op:CanonicalStrokeOperation={type:'canonical_stroke',id:'browser-op',userId:'author',timestamp:1,layerId:'layer',frame}
 let settled=false
 const pending=transport.recorded(identity,op,()=>true).then(result=>{settled=true;return result})
 await vi.waitFor(()=>expect(db.operation.create).toHaveBeenCalledOnce());expect(settled).toBe(false)
 expect(f.board.operationsById.get(op.id)?.seq).toBe(1)
 resolve({});const saved=await pending
 expect(saved.result).toMatchObject({ok:true,seq:1});expect(saved.accepted?.frame).toEqual(frame)
 expect(db.operation.create.mock.calls[0][0].data).toMatchObject({id:op.id,roomId:'board',userId:'author',seq:1,type:'canonical_stroke',data:{frame}})
 expect((await transport.recorded(identity,op,()=>true)).result).toMatchObject({ok:true,duplicate:true,seq:1});expect(db.operation.create).toHaveBeenCalledOnce()
})
it('keeps default auto OFF and the historical receiver closed to the browser frame',async()=>{
 const f=setup(),pin=vi.spyOn(f.storage,'pin')
 expect(await new CanonicalRoomTransport().begin(identity,f.input,()=>true)).toEqual({ok:false,reason:'invalid_operation'});expect(pin).not.toHaveBeenCalled()
 const browserTransport=new CanonicalRoomTransport(browserPolicy),s=snapshot(await browserTransport.begin(identity,f.input,()=>true)),frame=packet(s)
 const old=new CanonicalRoomTransport(nativePolicy),native=snapshot(await old.begin(identity,f.input,()=>true))
 expect(native.rasterProfile).toBe(CANONICAL_STROKE_RASTER_PROFILE);expect(Buffer.from(packet(native).materialPacked.slice(2),'base64')[25]).toBe(2)
 const op:CanonicalStrokeOperation={type:'canonical_stroke',id:'cross-profile',userId:'author',timestamp:1,layerId:'layer',frame}
 expect((await old.recorded(identity,op,()=>true)).result.ok).toBe(false);expect(db.operation.create).not.toHaveBeenCalled();expect(f.board.nextSeq).toBe(1)
 expect(()=>decodeCanonicalStrokeFrame(frame,{...native,frameOrdinal:0})).toThrow()
 expect(()=>decodeCanonicalStrokeFrame(packet(native),{...s,frameOrdinal:0})).toThrow()
 const mislabeled:CanonicalStrokeFrameEnvelope={...packet(native),version:2,rasterProfile:browser}
 expect((await browserTransport.recorded(identity,{...op,id:'native-bytes-browser-label',frame:mislabeled},()=>true)).result.ok).toBe(false)
 expect(db.operation.create).not.toHaveBeenCalled();expect(f.board.nextSeq).toBe(1)
})
it('rejects mismatched native/browser coverage policies and author allowsets before storage writes',()=>{
 const f=setup(),pin=vi.spyOn(f.storage,'pin')
 expect(()=>new CanonicalRoomTransport({...browserPolicy,autoSources:nativePolicy.autoSources})).toThrow()
 expect(()=>new CanonicalRoomTransport({...nativePolicy,autoSources:browserPolicy.autoSources})).toThrow()
 expect(()=>new CanonicalRoomTransport({...browserPolicy,allowedRecordedRasterProfiles:[CANONICAL_STROKE_RASTER_PROFILE]})).toThrow()
 expect(pin).not.toHaveBeenCalled();expect(db.operation.create).not.toHaveBeenCalled()
})
