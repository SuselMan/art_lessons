import {prepareCanonicalHistoryPage} from '../../../pages/Room/net/canonicalHistoryPage'
import {describe,it,expect,vi} from 'vitest'
import {buildCanonicalMaterial,canonicalDefaultAutoSourceBinding,CANONICAL_STROKE_RASTER_PROFILE,type BrushDescriptor,type CanonicalStrokeOperation,type ServerToClientEvents,type CanonicalStrokeSnapshotV2} from '@grafetto/shared'
import stock from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import {prepareCanonicalRoomState} from '../../../pages/Room/net/canonicalRoomState'
import type {CanonicalRecordedInput} from './CanonicalRecordedDelivery'
import {OperationLog,type LogEntry} from './OperationLog'

function fixture(onCurrent:()=>void=()=>{}){
 const pin=canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1')
 const material={version:2 as const,assets:[],primarySource:pin,budget:{workUnits:1048576,outputBytes:1048576,drawPixels:1048576}}
 const snapshot:CanonicalStrokeSnapshotV2={materialVersion:2,material,assets:[],layerId:'layer',brush:'brush:'+pin.descriptorId+'@'+pin.descriptorVersion,strokeId:'stroke',boardEpoch:1,descriptorSha256:pin.descriptorSha256,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'}}
 let current=true
 const operation=(id:string,seq:number,ordinal:number):CanonicalStrokeOperation=>({type:'canonical_stroke',id,userId:'author',timestamp:0,seq,layerId:'layer',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:snapshot.brush,strokeId:'stroke',frameOrdinal:ordinal,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},material).packed}})
 const ops=[operation('a',3,0),operation('b',5,1)]
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:ops,participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:1},canonicalCapabilities:{version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot}],bindings:ops.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}))}}
 const read=prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent:()=>{onCurrent();return current}}).canonicalRead
 const prepare=()=>prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent:()=>{onCurrent();return current}}).canonicalRead.preparedAtoms as readonly CanonicalRecordedInput[]
 return {inputs:read.preparedAtoms as readonly CanonicalRecordedInput[],scope:read.scope,prepare,stale:()=>{current=false}}
}

