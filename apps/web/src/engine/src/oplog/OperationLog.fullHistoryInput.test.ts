import {attachCanonicalRecordedDelivery,captureCanonicalLocalReadScope} from '../../../pages/Room/net/canonicalRecordedDelivery'
import {OperationLog,type LogEntry} from './OperationLog'
import type {CanonicalRecordedInput} from './CanonicalRecordedDelivery'
import {expect,it,vi} from 'vitest'
vi.mock('@sentry/react',()=>({captureException:vi.fn()}))
import {parseCanonicalStrokeCloseOperation,prepareCanonicalRecordedAttachment,sourceAutoGeometry,canonicalSoftAutoSourcePin,buildCanonicalMaterial,CANONICAL_STROKE_RASTER_PROFILE,type CanonicalStrokeOperation,type CanonicalStrokeSnapshotV2,type CanonicalRecordedAttachmentV1,type ServerToClientEvents,type Operation} from '@grafetto/shared'
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

type BranchStep={readonly kind:'frame';readonly id:string;readonly stroke:string;readonly user?:string;readonly ordinal?:number;readonly ended?:boolean;readonly empty?:boolean}|{readonly kind:'undo'|'redo';readonly id:string;readonly target:string;readonly user?:string}
function branchOperation(step:BranchStep,seq:number):{operation:Operation;snapshot?:CanonicalStrokeSnapshotV2}{
 const userId=step.user??'author'
 if(step.kind!=='frame')return{operation:{type:step.kind==='undo'?'operation_undo':'operation_redo',id:step.id,userId,timestamp:seq,seq,targetOpId:step.target}}
 const f=fixture(step.ended!==false),captured=f.attachment.capabilities[0].snapshot
 if(!('materialVersion'in captured)||captured.materialVersion!==2)throw Error('Actual V2 fixture required')
 const snapshot={...captured,strokeId:step.stroke}
 const materialPacked=step.empty?buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:step.ended===false?[]:[{kind:'gestureEnd',at:0}]},snapshot.material).packed:f.op.frame.materialPacked
 return{snapshot,operation:{...f.op,id:step.id,userId,seq,frame:{...f.op.frame,strokeId:step.stroke,frameOrdinal:step.ordinal??0,materialPacked}}}
}
function branchRead(steps:readonly BranchStep[],isCurrent=()=>true){
 const room=fullState(),rows=steps.map((s,i)=>branchOperation(s,i+1)),capabilities:CanonicalRecordedAttachmentV1['capabilities'][number][]=[],indexes=new Map<string,number>()
 const bindings:CanonicalRecordedAttachmentV1['bindings'][number][]=[]
 for(const {operation,snapshot} of rows)if(operation.type==='canonical_stroke'&&snapshot){const key=JSON.stringify([operation.userId,snapshot.strokeId]);let index=indexes.get(key);if(index===undefined){index=capabilities.length;indexes.set(key,index);capabilities.push({originalUserId:operation.userId,snapshot})}bindings.push({operationId:operation.id,sequence:operation.seq!,originalUserId:operation.userId,capability:index})}
 room.tailOperations=rows.map(r=>r.operation);room.canonicalCapabilities={version:1,roomId:'room',boardEpoch:2,capabilities,bindings};countTail(room)
 const read=prepareCanonicalRoomState(room,{expectedBoardId:'room',isCurrent}).canonicalRead
 const inputs=read.preparedAtoms as readonly CanonicalRecordedInput[],log=new OperationLog()
 inputs.forEach(input=>log.append(input.operation,{serverSeq:input.operation.seq,canonicalInput:input}))
 const fold=read.assertFullHistoryBase!(read.tailOperations)
 for(const group of fold.gestures)if(!group.visible){log.applyUndo(group.frameOperationIds[0],group.userId);if(!group.redoable)for(const id of group.frameOperationIds)log.revoke(id)}
 const future=(step:BranchStep,seq:number)=>{const row=branchOperation(step,seq);if(row.operation.type!=='canonical_stroke'||!row.snapshot)throw Error('Original frame required');const atom=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:row.operation.userId,snapshot:row.snapshot}],bindings:[{operationId:row.operation.id,sequence:seq,originalUserId:row.operation.userId,capability:0}]},[row.operation],read.scope)[0],input=attachCanonicalRecordedDelivery(atom,read.scope);if(!('delivery'in input))throw Error('Missing original owner');return input}
 return{log,read,inputs,future,fold}
}
const hiddenBranch:readonly BranchStep[]=[{kind:'frame',id:'A',stroke:'A'},{kind:'frame',id:'B',stroke:'B'},{kind:'undo',id:'undoB',target:'B'}]
it('invalidates a hidden group only at the first new original empty source frame, atomically retaining its original input',()=>{
 const s=branchRead(hiddenBranch),{log}=s,entries=log.entries,revision=log.revision,before=log.pixelOpDoneCount('L'),input=s.future({kind:'frame',id:'C0',stroke:'C',empty:true,ended:false},4),originalB=entries[1]
 expect(originalB.state).toBe('undone')
 log.append(input.operation,{serverSeq:4,canonicalInput:input},()=>{expect(log.entries).toBe(entries);expect(entries[1].state).toBe('undone');expect(log.revision).toBe(revision);return undefined})
 expect(log.entries[1].state).toBe('gone');expect(originalB.state).toBe('undone');expect(log.entries[1]).not.toBe(originalB)
 expect(log.entries[1].canonicalInput).toBe(originalB.canonicalInput);expect(Object.getOwnPropertyDescriptor(log.entries[1],'canonicalInput')?.enumerable).toBe(false)
 expect(log.pixelOpDoneCount('L')).toBe(before+1)
 const next=s.future({kind:'frame',id:'C1',stroke:'C',ordinal:1,empty:true},5);log.append(next.operation,{serverSeq:5,canonicalInput:next},()=>undefined)
 expect(log.entries[1].state).toBe('gone');expect(log.pixelOpDoneCount('L')).toBe(before+2)
})
it.each(['continuation','peer']as const)('preserves hidden redo state for an original %s while another original source is OPEN',kind=>{
 const prefix:readonly BranchStep[]=[{kind:'frame',id:'A0',stroke:'A',ended:false,empty:true},...hiddenBranch.slice(1)],s=branchRead(prefix),input=s.future({kind:'frame',id:'next',stroke:kind==='continuation'?'A':'peer',user:kind==='peer'?'peer':'author',ordinal:kind==='continuation'?1:0,ended:false,empty:true},4)
 s.log.append(input.operation,{serverSeq:4,canonicalInput:input},()=>undefined)
 expect(s.log.entries.find(e=>e.op.id==='B')?.state).toBe('undone')
})
it.each(['throw','reentry']as const)('leaves hidden states and grouped counts intact when guarded branch publication encounters %s',kind=>{
 const s=branchRead(hiddenBranch),entries=s.log.entries,count=s.log.pixelOpDoneCount('L'),input=s.future({kind:'frame',id:'C',stroke:'C',empty:true},4),primary=Error('CAS refused')
 expect(()=>s.log.append(input.operation,{serverSeq:4,canonicalInput:input},()=>{if(kind==='throw')throw primary;s.log.applyUndo('A','author');return undefined})).toThrow(kind==='throw'?primary:'journal changed')
 expect(s.log.entries).toBe(entries);expect(entries[1].state).toBe('undone');expect(s.log.entries.some(e=>e.op.id==='C')).toBe(false);expect(s.log.pixelOpDoneCount('L')).toBe(count-(kind==='reentry'?1:0))
})
it('keeps historical redo of gone original frames valid, with exact grouped count restoration',()=>{
 const s=branchRead([...hiddenBranch,{kind:'frame',id:'C',stroke:'C'},{kind:'undo',id:'repeatUndoB',target:'B'}]),{log}=s
 expect(log.entries.find(e=>e.op.id==='B')?.state).toBe('gone');expect(log.pixelOpDoneCount('L')).toBe(2)
 expect(log.applyUndo('B','author')).toBeNull();expect(log.entries.find(e=>e.op.id==='B')?.state).toBe('gone')
 expect(log.applyRedo('B','author')?.id).toBe('B');expect(log.entries.find(e=>e.op.id==='B')?.state).toBe('done');expect(log.pixelOpDoneCount('L')).toBe(3)
 log.applyRedo('B','author');expect(log.pixelOpDoneCount('L')).toBe(3);log.applyUndo('B','author');expect(log.entries.find(e=>e.op.id==='B')?.state).toBe('undone');expect(log.pixelOpDoneCount('L')).toBe(2)
 const historical=branchRead([...hiddenBranch,{kind:'frame',id:'C',stroke:'C'},{kind:'redo',id:'oldAcceptedRedoB',target:'undoB'}]);expect(historical.log.entries.find(e=>e.op.id==='B')?.state).toBe('done')
})
it('keeps grouped hidden counts exact across new source invalidation and historical revival of two original frames',()=>{
 const s=branchRead([{kind:'frame',id:'A',stroke:'A'},{kind:'frame',id:'B0',stroke:'B',empty:true,ended:false},{kind:'frame',id:'B1',stroke:'B',ordinal:1,empty:true},{kind:'undo',id:'undoB',target:'B1'}]),{log}=s
 expect(log.pixelOpDoneCount('L')).toBe(1);expect(log.entries.filter(e=>e.op.type==='canonical_stroke'&&e.op.frame.strokeId==='B').every(e=>e.state==='undone')).toBe(true)
 const input=s.future({kind:'frame',id:'C',stroke:'C',empty:true},5);log.append(input.operation,{serverSeq:5,canonicalInput:input},()=>undefined)
 expect(log.pixelOpDoneCount('L')).toBe(2);expect(log.entries.filter(e=>e.op.type==='canonical_stroke'&&e.op.frame.strokeId==='B').every(e=>e.state==='gone')).toBe(true)
 log.applyRedo('B1','author');expect(log.pixelOpDoneCount('L')).toBe(4);log.applyRedo('B0','author');expect(log.pixelOpDoneCount('L')).toBe(4)
 log.applyUndo('B0','author');expect(log.pixelOpDoneCount('L')).toBe(2);expect(log.entries.filter(e=>e.op.type==='canonical_stroke'&&e.op.frame.strokeId==='B').every(e=>e.state==='undone')).toBe(true)
})
it('preserves original hidden redo when an earlier OPEN source is sealed by a genuine typed close',()=>{
 const s=branchRead([{kind:'frame',id:'A0',stroke:'A',ended:false,empty:true},...hiddenBranch.slice(1)]),operation:Operation=parseCanonicalStrokeCloseOperation({type:'canonical_stroke_close',id:'closeA',userId:'author',timestamp:4,seq:4,layerId:'L',targetUserId:'author',strokeId:'A',disposition:'commitPartial',recordedNext:1,firstFrameOpId:'A0',lastFrameOpId:'A0'}),input=attachCanonicalRecordedDelivery({operation},s.read.scope)
 if(!('delivery'in input))throw Error('Original close required')
 s.log.append(operation,{serverSeq:4,canonicalInput:input},()=>undefined)
 expect(s.log.entries.find(e=>e.op.id==='B')?.state).toBe('undone');expect(s.log.pixelOpDoneCount('L')).toBe(1)
})
it('refuses gone rows absent from the original full hidden proof instead of treating a local revoke as recorded authority',()=>{
 const s=branchRead(hiddenBranch),input=s.future({kind:'frame',id:'C',stroke:'C',empty:true},4)
 s.log.revoke('A');const entries=s.log.entries,revision=s.log.revision,count=s.log.pixelOpDoneCount('L')
 expect(()=>s.log.append(input.operation,{serverSeq:4,canonicalInput:input},()=>undefined)).toThrow('cannot account for hidden frames')
 expect(s.log.entries).toBe(entries);expect(s.log.revision).toBe(revision);expect(s.log.pixelOpDoneCount('L')).toBe(count)
})

