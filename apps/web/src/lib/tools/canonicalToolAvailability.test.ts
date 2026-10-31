import {beforeEach,expect,it} from 'vitest'
import {CANONICAL_STROKE_RASTER_PROFILE as profile,isBrushLibrary,type ImportedBrush} from '@grafetto/shared'
import stock from '../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import {canonicalToolAvailability,canonicalToolOffered} from './canonicalToolAvailability'
import {TOOL_SCHEMAS} from './toolSchemas'
import {resetRoomStore,useRoomStore} from '../../stores/roomStore'
function library():ImportedBrush[]{
 const brushes=[4,8].map(index=>{const row=stock.rows.find(r=>r.index===index);if(!row)throw Error('Missing source');return {name:'Native '+index,source:'stock.kpp',descriptor:row.descriptor,warnings:[]}})
 const candidate:unknown={schemaVersion:1,brushes,assets:[],skipped:[]}
 if(!isBrushLibrary(candidate))throw Error('Invalid actual fixture library')
 return candidate.brushes
}
const read={authorRasterProfile:profile,assertCurrent:()=>({roomId:'test',boardEpoch:0,rasterProfile:profile})}
beforeEach(resetRoomStore)
it('leaves legacy schemas and tool policy alone, but does not inherit source eligibility before the original read',()=>{
 expect(canonicalToolAvailability(false,true,read,library())).toBeUndefined()
 const waiting=canonicalToolAvailability(true,true,undefined,library())
 expect(waiting?.status).toBe('restoring');expect(canonicalToolOffered(waiting,'digitalBrush')).toBe(false);expect(canonicalToolOffered(waiting,'hand')).toBe(true)
})
it('late library becomes eligible from actual Basic2/5 data; both surfaces share one honest scoped schema',()=>{
 expect(canonicalToolAvailability(true,true,read,[])?.status).toBe('empty')
 const ready=canonicalToolAvailability(true,true,read,library());expect(ready?.options).toHaveLength(2)
 expect(ready?.schema.brush.valueType).toEqual({kind:'enumOptions',options:library().map(b=>b.descriptor.id)})
 expect(ready?.schema.brush.default).toBe(ready?.options[0].id)
 expect(canonicalToolAvailability(true,true,read,[])?.schema.brush.default).toBe('')
 expect(ready?.schema.size).toBeUndefined();expect(ready?.schema.sizeFromPressure).toBeUndefined();expect(ready?.schema.opacityFromPressure).toBeUndefined()
 expect(TOOL_SCHEMAS.digitalBrush.size).toBeDefined();expect(canonicalToolOffered(ready,'fill')).toBe(false)
})
it('atomically normalizes an unsupported remembered tool, restores source size even for same ID, and retains hand',()=>{
 const ready=canonicalToolAvailability(true,true,read,library());if(!ready)throw Error('Missing availability')
 const store=useRoomStore;store.getState().normalizeCanonicalTool(ready.options)
 expect(store.getState().tool).toBe('digitalBrush');expect(store.getState().toolSettings.digitalBrush.size).toBe(ready.options[0].sizePx)
 store.getState().setToolSetting('digitalBrush','size',999);store.getState().normalizeCanonicalTool(ready.options)
 expect(store.getState().toolSettings.digitalBrush.size).toBe(ready.options[0].sizePx)
 store.getState().setTool('hand');store.getState().normalizeCanonicalTool(ready.options);expect(store.getState().tool).toBe('hand')
 store.getState().normalizeCanonicalTool([]);expect(store.getState().tool).toBe('hand')
})

it('stale original lifetime before a library revision cannot derive eligible source options',()=>{
 let current=true
 const original={authorRasterProfile:profile,assertCurrent(){if(!current)throw Error('Stale original');return{roomId:'test',boardEpoch:0,rasterProfile:profile}}}
 expect(canonicalToolAvailability(true,true,original,library())?.status).toBe('ready')
 current=false
 const updated=canonicalToolAvailability(true,true,original,[...library()])
 expect(updated?.status).toBe('restoring');expect(updated?.options).toHaveLength(0)
})

it('does not grant an unsupported brush or fall back to an older eligible version of the same ID',()=>{
 const [supported]=library()
 const behavior=supported.descriptor.behavior;if(!behavior)throw Error('Native behavior missing')
 const rejected:ImportedBrush={...supported,descriptor:{...supported.descriptor,version:supported.descriptor.version+1,behavior:{...behavior,erase:true}}}
 const result=canonicalToolAvailability(true,true,read,[supported,rejected])
 expect(result?.status).toBe('empty');expect(result?.options).toHaveLength(0)
})
