import {it,expect,vi} from 'vitest'
import {createBrushSourceNonce,type BrushDescriptor} from '@grafetto/shared'
import {createTestEngine,paperReady,pointerSample,dab,makeLayerAdd,makeStroke} from './testing/engineTestUtils'
import {installBrushLibrary} from './brushLibrary'
import {digitalBrushFromPreset} from './src/presets/digitalBrushPresets'
function descriptor():BrushDescriptor {
 const b=structuredClone(digitalBrushFromPreset('hard-round'));b.id=`imported-${'ab'.repeat(12)}`;b.version=197;b.model='stamp';b.paperInteraction=0
 b.behavior={version:2,colorMix:{version:1,value:1,pressure:[[0,0],[1,1]]},rendering:{mode:'buildUp',blendMode:'normal',accumulation:'alphaDarken',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}};return b
}
it('captures an author background and uses the recorded value for peer and replay',async()=>{
 const brush=descriptor();installBrushLibrary({schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Authored mix',source:'qa',warnings:[],descriptor:brush}]})
 const {engine}=createTestEngine({}, {width:96,height:64})
 Reflect.set(engine['gl'],'blendColor',vi.fn())
 try{
  await paperReady(engine);engine.initLayer('L');engine.setActiveLayer('L');engine.setTool('digitalBrush');engine.setPencil(`brush:${brush.id}@197`)
  engine.setBrushBackground([0,0,255,255]);const capture=engine['_captureAuthorStart'](pointerSample(10,20),0)?.brushSource;expect(capture?.background).toEqual([0,0,255,255])
  engine.setBrushBackground([0,255,0,255]);expect(capture?.background).toEqual([0,0,255,255])
  engine.appendOperation(makeLayerAdd('peer','ink'));const source={version:1 as const,background:[0,0,255,255] as const},uniform=vi.spyOn(engine['gl'],'uniform3fv')
  const op=makeStroke('peer','ink',[dab(20,32,{size:20,pressure:.5}),dab(40,32,{size:20,pressure:.5})],{tool:'digitalBrush',preset:`brush:${brush.id}@197`,color:[1,0,0],strokeEnd:true,brushSource:source,strokeId:createBrushSourceNonce('mixsource123',source)})
  engine.appendOperation(op,'remote')
  const calls=uniform.mock.calls.filter(([location])=>location&&Reflect.get(location,'name')==='u_color')
  expect(calls.some(([,v])=>Math.abs(Number(v[0])-128/255)<.0001&&Number(v[1])===0&&Math.abs(Number(v[2])-127/255)<.0001)).toBe(true)
 }finally{engine.destroy()}
})
