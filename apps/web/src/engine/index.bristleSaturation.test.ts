import {afterEach,expect,it,vi} from 'vitest'
import {webcrypto} from 'node:crypto'
import type {BrushDescriptor} from '@grafetto/shared'
import {genuineBristle93Fixture} from './testing/bristle93Fixture'
import {installBrushLibrary,installBrushPixels} from './brushLibrary'
import {prepareBristleSaturationLookup} from './src/presets/bristleSaturationLookup'
import {BristleRequestBatch} from './src/dabs/BristleRequestBatch'
import type {PreparedBristleSaturationResource} from './src/dabs/BristleSaturationResource'
import {createTestEngine,dab,makeLayerAdd,makeStroke,paperReady} from './testing/engineTestUtils'
const held=new Map<BristleRequestBatch,{settings:object;resource:PreparedBristleSaturationResource}>()
afterEach(()=>{for(const item of held.values())item.resource.release();held.clear();vi.restoreAllMocks();vi.unstubAllGlobals()})
async function installed(){
 vi.stubGlobal('crypto',webcrypto)
 const f=genuineBristle93Fixture()
 if(f.bristle.version!==2||!f.bristle.saturationLookup)throw Error('Expected compiled fixture')
 const descriptor:BrushDescriptor={...f.descriptor,bristle:{...f.bristle,random:0,connected:true}}
 const side=Math.sqrt(f.raw.length)
 installBrushLibrary({schemaVersion:1,assets:[{id:f.bristle.saturationLookup.asset,size:side,file:`${f.bristle.saturationLookup.asset.slice(6)}.bin`}],skipped:[],brushes:[{name:'Genuine authored Bristle93 fixture',source:'qa',warnings:[],descriptor}]})
 installBrushPixels(f.bristle.saturationLookup.asset,f.raw)
 // Resolve installed immutable identity, exactly as existing API readiness does.
 const {digitalBrushFromPreset}=await import('./src/presets/digitalBrushPresets')
 const preset=`brush:${descriptor.id}@93`,brush=digitalBrushFromPreset(preset)
 if(!brush.bristle)throw Error('Expected fixture Bristle')
 await prepareBristleSaturationLookup(brush.bristle)
 return{preset,brush}
}
function boundary(){
 const prepare=vi.spyOn(BristleRequestBatch.prototype,'prepareCompiledSaturation').mockImplementation(function(this:BristleRequestBatch,settings,resource){
  resource.assertCurrent();held.get(this)?.resource.release();held.set(this,{settings,resource})
 })
 vi.spyOn(BristleRequestBatch.prototype,'assertInkPrepared').mockImplementation(function(this:BristleRequestBatch,settings){const item=held.get(this);if(item?.settings!==settings)throw Error('Wrong compiled Bristle owner');item.resource.assertCurrent()})
 vi.spyOn(BristleRequestBatch.prototype,'preparedInkProfile').mockImplementation(function(this:BristleRequestBatch){return held.get(this)!.resource.profile})
 vi.spyOn(BristleRequestBatch.prototype,'preparedSaturationTable').mockImplementation(function(this:BristleRequestBatch){return held.get(this)!.resource.table})
 vi.spyOn(BristleRequestBatch.prototype,'prepareDimensions').mockImplementation(()=>{})
 const paint=vi.spyOn(BristleRequestBatch.prototype,'paint').mockImplementation(function(this:BristleRequestBatch){held.get(this)!.resource.assertCurrent()})
 return{prepare,paint}
}
const points=[dab(20,20,{size:8,pressure:1,opacity:1}),dab(24,20,{size:8,pressure:1,opacity:1}),dab(28,20,{size:8,pressure:1,opacity:1})]
it('selected compiled93 resource is prepared before actual Painter state with no client table construction',async()=>{
 const {preset}=await installed(),m=boundary(),{engine}=createTestEngine({userId:'observer'},{width:64,height:64})
 try{
  await paperReady(engine);await expect(engine.prepareBrush(preset)).resolves.toEqual({status:'ready'})
  engine.appendOperation(makeLayerAdd('peer','sat'));engine.appendOperation(makeStroke('peer','sat',points,{tool:'digitalBrush',preset,strokeId:'selected93',strokeEnd:true}),'remote')
  expect(m.prepare).toHaveBeenCalled();expect(m.paint).toHaveBeenCalled()
  expect(m.paint.mock.calls[0][0].every(s=>'bristleInkSpan' in s)).toBe(true)
 }finally{engine.destroy()}
})
it('never-selected recorded93 uses the same resource preflight rather than selected-brush readiness',async()=>{
 const {preset}=await installed(),m=boundary(),{engine}=createTestEngine({userId:'observer'},{width:64,height:64})
 try{
  await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','sat-cold'))
  engine.appendOperation(makeStroke('peer','sat-cold',points,{tool:'digitalBrush',preset,strokeId:'recorded93',strokeEnd:true}),'remote')
  expect(m.prepare).toHaveBeenCalled();expect(m.paint).toHaveBeenCalled();expect(m.prepare.mock.invocationCallOrder[0]).toBeLessThan(m.paint.mock.invocationCallOrder[0])
 }finally{engine.destroy()}
})
