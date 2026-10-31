import {beforeEach,expect,it,vi} from 'vitest'
import {buildCanonicalMaterial,canonicalDefaultAutoSourceBinding,CANONICAL_STROKE_RASTER_PROFILE,type BrushDescriptor,type CanonicalStrokeOperation} from '@grafetto/shared'
const {default:stock}=await import(new URL('../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native.ts',import.meta.url).href)
const db=vi.hoisted(()=>({operation:{findMany:vi.fn()}}))
vi.mock('../db/prisma.js',()=>({prisma:db}))
import {getOperationsBefore,getOperationsBeforeWithCanonicalRows} from './snapshotStore.js'
import {canonicalOperationRowSelect} from './roomPersistence.js'
function fixture(){
 const descriptor=stock.rows[0].descriptor as unknown as BrushDescriptor,pin=canonicalDefaultAutoSourceBinding(descriptor,'a'.repeat(64),'neon64-f32-fma-v1')
 const material={version:2 as const,assets:[],primarySource:pin,budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}}
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{at:0,kind:'gestureEnd'}]},material).packed
 const operation:CanonicalStrokeOperation={id:'op',seq:1,type:'canonical_stroke',userId:'author',timestamp:0,layerId:'L',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:'S',frameOrdinal:0,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'},materialPacked:packed}}
 return {operation,row:{id:operation.id,seq:1,type:operation.type,roomId:'room',userId:'author',layerId:'L',tool:null,data:operation}}
}
beforeEach(()=>vi.clearAllMocks())
it('keeps exact actual indexed evidence, projects immutable canonical data and preserves legacy array shape',async()=>{
 const {operation,row}=fixture(),legacy={id:'legacy',seq:2,type:'layer_add',userId:'other',timestamp:0,layerId:'L2',name:'Layer'}
 db.operation.findMany.mockResolvedValueOnce([{id:'legacy',seq:2,type:'layer_add',roomId:'room',userId:'other',layerId:'L2',tool:null,data:legacy},row])
 const result=await getOperationsBeforeWithCanonicalRows('room',3,500)
 expect(db.operation.findMany).toHaveBeenCalledWith(expect.objectContaining({select:canonicalOperationRowSelect,orderBy:{seq:'desc'},take:500}))
 expect(result.operations.map(op=>op.id)).toEqual(['op','legacy']);expect(result.operations[1]).toBe(legacy)
 expect(result.canonicalRows).toHaveLength(1);expect(result.canonicalRows[0].data).toBe(result.operations[0]);expect(result.operations[0]).not.toBe(operation)
 if(result.operations[0].type!=='canonical_stroke')throw Error('Expected canonical')
 expect(Object.isFrozen(result.operations[0].frame)).toBe(true)
 Object.assign(operation.frame,{pigmentRgb8:[9,9,9]});expect(result.operations[0].frame.pigmentRgb8).toEqual([1,2,3])
 db.operation.findMany.mockResolvedValueOnce([{data:legacy}])
 await expect(getOperationsBefore('room',3,500)).resolves.toEqual([legacy])
})
it.each(['id','seq','roomId','userId','type','layerId','tool'] as const)('rejects mismatched actual indexed %s before publishing operations',async field=>{
 const {row}=fixture();Object.assign(row,{[field]:field==='seq'?99:'wrong'})
 db.operation.findMany.mockResolvedValueOnce([row])
 await expect(getOperationsBeforeWithCanonicalRows('room',3,500)).rejects.toThrow()
})
