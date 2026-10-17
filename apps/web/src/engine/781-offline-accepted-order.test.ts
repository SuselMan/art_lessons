import {expect,it,vi} from 'vitest'
import {createTestEngine,dab,makeLayerAdd,makeStroke,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd} from './testing/engineTestUtils'


it('reconnect public batch repairs B accepted before an already-painted pending A stroke',async()=>{
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1'},{width:64,height:64});await engine.paperReady()
 Object.defineProperty(engine['gl'],'colorMask',{value:vi.fn(),configurable:true})
 const preset='normal:95:34:PB29:round:wc@m70-r2-v1'
 try{
  engine.appendOperation(makeLayerAdd('A','L','L',{seq:0}),'remote');engine.setActiveLayer('L');engine.setCompositeOrder([{id:'L',opacity:1}]);engine.setTool('watercolor');engine.setPencil(preset);engine.setSize(6)
  engine.appendOperation(makeLayerAdd('B','other','other',{seq:0}),'remote')
  engine.appendOperation(makeStroke('B','other',[dab(10,10)],{id:'untouched-other',strokeId:'untouched-other',seq:0,tool:'watercolor',preset,timestamp:Date.now()}),'remote')
  simulateStrokeStart(engine,20,24);simulateStrokeMove(engine,30,24);simulateStrokeEnd(engine,36,24)
  const own=engine.getOperations().find(op=>op.type==='stroke'&&op.userId==='A')!
  const puddle=engine['_puddleFor'](),source=vi.spyOn(puddle,'source')
  const overtaken=engine['_noteOvertaken'].bind(engine),owed:boolean[]=[]
  vi.spyOn(engine as unknown as {_noteOvertaken:typeof overtaken},'_noteOvertaken').mockImplementation((...args)=>{overtaken(...args);owed.push(engine['_unsettledLayers'].has('L'))})
  const rebuild=vi.spyOn(engine as unknown as {_rebuildLayerOrDefer(id:string):void},'_rebuildLayerOrDefer')
  engine.suspendDisplay()
  engine.appendOperation(makeStroke('B','L',[dab(22,24),dab(30,24)],{id:'B',strokeId:'B',seq:1,tool:'watercolor',preset,timestamp:Date.now()}),'remote')
  engine.confirmOperation(own.id,2)
  expect(owed).toContain(true)
  engine.resumeDisplay()
  await vi.waitFor(()=>{
   const order=source.mock.calls.map(a=>a[1])
   expect(order.slice(-2)).toEqual(['B',own.type==='stroke'?own.strokeId:undefined])
  },{timeout:2000})
  expect(engine['_unsettledLayers'].has('L')).toBe(false)
  expect(engine['_pendingRebuilds'].size).toBe(0)
  expect(rebuild.mock.calls.every(([id])=>id==='L')).toBe(true)
  expect(puddle.hasMaterial(engine['_layers'].get('other')!)).toBe(true)
 }finally{engine.destroy()}
})

it('preserves the legacy open-wash joining delay for an owed accepted-order repair',async()=>{
 const {engine}=createTestEngine({userId:'A',watercolorModel:'legacy'},{width:64,height:64});await engine.paperReady()
 Object.defineProperty(engine['gl'],'colorMask',{value:vi.fn(),configurable:true})
 try{
  engine.appendOperation(makeLayerAdd('A','L','L',{seq:0}),'remote');engine.setActiveLayer('L');engine.setCompositeOrder([{id:'L',opacity:1}]);engine.setTool('watercolor');engine.setPencil('normal:95:34:PB29:round');engine.setSize(6)
  simulateStrokeStart(engine,20,24);simulateStrokeMove(engine,30,24);simulateStrokeEnd(engine,36,24)
  const own=engine.getOperations().find(op=>op.type==='stroke'&&op.userId==='A')!,rebuild=vi.spyOn(engine as unknown as {_rebuildLayerOrDefer(id:string):void},'_rebuildLayerOrDefer')
  engine.suspendDisplay();engine.appendOperation(makeStroke('B','L',[dab(22,24)],{id:'B',strokeId:'B',seq:1,tool:'watercolor',preset:'normal:95:34:PB29:round',timestamp:Date.now()}),'remote');engine.confirmOperation(own.id,2);engine.resumeDisplay()
  expect(engine['_unsettledLayers'].has('L')).toBe(true)
  expect(rebuild).not.toHaveBeenCalled()
 }finally{engine.destroy()}
})
