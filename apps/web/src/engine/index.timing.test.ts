import { afterEach, expect, it } from 'vitest'
import { glUpTimingGate } from '../../../../docs/qa/harness/728-gl-timing/GlTiming400Gate.mjs'
import { watercolorQaOptions } from '../pages/Room/diagnostics/watercolorQaOptions'
import { BoundedGlTiming } from './src/diagnostics/BoundedGlTiming'
import { createTestEngine, makeLayerAdd, paperReady, simulateStroke, simulateStrokeStart, simulateStrokeEnd } from './testing/engineTestUtils'
import type { PencilEngine } from './index'
const engines: PencilEngine[] = []
afterEach(() => { for (const e of engines.splice(0)) if (!e['_destroyed']) e.destroy() })
it('bounded observations preserve original results/errors and own exported records', () => {
  let tick = 0
  const timer = new BoundedGlTiming(() => ++tick, 2)
  timer.beginInput()
  timer.setStrokeId('owned')
  expect(timer.measure('ok', () => 17)).toBe(17)
  const sentinel = Error('material failure')
  expect(() => timer.measure('failed', () => { throw sentinel })).toThrow(sentinel)
  timer.firstPigment(); timer.firstPigment()
  const records = timer.export()
  expect(records.map(x => x.phase)).toEqual(['failed', 'first-pigment-submit'])
  ;(records[0] as { phase: string }).phase = 'mutated'
  expect(timer.export()[0].phase).toBe('failed')
  expect(timer.stats()).toMatchObject({capacity:2,recorded:2,dropped:1,observerErrors:0})
  timer.endInput()
  const outsideTick = tick
  timer.mark('outside')
  expect(tick).toBe(outsideTick)
  expect(timer.stats().recorded).toBe(2)
  const broken = new BoundedGlTiming(() => { throw Error('observer clock') })
  broken.beginInput()
  expect(broken.measure('ok', () => 19)).toBe(19)
  expect(() => broken.measure('bad', () => { throw sentinel })).toThrow(sentinel)
  expect(broken.export()).toEqual([])
  expect(broken.stats().observerErrors).toBeGreaterThan(0)
})
async function setup(enabled: boolean) {
  const { engine: e } = createTestEngine({ userId: 'a', diagnosticGlTiming: enabled }, { width: 64, height: 64 })
  engines.push(e)
  e.appendOperation(makeLayerAdd('a', 'L'))
  e.setCompositeOrder([{ id: 'L', opacity: 1 }]); e.setActiveLayer('L')
  await paperReady(e)
  e.setTool('watercolor'); e.setPencil('normal:100:100:PB29:round'); e.setSize(8)
  return e
}
it('actual pointer route observes source before display, retains pending lifecycle and OFF has no observer', async () => {
  const off = await setup(false)
  simulateStroke(off, [{ x: 24, y: 32 }, { x: 40, y: 32 }])
  expect(off.getDiagnosticGlTiming()).toBeNull()
  expect(off['_ribbonPainter'].diagnosticTiming).toBeNull()
  const e = await setup(true)
  simulateStroke(e, [{ x: 24, y: 32 }, { x: 40, y: 32 }])
  const pending = e['_settle']
  expect(pending).not.toBeNull()
  simulateStrokeStart(e, 24, 32)
  const rows = e.getDiagnosticGlTiming()!
  const phases = rows.filter(x => x.input === 2).map(x => x.phase)
  expect(phases).toContain('admission-complete-settle')
  expect(phases).toContain('scratch-first-touch')
  const before = e.getDiagnosticGlTiming()!.length
  const scratch = e['_ribbonStrokeScratch']!
  const tile = scratch.tileEntries().next().value![0]
  scratch.filmBuffers(tile)
  expect(e.getDiagnosticGlTiming()!.length).toBe(before)
  expect(e.getDiagnosticGlTimingStats()).toMatchObject({capacity:1024,dropped:0,observerErrors:0,active:false})
  expect(rows.filter(x=>x.input===2&&x.phase==='first-pigment-submit')[0]).toMatchObject({userId:'a',layerId:'L',strokeId:e['_strokeId']})
  expect(phases).toContain('live-generator-exhaust')
  expect(phases.indexOf('first-pigment-submit')).toBeLessThan(phases.indexOf('display-submit'))
  expect(phases).toContain('input-down-through-display')
  simulateStrokeEnd(e, 40, 32)
  expect(e['_wcJoinedTouchLease']).toBeNull()
})

it('observer clock failure cannot stop an actual stroke or destroy cleanup', async () => {
  const e = await setup(true)
  const broken = new BoundedGlTiming(() => { throw Error('clock unavailable') })
  e['_glTiming'] = broken
  e['_ribbonPainter'].diagnosticTiming = broken
  simulateStroke(e, [{ x: 24, y: 32 }, { x: 40, y: 32 }])
  expect(e.getOperations().some(op => op.type === 'stroke')).toBe(true)
  expect(e.getDiagnosticGlTiming()).toEqual([])
  e.destroy()
  expect(e['_destroyed']).toBe(true)
})

