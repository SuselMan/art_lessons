import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CANONICAL_MATERIAL_PROFILE, CANONICAL_STROKE_RASTER_PROFILE,verifyCanonicalRecordedClose,verifyCanonicalRecordedPrefix, packCanonicalMaterial, type CanonicalStrokeOperation, type Operation } from '@grafetto/shared'
const db=vi.hoisted(()=>({operation:{create:vi.fn(),findUnique:vi.fn()}}))
vi.mock('../db/prisma.js',()=>({prisma:db}))
import { adoptLoadedCanonicalWrites, canonicalWriteFence, ensureCanonicalWrite, knownCanonicalWrite, recordCanonicalCloseOperation,recordCanonicalMetadataOperation,recordOperation,retireSucceededCanonicalOperation } from './operationLog.js'
import { rooms, flushRoomWrites, type RoomRecord } from './roomRegistry.js'
import { CanonicalStrokeAdmission, type TrustedCanonicalGesture } from './CanonicalStrokeAdmission.js'
const asset={id:`asset:${'1'.repeat(64)}`,size:1,x:0,y:0,width:1,height:1}
const material={assets:[asset],primaryAsset:asset.id,budget:{workUnits:100,outputBytes:100,drawPixels:100},preflightDefinition:()=>({workUnits:1,outputBytes:1})}
function candidate(id='op'):CanonicalStrokeOperation{return{type:'canonical_stroke',id,userId:'author',timestamp:0,layerId:'layer',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:'brush:fixture@1',strokeId:'gesture',frameOrdinal:0,pigmentRgb8:[20,70,190],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:.73,outerBlend:'over'},materialPacked:packCanonicalMaterial({profile:CANONICAL_MATERIAL_PROFILE,masked:false,entry:{phase:'between'},definitions:[],draws:[],fences:[]},material)}}}
function resident(id='room'):RoomRecord{
  // These are the actual fields used by the log/receipt owner; no policy grant.
  const record={room:{id},nextSeq:1,operations:[],operationsById:new Map()} as unknown as RoomRecord
  rooms.set(id,record);return record
}
function deferred<T>(){let resolve!:(v:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
const stored=(roomId:string,op:Operation)=>({id:op.id,roomId,userId:op.userId,seq:op.seq!,type:op.type,layerId:'layerId'in op?(op.layerId??null):null,tool:null,data:structuredClone(op)})
beforeEach(()=>{db.operation.create.mockReset().mockResolvedValue({});db.operation.findUnique.mockReset().mockResolvedValue(null)})
afterEach(async()=>{for(const id of rooms.keys())await flushRoomWrites(id);rooms.clear();vi.restoreAllMocks()})

describe('actual-object canonical write receipts (no transport activation)',()=>{
  it('returns the appended object synchronously and tracks a deferred write without changing queue order',async()=>{
    const r=resident(),write=deferred<void>(),order:string[]=[]
    db.operation.create.mockImplementationOnce(()=>{order.push('canonical');return write.promise}).mockImplementationOnce(async()=>{order.push('legacy');return{}})
    const rgb:[number,number,number]=[20,70,190],base=candidate(),input={...base,frame:{...base.frame,pigmentRgb8:rgb}},op=recordOperation('room',input),receipt=knownCanonicalWrite(op)!
    expect(op).toBe(r.operationsById.get(op.id));expect(r.operations).toEqual([op]);expect(op.seq).toBe(1)
    expect(receipt.status).toBe('pending');expect(canonicalWriteFence(r)).toEqual({pending:1,failed:0})
    expect(ensureCanonicalWrite(r,op)).toBe(receipt.outcome)
    const legacy:Operation={id:'legacy',userId:'author',timestamp:1,type:'layer_clear',layerId:'layer'}
    const old=recordOperation('room',legacy);expect(old.seq).toBe(2);expect(knownCanonicalWrite(old)).toBeUndefined()
    await Promise.resolve();expect(order).toEqual(['canonical'])
    // Small copied header protects the queued immutable row from caller edits.
    rgb[0]=99
    expect(op.type==='canonical_stroke'&&op.frame.pigmentRgb8[0]).toBe(20)
    expect(Object.isFrozen(op)).toBe(true)
    write.resolve();expect(await receipt.outcome).toEqual({ok:true,value:undefined})
    await flushRoomWrites('room');expect(order).toEqual(['canonical','legacy'])
    expect(canonicalWriteFence(r)).toEqual({pending:0,failed:0})
    expect(knownCanonicalWrite(op)!.status).toBe('succeeded')
  })
  it('failure after actual admission seal remains failed after queue drain; explicit repair coalesces without new seq',async()=>{
    const log=vi.spyOn(console,'error').mockImplementation(()=>{}),r=resident(),write=deferred<void>()
    db.operation.create.mockReturnValueOnce(write.promise)
    const input=candidate(),grant:TrustedCanonicalGesture={roomId:'room',userId:'author',layerId:'layer',boardEpoch:1,roomRasterVersion:'straight-rgba8-v1',rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,descriptorSha256:'2'.repeat(64),brush:input.frame.brush,strokeId:input.frame.strokeId,pigmentRgb8:input.frame.pigmentRgb8,composition:input.frame.composition,material}
    const admission=new CanonicalStrokeAdmission({maxGestures:1,retainedFrames:8,resolve:()=>grant}),ticket=admission.prepare({roomId:'room',userId:'author'},{type:'canonical_stroke',id:input.id,layerId:'layer',frame:input.frame})
    const op=recordOperation('room',input);ticket.commit()
    expect(admission.cursor(grant,'gesture').recordedNext).toBe(1)
    write.reject(new Error('DB rejected after seal'))
    expect(await knownCanonicalWrite(op)!.outcome).toMatchObject({ok:false})
    await flushRoomWrites('room');expect(canonicalWriteFence(r)).toEqual({pending:0,failed:1})
    const before=db.operation.create.mock.calls.length
    expect(await ensureCanonicalWrite(r,op)).toMatchObject({ok:false});expect(db.operation.create).toHaveBeenCalledTimes(before)
    const repaired=deferred<void>();db.operation.create.mockReturnValueOnce(repaired.promise)
    const a=ensureCanonicalWrite(r,op,{retryFailed:true}),b=ensureCanonicalWrite(r,op,{retryFailed:true})
    expect(a).toBe(b);expect(canonicalWriteFence(r)).toEqual({pending:1,failed:0})
    await vi.waitFor(()=>expect(db.operation.create).toHaveBeenCalledTimes(before+1))
    expect(r.nextSeq).toBe(2);expect(r.operations).toEqual([op]);expect(admission.cursor(grant,'gesture').recordedNext).toBe(1)
    repaired.resolve();expect(await a).toEqual({ok:true,value:undefined});await flushRoomWrites('room')
    expect(canonicalWriteFence(r)).toEqual({pending:0,failed:0})
    expect(await ensureCanonicalWrite(r,op,{retryFailed:true})).toEqual({ok:true,value:undefined})
    expect(db.operation.create).toHaveBeenCalledTimes(before+1);log.mockRestore()
  })
  it('repairs an uncertain response by verifying the full existing row, not creating again',async()=>{
    const log=vi.spyOn(console,'error').mockImplementation(()=>{}),r=resident()
    db.operation.create.mockRejectedValueOnce(new Error('reply lost after commit'))
    const op=recordOperation('room',candidate());await knownCanonicalWrite(op)!.outcome
    db.operation.findUnique.mockResolvedValueOnce(stored('room',op))
    expect(await ensureCanonicalWrite(r,op,{retryFailed:true})).toEqual({ok:true,value:undefined})
    expect(db.operation.create).toHaveBeenCalledTimes(1);expect(op.seq).toBe(1);log.mockRestore()
  })
  it('an independent later success does not erase an earlier failed fence',async()=>{
    const log=vi.spyOn(console,'error').mockImplementation(()=>{}),r=resident()
    db.operation.create.mockRejectedValueOnce(new Error('seq1 failed'))
    const a=recordOperation('room',candidate('a')),b=recordOperation('room',candidate('b'))
    expect(await knownCanonicalWrite(a)!.outcome).toMatchObject({ok:false})
    expect(await knownCanonicalWrite(b)!.outcome).toEqual({ok:true,value:undefined})
    await flushRoomWrites('room');expect(canonicalWriteFence(r)).toEqual({pending:0,failed:1});log.mockRestore()
  })
  it('rejects equal copies, untracked objects and stale owners before repair I/O',async()=>{
    const r=resident(),op=recordOperation('room',candidate());await knownCanonicalWrite(op)!.outcome
    expect(knownCanonicalWrite(structuredClone(op))).toBeUndefined()
    expect(()=>ensureCanonicalWrite(r,structuredClone(op),{retryFailed:true})).toThrow(/stale/)
    const unknown=candidate('untracked');r.operationsById.set(unknown.id,unknown)
    expect(()=>ensureCanonicalWrite(r,unknown)).toThrow(/unknown/)
    const replacement=resident();replacement.operationsById.set(op.id,op)
    expect(()=>ensureCanonicalWrite(r,op,{retryFailed:true})).toThrow(/stale/)
    expect(()=>ensureCanonicalWrite(replacement,op,{retryFailed:true})).toThrow(/stale/)
    expect(db.operation.findUnique).not.toHaveBeenCalled();expect(db.operation.create).toHaveBeenCalledTimes(1)
  })
  it('old completion updates only its small owner counters after room replacement',async()=>{
    const old=resident(),first=deferred<void>();db.operation.create.mockReturnValueOnce(first.promise)
    const oldOp=recordOperation('room',candidate('old')),current=resident()
    expect(canonicalWriteFence(current)).toEqual({pending:0,failed:0})
    const newOp=recordOperation('room',candidate('new'))
    expect(canonicalWriteFence(old)).toEqual({pending:1,failed:0});expect(canonicalWriteFence(current)).toEqual({pending:1,failed:0})
    first.resolve();await knownCanonicalWrite(oldOp)!.outcome;await knownCanonicalWrite(newOp)!.outcome
    expect(canonicalWriteFence(old)).toEqual({pending:0,failed:0});expect(canonicalWriteFence(current)).toEqual({pending:0,failed:0})
    expect(()=>ensureCanonicalWrite(old,oldOp)).toThrow(/stale/)
  })
})


describe('verified loader provenance',()=>{
  function loaded(r:RoomRecord,id='loaded') { const op={...candidate(id),seq:1};r.operations.push(op);r.operationsById.set(id,op);return op }
  it('adopts only actual indexed DB objects, without scheduling a write or claiming completeness',async()=>{
    const r=resident(),op=loaded(r),row={...stored('room',op),data:op}
    adoptLoadedCanonicalWrites(r,[row])
    expect(knownCanonicalWrite(op)?.status).toBe('succeeded')
    expect(await ensureCanonicalWrite(r,op)).toEqual({ok:true,value:undefined})
    expect(knownCanonicalWrite(structuredClone(op))).toBeUndefined()
    expect(db.operation.create).not.toHaveBeenCalled();expect(db.operation.findUnique).not.toHaveBeenCalled()
  })
  it('rejects equal copies, stale owners and malformed rows atomically',()=>{
    const r=resident(),a=loaded(r,'a'),b=loaded(r,'b'),ra={...stored('room',a),data:a},rb={...stored('room',b),data:b}
    expect(()=>adoptLoadedCanonicalWrites(r,[ra,{...rb,seq:99}])).toThrow('conflict')
    expect(knownCanonicalWrite(a)).toBeUndefined();expect(knownCanonicalWrite(b)).toBeUndefined()
    expect(()=>adoptLoadedCanonicalWrites(r,[stored('room',a)])).toThrow('actual object')
    resident('room');expect(()=>adoptLoadedCanonicalWrites(r,[ra])).toThrow('stale owner')
  })
  it('never converts a pending or failed attempt into loaded success',async()=>{
    const r=resident(),gate=deferred<void>();db.operation.create.mockReturnValueOnce(gate.promise)
    const op=recordOperation('room',candidate()),row={...stored('room',op),data:op}
    expect(()=>adoptLoadedCanonicalWrites(r,[row])).toThrow('already has')
    expect(knownCanonicalWrite(op)?.status).toBe('pending')
    const log=vi.spyOn(console,'error').mockImplementation(()=>{});gate.reject(new Error('offline'));await flushRoomWrites('room')
    expect(()=>adoptLoadedCanonicalWrites(r,[row])).toThrow('already has')
    expect(knownCanonicalWrite(op)?.status).toBe('failed');expect(canonicalWriteFence(r)).toEqual({pending:0,failed:1});log.mockRestore()
  })
})

it('tracks only explicit immutable canonical metadata through SAME receipt owner and queue',async()=>{
 const r=resident(),write=deferred<void>(),input={type:'operation_undo' as const,id:'undo-meta',userId:'author',timestamp:1,targetOpId:'frame'}
 db.operation.create.mockReturnValueOnce(write.promise)
 const op=recordCanonicalMetadataOperation('room',input),receipt=knownCanonicalWrite(op)!
 input.targetOpId='mutated'
 expect(Object.isFrozen(op)).toBe(true);expect(op.targetOpId).toBe('frame');expect(op.seq).toBe(1)
 expect(receipt.status).toBe('pending');expect(canonicalWriteFence(r)).toEqual({pending:1,failed:0})
 expect(()=>ensureCanonicalWrite(r,{...op})).toThrow('unknown or stale')
 const legacy=recordOperation('room',{...input,id:'legacy-undo'})
 expect(knownCanonicalWrite(legacy)).toBeUndefined()
 write.resolve();expect(await ensureCanonicalWrite(r,op)).toEqual({ok:true,value:undefined})
 await flushRoomWrites('room');expect(db.operation.create.mock.calls.map(([request])=>request.data.id)).toEqual(['undo-meta','legacy-undo'])
 rooms.set('room',{...r});expect(()=>ensureCanonicalWrite(r,op)).toThrow('unknown or stale')
})

function closeDraft(){return{type:'canonical_stroke_close' as const,id:'close-meta',userId:'owner',timestamp:9,layerId:'layer',targetUserId:'author',strokeId:'gesture',disposition:'commitPartial' as const,recordedNext:1,firstFrameOpId:'frame-0',lastFrameOpId:'frame-0'}}
it('stamps an immutable internal close with current server seq and SAME receipt, without accepting caller seq',async()=>{
 const r=resident(),write=deferred<void>();db.operation.create.mockReturnValueOnce(write.promise)
 const draft=closeDraft(),op=recordCanonicalCloseOperation('room',draft)
 draft.targetUserId='changed';expect(op.targetUserId).toBe('author');expect(op.seq).toBe(1);expect(Object.isFrozen(op)).toBe(true)
 expect(knownCanonicalWrite(op)?.status).toBe('pending');expect(canonicalWriteFence(r)).toEqual({pending:1,failed:0})
 const forged={...closeDraft(),id:'caller-seq',seq:99}
 expect(()=>recordCanonicalCloseOperation('room',forged)).toThrow()
 expect(r.nextSeq).toBe(2);expect(r.operations).toEqual([op])
 write.resolve();expect(await ensureCanonicalWrite(r,op)).toEqual({ok:true,value:undefined})
 expect(()=>ensureCanonicalWrite(r,{...op})).toThrow('unknown or stale')
})
it('keeps failed close sealed and repairs one exact immutable row without seq2',async()=>{
 const r=resident(),write=deferred<void>(),log=vi.spyOn(console,'error').mockImplementation(()=>{})
 const frame=candidate('frame-0'),grant:TrustedCanonicalGesture={roomId:'room',userId:'author',layerId:'layer',boardEpoch:0,roomRasterVersion:'straight-rgba8-v1',rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,descriptorSha256:'2'.repeat(64),brush:frame.frame.brush,strokeId:frame.frame.strokeId,pigmentRgb8:frame.frame.pigmentRgb8,composition:frame.frame.composition,material}
 const admission=new CanonicalStrokeAdmission({resolve:()=>grant,maxGestures:1,retainedFrames:8}),prepared=admission.prepare(grant,{type:'canonical_stroke',id:frame.id,layerId:frame.layerId,frame:frame.frame})
 const recorded=recordOperation('room',frame);prepared.commit();expect(await ensureCanonicalWrite(r,recorded)).toMatchObject({ok:true})
 const summary=verifyCanonicalRecordedPrefix([{operationId:recorded.id,sequence:recorded.seq!,frameOrdinal:0,decoded:prepared.value.decoded}])
 const seal=verifyCanonicalRecordedClose(summary,{userId:'author',layerId:'layer',strokeId:'gesture'},{...closeDraft(),seq:r.nextSeq})
 const closing=admission.prepareRecordedClose(grant,'gesture',seal)
 db.operation.create.mockReturnValueOnce(write.promise)
 const op=recordCanonicalCloseOperation('room',closeDraft()),next=r.nextSeq;closing.commit()
 write.reject(new Error('close write failed'));expect(await ensureCanonicalWrite(r,op)).toMatchObject({ok:false})
 expect(admission.cursor(grant,'gesture')).toMatchObject({recordedNext:1,ended:true})
 await flushRoomWrites('room');expect(canonicalWriteFence(r)).toEqual({pending:0,failed:1})
 const repair=deferred<void>();db.operation.create.mockReturnValueOnce(repair.promise)
 const a=ensureCanonicalWrite(r,op,{retryFailed:true}),b=ensureCanonicalWrite(r,op,{retryFailed:true});expect(a).toBe(b)
 repair.resolve();expect(await a).toEqual({ok:true,value:undefined})
 expect(r.nextSeq).toBe(next);expect(r.operations).toEqual([recorded,op]);expect(canonicalWriteFence(r)).toEqual({pending:0,failed:0})
 expect(admission.cursor(grant,'gesture')).toMatchObject({recordedNext:1,ended:true})
 expect(db.operation.create).toHaveBeenCalledTimes(3);log.mockRestore()
})
it('rejects hidden/symbol/accessor close draft fields before seq/receipt mutation',()=>{
 const r=resident();let reads=0
 const hidden=Object.defineProperty(closeDraft(),'extra',{value:true,enumerable:false})
 const symbol={...closeDraft(),[Symbol('extra')]:true}
 const accessor=Object.defineProperty(closeDraft(),'layerId',{get(){reads++;return 'layer'},enumerable:true})
 for(const draft of [hidden,symbol,accessor])expect(()=>recordCanonicalCloseOperation('room',draft)).toThrow()
 expect(reads).toBe(0);expect(r.nextSeq).toBe(1);expect(r.operations).toEqual([])
 expect(canonicalWriteFence(r)).toEqual({pending:0,failed:0});expect(db.operation.create).not.toHaveBeenCalled()
})

it('bounds close draft own-key count before cloning property descriptors',()=>{
 const r=resident(),draft=Object.assign(closeDraft(),Object.fromEntries(Array.from({length:1000},(_,i)=>['extra-'+i,i])))
 const inspect=vi.spyOn(Object,'getOwnPropertyDescriptors')
 let rejected=false,calls=0
 try{try{recordCanonicalCloseOperation('room',draft)}catch{rejected=true}calls=inspect.mock.calls.length}finally{inspect.mockRestore()}
 expect(rejected).toBe(true);expect(calls).toBe(0);expect(r.nextSeq).toBe(1);expect(r.operations).toEqual([])
 expect(canonicalWriteFence(r)).toEqual({pending:0,failed:0})
})


it('indexed residency retires only the exact succeeded actual write, never pending or failed repair truth',async()=>{
 const r=resident(),write=deferred<void>();r.canonicalHistoryResidency='indexed-v1'
 db.operation.create.mockImplementationOnce(()=>write.promise)
 const op=recordOperation('room',candidate('indexed-retire'))
 expect(retireSucceededCanonicalOperation(r,op)).toBe(false)
 expect(r.operationsById.get(op.id)).toBe(op)
 write.resolve();await ensureCanonicalWrite(r,op)
 expect(retireSucceededCanonicalOperation(r,{...op})).toBe(false)
 expect(retireSucceededCanonicalOperation(r,op)).toBe(true)
 expect(r.operations).toEqual([]);expect(r.operationsById.size).toBe(0);expect(r.nextSeq).toBe(2)
 expect(()=>ensureCanonicalWrite(r,op)).toThrow('unknown or stale')
 const report=vi.spyOn(console,'error').mockImplementation(()=>{})
 db.operation.create.mockRejectedValueOnce(Error('durable failure'))
 const failed=recordOperation('room',candidate('indexed-failed'));await ensureCanonicalWrite(r,failed)
 expect(retireSucceededCanonicalOperation(r,failed)).toBe(false)
 expect(r.operationsById.get(failed.id)).toBe(failed)
 expect(canonicalWriteFence(r).failed).toBe(1);report.mockRestore()
})
it('indexed closed residency refuses direct legacy placement before consuming a sequence',()=>{
 const r=resident();r.canonicalHistoryResidency='indexed-v1'
 expect(()=>recordOperation('room',{type:'layer_clear',id:'bad',userId:'author',timestamp:0,layerId:'layer'})).toThrow('Indexed closed format')
 expect(r.nextSeq).toBe(1);expect(r.operationsById.size).toBe(0)
})
