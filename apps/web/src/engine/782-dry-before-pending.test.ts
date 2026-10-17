import {expect,it,vi} from 'vitest'
import {createTestEngine,makeLayerAdd,makeStroke,dab,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd} from './testing/engineTestUtils'
it.each(['layer-Dry','global-Dry','hide'] as const)('%s before pending pigment retains it wet for the next water-only stroke',async(kind)=>{
 const a=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1'},{width:64,height:64}).engine
 const oracle=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1'},{width:64,height:64}).engine
 for(const e of [a,oracle]){await e.paperReady();Object.defineProperty(e['gl'],'colorMask',{value:vi.fn(),configurable:true});e.appendOperation(makeLayerAdd('A','L','L',{seq:0}),'remote');e.setActiveLayer('L');e.setCompositeOrder([{id:'L',opacity:1}]);e.setTool('watercolor');e.setPencil('normal:95:34:PB29:round:wc@m70-r2-v1');e.setSize(6)}
 try{
  simulateStrokeStart(a,20,24);simulateStrokeMove(a,30,24);simulateStrokeEnd(a,36,24)
  const own=a.getOperations().find(x=>x.type==='stroke')!
  const dry=kind==='hide'?{id:'peer-hide',type:'layer_visibility' as const,layerId:'L',visible:false,userId:'B',seq:1,timestamp:Date.now()}:{id:'peer-dry',type:'paper_dry' as const,...kind==='layer-Dry'?{layerId:'L'}:{},userId:'B',seq:1,timestamp:Date.now()}
  a.appendOperation(dry,'remote');a.confirmOperation(own.id,2)
  await vi.waitFor(()=>{expect(a['_unsettledLayers'].size).toBe(0);expect(a['_pendingRebuilds'].size).toBe(0);expect(a['_rebuildJobs'].size).toBe(0)},{timeout:2000})
  oracle.appendOperation(dry,'remote');oracle.appendOperation({...own,seq:2},'remote')
  for(const e of [a,oracle]){e.setPencil('normal:95:0:PB29:round:wc@m70-r2-v1');simulateStrokeStart(e,24,24);simulateStrokeMove(e,30,24)}
  expect(oracle['_ribbonStrokeScratch']!.pigmentInputsKnownZero).toBe(false)
  expect(a['_ribbonStrokeScratch']!.pigmentInputsKnownZero).toBe(oracle['_ribbonStrokeScratch']!.pigmentInputsKnownZero)
 }finally{a.destroy();oracle.destroy()}
})

it('keeps the held owner intact when Dry precedes its pending first chunk',async()=>{
 const e=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1'},{width:64,height:64}).engine;await e.paperReady();Object.defineProperty(e['gl'],'colorMask',{value:vi.fn(),configurable:true})
 try{
  e.appendOperation(makeLayerAdd('A','L','L',{seq:0}),'remote');e.setActiveLayer('L');e.setCompositeOrder([{id:'L',opacity:1}]);e.setTool('watercolor');e.setPencil('normal:95:34:PB29:round:wc@m70-r2-v1');e.setSize(6)
  simulateStrokeStart(e,20,24);simulateStrokeMove(e,30,24);e['_flushStrokeChunk']()
  const chunk=e.getOperations().find(x=>x.type==='stroke')!,scratch=e['_ribbonStrokeScratch'],destroy=vi.spyOn(scratch!,'destroy'),rebuild=vi.spyOn(e as unknown as {_rebuildLayerOrDefer(id:string):void},'_rebuildLayerOrDefer')
  e.appendOperation({id:'dry',type:'paper_dry',layerId:'L',userId:'B',seq:1,timestamp:Date.now()},'remote');e.confirmOperation(chunk.id,2)
  expect(e['_ribbonStrokeScratch']).toBe(scratch);expect(destroy).not.toHaveBeenCalled();expect(rebuild).not.toHaveBeenCalled()
  simulateStrokeMove(e,40,24);simulateStrokeEnd(e,44,24)
  await vi.waitFor(()=>expect(rebuild).toHaveBeenCalledWith('L'),{timeout:2000})
 }finally{e.destroy()}
})

