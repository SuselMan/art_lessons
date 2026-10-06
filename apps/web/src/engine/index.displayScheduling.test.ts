import { afterEach, expect, it, vi } from 'vitest'
import type { PencilEngine } from './index'
import { createTestEngine, makeLayerAdd, paperReady, simulateStroke, simulateStrokeStart, simulateStrokeEnd } from './testing/engineTestUtils'
const engines: PencilEngine[] = []
afterEach(() => { for (const e of engines.splice(0)) e.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
async function setup() {
  const { engine: e } = createTestEngine({ userId: 'author' }, { width: 64, height: 64 }); engines.push(e)
  e.appendOperation(makeLayerAdd('author', 'L')); e.setCompositeOrder([{ id: 'L', opacity: 1 }]); e.setActiveLayer('L'); e.setTool('watercolor'); e.setPencil('normal:92:42:PB29'); e.setSize(24)
  await paperReady(e)
  vi.useFakeTimers()
  let id=0; const raf=new Map<number, FrameRequestCallback>()
  vi.stubGlobal('requestAnimationFrame', (f:FrameRequestCallback)=>{ raf.set(++id,f);return id })
  vi.stubGlobal('cancelAnimationFrame', (n:number)=>raf.delete(n))
  const flush=()=>{const work=[...raf.values()];raf.clear();for(const f of work)f(performance.now())}
  return {e,raf,flush}
}
it('DEV T suppresses reveal-owned frames during pen-down and resumes the real reveal after pen-up', async()=>{
  const {e,raf,flush}=await setup();e['_diagnosticRevealPause']=true
  simulateStroke(e,[{x:16,y:20},{x:32,y:20},{x:48,y:20}]);e['_completeSettle']();e['_display']()
  expect(e['_washReveals'].size).toBeGreaterThan(0)
  simulateStrokeStart(e,16,40)
  const requests=vi.spyOn(e as unknown as {_displayIfNotSuspended():void},'_displayIfNotSuspended')
  vi.advanceTimersByTime(70)
  expect(requests).not.toHaveBeenCalled();expect(e['_revealTimer']).toBe(0)
  // A live input's owed frame still paints; only reveal-owned requests pause.
  e['_scheduleDisplay']();flush();expect(e['_washReveals'].size).toBeGreaterThan(0)
  simulateStrokeEnd(e,32,40);e['_completeSettle']();e['_display']()
  requests.mockClear();vi.advanceTimersByTime(33)
  expect(requests).toHaveBeenCalled();expect(raf.size).toBeGreaterThan(0)
  flush();vi.advanceTimersByTime(9000);flush();e['_display']()
  expect(e['_washReveals'].size).toBe(0)
})
it('default OFF keeps the baseline reveal timer behavior',async()=>{
  const {e}=await setup();simulateStroke(e,[{x:16,y:20},{x:32,y:20}]);e['_completeSettle']();e['_display']();simulateStrokeStart(e,16,40)
  const requests=vi.spyOn(e as unknown as {_displayIfNotSuspended():void},'_displayIfNotSuspended');vi.advanceTimersByTime(70)
  expect(requests).toHaveBeenCalled()
})
it('DEV R renders latest state once when a direct display replaces an owed RAF, then accepts future changes',async()=>{
  const {e,raf,flush}=await setup();e['_diagnosticDisplayRafCancel']=true
  const compose=vi.spyOn(e as unknown as {_composePaperToScreen(...args:unknown[]):void},'_composePaperToScreen')
  e['_scheduleDisplay']();e['_scheduleDisplay']();expect(raf.size).toBe(1)
  e['_display']();expect(compose).toHaveBeenCalledOnce();expect(raf.size).toBe(0)
  flush();expect(compose).toHaveBeenCalledOnce()
  e['_scheduleDisplay']();flush();expect(compose).toHaveBeenCalledTimes(2)
})
it('DEV R retains the debug latency sample for a cancelled owed frame',async()=>{
  const {e,flush}=await setup();e['_diagnosticDisplayRafCancel']=true;e['_debug']=true;e['_dbgPendingFrameTimestamp']=performance.now()-10
  e['_scheduleDisplay']();e['_display']();flush()
  expect(e['_dbgFrameCount']).toBe(1);expect(e['_dbgFrameSum']).toBeGreaterThanOrEqual(10);expect(e['_dbgPendingFrameTimestamp']).toBeNull()
})