it('pure water never reports positive pigment and later pigment has its own local owner', async () => {
  const e = await setup(true)
  e.setPencil('normal:100:0:PB29:round')
  simulateStroke(e, [{x:24,y:32},{x:40,y:32}])
  expect(e.getDiagnosticGlTiming()!.filter(x=>x.phase==='first-pigment-submit')).toEqual([])
  e.setPencil('normal:100:100:PB29:round')
  simulateStrokeStart(e,24,32)
  const markers=e.getDiagnosticGlTiming()!.filter(x=>x.phase==='first-pigment-submit')
  expect(markers).toHaveLength(1)
  expect(markers[0]).toMatchObject({input:2,userId:'a',layerId:'L',strokeId:e['_strokeId']})
  simulateStrokeEnd(e,40,32)
})
it('strict Room option is DEV only, refuses duplicate/native/deferred and reaches actual constructor', async () => {
  expect(watercolorQaOptions(false,undefined,undefined,'?wcGlTiming=bad&wcGlTiming=1').diagnosticGlTiming).toBe(false)
  for(const search of ['?wcGlTiming=1&wcGlTiming=0','?wcGlTiming=wat','?wcGlTiming=1&wcNative=1','?wcGlTiming=1&qaJoinedTouchMixed=1']) expect(()=>watercolorQaOptions(true,undefined,undefined,search)).toThrow()
  expect(()=>watercolorQaOptions(true,undefined,'1','?wcGlTiming=1')).toThrow()
  const flags=watercolorQaOptions(true,undefined,undefined,'?qaJoinedTouch=1&wcMixedLease=1&wcGlTiming=1')
  const {engine:e}=createTestEngine(flags)
  engines.push(e)
  expect(e.getDiagnosticGlTimingStats()).toMatchObject({capacity:1024,recorded:0,dropped:0,observerErrors:0})
  expect(e['_wcJoinedTouchSnapshotLease']).toBe(true)
  expect(e['_wcJoinedTouch']).toBe(true)
  expect(e['_wcJoinedTouchMixed']).toBe(false)
  expect(e['_wcNativeEnabled']).toBe(false)
  expect(e['_wcAsyncFinish']).toBe(false)
  expect(e['_wcJoinedFinishDeferred']).toBe(false)
  expect(()=>createTestEngine({diagnosticGlTiming:true,nativeWatercolor:true})).toThrow('ordinary synchronous')
})

it('UP retains actual owner after runtime clears stroke and exceptions restore observer scope', async () => {
  const e=await setup(true)
  simulateStrokeStart(e,24,32)
  const id=e['_strokeId']!
  simulateStrokeEnd(e,40,32)
  const rows=e.getDiagnosticGlTiming()!.filter(r=>r.scope==='up')
  expect(rows.length).toBeGreaterThan(0)
  expect(rows.every(r=>r.strokeId===id&&r.userId==='a'&&r.layerId==='L')).toBe(true)
  expect(rows.map(r=>r.phase)).toContain('up-tail-geometry')
  expect(rows.map(r=>r.phase)).toContain('up-finish-total')
  expect(rows.map(r=>r.phase)).toContain('up-diffusion-preparation')
  expect(rows.map(r=>r.phase)).toContain('up-new-solver-start-and-stitch')
  expect(rows.map(r=>r.phase)).toContain('up-local-callback')
  expect(rows.map(r=>r.phase)).toContain('up-pending-commit')
  expect(rows.at(-1)?.phase).toBe('input-up-total')
  expect(e['_strokeId']).toBeNull()
  expect(e.getDiagnosticGlTimingStats()).toMatchObject({active:false,dropped:0,observerErrors:0})
  simulateStrokeStart(e,24,32)
  const sentinel=Error('end callback failed')
  e['_handlers'].strokeEnd=()=>{throw sentinel}
  expect(()=>simulateStrokeEnd(e,40,32)).toThrow(sentinel)
  expect(e.getDiagnosticGlTimingStats()).toMatchObject({active:false,observerErrors:0})
  const last=e.getDiagnosticGlTiming()!.at(-1)!
  expect(last.phase).toBe('input-up-total')
  expect(last.scope).toBe('up')
})

it('UP observer refuses a foreign or absent gesture instead of borrowing the last local ordinal', () => {
  let ticks=0
  const t=new BoundedGlTiming(()=>++ticks)
  t.beginInput('a','L');t.setStrokeId('owned');t.endInput()
  expect(t.beginUp('peer','L','owned')).toBe(false)
  expect(t.beginUp('a','L','different')).toBe(false)
  expect(t.beginUp('a','L',null)).toBe(false)
  expect(t.stats()).toMatchObject({active:false,observerErrors:3,recorded:0})
  expect(ticks).toBe(0)
  expect(t.beginUp('a','L','owned')).toBe(true)
  t.measure('owned-up',()=>17);t.endInput()
  expect(t.export()[0]).toMatchObject({input:1,scope:'up',strokeId:'owned',userId:'a',layerId:'L'})
})

it('actual two gesture UP records satisfy the strict controller gate without replacing clocks', async () => {
  const e=await setup(true),expected: {strokeId:string}[]=[]
  let beforeSecondWet: {layerId:string;at:number;center:number;nearForEligibility:boolean;anyWet:boolean}|null=null
  for(let i=0;i<2;i++){
    if(i===1){const at=performance.now();beforeSecondWet={layerId:'L',at,center:e['_paperWet'].sample('L',24,32,at),nearForEligibility:e['_paperWet'].anyWetNear('L',24,32,6,at),anyWet:e['_paperWet'].anyWet('L',at)}}
    simulateStrokeStart(e,24,32)
    expected.push({strokeId:e['_strokeId']!})
    simulateStrokeEnd(e,40,32)
  }
  const records=e.getDiagnosticGlTiming()!,firstUp=records.find(r=>r.input===1&&r.phase==='input-up-total')!,secondDown=records.find(r=>r.input===2&&r.phase==='input-down-through-display')!
  const gate=glUpTimingGate({records,expected,userId:'a',layerId:'L',betweenGesture:{firstUpReturn:firstUp.end,secondDownBegin:secondDown.start,gapFromFirstUpReturnMs:secondDown.start-firstUp.end},beforeSecondWet})
  expect(gate.valid).toBe(true)
  expect(gate.inputs).toHaveLength(2)
  expect(gate.inputs!.every((r:{unknownExclusiveMs:number})=>r.unknownExclusiveMs>=0)).toBe(true)
})
