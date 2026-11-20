import {afterEach,expect,it,vi} from 'vitest'
import type {BrushDescriptor,Dab} from '@grafetto/shared'
import {installBrushLibrary} from './brushLibrary'
import {digitalBrushFromPreset} from './src/presets/digitalBrushPresets'
import {BristleRequestBatch} from './src/dabs/BristleRequestBatch'
import {SketchLineBatch} from './src/dabs/SketchLineBatch'
import {brushPreparationPlan} from './src/dabs/BrushPreparation'
import {createTestEngine,dab,makeLayerAdd,makeStroke,paperReady} from './testing/engineTestUtils'
const definition=(suffix:string,antialias:boolean,compositing:boolean):BrushDescriptor=>({
 ...digitalBrushFromPreset('hard-round'),id:'imported-665566'+suffix,version:66,
 model:'stamp',paperInteraction:0,flow:1,flowPer:'stamp',scatter:undefined,texture:undefined,wet:undefined,
 tip:{kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'},
 sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],
 bristle:{version:1,hairs:[[.2,0,1],[-.2,0,.5]],scale:1,shear:0,random:0,mousePressure:false,threshold:false,connected:true,antialias,compositing},
 behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}},
})
const max=definition('aabb',false,false),aa=definition('aabc',true,false),over=definition('aabd',false,true)
installBrushLibrary({schemaVersion:1,assets:[],skipped:[],brushes:[max,aa,over].map(descriptor=>({name:'Authored Bristle route',source:'qa',warnings:[],descriptor}))})
const preset=(d:BrushDescriptor)=>'brush:'+d.id+'@66'
const points:Dab[]=[dab(20,20,{size:8,pressure:1,opacity:1}),dab(24,20,{size:8,pressure:1,opacity:1}),dab(28,20,{size:8,pressure:1,opacity:1})]
afterEach(()=>vi.restoreAllMocks())
it('prewarms the exact selected capability, then routes actual Painter requests with the same shared line staging',async()=>{
 const events:string[]=[],prepare=vi.spyOn(BristleRequestBatch.prototype,'preparePrograms').mockImplementation(()=>{events.push('prewarm')}),dimensions=vi.spyOn(BristleRequestBatch.prototype,'prepareDimensions').mockImplementation(()=>{events.push('dimensions')}),paint=vi.spyOn(BristleRequestBatch.prototype,'paint').mockImplementation(()=>{events.push('winner')})
 const legacy=vi.spyOn(SketchLineBatch.prototype,'paint').mockImplementation(()=>{events.push('legacy')})
 const {engine}=createTestEngine({userId:'observer'},{width:64,height:64})
 try{
  await paperReady(engine);expect(brushPreparationPlan(max).capabilities).toContain('sketchLines')
  await expect(engine.prepareBrush(preset(max))).resolves.toEqual({status:'ready'});expect(prepare).toHaveBeenCalled()
  engine.appendOperation(makeLayerAdd('peer','ink'))
  engine.appendOperation(makeStroke('peer','ink',points,{tool:'digitalBrush',preset:preset(max),strokeId:'max',strokeEnd:true}),'remote')
  expect(paint).toHaveBeenCalled();expect(dimensions).toHaveBeenCalledWith(64,64);expect(legacy).not.toHaveBeenCalled()
  expect(events.indexOf('prewarm')).toBeLessThan(events.indexOf('winner'));expect(events.indexOf('dimensions')).toBeLessThan(events.indexOf('winner'))
  for(const [stamps,coverage,request]of paint.mock.calls){expect(stamps.length).toBeGreaterThan(0);expect(stamps.length).toBeLessThanOrEqual(4*4096);expect(coverage).not.toBe(request);const groups=new Set(stamps.map(s=>s.group));expect(groups.size).toBeLessThanOrEqual(4)}
  const painter=engine['_brush']['behavior'];painter.prepareSketchLines()
  const staging=Object.getOwnPropertyDescriptor(painter,'lineStaging')?.value
  expect(Object.getOwnPropertyDescriptor(painter['bristleRequests']!,'data')?.value).toBe(staging)
  expect(Object.getOwnPropertyDescriptor(painter['sketchBatch']!,'data')?.value).toBe(staging)
 }finally{engine.destroy()}
})
it('prepares a never-selected peer/cold brush before actual Painter deposition',()=>{
 const events:string[]=[]
 vi.spyOn(BristleRequestBatch.prototype,'preparePrograms').mockImplementation(()=>{events.push('prepare')})
 vi.spyOn(BristleRequestBatch.prototype,'prepareDimensions').mockImplementation(()=>{})
 vi.spyOn(BristleRequestBatch.prototype,'paint').mockImplementation(()=>{events.push('paint')})
 const {engine}=createTestEngine({userId:'observer'},{width:64,height:64})
 try{
  engine.appendOperation(makeLayerAdd('peer','ink'))
  engine.appendOperation(makeStroke('peer','ink',points,{tool:'digitalBrush',preset:preset(max),strokeId:'cold',strokeEnd:true}),'remote')
  expect(events).toContain('paint');expect(events[0]).toBe('prepare')
 }finally{engine.destroy()}
})
it.each([aa,over])('leaves existing AA/compositing Bristle on SketchLineBatch without new depth preparation',brush=>{
 const prepare=vi.spyOn(BristleRequestBatch.prototype,'preparePrograms').mockImplementation(()=>{})
 const winner=vi.spyOn(BristleRequestBatch.prototype,'paint').mockImplementation(()=>{})
 const legacy=vi.spyOn(SketchLineBatch.prototype,'paint').mockImplementation(()=>{})
 const {engine}=createTestEngine({userId:'observer'},{width:64,height:64})
 try{engine.appendOperation(makeLayerAdd('peer','ink'));engine.appendOperation(makeStroke('peer','ink',points,{tool:'digitalBrush',preset:preset(brush),strokeId:'old',strokeEnd:true}),'remote');expect(legacy).toHaveBeenCalled();expect(winner).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled()}finally{engine.destroy()}
})
it('reports a prewarm failure rather than marking the selected brush ready',async()=>{
 vi.spyOn(BristleRequestBatch.prototype,'preparePrograms').mockImplementation(()=>{throw undefined})
 const {engine}=createTestEngine({userId:'observer'},{width:64,height:64})
 try{await paperReady(engine);await expect(engine.prepareBrush(preset(max))).rejects.toBeUndefined()}finally{engine.destroy()}
})
it('resets the new capability on GL initialization and destroys it without replacing shared CPU staging',async()=>{
 const prepare=vi.spyOn(BristleRequestBatch.prototype,'preparePrograms').mockImplementation(()=>{})
 const reset=vi.spyOn(BristleRequestBatch.prototype,'reset'),destroy=vi.spyOn(BristleRequestBatch.prototype,'destroy')
 const {engine}=createTestEngine({userId:'observer'},{width:64,height:64})
 try{
  await paperReady(engine);await engine.prepareBrush(preset(max))
  const painter=engine['_brush']['behavior'],staging=Object.getOwnPropertyDescriptor(painter,'lineStaging')?.value
  expect(staging).toBeInstanceOf(Float32Array);painter.initGL();expect(reset).toHaveBeenCalledTimes(1)
  await engine.prepareBrush(preset(max));expect(prepare).toHaveBeenCalledTimes(2)
  expect(Object.getOwnPropertyDescriptor(painter,'lineStaging')?.value).toBe(staging)
  engine.destroy();expect(destroy).toHaveBeenCalledTimes(1)
 }finally{engine.destroy()}
})
