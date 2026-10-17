import {expect,it,vi} from 'vitest'
import {createTestEngine,makeLayerAdd,makeStroke,dab,paperReady,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd} from './testing/engineTestUtils'
// Keep the real native-target ownership guard; MockGL is not a physics oracle.
it('native target ownership stays exclusive across opt-in fast Undo and independent replay',async()=>{
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 Object.defineProperty(engine['gl'],'colorMask',{value:vi.fn(),configurable:true})
 try{
  engine.appendOperation(makeLayerAdd('B','L'),'remote')
  engine.appendOperation(makeStroke('B','L',[dab(10,10,{size:4})],{id:'prior',strokeId:'prior',washId:'m70:L',tool:'watercolor',preset:'normal:95:34:PB29:round:wc@m70-r2-v1',timestamp:Date.now(),seq:2}),'remote')
  engine.setActiveLayer('L');engine.setTool('watercolor');engine.setPencil('normal:95:34:PB29:round')
  engine['_puddle']!.canonicalTiles(engine['_layers'].get('L')!)
  engine.diagnosticOpenWetUndoCache=true
  simulateStrokeStart(engine,10,10);simulateStrokeMove(engine,15,10);simulateStrokeEnd(engine,15,10)
  const own=engine.getOperations().find(op=>op.type==='stroke'&&op.userId==='A')!
  engine.confirmOperation(own.id,3)
  engine['_puddle']!.canonicalTiles(engine['_layers'].get('L')!)
  expect(engine['_puddle']!.state.undoCaptures).toBe(1)
  engine.undo()
  expect(engine['_puddle']!.state.undoHits).toBe(1)
  expect(engine['_settle']).toBeNull()
  expect(()=>engine.bakeLayerByFullReplay('L')).not.toThrow()
 }finally{engine.destroy()}
})
