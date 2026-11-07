import {it,expect,vi} from 'vitest'
import {createBrushSourceNonce,type BrushDescriptor} from '@grafetto/shared'
import {createTestEngine,paperReady,pointerSample,dab,makeLayerAdd,makeStroke} from './testing/engineTestUtils'
import {installBrushLibrary} from './brushLibrary'
import {digitalBrushFromPreset} from './src/presets/digitalBrushPresets'
import {brushExecutionContext,assertBrushExecutionContext,assertSameBrushExecutionContext,requiresBrushExecutionContext} from './src/presets/brushExecutionContext'
function descriptor(opaque=true):BrushDescriptor{return{...digitalBrushFromPreset('hard-round'),id:'imported-'+(opaque?'bd':'be').repeat(12),version:67,behavior:{version:2},hatching:{version:1,angle:0,separation:8,thickness:1,origin:[0,0],style:'none',intervals:2,antialias:true,subpixel:true,...opaque?{opaqueBackground:true}:{}}}}
it('captures next-gesture API background once; custom/white are independent of paper and mutable caller',async()=>{
 const brush=descriptor();installBrushLibrary({schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Own background hatch',source:'qa',warnings:[],descriptor:brush}]})
 const{engine}=createTestEngine()
 try{
  await paperReady(engine);engine.initLayer('L');engine.setActiveLayer('L');engine.setTool('digitalBrush');engine.setPencil(`brush:${brush.id}@67`)
  const capture=()=>{const value=engine['_captureAuthorStart'](pointerSample(10,20),0);if(!value?.brushSource)throw Error('Expected actual author source capture');return value.brushSource}
  expect(capture().background).toEqual([255,255,255,255])
  const input:[number,number,number,number]=[20,100,180,128];engine.setHatchingBackground(input);input[0]=200
  const first=capture();expect(first.background).toEqual([20,100,180,128])
  engine.setBrushBackground([200,10,30,255]);expect(first.background).toEqual([20,100,180,128]);expect(capture().background).toEqual([200,10,30,255])
  engine.setHatchingBackground();expect(capture().background).toEqual([255,255,255,255])
  expect(()=>engine.setHatchingBackground([0,0,0,256])).toThrow('RGBA8')
 }finally{engine.destroy()}
})
it('requires recorded context before an opaque hatch while preserving old hatches and gesture immutability',()=>{
 const brush=descriptor(),old=descriptor(false),source={version:1 as const,background:[20,100,180,128]as const}
 expect(requiresBrushExecutionContext(brush)).toBe(true);expect(()=>assertBrushExecutionContext(brush)).toThrow('captured background')
 expect(()=>assertBrushExecutionContext(old)).not.toThrow()
 const context=brushExecutionContext(undefined,source),restored=brushExecutionContext(undefined,JSON.parse(JSON.stringify(source)))
 expect(()=>assertBrushExecutionContext(brush,restored)).not.toThrow();expect(()=>assertSameBrushExecutionContext(context,restored)).not.toThrow()
 expect(()=>assertSameBrushExecutionContext(context,brushExecutionContext(undefined,{version:1,background:[21,100,180,128]}))).toThrow('sources changed')
})

it('renders recorded background through the real hatching request shader without receiver API colour',async()=>{
 const brush=descriptor();installBrushLibrary({schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Own recorded background hatch',source:'qa',warnings:[],descriptor:brush}]})
 const{engine}=createTestEngine({}, {width:96,height:64})
 try{
  await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'))
  engine.setHatchingBackground([255,0,0,255]) // receiver UI/API must not be consulted
  const source={version:1 as const,background:[20,100,180,128]as const},uniform=vi.spyOn(engine['gl'],'uniform4f')
  const operation=makeStroke('peer','ink',[dab(20,32,{size:20,pressure:.5}),dab(40,32,{size:20,pressure:.5})],{tool:'digitalBrush',preset:`brush:${brush.id}@67`,color:[1,0,0],strokeEnd:true,brushSource:source,strokeId:createBrushSourceNonce('hatchsource123',source)})
  engine.appendOperation(operation,'remote')
  const calls=uniform.mock.calls.filter(([location])=>location&&Reflect.get(location,'name')==='u_hatchBackground')
  expect(calls.length).toBeGreaterThan(0)
  expect(calls.every(([,r,g,b,a])=>r===20/255&&g===100/255&&b===180/255&&a===128/255)).toBe(true)
 }finally{engine.destroy()}
})
