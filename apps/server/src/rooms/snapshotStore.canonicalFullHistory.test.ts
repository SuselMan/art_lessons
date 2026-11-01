import {beforeEach,it,expect,vi} from 'vitest'
import type {CanonicalStrokeOperation} from '@grafetto/shared'
const db=vi.hoisted(()=>({$transaction:vi.fn(),operation:{findMany:vi.fn()},$queryRawUnsafe:vi.fn(),$executeRawUnsafe:vi.fn()}))
db.$transaction=vi.fn(async(run:(connection:typeof db)=>Promise<unknown>)=>run(db))
vi.mock('../db/prisma.js',()=>({prisma:db}))
import {getCanonicalFullHistoryWithRows,getCanonicalIndexedHistoryPageRows,validateCanonicalIndexedHistoryRows} from './snapshotStore.js'
import {prisma as typedMain} from '../db/prisma.js'
import {canonicalOperationRowSelect} from './roomPersistence.js'
const op=(n:number):CanonicalStrokeOperation=>({id:'frame'+n,seq:n,userId:n%2?'A':'B',timestamp:0,type:'canonical_stroke',layerId:'L',frame:{version:1,rasterProfile:'installed-arm64-scalar-fused-fpcr0-v1',brush:'brush:test@1',strokeId:'S',frameOrdinal:0,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},materialPacked:'2|query-only evidence, decoded by owner'}})
const row=(data:CanonicalStrokeOperation)=>({id:data.id,seq:data.seq!,roomId:'room',userId:data.userId,type:data.type,layerId:data.layerId,tool:null,data})
beforeEach(()=>vi.clearAllMocks())
function validationPortal(rows:ReturnType<typeof row>[],unreachable=false){
 let cursor=0
 db.$executeRawUnsafe.mockImplementation(async(sql:string)=>{if(sql.startsWith('DECLARE '))cursor=0;return 0})
 db.$queryRawUnsafe.mockImplementation(async(sql:string,...parameters:unknown[])=>{
  if(sql.startsWith('FETCH ')){const selected=rows.slice(cursor,cursor+64);cursor+=selected.length;return selected.map(r=>({id:r.id,seq:r.seq,type:r.type,bytes:Buffer.byteLength(JSON.stringify(r.data),'utf8')}))}
  if(sql.startsWith('SELECT id,seq,type,octet_length'))return rows.filter(r=>r.seq>(parameters[2] as number)&&r.seq<=(parameters[1] as number)).slice(0,64).map(r=>({id:r.id,seq:r.seq,type:r.type,bytes:Buffer.byteLength(JSON.stringify(r.data),'utf8')}))
  return unreachable?[{id:'unreachable-metadata'}]:[]
 })
}
it('queries all global rows at one cut with terminal empty page, no filtered gesture repair',async()=>{
 const rows=Array.from({length:130},(_,i)=>row(op(i+1)))
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>where.id?where.id.in.includes(r.id):r.seq>where.seq.gt&&r.seq<=where.seq.lte).slice(0,take))
 const check=vi.fn(async()=>{}),result=await getCanonicalFullHistoryWithRows('room',130,check)
 expect(result.operations).toHaveLength(130);expect(db.operation.findMany).toHaveBeenCalledTimes(4);expect(check).toHaveBeenCalledTimes(4)
 for(const [q]of db.operation.findMany.mock.calls)expect(q).toEqual({where:{roomId:'room',seq:{gt:expect.any(Number),lte:130}},orderBy:{seq:'asc'},take:64,select:canonicalOperationRowSelect})
})
it('requires an actual empty query even at cut zero',async()=>{
 db.operation.findMany.mockResolvedValue([]);const check=vi.fn(async()=>{})
 expect((await getCanonicalFullHistoryWithRows('room',0,check)).operations).toEqual([])
 expect(db.operation.findMany).toHaveBeenCalledTimes(1);expect(check).toHaveBeenCalledTimes(1)
})
it.each(['missing','order','identity','unsupported','V1'] as const)('rejects %s evidence without sorting or silently skipping writers',async kind=>{
 const rows=[row(op(1)),row(op(2))]
 if(kind==='missing')rows.shift();if(kind==='order')rows.reverse();if(kind==='identity')rows[0].userId='other'
 if(kind==='unsupported')Object.assign(rows[0],{type:'stroke'})
 if(kind==='V1')Object.assign(rows[0].data.frame,{materialPacked:'1|old'})
 db.operation.findMany.mockResolvedValueOnce(rows).mockResolvedValue([])
 await expect(getCanonicalFullHistoryWithRows('room',2,async()=>{})).rejects.toThrow()
})
it('rechecks current owner immediately after every DB await before retaining a row',async()=>{
 db.operation.findMany.mockResolvedValue([row(op(1))]);const primary=Error('stale')
 await expect(getCanonicalFullHistoryWithRows('room',1,async()=>{throw primary})).rejects.toBe(primary)
})
it.each(['operations','capabilities','bytes'] as const)('bounds aggregate %s before returning retained evidence',async kind=>{
 const count=kind==='operations'?1025:kind==='capabilities'?65:80
 const rows=Array.from({length:count},(_,i)=>{const data=op(i+1);if(kind==='capabilities')Object.assign(data.frame,{strokeId:'S'+i});if(kind==='bytes')Object.assign(data.frame,{materialPacked:'2|'+('x'.repeat(60000))});return row(data)})
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>where.id?where.id.in.includes(r.id):r.seq>where.seq.gt&&r.seq<=where.seq.lte).slice(0,take))
 await expect(getCanonicalFullHistoryWithRows('room',count,async()=>{})).rejects.toThrow()
})

