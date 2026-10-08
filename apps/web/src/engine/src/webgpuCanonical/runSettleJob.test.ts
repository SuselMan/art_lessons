import { expect, it } from 'vitest'
import { CanonicalWatercolorSettlePlan } from '../raster/CanonicalWatercolorSettlePlan'
import { traceFixture } from '../raster/CanonicalWatercolorSettlePlan.fixture'
import { runCanonicalSettleJob } from './runSettleJob'

function trace(grouped: boolean, half: boolean, mixed: boolean, failure?: 'op' | 'finish' | 'composite') {
 const f = traceFixture(half, mixed, true, true, true), builder = new CanonicalWatercolorSettlePlan(f.context)
 const plan = builder.prepare(f.scratch, [{ buffer: f.tile, originX: 0, originY: 0, contentRect: null }],
  { minX: f.width / 2 - 12, minY: f.width / 2 - 12, maxX: f.width / 2 + 12, maxY: f.width / 2 + 12 }, .2, half ? 400 : 8, 1, 1, 1, 1)!
 let submissions = 0, scopes = 0, disposeCalls = 0
 const failureToken = new Error('synthetic dispatch/composite failure')
 const finish = plan.finish, dispose = plan.dispose
 if (failure === 'op') plan.ops.splice(5, 0, () => { throw failureToken })
 if (failure === 'finish') plan.finish = () => { finish(); throw failureToken }
 plan.dispose = () => { disposeCalls++; dispose() }
 const scope = { runQuantum<T>(task: (context: object) => T): T { scopes++; const result = task({}); submissions++; return result } }
 let error: unknown
 try { runCanonicalSettleJob(scope, plan, () => { f.record('finalComposite', []); if (failure === 'composite') throw failureToken }, grouped) }
 catch (caught) { error = caught }
 builder.destroyTextures()
 return { events: f.events, submissions, scopes, disposeCalls, error, failureToken, ops: plan.ops.length }
}

it.each([false, true].flatMap(half => [false, true].map(mixed => ({ half, mixed }))))('grouped actual planner trace keeps pass/copy/upload/resource order half=$half mixed=$mixed', ({ half, mixed }) => {
 const serial = trace(false, half, mixed), grouped = trace(true, half, mixed)
 expect(grouped.events).toEqual(serial.events)
 expect(grouped.error).toBeUndefined(); expect(serial.error).toBeUndefined()
 expect(grouped.submissions).toBe(1); expect(serial.submissions).toBe(serial.ops + 2)
 expect(grouped.disposeCalls).toBe(1); expect(serial.disposeCalls).toBe(1)
 for (const event of ['front', 'brush', 'uploadFlow', 'uploadForeign', 'region', 'finalComposite']) expect(grouped.events.some(row => row[0] === event)).toBe(true)
 if (half) expect(grouped.events.some(row => row[0] === 'resample')).toBe(true)
})

it.each(['op', 'finish', 'composite'] as const)('failed %s disposes exactly once and preserves original error in either scope policy', failure => {
 const serial = trace(false, false, true, failure), grouped = trace(true, false, true, failure)
 expect(grouped.events).toEqual(serial.events)
 expect(grouped.error).toBe(grouped.failureToken); expect(serial.error).toBe(serial.failureToken)
 expect(grouped.disposeCalls).toBe(1); expect(serial.disposeCalls).toBe(1)
 expect(grouped.submissions).toBe(0)
 expect(grouped.events.some(row => row[0] === 'releaseCoverage')).toBe(true)
})