describe('original recorded delivery retained by existing history entries',()=>{
 it('retains exact original input outside local operation JSON and numbering',()=>{
  const {inputs:[a]}=fixture(),log=new OperationLog()
  log.append(a.operation,{serverSeq:3,canonicalInput:a})
  expect(log.entries[0].canonicalInput).toBe(a);expect(log.entries[0].op).not.toBe(a.operation)
  expect(log.entries[0].op.seq).toBe(0);expect(a.operation.seq).toBe(3)
  expect(Object.keys(log.entries[0])).not.toContain('canonicalInput')
  expect(JSON.stringify(log.entries)).not.toContain('canonicalInput');expect({...log.entries[0]}).not.toHaveProperty('canonicalInput')
  expect(log.entries[0].canonicalRead?.operationId).toBe(a.operation.id)
 })
 it('binds a real pending clone on confirmation and keeps first proof across duplicate ACKs',()=>{
  const f=fixture(),[a,b]=f.inputs,log=new OperationLog()
  log.append(a.operation,{pending:true});log.append(b.operation,{serverSeq:5,canonicalInput:b})
  log.confirm(a.operation.id,3,undefined,a)
  expect(log.entries.map(e=>e.serverSeq)).toEqual([3,5]);expect(log.entries[0].canonicalInput).toBe(a)
  log.confirm(a.operation.id,3,undefined,a);log.confirm(a.operation.id,3)
  expect(log.entries[0].canonicalInput).toBe(a)
  const page=prepareCanonicalHistoryPage({operations:[a.operation],canonicalCapabilities:{version:1,roomId:'room',boardEpoch:1,capabilities:[a.read!.capability],bindings:[{operationId:a.operation.id,sequence:3,originalUserId:a.operation.userId,capability:0}]}},'room',f.scope)
  if(Array.isArray(page))throw Error('Expected prepared history')
  const duplicate=page.prepared[0] as CanonicalRecordedInput
  expect(duplicate).not.toBe(a);expect(duplicate.delivery.lifetime).toBe(a.delivery.lifetime)
  log.confirm(a.operation.id,3,undefined,duplicate)
  expect(log.entries[0].canonicalInput).toBe(a)
  const newer=f.prepare()[0],revision=log.revision
  expect(()=>log.confirm(a.operation.id,3,undefined,newer)).toThrow()
  expect(log.revision).toBe(revision);expect(log.entries[0].canonicalInput).toBe(a)
 })
 it('preserves original proof through historical scratch copies, reorder and undo/redo',()=>{
  const {inputs:[a,b]}=fixture(),log=new OperationLog(),scratch=new OperationLog()
  log.append(b.operation,{serverSeq:5,canonicalInput:b});scratch.append(a.operation,{serverSeq:3,canonicalInput:a})
  log.prependHistorical(scratch.entries)
  expect(log.entries.map(e=>e.canonicalInput)).toEqual([a,b]);expect(log.entries.map(e=>e.op.seq)).toEqual([0,1])
  log.applyUndo(b.operation.id,'author');log.applyRedo(b.operation.id,'author')
  expect(log.entries.map(e=>e.canonicalInput)).toEqual([a,b])
 })
 it('rejects copied input, wrong append pointer, pending resource and accessors before any revision',()=>{
  const {inputs:[a]}=fixture(),log=new OperationLog(),get=vi.fn(()=>a),getter=Object.defineProperty({serverSeq:3},'canonicalInput',{get})
  for(const invoke of [()=>log.append(a.operation,{serverSeq:3,canonicalInput:{...a}}),()=>log.append({...a.operation},{serverSeq:3,canonicalInput:a}),()=>log.append(a.operation,Object.assign({pending:true as const},{canonicalInput:a})),()=>log.append(a.operation,getter)]){
   expect(invoke).toThrow();expect(log.entries).toHaveLength(0);expect(log.revision).toBe(0)
  }expect(get).not.toHaveBeenCalled()
 })
 it('prepares an entire incoming historical batch before mutation and refuses stale proof refresh',()=>{
  const f=fixture(),[a,b]=f.inputs,log=new OperationLog()
  log.append(a.operation,{serverSeq:3,canonicalInput:a});const before=log.revision
  const batch:LogEntry[]=[{op:b.operation,state:'done',serverSeq:5,canonicalInput:{...b}}]
  expect(()=>log.prependHistorical(batch)).toThrow();expect(log.entries).toHaveLength(1);expect(log.revision).toBe(before)
  f.stale();expect(()=>log.confirm(a.operation.id,3,undefined,a)).toThrow();expect(log.revision).toBe(before)
  log.confirm(a.operation.id,3);expect(log.entries[0].canonicalInput).toBe(a)
  expect(()=>a.delivery.assertCurrent(a)).toThrow()
 })
 it('rejects a changed pending body and conflicting supplied read before confirming',()=>{
  const {inputs:[a]}=fixture(),log=new OperationLog()
  log.append({...a.operation,timestamp:99},{pending:true});const revision=log.revision
  expect(()=>log.confirm(a.operation.id,3,undefined,a)).toThrow()
  expect(log.isPending(a.operation.id)).toBe(true);expect(log.revision).toBe(revision)
  const clean=new OperationLog(),read=a.read!
  const snapshot=read.capability.snapshot,pin=snapshot.material.primarySource
  if(pin.kind!=='defaultAuto')throw Error('Expected default source fixture')
  const conflicting={...read,capability:{...read.capability,snapshot:{...snapshot,descriptorSha256:'c'.repeat(64),material:{...snapshot.material,primarySource:{...pin,descriptorSha256:'c'.repeat(64)}}}}}
  expect(()=>clean.append(a.operation,{serverSeq:3,canonicalInput:a,canonicalRead:conflicting})).toThrow()
  expect(clean.revision).toBe(0);expect(clean.entries).toHaveLength(0)
 })
 it('rejects incoming historical proof accessors without invoking them or partially retaining earlier entries',()=>{
  const {inputs:[a,b]}=fixture(),log=new OperationLog(),get=vi.fn(()=>b)
  const bad:LogEntry=Object.defineProperty({op:b.operation,state:'done',serverSeq:5},'canonicalInput',{get})
  const good:LogEntry={op:a.operation,state:'done',serverSeq:3,canonicalInput:a}
  expect(()=>log.prependHistorical([good,bad])).toThrow();expect(get).not.toHaveBeenCalled()
  expect(log.revision).toBe(0);expect(log.entries).toHaveLength(0)
 })

 it('refuses same-gesture authority mixing at equal epoch on append and throughout historical preparation',()=>{
  const f=fixture(),[a]=f.inputs,newer=f.prepare()[1],log=new OperationLog()
  log.append(a.operation,{serverSeq:3,canonicalInput:a});const revision=log.revision
  expect(()=>log.append(newer.operation,{serverSeq:5,canonicalInput:newer})).toThrow(/lifetime/)
  expect(log.revision).toBe(revision);expect(log.entries).toHaveLength(1)
  expect(()=>log.prependHistorical([{op:newer.operation,state:'done',serverSeq:5,canonicalInput:newer}])).toThrow(/lifetime/)
  expect(log.revision).toBe(revision)
  const clean=new OperationLog()
  expect(()=>clean.prependHistorical([{op:a.operation,state:'done',serverSeq:3,canonicalInput:a},{op:newer.operation,state:'done',serverSeq:5,canonicalInput:newer}])).toThrow(/lifetime/)
  expect(clean.revision).toBe(0);expect(clean.entries).toHaveLength(0)
 })

})