it('keeps the default frame-only contract closed while explicit mixed-v2 retains every ordered row',async()=>{
 const first=row(op(1)),close={type:'canonical_stroke_close' as const,id:'close',userId:'A',timestamp:1,seq:2,layerId:'L',targetUserId:'A',strokeId:'S',disposition:'commitPartial' as const,recordedNext:1,firstFrameOpId:first.id,lastFrameOpId:first.id}
 const undo={type:'operation_undo' as const,id:'undo',userId:'A',timestamp:2,seq:3,targetOpId:first.id}
 const redo={type:'operation_redo' as const,id:'redo',userId:'A',timestamp:3,seq:4,targetOpId:undo.id}
 const metadataRow=(data:typeof close|typeof undo|typeof redo)=>({id:data.id,seq:data.seq,roomId:'room',userId:data.userId,type:data.type,layerId:'layerId'in data?data.layerId:null,tool:null,data})
 const rows=[first,metadataRow(close),metadataRow(undo),metadataRow(redo)]
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>where.id?where.id.in.includes(r.id):r.seq>where.seq.gt&&r.seq<=where.seq.lte).slice(0,take))
 await expect(getCanonicalFullHistoryWithRows('room',4,async()=>{})).rejects.toThrow()
 const result=await getCanonicalFullHistoryWithRows('room',4,async()=>{},'mixed-v2')
 expect(result.kind).toBe('mixed-canonical-history-v2');expect(result.operations.map(o=>o.type)).toEqual(['canonical_stroke','canonical_stroke_close','operation_undo','operation_redo'])
 expect(result.canonicalRows).toHaveLength(1);expect(result.orderedRows.map(r=>r.id)).toEqual(result.operations.map(o=>o.id))
 expect(Object.isFrozen(result.operations)).toBe(true);expect(result.operations.every(Object.isFrozen)).toBe(true)
 expect(result.orderedRows.every((r,i)=>r.data===result.operations[i])).toBe(true)
})
it.each(['gap','identity','unsupported'] as const)('refuses mixed-v2 %s without skipping or repairing global sequence',async kind=>{
 const data={type:'operation_undo' as const,id:'undo',userId:'A',timestamp:2,seq:2,targetOpId:'frame1'}
 const meta={id:data.id,seq:data.seq,roomId:'room',userId:data.userId,type:data.type as string,layerId:null,tool:null,data}
 if(kind==='gap')meta.seq=3
 if(kind==='identity')meta.userId='other'
 if(kind==='unsupported')meta.type='paper_dry'
 db.operation.findMany.mockResolvedValueOnce([row(op(1)),meta]).mockResolvedValue([])
 await expect(getCanonicalFullHistoryWithRows('room',kind==='gap'?3:2,async()=>{},'mixed-v2')).rejects.toThrow()
})


