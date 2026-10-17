import {expect,it,vi} from 'vitest'
import {createTestEngine,makeLayerAdd,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd} from './testing/engineTestUtils'
it.fails('retains accepted-after-Dry pigment in wet material for the next water-only stroke',async()=>{
 const a=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1'},{width:64,height:64}).engine
 const oracle=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1'},{width:64,height:64}).engine
 for(const e of [a,oracle]){await e.paperReady();Object.defineProperty(e['gl'],'colorMask',{value:vi.fn(),configurable:true});e.appendOperation(makeLayerAdd('A','L','L',{seq:0}),'remote');e.setActiveLayer('L');e.setCompositeOrder([{id:'L',opacity:1}]);e.setTool('watercolor');e.setPencil('normal:95:34:PB29:round:wc@m70-r2-v1');e.setSize(6)}
 try{
  simulateStrokeStart(a,20,24);simulateStrokeMove(a,30,24);simulateStrokeEnd(a,36,24)
  const own=a.getOperations().find(x=>x.type==='stroke')!
  const dry={id:'peer-dry',type:'paper_dry' as const,layerId:'L',userId:'B',seq:1,timestamp:Date.now()}
  a.appendOperation(dry,'remote');a.confirmOperation(own.id,2)
  oracle.appendOperation(dry,'remote');oracle.appendOperation({...own,seq:2},'remote')
  for(const e of [a,oracle]){e.setPencil('normal:95:0:PB29:round:wc@m70-r2-v1');simulateStrokeStart(e,24,24);simulateStrokeMove(e,30,24)}
  expect(oracle['_ribbonStrokeScratch']!.pigmentInputsKnownZero).toBe(false)
  expect(a['_ribbonStrokeScratch']!.pigmentInputsKnownZero).toBe(oracle['_ribbonStrokeScratch']!.pigmentInputsKnownZero)
 }finally{a.destroy();oracle.destroy()}
})
