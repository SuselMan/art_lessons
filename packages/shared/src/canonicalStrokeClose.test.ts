import {describe,it,expect} from 'vitest'
import {parseCanonicalStrokeCloseOperation,parseCanonicalStrokeCloseRequest,verifyCanonicalRecordedClose} from './canonicalStrokeClose.js'
import {verifyCanonicalRecordedPrefix} from './canonicalRecordedPrefix.js'
const request={operationId:'close',layerId:'layer',targetUserId:'author',strokeId:'gesture',disposition:'commitPartial' as const,expectedRecordedNext:2,expectedLastFrameOpId:'last'}
const operation={type:'canonical_stroke_close' as const,id:'close',userId:'owner',timestamp:10,seq:8,layerId:'layer',targetUserId:'author',strokeId:'gesture',disposition:'commitPartial' as const,recordedNext:2,firstFrameOpId:'first',lastFrameOpId:'last'}
const identity={userId:'author',layerId:'layer',strokeId:'gesture'}
const prefix=()=>verifyCanonicalRecordedPrefix([
 {operationId:'first',sequence:1,frameOrdinal:0,decoded:{entry:{phase:'between'},fences:[]}},
 {operationId:'last',sequence:6,frameOrdinal:1,decoded:{entry:{phase:'between'},fences:[]}},
])
describe('closed explicit canonical metadata (no authority)',()=>{
 it('copies immutable bounded request and recorded operation; actor and target are distinct',()=>{
  const input={...request},op={...operation},captured=parseCanonicalStrokeCloseRequest(input),recorded=parseCanonicalStrokeCloseOperation(op)
  input.targetUserId='changed';op.targetUserId='changed'
  expect(captured).toEqual(request);expect(recorded).toEqual(operation)
  expect(Object.isFrozen(captured)).toBe(true);expect(Object.isFrozen(recorded)).toBe(true)
  expect(recorded.userId).toBe('owner');expect(recorded.targetUserId).toBe('author')
 })
 it.each(['userId','timestamp','seq','boardEpoch','descriptorSha256','rasterProfile','pigmentRgb8','materialPacked','extra'])('rejects unexpected request field %s before copy',key=>{
  expect(()=>parseCanonicalStrokeCloseRequest({...request,[key]:'x'.repeat(1000000)})).toThrow()
 })
 it.each([undefined,null,[],{}, {...request,disposition:'discard'},{...request,expectedRecordedNext:0},{...request,expectedRecordedNext:Number.MAX_SAFE_INTEGER},{...request,operationId:'x'.repeat(257)},{...request,strokeId:'bad\0id'}])('rejects malformed request %#',value=>{
  expect(()=>parseCanonicalStrokeCloseRequest(value)).toThrow()
 })
 it('requires a recorded positive seq, exact own fields and finite timestamp',()=>{
  const {seq:_,...unrecorded}=operation
  for(const value of [unrecorded,{...operation,seq:0},{...operation,seq:NaN},{...operation,timestamp:Infinity},{...operation,timestamp:-1},{...operation,recordedNext:0},{...operation,extra:[]},{...operation,frame:{}},{...operation,firstFrameOpId:''},{...operation,targetUserId:'x'.repeat(257)}])expect(()=>parseCanonicalStrokeCloseOperation(value)).toThrow()
  const inherited=Object.assign(Object.create({layerId:'layer'}),operation);delete inherited.layerId
  expect(()=>parseCanonicalStrokeCloseOperation(inherited)).toThrow()
 })
 it('verifies explicit seal for an open decoded prefix without inventing material fences or author frame',()=>{
  const original=prefix(),seal=verifyCanonicalRecordedClose(original,identity,operation)
  expect(seal).toEqual({kind:'commitPartial',closeOperationId:'close',closeSeq:8,recordedNext:2,firstOperationId:'first',lastOperationId:'last',firstSeq:1,lastSeq:6})
  expect(Object.isFrozen(seal)).toBe(true);expect(original.ended).toBe(false);expect(original.nextOrdinal).toBe(2)
 })
 it('retains normal gestureEnd separately and rejects mismatched prefix/context/order',()=>{
  const original=prefix()
  for(const patch of [{recordedNext:1},{firstFrameOpId:'other'},{lastFrameOpId:'other'},{targetUserId:'other'},{layerId:'other'},{strokeId:'other'},{seq:6},{id:'first'},{id:'last'}])expect(()=>verifyCanonicalRecordedClose(original,identity,{...operation,...patch})).toThrow()
  expect(()=>verifyCanonicalRecordedClose({...original,ended:true,endSeq:6},identity,operation)).toThrow()
  expect(()=>verifyCanonicalRecordedClose({...original,recordedNext:0,nextOrdinal:0},identity,operation)).toThrow()
 })
 it('supports a single recorded frame seal and legal long-prefix cuts without a32frame cap',()=>{
  const records=Array.from({length:206},(_,i)=>({operationId:'frame-'+i,sequence:i+1,frameOrdinal:i,decoded:{entry:{phase:'between' as const},fences:[]}}))
  const long=verifyCanonicalRecordedPrefix(records)
  expect(verifyCanonicalRecordedClose(long,identity,{...operation,recordedNext:206,firstFrameOpId:'frame-0',lastFrameOpId:'frame-205',seq:207}).recordedNext).toBe(206)
  const single=verifyCanonicalRecordedPrefix(records.slice(0,1))
  expect(verifyCanonicalRecordedClose(single,identity,{...operation,recordedNext:1,firstFrameOpId:'frame-0',lastFrameOpId:'frame-0',seq:2}).recordedNext).toBe(1)
 })
})

it('rejects symbol/nonenumerable extras and accessors without invoking them',()=>{
 for(const parse of [parseCanonicalStrokeCloseRequest,parseCanonicalStrokeCloseOperation]){
  const base=parse===parseCanonicalStrokeCloseRequest?request:operation
  const symbolic={...base,[Symbol('extra')]:'not JSON'}
  const hidden=Object.defineProperty({...base},'extra',{value:'hidden',enumerable:false})
  let reads=0
  const accessor=Object.defineProperty({...base},'layerId',{get(){reads++;return 'layer'},enumerable:true})
  for(const value of [symbolic,hidden,accessor])expect(()=>parse(value)).toThrow()
  expect(reads).toBe(0)
 }
})
