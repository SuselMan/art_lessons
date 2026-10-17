import {expect,it,vi} from 'vitest'
import {createTestEngine,paperReady,makeLayerAdd,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd} from './testing/engineTestUtils'
// Material/checkpoint ownership proof; native fluid parity is hardware QA.
vi.mock('./src/watercolor/puddle/PuddleTarget',()=>({createNativePuddleTarget:()=>({state:{done:true},resetFromScratch(){},step(){},dry(){},cancel(){},destroy(){},buffers:()=>({p:{},c:{},coverage:{}})})}))
vi.mock('./src/watercolor/puddle/PuddlePresentation',()=>({createPuddlePresentation:()=>({invalidate(){},destroy(){},reset(){},setTarget(){},acceptInput(){},tick:()=>({copyTo(){}})})}))
it('desktop M70 ninth DOWN never checkpoints eight still-wet operations as a legacy carried wash',async()=>{
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 vi.useFakeTimers({toFake:['Date','setTimeout','clearTimeout','setInterval','clearInterval']})
 let wall=1_000_000;const clock=vi.spyOn(Date,'now').mockImplementation(()=>wall)
 try{
  Object.defineProperty(engine,'_gpuBudget',{value:Infinity,configurable:true})
  engine.appendOperation({...makeLayerAdd('C','L'),seq:1},'remote')
  engine.setActiveLayer('L');engine.setTool('watercolor');engine.setPencil('normal:95:34:PB29:round')
  for(let n=0;n<8;n++){
   wall+=10;simulateStrokeStart(engine,8,8+n%4);simulateStrokeMove(engine,15,8+n%4);simulateStrokeEnd(engine,15,8+n%4)
  }
  expect(engine.getOperations().filter(op=>op.type==='stroke')).toHaveLength(8)
  simulateStrokeStart(engine,8,12)
  expect(engine['_washBoundaries'].size).toBe(0)
  simulateStrokeEnd(engine,8,12)
  await vi.advanceTimersByTimeAsync(1)
  expect(engine['_checkpoints'].all().some(cp=>cp.washIds?.includes('m70:L'))).toBe(false)
 }finally{engine.destroy();clock.mockRestore();vi.useRealTimers()}
})
it('still checkpoints an ordinary pencil prefix before the first M70 material is painted',async()=>{
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 vi.useFakeTimers({toFake:['Date','setTimeout','clearTimeout','setInterval','clearInterval']})
 const clock=vi.spyOn(Date,'now').mockReturnValue(1_000_000)
 try{
  Object.defineProperty(engine,'_gpuBudget',{value:Infinity,configurable:true})
  engine.appendOperation({...makeLayerAdd('C','L'),seq:1},'remote')
  engine.setActiveLayer('L');engine.setTool('pencil')
  for(let n=0;n<4;n++){simulateStrokeStart(engine,8,8+n);simulateStrokeMove(engine,15,8+n);simulateStrokeEnd(engine,15,8+n)}
  engine.setTool('watercolor');engine.setPencil('normal:95:34:PB29:round')
  simulateStrokeStart(engine,8,12)
  expect(engine['_washBoundaries'].size).toBe(1)
  simulateStrokeEnd(engine,8,12)
  await vi.advanceTimersByTimeAsync(1)
  expect(engine['_checkpoints'].all().some(cp=>cp.opIds.length===4 && !cp.washIds?.length)).toBe(true)
 }finally{engine.destroy();clock.mockRestore();vi.useRealTimers()}
})
