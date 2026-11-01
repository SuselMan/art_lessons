import {expect,it,vi} from 'vitest'
vi.mock('@sentry/react',()=>({captureException:vi.fn()}))
import {sourceAutoGeometry,canonicalSoftAutoSourcePin,buildCanonicalMaterial,CANONICAL_STROKE_RASTER_PROFILE,type CanonicalStrokeOperation,type CanonicalStrokeSnapshotV2,type CanonicalRecordedAttachmentV1,type ServerToClientEvents,type Operation} from '@grafetto/shared'
import {prepareCanonicalRoomState,preflightRoomStateDelivery} from './canonicalRoomState'
function fixture(ended=true){
 const curve={text:'0,1;1,0',points:[{x:0,y:1,corner:false},{x:1,y:0,corner:false}]}
 const primarySource=canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,descriptorId:'soft',descriptorVersion:1,descriptorSha256:'a'.repeat(64),source:{kind:'softAuto',generator:'soft',shape:'circle',diameter:8,ratio:1,horizontalFade:1,verticalFade:1,antialias:false,spikes:2,randomness:0,density:1,softnessCurve:curve},brushScale:1,brushAngle:0,coverageProfile:'neon64-f32-fma-v1',reader:'krita-bd6e8d0-v1',compilerProfile:'eigen-5.0.1-mapped-arm64-f64-v3',buildId:'b'.repeat(64),radialCurve:{source:curve,coefficients:[[0,0,-1,1]]}})
 const material={version:2 as const,assets:[],primarySource,budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'L',brush:'brush:soft@1',strokeId:'S',boardEpoch:2,descriptorSha256:'a'.repeat(64),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},assets:[],materialVersion:2,material}
 const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:8,ratio:1,spikes:2,scale:1,angle:0},{scale:1,ratio:1,rotation:0},0,0)
 const recipe={kind:'softAuto' as const,sourceSlot:0 as const,source:primarySource.source,coverageProfile:primarySource.coverageProfile,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:false}
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:0,y:0,opacity:1,flow:1}],fences:[{at:0,kind:'segmentBegin',group:0},{at:1,kind:'primaryEnd',group:0},{at:1,kind:'segmentEnd',group:0},...(ended?[{at:1,kind:'gestureEnd' as const}]:[])]},material).packed
 const op:CanonicalStrokeOperation={id:'op',userId:'author',timestamp:0,seq:1,type:'canonical_stroke',layerId:'L',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:snapshot.brush,strokeId:'S',frameOrdinal:0,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:packed}}
 const attachment:CanonicalRecordedAttachmentV1={version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:'op',sequence:1,originalUserId:'author',capability:0}]}
 return {attachment,op,expected:{roomId:'room',boardEpoch:2}}
}
function state(ended=true){
 const f=fixture(ended)
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[f.op],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:f.expected,canonicalCapabilities:f.attachment}
 return {state,f}
}

