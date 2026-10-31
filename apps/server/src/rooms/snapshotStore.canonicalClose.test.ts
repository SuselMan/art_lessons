import {beforeEach,expect,it,vi} from 'vitest'
import type {CanonicalStoredOperationRow} from './roomPersistence.js'
import {buildCanonicalMaterial,canonicalDefaultAutoSourceBinding,decodeCanonicalStrokeFrame,verifyCanonicalRecordedPrefix,type BrushDescriptor,type CanonicalStrokeOperation} from '@grafetto/shared'
const {default:stock}=await import(new URL('../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native.ts',import.meta.url).href)
const descriptor=stock.rows[0].descriptor as unknown as BrushDescriptor,pin=canonicalDefaultAutoSourceBinding(descriptor,'a'.repeat(64),'neon64-f32-fma-v1')
const material={version:2 as const,assets:[],primarySource:pin,budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}}
const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},material).packed
const db=vi.hoisted(()=>({operation:{findMany:vi.fn()}}))
vi.mock('../db/prisma.js',()=>({prisma:db}))
import {getCanonicalGesturePrefixWithRows,CANONICAL_GESTURE_PREFIX_BYTES} from './snapshotStore.js'
const selector={userId:'author',strokeId:'gesture'}
function frame(n:number):CanonicalStrokeOperation{return{type:'canonical_stroke',id:'frame-'+n,userId:'author',timestamp:n,seq:n+1,layerId:'layer',frame:{version:1,rasterProfile:'installed-arm64-scalar-fused-fpcr0-v1',brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:'gesture',frameOrdinal:n,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'},materialPacked:packed}}}
function close(count:number){return{type:'canonical_stroke_close' as const,id:'close',userId:'owner',timestamp:count+1,seq:count+1,layerId:'layer',targetUserId:'author',strokeId:'gesture',disposition:'commitPartial' as const,recordedNext:count,firstFrameOpId:'frame-0',lastFrameOpId:'frame-'+(count-1)}}
function row(op:CanonicalStrokeOperation|ReturnType<typeof close>):CanonicalStoredOperationRow{return{id:op.id,roomId:'room',userId:op.userId,seq:op.seq!,type:op.type,layerId:op.layerId,tool:null,data:op}}
beforeEach(()=>{db.operation.findMany.mockReset()})
it('reads206 legal cuts and owner-authored target close through ONE ordered selector/cut, keeping frames separate',async()=>{
 const frames=Array.from({length:206},(_,n)=>frame(n)),rows=[...frames.map(row),row(close(206))]
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>r.roomId===where.roomId&&r.seq>where.seq.gt&&r.seq<=where.seq.lte&&where.OR?.some((branch:Record<string,unknown>)=>{
  const op=r.data as ReturnType<typeof close>|CanonicalStrokeOperation
  return branch.type==='canonical_stroke'?r.type===branch.type&&r.userId===branch.userId&&op.type==='canonical_stroke'&&op.frame.strokeId===selector.strokeId:branch.type==='canonical_stroke_close'&&r.type===branch.type&&op.type==='canonical_stroke_close'&&op.targetUserId===selector.userId&&op.strokeId===selector.strokeId
 })).slice(0,take))
 const verified=frames.map(op=>({operationId:op.id,sequence:op.seq!,frameOrdinal:op.frame.frameOrdinal,decoded:decodeCanonicalStrokeFrame(op.frame,{rasterProfile:op.frame.rasterProfile,brush:op.frame.brush,strokeId:op.frame.strokeId,frameOrdinal:op.frame.frameOrdinal,pigmentRgb8:op.frame.pigmentRgb8,composition:op.frame.composition,material}).frame}))
 expect(verifyCanonicalRecordedPrefix(verified)).toMatchObject({recordedNext:206,ended:false})
 const result=await getCanonicalGesturePrefixWithRows('room',selector,207,frames[205])
 expect(result.operations).toHaveLength(206);expect(result.canonicalRows).toHaveLength(206)
 expect(result.close?.operation).toEqual(close(206));expect(result.close?.row.data).toBe(result.close?.operation);expect(Object.isFrozen(result.close?.operation)).toBe(true)
 expect(db.operation.findMany).toHaveBeenCalledTimes(4)
 for(const [q] of db.operation.findMany.mock.calls){
  expect(q.where).toEqual({roomId:'room',seq:{gt:q.where.seq.gt,lte:207},OR:[{userId:'author',type:'canonical_stroke',data:{path:['frame','strokeId'],equals:'gesture'}},{type:'canonical_stroke_close',AND:[{data:{path:['targetUserId'],equals:'author'}},{data:{path:['strokeId'],equals:'gesture'}}]}]})
  expect(q.orderBy).toEqual({seq:'asc'});expect(q.take).toBe(64)
 }
})
it.each(['post-close','second-close','before-first','missing-first','missing-middle','changed-anchor','close-N','close-cut','close-first','close-last','target','stroke','layer','indexed-actor','indexed-room','indexed-type','indexed-body','duplicate-ID','order'] as const)('rejects %s atomically without adopting evidence',async kind=>{
 const a=frame(0),b=frame(1),c=close(2);let rows=[row(a),row(b),row(c)]
 if(kind==='post-close')rows.push(row({...frame(2),seq:4}))
 if(kind==='second-close')rows.push(row({...c,id:'second',seq:4}))
 if(kind==='before-first')rows=[row({...c,seq:1})]
 if(kind==='missing-first')rows=[row(b),row(c)]
 if(kind==='missing-middle'){const third=frame(2);rows=[row(a),row(third),row(close(3))]}
 if(kind==='changed-anchor')rows=[row({...a,timestamp:99}),row(b),row(c)]
 if(kind==='close-N')rows[2]=row({...c,recordedNext:1})
 if(kind==='close-cut')rows[2]=row({...c,seq:11})
 if(kind==='close-first')rows[2]=row({...c,firstFrameOpId:'other'})
 if(kind==='close-last')rows[2]=row({...c,lastFrameOpId:'other'})
 if(kind==='target')rows[2]=row({...c,targetUserId:'other'})
 if(kind==='stroke')rows[2]=row({...c,strokeId:'other'})
 if(kind==='layer')rows[2]=row({...c,layerId:'other'})
 if(kind==='indexed-actor')rows[2]={...rows[2],userId:'author'}
 if(kind==='indexed-room')rows[2]={...rows[2],roomId:'other'}
 if(kind==='indexed-type')rows[2]={...rows[2],type:'canonical_stroke'}
 if(kind==='indexed-body')rows[2]={...rows[2],data:{...c,unknown:'extra'}}
 if(kind==='duplicate-ID')rows[2]=row({...c,id:a.id})
 if(kind==='order')rows=[row(b),row(a),row(c)]
 db.operation.findMany.mockResolvedValue(rows)
 await expect(getCanonicalGesturePrefixWithRows('room',selector,10,a)).rejects.toThrow('repair')
})
it('charges normalized close bytes in the SAME4MiB total before retention',async()=>{
 const base=frame(0),c=close(1),overhead=Buffer.byteLength(JSON.stringify(base),'utf8')-Buffer.byteLength(base.frame.materialPacked,'utf8')
 const a={...base,frame:{...base.frame,materialPacked:'x'.repeat(CANONICAL_GESTURE_PREFIX_BYTES-overhead-1)}}
 db.operation.findMany.mockResolvedValue([row(a),row(c)])
 await expect(getCanonicalGesturePrefixWithRows('room',selector,2,a)).rejects.toThrow('repair')
})

it.each([false,true])('continues querying after close exactly at the page edge (post-close frame=%s)',async post=>{
 const frames=Array.from({length:63},(_,n)=>frame(n)),closing=close(63),rows=[...frames.map(row),row(closing),...post?[row({...frame(63),seq:65})]:[]]
 db.operation.findMany.mockImplementation(async({where,take})=>rows.filter(r=>r.seq>where.seq.gt&&r.seq<=where.seq.lte).slice(0,take))
 const pending=getCanonicalGesturePrefixWithRows('room',selector,65,frames[62])
 if(post)await expect(pending).rejects.toThrow('repair')
 else expect((await pending).close?.operation.seq).toBe(64)
 expect(db.operation.findMany).toHaveBeenCalledTimes(2);expect(db.operation.findMany.mock.calls[1][0].where.seq.gt).toBe(64)
})
