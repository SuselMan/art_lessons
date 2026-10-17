import {expect,it,vi} from 'vitest'
import {createTestEngine,makeLayerAdd,paperReady,simulateStrokeStart} from './testing/engineTestUtils'
it('context loss stops the dwell interval rather than retaining a recurring no-op after the physical stroke is gone',async()=>{
 const {engine}=createTestEngine({userId:'A',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine);engine.appendOperation(makeLayerAdd('A','L'),'remote');engine.setActiveLayer('L');engine.setTool('liner')
 const state=engine as unknown as {_dwellTimer:unknown;_dwellCfg:unknown;_handleContextLost(event:Event):void;_paintDwellDab(...args:unknown[]):void}
 vi.useFakeTimers()
 try{
  simulateStrokeStart(engine,10,10)
  expect(state._dwellTimer).not.toBeNull()
  const paint=vi.spyOn(state,'_paintDwellDab')
  state._handleContextLost({preventDefault(){}} as Event)
  vi.advanceTimersByTime(500)
  expect(paint).not.toHaveBeenCalled()
  expect(state._dwellTimer).toBeNull();expect(state._dwellCfg).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
 }finally{engine.destroy();vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks()}
})