function fullState(ended=true){
 const {state:s}=state(ended)
 s.canonicalHistoryBase={kind:'full-room-prefix-v2',roomId:'room',boardEpoch:2,throughSeq:1,operationCount:1}
 return s
}
function close():Operation{return{type:'canonical_stroke_close',id:'close',userId:'author',timestamp:2,seq:2,layerId:'L',targetUserId:'author',strokeId:'S',disposition:'commitPartial',recordedNext:1,firstFrameOpId:'op',lastFrameOpId:'op'}}
function countTail(s:ReturnType<typeof fullState>){s.canonicalHistoryBase={kind:'full-room-prefix-v2',roomId:'room',boardEpoch:2,throughSeq:s.tailOperations.length,operationCount:s.tailOperations.length}}
it('captures full close history under the original read and preserves every exact normalized operation pointer',()=>{
 let current=true;const s=fullState(false),raw=close();s.tailOperations.push(raw,{type:'operation_undo',id:'undo',userId:'author',timestamp:3,seq:3,targetOpId:'op'});countTail(s)
 const prepared=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>current}),read=prepared.canonicalRead,verified=read.assertFullHistoryBase!(prepared.tailOperations)
 expect(verified.gestures).toEqual([{userId:'author',layerId:'L',strokeId:'S',frameOperationIds:['op'],ended:false,sealed:true,visible:false,redoable:true}])
 expect(verified.base).toBe(read.fullHistoryBase);expect(prepared.canonicalHistoryBase).toBe(read.fullHistoryBase)
 expect(read.emptyHistoryBase).toBeUndefined();expect(()=>read.assertEmptyHistoryBase(prepared.tailOperations)).toThrow()
 expect(prepared.tailOperations[1]).not.toBe(raw);expect(Object.isFrozen(prepared.tailOperations[1])).toBe(true)
 prepared.canonicalRead.preparedAtoms.forEach((atom,i)=>expect(atom.operation).toBe(prepared.tailOperations[i]))
 const delivery=Object.getOwnPropertyDescriptor(read.preparedAtoms[1],'delivery')!.value
 expect(delivery.lifetime).toBe(read);delivery.assertCurrent(read.preparedAtoms[1])
 Object.assign(raw,{recordedNext:99});expect(read.assertFullHistoryBase!(prepared.tailOperations)).toBe(verified)
 expect(()=>({...read}).assertFullHistoryBase!(prepared.tailOperations)).toThrow()
 expect(()=>read.assertFullHistoryBase!([...prepared.tailOperations])).toThrow()
 current=false;expect(()=>read.assertFullHistoryBase!(prepared.tailOperations)).toThrow();expect(()=>delivery.assertCurrent(read.preparedAtoms[1])).toThrow()
})
it('folds completed history undo/redo metadata and rejects mixed-base authority',()=>{
 const s=fullState();s.tailOperations.push({type:'operation_undo',id:'undo',userId:'author',timestamp:2,seq:2,targetOpId:'op'},{type:'operation_redo',id:'redo',userId:'author',timestamp:3,seq:3,targetOpId:'undo'});countTail(s)
 const prepared=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>true}),read=prepared.canonicalRead
 expect(read.assertFullHistoryBase!(prepared.tailOperations).gestures[0]).toMatchObject({ended:true,sealed:false,visible:true})
 const other=prepareCanonicalRoomState(fullState(),{expectedBoardId:'room',isCurrent:()=>true})
 expect(()=>read.assertFullHistoryBase!(other.tailOperations)).toThrow()
 expect(()=>preflightRoomStateDelivery(s)).toThrow('Unsupported')
 expect(preflightRoomStateDelivery(s,value=>prepareCanonicalRoomState(value,{expectedBoardId:'room',isCurrent:()=>true})).canonicalRead).toBeDefined()
})
it.each(['missing','v1','badClose','getter','baseGetter','extra','futureUndo']as const)('rejects unverified full history (%s) without invoking caller getters',kind=>{
 const s=fullState(false),raw=close(),getter=vi.fn(()=>1);s.tailOperations.push(raw);countTail(s)
 if(kind==='missing')s.canonicalHistoryBase=undefined
 if(kind==='v1')s.canonicalHistoryBase={kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:2,operationCount:2}
 if(kind==='badClose')Object.assign(raw,{recordedNext:2})
 if(kind==='getter')Object.defineProperty(raw,'recordedNext',{get:getter})
 if(kind==='baseGetter')Object.defineProperty(s.canonicalHistoryBase!,'kind',{get:getter})
 if(kind==='extra')Object.defineProperty(raw,'unknown',{get:getter})
 if(kind==='futureUndo'){s.tailOperations[1]={type:'operation_undo',id:'undo',userId:'author',timestamp:2,seq:2,targetOpId:'future'}}
 expect(()=>prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>true})).toThrow()
 expect(getter).not.toHaveBeenCalled()
})

it('captures an empty V2 history without manufacturing any operation or frame capability',()=>{
 const s=fullState();s.tailOperations=[];s.canonicalCapabilities=undefined;countTail(s)
 const prepared=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>true})
 expect(prepared.canonicalRead.assertFullHistoryBase!(prepared.tailOperations).gestures).toEqual([])
 expect(prepared.canonicalRead.preparedAtoms).toHaveLength(0)
 expect(prepared.tailOperations).toHaveLength(0)
})
