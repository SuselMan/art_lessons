import {describe,it,expect,vi} from 'vitest'
import {buildCanonicalMaterial,canonicalDefaultAutoSourceBinding,CANONICAL_STROKE_RASTER_PROFILE,type BrushDescriptor,type CanonicalStrokeOperation,type ServerToClientEvents,type CanonicalStrokeSnapshotV2} from '@grafetto/shared'
import stock from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import {prepareCanonicalRoomState} from '../../../pages/Room/net/canonicalRoomState'
import type {CanonicalRecordedInput} from './CanonicalRecordedDelivery'
import {OperationLog} from './OperationLog'

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


describe('guarded original recorded append publication',()=>{
 it('publishes one original confirmed input after a single final synchronous hook',()=>{
  const {inputs:[a]}=fixture(),log=new OperationLog(),hook=vi.fn(()=>{expect(log.entries).toHaveLength(0);return undefined})
  expect(log.append(a.operation,{serverSeq:3,canonicalInput:a},hook)).toEqual([])
  expect(hook).toHaveBeenCalledTimes(1);expect(log.revision).toBe(1)
  expect(log.entries[0].canonicalInput).toBe(a);expect(log.entries[0].serverSeq).toBe(3)
  expect(log.entries[0].op.seq).toBe(0);expect(a.operation.seq).toBe(3)
 })
 it('checks a caller owner invalidated by the genuine origin callback',()=>{
  let action=()=>{},live=true;const {inputs:[a]}=fixture(()=>action()),log=new OperationLog()
  action=()=>{live=false}
  expect(()=>log.append(a.operation,{serverSeq:3,canonicalInput:a},()=>{if(!live)throw Error('Owner invalidated during origin');return undefined})).toThrow('Owner invalidated during origin')
  expect(log.entries).toHaveLength(0);expect(log.revision).toBe(0)
 })
 it('publishes captured placement and original proof despite caller placement changes in the hook',()=>{
  const {inputs:[a]}=fixture(),log=new OperationLog(),placement={serverSeq:3,canonicalInput:a}
  log.append(a.operation,placement,()=>{placement.serverSeq=999;return undefined})
  expect(log.entries[0].serverSeq).toBe(3);expect(log.entries[0].canonicalInput).toBe(a)
  if(a.operation.type!=='canonical_stroke')throw Error('Expected source frame')
  expect(log.entries[0].op).toMatchObject({frame:a.operation.frame})
 })
 it('refuses origin callback reentry while preserving the inner journal mutation',()=>{
  let action=()=>{};const {inputs:[a]}=fixture(()=>action()),log=new OperationLog(),hook=vi.fn(()=>undefined)
  action=()=>{action=()=>{};log.append(a.operation,{pending:true})}
  expect(()=>log.append(a.operation,{serverSeq:3,canonicalInput:a},hook)).toThrow(/journal/)
  expect(log.entries).toHaveLength(1);expect(log.entries[0].pending).toBe(true);expect(log.revision).toBe(1)
 })
 it('checks owner after origin callbacks and before publication',()=>{
  let live=true;const {inputs:[a]}=fixture(),log=new OperationLog(),hook=vi.fn(()=>{live=false;throw Error('Owner replaced')})
  expect(()=>log.append(a.operation,{serverSeq:3,canonicalInput:a},hook)).toThrow('Owner replaced')
  expect(live).toBe(false);expect(log.entries).toHaveLength(0);expect(log.revision).toBe(0)
 })
 it('refuses an already-undone journal without changing redo truth or counts',()=>{
  const {inputs:[a,b]}=fixture(),log=new OperationLog(),hook=vi.fn(()=>undefined)
  log.append(a.operation,{serverSeq:3,canonicalInput:a});log.applyUndo(a.operation.id,'author')
  const revision=log.revision,entries=log.entries
  expect(()=>log.append(b.operation,{serverSeq:5,canonicalInput:b},hook)).toThrow()
  expect(log.revision).toBe(revision);expect(log.entries).toBe(entries);expect(log.entries[0].state).toBe('undone')
  expect(log.pixelOpDoneCount('layer')).toBe(0);expect(hook).not.toHaveBeenCalled()
 })
 it('final CAS preserves an undo applied by the publication hook',()=>{
  const {inputs:[a,b]}=fixture(),log=new OperationLog();log.append(a.operation,{serverSeq:3,canonicalInput:a})
  expect(()=>log.append(b.operation,{serverSeq:5,canonicalInput:b},()=>{log.applyUndo(a.operation.id,'author');return undefined})).toThrow(/journal/)
  expect(log.entries).toHaveLength(1);expect(log.entries[0].state).toBe('undone');expect(log.pixelOpDoneCount('layer')).toBe(0)
 })
 it('rejects nonundefined hook results without inspecting then and before journal mutation',()=>{
  const {inputs:[a]}=fixture(),then=vi.fn(),opaque=Object.defineProperty({},'then',{get:then})
  for(const value of [1,opaque,Promise.resolve(undefined)]){
   const log=new OperationLog();expect(()=>Reflect.apply(log.append,log,[a.operation,{serverSeq:3,canonicalInput:a},()=>value])).toThrow(/undefined/)
   expect(log.revision).toBe(0);expect(log.entries).toHaveLength(0)
  }expect(then).not.toHaveBeenCalled()
 })
 it('refuses accessor placement and unsupported legacy/pending/non-end hook lanes',()=>{
  const {inputs:[a,b]}=fixture(),get=vi.fn(()=>3),hook=vi.fn(()=>undefined),log=new OperationLog()
  const accessor=Object.defineProperty({canonicalInput:a},'serverSeq',{get})
  expect(()=>Reflect.apply(log.append,log,[a.operation,accessor,hook])).toThrow();expect(get).not.toHaveBeenCalled()
  expect(()=>log.append({type:'layer_clear',id:'legacy-clear',userId:'author',timestamp:0,layerId:'layer'},{},hook)).toThrow()
  expect(()=>log.append(a.operation,{serverSeq:3},hook)).toThrow()
  expect(()=>log.append(a.operation,{pending:true},hook)).toThrow()
  log.append(b.operation,{serverSeq:5,canonicalInput:b});const revision=log.revision
  expect(()=>log.append(a.operation,{serverSeq:3,canonicalInput:a},hook)).toThrow()
  expect(log.revision).toBe(revision);expect(hook).not.toHaveBeenCalled()
 })
})
