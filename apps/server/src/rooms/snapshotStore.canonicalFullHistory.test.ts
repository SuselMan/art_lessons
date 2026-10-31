import {beforeEach,it,expect,vi} from 'vitest'
import type {CanonicalStrokeOperation} from '@grafetto/shared'
const db=vi.hoisted(()=>({operation:{findMany:vi.fn()}}))
vi.mock('../db/prisma.js',()=>({prisma:db}))
import {getCanonicalFullHistoryWithRows} from './snapshotStore.js'
import {canonicalOperationRowSelect} from './roomPersistence.js'
const op=(n:number):CanonicalStrokeOperation=>({id:'frame'+n,seq:n,userId:n%2?'A':'B',timestamp:0,type:'canonical_stroke',layerId:'L',frame:{version:1,rasterProfile:'installed-arm64-scalar-fused-fpcr0-v1',brush:'brush:test@1',strokeId:'S',frameOrdinal:0,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},materialPacked:'2|query-only evidence, decoded by owner'}})
const row=(data:CanonicalStrokeOperation)=>({id:data.id,seq:data.seq!,roomId:'room',userId:data.userId,type:data.type,layerId:data.layerId,tool:null,data})
beforeEach(()=>vi.clearAllMocks())
it('queries all global rows at one cut with terminal empty page, no filtered gesture repair',async()=>{
 const rows=Array.from({length:130},(_,i)=>row(op(i+1)))
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>r.seq>where.seq.gt&&r.seq<=where.seq.lte).slice(0,take))
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
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>r.seq>where.seq.gt&&r.seq<=where.seq.lte).slice(0,take))
 await expect(getCanonicalFullHistoryWithRows('room',count,async()=>{})).rejects.toThrow()
})

it('keeps the default frame-only contract closed while explicit mixed-v2 retains every ordered row',async()=>{
 const first=row(op(1)),close={type:'canonical_stroke_close' as const,id:'close',userId:'A',timestamp:1,seq:2,layerId:'L',targetUserId:'A',strokeId:'S',disposition:'commitPartial' as const,recordedNext:1,firstFrameOpId:first.id,lastFrameOpId:first.id}
 const undo={type:'operation_undo' as const,id:'undo',userId:'A',timestamp:2,seq:3,targetOpId:first.id}
 const redo={type:'operation_redo' as const,id:'redo',userId:'A',timestamp:3,seq:4,targetOpId:undo.id}
 const metadataRow=(data:typeof close|typeof undo|typeof redo)=>({id:data.id,seq:data.seq,roomId:'room',userId:data.userId,type:data.type,layerId:'layerId'in data?data.layerId:null,tool:null,data})
 const rows=[first,metadataRow(close),metadataRow(undo),metadataRow(redo)]
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>r.seq>where.seq.gt&&r.seq<=where.seq.lte).slice(0,take))
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
