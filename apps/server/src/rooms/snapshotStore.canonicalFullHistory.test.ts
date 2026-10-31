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
