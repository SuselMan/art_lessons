import {expect,it,vi} from 'vitest'
import {createTestEngine,dab,makeLayerAdd,makeStroke,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd} from './testing/engineTestUtils'

it.each([
 {name:'forward expiry crossing',oldAge:119_000,elapsed:2_000,repair:true},
 {name:'same wet epoch',oldAge:119_000,elapsed:500,repair:false},
 {name:'already dry at DOWN',oldAge:121_000,elapsed:2_000,repair:false},
 {name:'backward clock restores earlier wet epoch',oldAge:121_000,elapsed:-2_000,repair:true},
 {name:'empty prewarm is not old material',oldAge:null,elapsed:121_000,repair:false},
 {name:'recorded chunk refreshes expiry basis',oldAge:119_000,chunkAt:500,elapsed:2_000,repair:false},
 {name:'chunk mismatch keeps repair owed until UP',oldAge:119_000,chunkAt:2_000,elapsed:3_000,repair:true},
 {name:'gap after recorded chunk expires epoch',oldAge:119_000,chunkAt:500,elapsed:121_000,repair:true},
])('$name: reconciles recorded timestamp without unconditional replay',async({oldAge,elapsed,repair,chunkAt})=>{
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1'},{width:64,height:64})
 await engine.paperReady()
 Object.defineProperty(engine['gl'],'colorMask',{value:vi.fn(),configurable:true})
 const preset='normal:95:34:PB29:round:wc@m70-r2-v1'
 let now=1_000_000
 const clock=vi.spyOn(Date,'now').mockImplementation(()=>now)
 const rebuild=vi.spyOn(engine as unknown as {_rebuildLayerOrDefer(id:string):void},'_rebuildLayerOrDefer').mockImplementation(()=>{})
 try{
  engine.appendOperation(makeLayerAdd('A','L','L',{seq:1}),'remote')
  engine.setActiveLayer('L');engine.setCompositeOrder([{id:'L',opacity:1}])
  if(oldAge!==null){
  const old=makeStroke('A','L',[dab(20,24)],{id:'old',seq:2,tool:'watercolor',preset,timestamp:now-oldAge})
  engine.appendOperation(old,'remote')
  }
  engine.setTool('watercolor');engine.setPencil(preset);engine.setSize(6)
  simulateStrokeStart(engine,22,24);simulateStrokeMove(engine,30,24)
  rebuild.mockClear()
  if(chunkAt!==undefined){
   now+=chunkAt
   engine['_flushStrokeChunk']()
   expect(rebuild).not.toHaveBeenCalled()
   simulateStrokeMove(engine,34,24)
   now-=chunkAt
  }
  now+=elapsed
  simulateStrokeEnd(engine,36,24)
  const recorded=engine.getOperations().filter(o=>o.type==='stroke').at(-1)!
  expect(recorded.timestamp).toBe(now)
  if(repair)expect(rebuild).toHaveBeenCalledExactlyOnceWith('L')
  else expect(rebuild).not.toHaveBeenCalled()
 }finally{rebuild.mockRestore();clock.mockRestore();engine.destroy()}
})