it.each(['layer-Dry','global-Dry','hide'] as const)('pending %s accepted after peer pigment leaves that pigment dry',async(kind)=>{
 const a=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1'},{width:64,height:64}).engine
 const oracle=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1'},{width:64,height:64}).engine
 const preset='normal:95:34:PB29:round:wc@m70-r2-v1'
 for(const e of [a,oracle]){await e.paperReady();Object.defineProperty(e['gl'],'colorMask',{value:vi.fn(),configurable:true});e.appendOperation(makeLayerAdd('A','L','L',{seq:0}),'remote');e.setActiveLayer('L');e.setCompositeOrder([{id:'L',opacity:1}]);e.setTool('watercolor');e.setPencil(preset);e.setSize(6)}
 try{
  const prior=makeStroke('A','L',[dab(20,24)],{id:'prior',strokeId:'prior',seq:1,tool:'watercolor',preset,timestamp:Date.now()})
  a.appendOperation(prior,'remote')
  const dry=kind==='hide'?{id:'own-hide',type:'layer_visibility' as const,layerId:'L',visible:false,userId:'A',timestamp:Date.now()}:{id:'own-dry',type:'paper_dry' as const,...kind==='layer-Dry'?{layerId:'L'}:{},userId:'A',timestamp:Date.now()}
  a.appendOperation(dry)
  const peer=makeStroke('B','L',[dab(24,24)],{id:'peer',strokeId:'peer',seq:2,tool:'watercolor',preset,timestamp:Date.now()})
  a.appendOperation(peer,'remote');a.confirmOperation(dry.id,3)
  await vi.waitFor(()=>{expect(a['_opQueue'].length).toBe(0);expect(a['_unsettledLayers'].size).toBe(0);expect(a['_pendingRebuilds'].size).toBe(0);expect(a['_rebuildJobs'].size).toBe(0)},{timeout:8000})
  for(const op of [prior,peer,{...dry,seq:3}])oracle.appendOperation(op,'remote')
  for(const e of [a,oracle]){e.setPencil('normal:95:0:PB29:round:wc@m70-r2-v1');simulateStrokeStart(e,24,24);simulateStrokeMove(e,30,24)}
  expect(oracle['_ribbonStrokeScratch']!.pigmentInputsKnownZero).toBe(true)
  expect(a['_ribbonStrokeScratch']!.pigmentInputsKnownZero).toBe(true)
 }finally{a.destroy();oracle.destroy()}
})

it('does not introduce M70 material-order handling into purely legacy Dry',async()=>{
 const e=createTestEngine({userId:'A',watercolorModel:'legacy'},{width:64,height:64}).engine;await e.paperReady();Object.defineProperty(e['gl'],'colorMask',{value:vi.fn(),configurable:true})
 try{
  e.appendOperation(makeLayerAdd('A','L','L',{seq:0}),'remote');e.setActiveLayer('L');e.setCompositeOrder([{id:'L',opacity:1}]);e.setTool('watercolor');e.setPencil('normal:95:34:PB29:round');e.setSize(6)
  simulateStrokeStart(e,20,24);simulateStrokeMove(e,30,24);simulateStrokeEnd(e,36,24)
  const own=e.getOperations().find(x=>x.type==='stroke')!,rebuild=vi.spyOn(e as unknown as {_rebuildLayerOrDefer(id:string):void},'_rebuildLayerOrDefer')
  e.appendOperation({id:'dry',type:'paper_dry',layerId:'L',userId:'B',seq:1,timestamp:Date.now()},'remote');e.confirmOperation(own.id,2)
  expect(rebuild).not.toHaveBeenCalled();expect(e['_unsettledLayers'].size).toBe(0)
 }finally{e.destroy()}
})
