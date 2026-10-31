import {attachCanonicalRecordedDelivery,captureCanonicalLocalReadScope} from '../../../pages/Room/net/canonicalRecordedDelivery'
import {OperationLog,type LogEntry} from './OperationLog'
import type {CanonicalRecordedInput} from './CanonicalRecordedDelivery'
import {expect,it,vi} from 'vitest'
vi.mock('@sentry/react',()=>({captureException:vi.fn()}))
import {sourceAutoGeometry,canonicalSoftAutoSourcePin,buildCanonicalMaterial,CANONICAL_STROKE_RASTER_PROFILE,type CanonicalStrokeOperation,type CanonicalStrokeSnapshotV2,type CanonicalRecordedAttachmentV1,type ServerToClientEvents,type Operation} from '@grafetto/shared'
import {prepareCanonicalRoomState} from '../../../pages/Room/net/canonicalRoomState'
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

function recorded(){
 let current=true
 const s=fullState(false)
 s.tailOperations.push(close(),{type:'operation_undo',id:'undo',userId:'author',timestamp:3,seq:3,targetOpId:'op'},
  {type:'operation_redo',id:'redo',userId:'author',timestamp:4,seq:4,targetOpId:'undo'})
 countTail(s)
 const read=prepareCanonicalRoomState(s,{expectedBoardId:'room',isCurrent:()=>current}).canonicalRead
 return {inputs:read.preparedAtoms as readonly CanonicalRecordedInput[],read,stale:()=>{current=false}}
}
it('retains original full-history undo/redo delivery across append and local numbering',()=>{
 const {inputs,read}=recorded(),log=new OperationLog()
 for(const input of inputs){
  log.append(input.operation,{serverSeq:input.operation.seq,canonicalInput:input})
  expect(log.entries.at(-1)!.canonicalInput).toBe(input)
  expect(input.delivery.lifetime).toBe(read)
 }
 expect(log.entries.map(e=>e.op.seq)).toEqual([0,1,2,3])
 expect(log.entries.slice(1).every(e=>e.canonicalRead===undefined)).toBe(true)
 expect(log.entries[2].canonicalInput!.read).toBeUndefined()
 log.applyUndo('op','author');log.applyRedo('op','author')
 expect(log.entries[0].state).toBe('done')
})
it('prepares original metadata through historical copies and empty-journal CAS',()=>{
 const {inputs}=recorded(),scratch=new OperationLog(),log=new OperationLog()
 inputs.forEach(input=>scratch.append(input.operation,{serverSeq:input.operation.seq,canonicalInput:input}))
 const publish=vi.fn(()=>undefined)
 log.prependHistorical(scratch.entries,0,publish)
 expect(publish).toHaveBeenCalledOnce()
 expect(log.entries.map(e=>e.canonicalInput)).toEqual(inputs)
 expect(()=>log.prependHistorical(scratch.entries,0)).toThrow('Historical baseline journal changed')
 const later=new OperationLog(),early=new OperationLog(),split=new OperationLog()
 inputs.slice(2).forEach(input=>later.append(input.operation,{serverSeq:input.operation.seq,canonicalInput:input}))
 inputs.slice(0,2).forEach(input=>early.append(input.operation,{serverSeq:input.operation.seq,canonicalInput:input}))
 split.prependHistorical(later.entries);split.prependHistorical(early.entries)
 expect(split.entries.map(e=>e.canonicalInput)).toEqual(inputs)
})
it('rejects copied metadata proof, wrong pointer, changed historical body and stale delivery atomically',()=>{
 const f=recorded(),input=f.inputs[2],log=new OperationLog()
 for(const invoke of [
  ()=>log.append(input.operation,{serverSeq:3,canonicalInput:{...input}}),
  ()=>log.append({...input.operation},{serverSeq:3,canonicalInput:input}),
  ()=>log.append(input.operation,{serverSeq:4,canonicalInput:input}),
  ()=>log.prependHistorical([{op:{...input.operation,timestamp:99},state:'done',serverSeq:3,canonicalInput:input}]),
  ()=>log.prependHistorical([{op:{...input.operation,targetOpId:'foreign'} as Operation,state:'done',serverSeq:3,canonicalInput:input}]),
 ]){expect(invoke).toThrow();expect(log.revision).toBe(0);expect(log.entries).toHaveLength(0)}
 const scratch=new OperationLog();f.inputs.forEach(i=>scratch.append(i.operation,{serverSeq:i.operation.seq,canonicalInput:i}))
 f.stale();expect(()=>log.prependHistorical(scratch.entries,0)).toThrow()
 expect(log.revision).toBe(0);expect(log.entries).toHaveLength(0)
})
it('rejects metadata read authority and closed-schema getters without invoking them',()=>{
 const {inputs}=recorded(),input=inputs[2],log=new OperationLog(),getter=vi.fn(()=>3)
 const op=Object.defineProperty({...input.operation},'timestamp',{get:getter})
 const entry:LogEntry={op,state:'done',serverSeq:3,canonicalInput:input}
 expect(()=>log.prependHistorical([entry])).toThrow();expect(getter).not.toHaveBeenCalled()
 expect(()=>log.append(input.operation,{serverSeq:3,canonicalInput:input,canonicalRead:inputs[0].read})).toThrow()
 expect(log.revision).toBe(0)
})

it('cannot mint metadata delivery from data-only policy or a foreign frozen operation',()=>{
 const {read,inputs}=recorded(),operation=Object.freeze({...inputs[2].operation,id:'foreign'})
 const plain=captureCanonicalLocalReadScope({roomId:read.scope.roomId,boardEpoch:read.scope.boardEpoch,allowedRasterProfiles:read.scope.allowedRasterProfiles,isCurrent:()=>true})
 expect(attachCanonicalRecordedDelivery({operation},plain)).not.toHaveProperty('delivery')
 expect(()=>attachCanonicalRecordedDelivery({operation},read.scope)).toThrow()
 expect(()=>attachCanonicalRecordedDelivery({operation:inputs[2].operation,read:inputs[0].read},read.scope)).toThrow()
})
