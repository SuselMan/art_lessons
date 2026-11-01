import {beforeEach,expect,it,vi} from 'vitest'
import type {CanonicalStrokeOperation} from '@grafetto/shared'
const db=vi.hoisted(()=>({operation:{findMany:vi.fn()}}))
vi.mock('../db/prisma.js',()=>({prisma:db}))
import {getCanonicalGesturePrefixWithRows,CANONICAL_GESTURE_PREFIX_BYTES} from './snapshotStore.js'
import {canonicalOperationRowSelect} from './roomPersistence.js'
const selector={userId:'author',strokeId:'S'}
function operation(n:number):CanonicalStrokeOperation{return{id:'frame'+n,seq:2*n+1,userId:'author',timestamp:n,type:'canonical_stroke',layerId:'L',frame:{version:1,rasterProfile:'installed-arm64-scalar-fused-fpcr0-v1',brush:'brush:test@1',strokeId:'S',frameOrdinal:n,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},materialPacked:'opaque query evidence, decoded later under fixed binding'}}}
const indexed=(data:CanonicalStrokeOperation)=>({id:data.id,seq:data.seq!,roomId:'room',userId:data.userId,type:data.type,layerId:data.layerId,tool:null,data})
beforeEach(()=>vi.clearAllMocks())
it('pages exact indexed target at one captured cut without imposing a32-frame cap or sorting returned evidence',async()=>{
 const operations=Array.from({length:202},(_,n)=>operation(n)),rows=operations.map(indexed)
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>r.seq>where.seq.gt&&r.seq<=where.seq.lte).slice(0,take))
 const result=await getCanonicalGesturePrefixWithRows('room',selector,403,operations[201])
 expect(result.operations).toHaveLength(202);expect(db.operation.findMany).toHaveBeenCalledTimes(4)
 for(const [query] of db.operation.findMany.mock.calls)expect(query).toMatchObject({where:{roomId:'room',seq:{lte:403},OR:[{userId:'author',type:'canonical_stroke',data:{path:['frame','strokeId'],equals:'S'}},{type:'canonical_stroke_close',AND:[{data:{path:['targetUserId'],equals:'author'}},{data:{path:['strokeId'],equals:'S'}}]}]},orderBy:{seq:'asc'},take:64,select:canonicalOperationRowSelect})
 expect(db.operation.findMany.mock.calls.map(([query])=>query.where.seq.gt)).toEqual([0,127,255,383])
 expect(result.canonicalRows[201].data).toBe(result.operations[201]);expect(result.operations[201]).not.toBe(operations[201])
 expect(Object.isFrozen(result.operations[0].frame)).toBe(true)
 operations[0].timestamp=999;expect(result.operations[0].timestamp).toBe(0)
})
it('allows empty only without a known anchor and rejects missing or changed known immutable identity',async()=>{
 db.operation.findMany.mockResolvedValue([])
 await expect(getCanonicalGesturePrefixWithRows('room',selector,9)).resolves.toEqual({operations:[],canonicalRows:[]})
 await expect(getCanonicalGesturePrefixWithRows('room',selector,9,operation(2))).rejects.toThrow('repair')
 const op=operation(2);db.operation.findMany.mockResolvedValue([indexed(op)])
 await expect(getCanonicalGesturePrefixWithRows('room',selector,9,{...op,id:'missing'})).rejects.toThrow('repair')
 await expect(getCanonicalGesturePrefixWithRows('room',selector,9,{...op,frame:{...op.frame,frameOrdinal:1}})).rejects.toThrow('repair')
 await expect(getCanonicalGesturePrefixWithRows('room',selector,9,{...op,frame:{...op.frame,pigmentRgb8:[9,9,9]}})).rejects.toThrow('repair')
})
it.each(['order','duplicate','cut','user','stroke','row','unknown','huge','nonadvancing'] as const)('rejects %s query evidence atomically',async kind=>{
 const a=operation(0),b=operation(1);let rows=[indexed(a),indexed(b)]
 if(kind==='order')rows.reverse()
 if(kind==='duplicate')rows=[indexed(a),indexed(a)]
 if(kind==='cut')rows=[indexed(operation(9))]
 if(kind==='user'){const op={...a,userId:'other'};rows=[indexed(op)]}
 if(kind==='stroke')rows=[indexed({...a,frame:{...a.frame,strokeId:'other'}})]
 if(kind==='row')rows[0]={...rows[0],userId:'other'}
 if(kind==='unknown')Object.assign(a.frame,{extra:{not:'normalized'}})
 if(kind==='huge')Object.assign(a.frame,{materialPacked:'x'.repeat(CANONICAL_GESTURE_PREFIX_BYTES+1)})
 if(kind==='nonadvancing')rows=Array.from({length:64},(_,n)=>indexed(operation(n)))
 db.operation.findMany.mockResolvedValue(rows)
 await expect(getCanonicalGesturePrefixWithRows('room',selector,kind==='nonadvancing'?1000:9)).rejects.toThrow()
})
it('bounds total normalized bytes before retaining all rows, not just each packed string',async()=>{
 const rows=Array.from({length:4},(_,n)=>indexed({...operation(n),frame:{...operation(n).frame,materialPacked:'x'.repeat(1024*1024)}}))
 db.operation.findMany.mockResolvedValue(rows)
 await expect(getCanonicalGesturePrefixWithRows('room',selector,9)).rejects.toThrow('repair')
})
it('propagates DB failure instead of converting failed recovery to a new empty gesture',async()=>{
 const error=Error('db unavailable');db.operation.findMany.mockRejectedValue(error)
 await expect(getCanonicalGesturePrefixWithRows('room',selector,9)).rejects.toBe(error)
})