it('publishes an original indexed cut without materializing retired LogEntries and preserves aggregate frame counts',()=>{
 const source=fullState(),p=prepareCanonicalRoomState(source,{expectedBoardId:source.room.id,isCurrent:()=>true}),lifetime=p.canonicalRead!,scope=lifetime.assertCurrent()
 if(!lifetime.assertFullHistoryBase)throw Error('Actual full original source required')
 const log=new OperationLog(),cut:import('./CanonicalRecordedDelivery').CanonicalAcceptedCut={lifetime,scope,throughSeq:1,operationCount:1,roomGeometry:{width:64,height:64,infinite:false},authorRasterProfile:CANONICAL_STROKE_RASTER_PROFILE,assertCurrent(candidate){if(candidate!==cut)throw Error('Foreign indexed cut');lifetime.assertFullHistoryBase!(p.tailOperations)}}
 const ticket=log.prepareCanonicalCutPublication(cut,{throughSeq:1,operationCount:1,visibleFrameCounts:[{layerId:'L',count:1}]},log.revision)
 expect(log.canonicalAcceptedCut).toBeNull();expect(log.pixelOpDoneCount('L')).toBe(0)
 ticket.assertCurrent();ticket.publish()
 expect(log.canonicalAcceptedCut).toBe(cut);expect(log.canonicalRetainedSuffix).toHaveLength(0);expect(log.pixelOpDoneCount('L')).toBe(1)
 expect(()=>ticket.publish()).toThrow();expect(()=>Reflect.apply(ticket.publish,{},[])).toThrow()
})
it('rejects indexed cut publication after original callback reentry without overwriting the real journal',()=>{
 const source=fullState(),p=prepareCanonicalRoomState(source,{expectedBoardId:source.room.id,isCurrent:()=>true}),lifetime=p.canonicalRead!,scope=lifetime.assertCurrent(),log=new OperationLog()
 let reenter=false
 const cut:import('./CanonicalRecordedDelivery').CanonicalAcceptedCut={lifetime,scope,throughSeq:1,operationCount:1,roomGeometry:{width:64,height:64,infinite:false},authorRasterProfile:CANONICAL_STROKE_RASTER_PROFILE,assertCurrent(candidate){if(candidate!==cut)throw Error('Foreign indexed cut');lifetime.assertCurrent();if(reenter){reenter=false;log.append({type:'layer_clear',id:'real-reentry',userId:'author',timestamp:0,layerId:'L'})}}}
 const ticket=log.prepareCanonicalCutPublication(cut,{throughSeq:1,operationCount:1,visibleFrameCounts:[{layerId:'L',count:1}]},log.revision)
 reenter=true;expect(()=>ticket.assertCurrent()).toThrow('Canonical indexed journal changed');expect(()=>ticket.publish()).toThrow();expect(log.canonicalAcceptedCut).toBeNull();expect(log.entries.map(e=>e.op.id)).toEqual(['real-reentry'])
})