describe('initial historical journal compare-and-publish',()=>{
 it('publishes original scratch entries once into the same empty journal at its captured revision',()=>{
  const f=fixture(),log=new OperationLog(),scratch=new OperationLog(),revision=log.revision
  for(const input of f.inputs)scratch.append(input.operation,{serverSeq:input.read!.sequence,canonicalInput:input})
  log.prependHistorical(scratch.entries,revision)
  expect(log.revision).toBe(revision+1);expect(log.entries.map(e=>e.canonicalInput)).toEqual(f.inputs)
  expect(log.entries.map(e=>e.serverSeq)).toEqual([3,5]);expect(log.entries.map(e=>e.op.seq)).toEqual([0,1]);expect(log.pixelOpDoneCount('layer')).toBe(2)
  expect(()=>log.prependHistorical(scratch.entries,log.revision)).toThrow(/journal changed/)
  expect(log.entries).toHaveLength(2)
 })
 it.each(['append','undo'] as const)('refuses a baseline after an original read callback reenters the real journal through %s',action=>{
  const log=new OperationLog();let armed=false
  const f=fixture(()=>{if(armed){armed=false;if(action==='append')log.append({type:'layer_clear',id:'live',userId:'peer',timestamp:1,layerId:'layer'});else log.applyUndo('missing','peer')}})
  const scratch=new OperationLog()
  for(const input of f.inputs)scratch.append(input.operation,{serverSeq:input.read!.sequence,canonicalInput:input})
  const revision=log.revision;armed=true
  expect(()=>log.prependHistorical(scratch.entries,revision)).toThrow(/journal changed/)
  expect(armed).toBe(false);expect(log.revision).toBe(revision+1)
  expect(log.entries.map(e=>e.op.id)).toEqual(action==='append'?['live']:[]);expect(log.pixelOpDoneCount('layer')).toBe(action==='append'?1:0)
 })
 it('rejects invalid or already stale captured revisions before publishing any history',()=>{
  const f=fixture(),log=new OperationLog(),scratch=new OperationLog()
  const input=f.inputs[0];scratch.append(input.operation,{serverSeq:input.read!.sequence,canonicalInput:input})
  for(const revision of [NaN,-1,.5,1])expect(()=>log.prependHistorical(scratch.entries,revision)).toThrow()
  expect(log.revision).toBe(0);expect(log.entries).toHaveLength(0)
 })
})


describe('late initial historical publication validator',()=>{
 it('checks candidate lifetime after every original delivery callback and preserves its exact rejection',()=>{
  const log=new OperationLog();let armed=false,current=true
  const f=fixture(()=>{if(armed)current=false}),scratch=new OperationLog()
  for(const input of f.inputs)scratch.append(input.operation,{serverSeq:input.read!.sequence,canonicalInput:input})
  const error=new Error('candidate layer/context replaced'),validate=vi.fn(()=>{if(!current)throw error;return undefined});armed=true
  expect(()=>log.prependHistorical(scratch.entries,0,validate)).toThrow(error)
  expect(validate).toHaveBeenCalledOnce();expect(current).toBe(false)
  expect(log.entries).toHaveLength(0);expect(log.revision).toBe(0);expect(log.pixelOpDoneCount('layer')).toBe(0)
 })
 it('compares the real journal again after the late validator returns',()=>{
  const f=fixture(),log=new OperationLog(),scratch=new OperationLog(),input=f.inputs[0]
  scratch.append(input.operation,{serverSeq:input.read!.sequence,canonicalInput:input})
  const validate=vi.fn(()=>{log.append({type:'layer_clear',id:'live',userId:'peer',timestamp:1,layerId:'layer'});return undefined})
  expect(()=>log.prependHistorical(scratch.entries,0,validate)).toThrow(/journal changed/)
  expect(validate).toHaveBeenCalledOnce();expect(log.entries.map(e=>e.op.id)).toEqual(['live']);expect(log.revision).toBe(1)
 })
 it('never executes a publication validator without an initial empty-journal precondition',()=>{
  const validate=vi.fn(),log=new OperationLog()
  expect(()=>log.prependHistorical([],undefined,validate)).toThrow()
  expect(validate).not.toHaveBeenCalled();expect(log.revision).toBe(0)
 })
})

it('rejects async and value-returning publication validators without inspecting thenables or publishing',()=>{
 const f=fixture(),log=new OperationLog(),scratch=new OperationLog(),input=f.inputs[0]
 scratch.append(input.operation,{serverSeq:input.read!.sequence,canonicalInput:input})
 const then=vi.fn(),opaque=Object.defineProperty({},'then',{get:then})
 // Exercise malformed JavaScript callers beyond the undefined-only TS contract.
 for(const validate of [async()=>undefined,()=>opaque,()=>7])expect(()=>Reflect.apply(log.prependHistorical,log,[scratch.entries,0,validate])).toThrow(/synchronous/)
 expect(then).not.toHaveBeenCalled();expect(log.entries).toHaveLength(0);expect(log.revision).toBe(0)
})
