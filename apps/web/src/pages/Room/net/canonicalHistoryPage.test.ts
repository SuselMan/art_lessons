import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {sourceAutoGeometry,canonicalSoftAutoSourcePin,buildCanonicalMaterial,CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,type CanonicalStrokeOperation,type CanonicalStrokeSnapshotV2,type CanonicalRecordedAttachmentV1,type Operation} from '@grafetto/shared'
import {captureCanonicalHistoryScope,prepareCanonicalHistoryPage,CanonicalHistoryReadError} from './canonicalHistoryPage'
import {fetchHistoryPage,walkHistoryBackward,restoreLatestSnapshot} from './snapshotRestore'
import {api} from '../../../lib/api/api'
import {prepareBrushPresets} from '../../../lib/api/brushLibrary'
vi.mock('../../../lib/api/api',async original=>({...await original<typeof import('../../../lib/api/api')>(),api:vi.fn()}))
vi.mock('../../../lib/api/brushLibrary',()=>({prepareBrushPresets:vi.fn(async()=>{})}))
const originalFetch=global.fetch
afterEach(()=>{global.fetch=originalFetch})
beforeEach(()=>{vi.mocked(api).mockReset();vi.mocked(prepareBrushPresets).mockReset().mockResolvedValue(undefined)})
function fixture(){
 const curve={text:'0,1;1,0',points:[{x:0,y:1,corner:false},{x:1,y:0,corner:false}]}
 const primarySource=canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,descriptorId:'soft',descriptorVersion:1,descriptorSha256:'a'.repeat(64),source:{kind:'softAuto',generator:'soft',shape:'circle',diameter:8,ratio:1,horizontalFade:1,verticalFade:1,antialias:false,spikes:2,randomness:0,density:1,softnessCurve:curve},brushScale:1,brushAngle:0,coverageProfile:'neon64-f32-fma-v1',reader:'krita-bd6e8d0-v1',compilerProfile:'eigen-5.0.1-mapped-arm64-f64-v3',buildId:'b'.repeat(64),radialCurve:{source:curve,coefficients:[[0,0,-1,1]]}})
 const material={version:2 as const,assets:[],primarySource,budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'L',brush:'brush:soft@1',strokeId:'S',boardEpoch:2,descriptorSha256:'a'.repeat(64),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},assets:[],materialVersion:2,material}
 const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:8,ratio:1,spikes:2,scale:1,angle:0},{scale:1,ratio:1,rotation:0},0,0)
 const recipe={kind:'softAuto' as const,sourceSlot:0 as const,source:primarySource.source,coverageProfile:primarySource.coverageProfile,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:false}
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:0,y:0,opacity:1,flow:1}],fences:[{at:0,kind:'segmentBegin',group:0},{at:1,kind:'primaryEnd',group:0},{at:1,kind:'segmentEnd',group:0},{at:1,kind:'gestureEnd'}]},material).packed
 const op:CanonicalStrokeOperation={id:'op',userId:'author',timestamp:0,seq:3,type:'canonical_stroke',layerId:'L',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:snapshot.brush,strokeId:'S',frameOrdinal:0,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:packed}}
 const attachment:CanonicalRecordedAttachmentV1={version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:'op',sequence:3,originalUserId:'author',capability:0}]}
 return {attachment,op,expected:{roomId:'room',boardEpoch:2}}
}
function page(){const f=fixture();return {...f,scope:{...f.expected,isCurrent:vi.fn(()=>true)},body:{operations:[f.op],canonicalCapabilities:f.attachment}}}
it('prepares the whole closed page as immutable atoms while legacy arrays keep their old owner',()=>{
 const f=page(),prepared=prepareCanonicalHistoryPage(f.body,'room',f.scope)
 expect(Array.isArray(prepared)).toBe(false)
 if(Array.isArray(prepared))throw Error('expected prepared page')
 expect(prepared.prepared[0].read?.sequence).toBe(3);expect(Object.isFrozen(prepared.operations)).toBe(true)
 f.body.operations.length=0;expect(prepared.operations).toHaveLength(1)
 const legacy:Operation[]=[];expect(prepareCanonicalHistoryPage(legacy,'room')).toBe(legacy)
})
it('does not turn a structured read failure into an empty successful history or prepare presets',async()=>{
 const f=page();vi.mocked(api).mockResolvedValueOnce(f.body)
 await expect(fetchHistoryPage('room',4,1)).rejects.toBeInstanceOf(CanonicalHistoryReadError)
 expect(prepareBrushPresets).not.toHaveBeenCalled()
})
it('rejects invalid or missing capability before loading any presets and keeps scoped network failure fatal',async()=>{
 const f=page(),bad=structuredClone(f.body)
 Object.assign(bad.canonicalCapabilities, {bindings:[{...bad.canonicalCapabilities.bindings[0],sequence:9}]})
 vi.mocked(api).mockResolvedValueOnce(bad)
 await expect(fetchHistoryPage('room',4,1,f.scope)).rejects.toBeInstanceOf(CanonicalHistoryReadError)
 expect(prepareBrushPresets).not.toHaveBeenCalled()
 expect(()=>prepareCanonicalHistoryPage([f.op],'room',f.scope)).toThrow(CanonicalHistoryReadError)
 vi.mocked(api).mockRejectedValueOnce(Error('offline'))
 await expect(fetchHistoryPage('room',4,1,f.scope)).rejects.toBeInstanceOf(CanonicalHistoryReadError)
})
it('carries accepted atomic metadata to the explicit canonical walk sink and never the legacy callback',async()=>{
 const f=page(),legacy=vi.fn(),canonical=vi.fn();vi.mocked(api).mockResolvedValueOnce(f.body)
 await walkHistoryBackward('room',4,1,legacy,fetchHistoryPage,{scope:f.scope,onPage:canonical})
 expect(legacy).not.toHaveBeenCalled();expect(canonical).toHaveBeenCalledWith([expect.objectContaining({read:expect.objectContaining({sequence:3})})])
})
it('rejects scope invalidation during resource preparation before a page reaches its sink',async()=>{
 const f=page(),sink=vi.fn();vi.mocked(api).mockResolvedValueOnce(f.body)
 vi.mocked(prepareBrushPresets).mockImplementationOnce(async()=>{f.scope.isCurrent.mockReturnValue(false)})
 await expect(walkHistoryBackward('room',4,1,vi.fn(),fetchHistoryPage,{scope:f.scope,onPage:sink})).rejects.toBeInstanceOf(CanonicalHistoryReadError)
 expect(sink).not.toHaveBeenCalled()
})
it('captures room-state identity before the HTTP await instead of observing later caller mutation',async()=>{
 const f=page();let resolve!:(value:unknown)=>void
 vi.mocked(api).mockImplementationOnce(()=>new Promise(r=>{resolve=r}) as never)
 const pending=fetchHistoryPage('room',4,1,f.scope);f.scope.boardEpoch=99;resolve(f.body)
 const prepared=await pending;if(Array.isArray(prepared))throw Error('expected capability')
 expect(prepared.prepared[0].read?.boardEpoch).toBe(2)
})
function index(){return {seq:3,layers:[],historyLayers:['L'],layerState:{items:{L:{kind:'layer',id:'L',name:'Layer',opacity:1,visible:true}},rootOrder:['L'],activeId:'L',selectedIds:[]}}}
it('hands scoped dependency history to the explicit prepared sink, preserving metadata outside pixel blobs',async()=>{
 const f=page(),preparedSink=vi.fn(async()=>{}),legacySink=vi.fn(async()=>{})
 global.fetch=vi.fn(async()=>({status:200,ok:true,json:async()=>index()})) as unknown as typeof fetch
 vi.mocked(api).mockResolvedValueOnce(index()).mockResolvedValueOnce(f.body).mockResolvedValueOnce([])
 const result=await restoreLatestSnapshot('room',{beginLayers:vi.fn(),applyLayer:vi.fn(),canonicalRead:f.scope,restoreCanonicalHistory:preparedSink,restoreHistory:legacySink})
 expect(result.status).toBe('restored');expect(legacySink).not.toHaveBeenCalled()
 expect(preparedSink).toHaveBeenCalledWith([expect.objectContaining({read:expect.objectContaining({sequence:3})})])
})
it('fails an invalid dependency page before creating layers or fetching blobs and does not retry the invalid authority',async()=>{
 const f=page(),bad=structuredClone(f.body),begin=vi.fn(),apply=vi.fn()
 Object.assign(bad.canonicalCapabilities, {bindings:[]})
 global.fetch=vi.fn(async()=>({status:200,ok:true,json:async()=>index()})) as unknown as typeof fetch
 vi.mocked(api).mockResolvedValueOnce(index()).mockResolvedValue(bad)
 const result=await restoreLatestSnapshot('room',{beginLayers:begin,applyLayer:apply,canonicalRead:f.scope,restoreCanonicalHistory:vi.fn(async()=>{})})
 expect(result).toMatchObject({status:'failed',stage:'index',appliedLayerIds:[]});expect(begin).not.toHaveBeenCalled();expect(apply).not.toHaveBeenCalled()
 expect(api).toHaveBeenCalledTimes(2);expect(prepareBrushPresets).not.toHaveBeenCalled()
})

it('captures a bounded independent profile allowset and rejects ambiguous receiver policy',()=>{
 const f=page(),profiles=[CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE]
 const captured=captureCanonicalHistoryScope({...f.scope,allowedRasterProfiles:profiles})!
 profiles.pop()
 expect(captured.allowedRasterProfiles).toEqual([CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE])
 expect(Object.isFrozen(captured.allowedRasterProfiles)).toBe(true)
 expect(()=>captureCanonicalHistoryScope({...f.scope,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,allowedRasterProfiles:profiles})).toThrow()
})
it('rejects close metadata without an explicit recorded seal owner, even in legacy arrays',()=>{
 const close={id:'close',type:'canonical_stroke_close',userId:'author',timestamp:0,seq:4}
 const f=page()
 for(const scope of [undefined,f.scope])expect(()=>prepareCanonicalHistoryPage([close],'room',scope)).toThrow(CanonicalHistoryReadError)
 expect(()=>prepareCanonicalHistoryPage({...f.body,operations:[close]},'room',f.scope)).toThrow(CanonicalHistoryReadError)
})