it('new indexed pages do not retain or cap the whole original range and require actual empty terminal',async()=>{
 const rows=Array.from({length:2300},(_,i)=>row(op(i+1)))
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>where.id?where.id.in.includes(r.id):r.seq>where.seq.gt&&r.seq<=where.seq.lte).slice(0,take))
 validationPortal(rows)
 const check=vi.fn(async()=>{});let cursor=0,total=0,maxRetained=0
 while(true){const page=await getCanonicalIndexedHistoryPageRows('room',2300,cursor,check);maxRetained=Math.max(maxRetained,page.operations.length);total+=page.operations.length;cursor=page.nextAfterSeq;if(page.terminal){expect(page.operations).toEqual([]);break}}
 expect(total).toBe(2300);expect(cursor).toBe(2300);expect(maxRetained).toBe(64)
 expect(check).toHaveBeenCalledTimes(73)
})
it('indexed dense validation consumes root summaries without collecting all frames or accepting missing roots',async()=>{
 const rows=Array.from({length:140},(_,i)=>{const frame=op(i+1);Object.assign(frame.frame,{strokeId:'S'+i});return row(frame)})
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>where.id?where.id.in.includes(r.id):r.seq>where.seq.gt&&r.seq<=where.seq.lte).slice(0,take))
 validationPortal(rows)
 const visit=vi.fn(async()=>({recordedNext:1,closed:false}))
 const result=await validateCanonicalIndexedHistoryRows('room',140,async()=>{},visit)
 expect(result).toEqual({throughSeq:140,operationCount:140,frameCount:140,metadataCount:0,closeCount:0,gestureCount:140})
 expect(visit).toHaveBeenCalledTimes(140)
 expect(db.$executeRawUnsafe.mock.calls[0][0]).toContain('NO SCROLL CURSOR WITHOUT HOLD')
 expect(db.$executeRawUnsafe.mock.calls[0].slice(1)).toEqual(['room',140])
 expect(db.$executeRawUnsafe.mock.calls.some(([sql])=>sql==='CLOSE canonical_indexed_validation')).toBe(true)
 await expect(validateCanonicalIndexedHistoryRows('room',140,async()=>{},async()=>({recordedNext:0,closed:false}))).rejects.toThrow()
})
it('indexed metadata completeness failure and stale terminal cannot produce a validation summary',async()=>{
 db.operation.findMany.mockResolvedValue([]);validationPortal([],true)
 await expect(validateCanonicalIndexedHistoryRows('room',0,async()=>{},async()=>({recordedNext:0,closed:false}))).rejects.toThrow()
 db.$queryRawUnsafe.mockResolvedValue([])
 const stale=Error('permission revoked')
 await expect(getCanonicalIndexedHistoryPageRows('room',0,0,async()=>{throw stale})).rejects.toBe(stale)
})

it('closes the validation portal on a revoked fetch before returning any summary',async()=>{
 validationPortal([row(op(1))]);db.operation.findMany.mockResolvedValue([])
 const revoked=Error('revoked after actual FETCH'),afterRead=vi.fn(async()=>{if(afterRead.mock.calls.length===2)throw revoked})
 await expect(validateCanonicalIndexedHistoryRows('room',1,afterRead,async()=>({recordedNext:1,closed:false}))).rejects.toBe(revoked)
 expect(db.$executeRawUnsafe.mock.calls.some(([sql])=>sql==='CLOSE canonical_indexed_validation')).toBe(true)
})

it('rejects a first oversized uncompressed JSON scalar before any operation body query',async()=>{
 db.operation.findMany.mockClear()
 db.$queryRawUnsafe.mockResolvedValue([{id:'oversize-compressible',seq:1,type:'canonical_stroke',bytes:4*1024*1024+1}])
 await expect(getCanonicalIndexedHistoryPageRows('room',1,0,async()=>{})).rejects.toThrow()
 expect(db.operation.findMany).not.toHaveBeenCalled()
 expect(db.$queryRawUnsafe.mock.calls[0][0]).toContain('octet_length(data::text)')
 expect(db.$queryRawUnsafe.mock.calls[0][0]).not.toContain('pg_column_size')
})


it('releases each limited main transaction before fresh authorization and preserves the original query error',async()=>{
 let held=false
 db.$transaction.mockImplementation(async run=>{expect(held).toBe(false);held=true;try{return await run(db)}finally{held=false}})
 db.$queryRawUnsafe.mockResolvedValue([])
 const auth=vi.fn(async()=>{expect(held).toBe(false);await db.$queryRawUnsafe('SELECT fresh_permission_after_release')})
 expect(await getCanonicalIndexedHistoryPageRows('room',0,0,auth)).toMatchObject({terminal:true,nextAfterSeq:0})
 expect(auth).toHaveBeenCalledTimes(1)
 expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{maxWait:1000,timeout:20000})
 expect(db.$executeRawUnsafe.mock.calls.map(([sql])=>sql)).toEqual(expect.arrayContaining(["SET LOCAL statement_timeout='15s'","SET LOCAL lock_timeout='1s'","SET LOCAL work_mem='4MB'","SET LOCAL temp_file_limit='64MB'"]))
 const primary=Error('original SQL failure');db.$queryRawUnsafe.mockRejectedValueOnce(primary);auth.mockClear()
 await expect(getCanonicalIndexedHistoryPageRows('room',0,0,auth)).rejects.toBe(primary)
 expect(held).toBe(false);expect(auth).not.toHaveBeenCalled()
})
it('does not nest main transactions or rewrite limits on the existing validation transaction',async()=>{
 db.$transaction.mockClear();db.$executeRawUnsafe.mockClear();db.$queryRawUnsafe.mockResolvedValue([])
 const validation={operation:typedMain.operation,$queryRawUnsafe:typedMain.$queryRawUnsafe,$executeRawUnsafe:typedMain.$executeRawUnsafe}
 expect(await getCanonicalIndexedHistoryPageRows('room',0,0,async()=>{},validation)).toMatchObject({terminal:true})
 expect(db.$transaction).not.toHaveBeenCalled();expect(db.$executeRawUnsafe).not.toHaveBeenCalled()
})
