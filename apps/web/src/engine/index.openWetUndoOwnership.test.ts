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

it('two concurrent authors retain native target ownership through accepted operation reordering',async()=>{
 vi.useFakeTimers({toFake:['Date','setTimeout','clearTimeout','setInterval','clearInterval']})
 let wall=1_000_000
 const clock=vi.spyOn(Date,'now').mockImplementation(()=>wall)
 const pending:Array<{actor:number;op:Parameters<ReturnType<typeof createTestEngine>['engine']['appendOperation']>[0]}>=[]
 const engines=[0,1].map(actor=>createTestEngine({userId:['A','B'][actor],watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32,onLocalOperation:op=>{pending.push({actor,op})}},{width:32,height:32}).engine)
 const started:Array<{actor:number;model:unknown;stack:string|undefined}>=[]
 const spies:Array<{mockRestore():void}>=[]
 try{
  for(const [actor,engine]of engines.entries()){
   await paperReady(engine);Object.defineProperty(engine['gl'],'colorMask',{value:vi.fn(),configurable:true})
   engine.appendOperation({...makeLayerAdd('C','L'),seq:1},'remote');engine.setActiveLayer('L');engine.setTool('watercolor');engine.setPencil('normal:95:34:PB29:round')
   const original=engine['_startSettle'].bind(engine)
   spies.push(vi.spyOn(engine as unknown as {_startSettle(...args:unknown[]):void},'_startSettle').mockImplementation((...args)=>{
    const scratch=args[0] as {finishContext?:{profile?:{materialModel?:string}}}
    started.push({actor,model:scratch.finishContext?.profile?.materialModel,stack:new Error().stack})
    return original(...args as Parameters<typeof original>)
   }))
  }
  let seq=1
  for(let n=0;n<50;n++){
   wall+=10
   for(const [actor,engine]of engines.entries()){
    simulateStrokeStart(engine,8+actor*4,8+n%6);simulateStrokeMove(engine,15+actor*4,8+n%6)
   }
   simulateStrokeEnd(engines[0],15,8+n%6)
   const a=pending.shift()!;a.op={...a.op,seq:++seq}
   engines[1].appendOperation(a.op,'remote') // Accepted peer stroke waits under B's held source.
   simulateStrokeEnd(engines[1],19,8+n%6)
   const b=pending.shift()!;b.op={...b.op,seq:++seq}
   engines[0].confirmOperation(a.op.id,a.op.seq!);engines[1].confirmOperation(b.op.id,b.op.seq!)
   engines[0].appendOperation(b.op,'remote')
   for(let tick=0;tick<6;tick++)await vi.runOnlyPendingTimersAsync()
  }
  for(const engine of engines){engine['_flushOpQueue']();expect(engine.getOperations().filter(op=>op.type==='stroke')).toHaveLength(100);expect(()=>engine['_puddle']!.canonicalTiles(engine['_layers'].get('L')!)).not.toThrow()}
  expect(started).toEqual([])
 }finally{for(const spy of spies)spy.mockRestore();for(const engine of engines)engine.destroy();clock.mockRestore();vi.useRealTimers()}
},30000)