it('visits indexed pages synchronously without retaining a second whole-prefix result',async()=>{
 const {visitCanonicalGesturePrefixRows}=await import('./snapshotStore.js')
 const ops=Array.from({length:202},(_,n)=>operation(n)),rows=ops.map(indexed),seen:number[]=[],afterRead=vi.fn(async()=>{})
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>r.seq>where.seq.gt&&r.seq<=where.seq.lte).slice(0,take))
 const result=await visitCanonicalGesturePrefixRows('room',selector,403,{requiredFrame:ops[201],afterRead,visit(op,row){expect(row.data).toBe(op);if(op.type!=='canonical_stroke')throw Error('Unexpected close');seen.push(op.frame.frameOrdinal);return undefined}})
 expect(seen).toEqual(ops.map(op=>op.frame.frameOrdinal));expect(result.lastOperation?.id).toBe(ops[201].id);expect(result.lastRow?.data).toBe(result.lastOperation)
 expect(Object.hasOwn(result,'operations')).toBe(false);expect(Object.hasOwn(result,'canonicalRows')).toBe(false);expect(afterRead).toHaveBeenCalledTimes(4)
})
it('rechecks the indexed page owner after awaits including empty terminal and refuses async visitors without reading then',async()=>{
 const {visitCanonicalGesturePrefixRows}=await import('./snapshotStore.js'),error=Error('Original cut invalidated'),visit=vi.fn(()=>undefined)
 db.operation.findMany.mockResolvedValue([])
 await expect(visitCanonicalGesturePrefixRows('room',selector,0,{afterRead:async()=>{throw error},visit})).rejects.toBe(error);expect(visit).not.toHaveBeenCalled()
 db.operation.findMany.mockResolvedValue([indexed(operation(0))]);let thenReads=0
 const thenable=Object.defineProperty({},'then',{get(){thenReads++;throw Error('Do not inspect')}})
 await expect(Reflect.apply(visitCanonicalGesturePrefixRows,null,['room',selector,1,{visit:()=>thenable}])).rejects.toThrow();expect(thenReads).toBe(0)
 await expect(visitCanonicalGesturePrefixRows('room',selector,1,{requiredFrame:operation(1),visit})).rejects.toThrow()
})
