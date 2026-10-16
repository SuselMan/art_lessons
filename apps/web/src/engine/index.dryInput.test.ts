import { expect, it, vi } from 'vitest'
import { createTestEngine, makeLayerAdd, paperReady, simulateStrokeStart, simulateStrokeMove, simulateStrokeEnd } from './testing/engineTestUtils'

async function setup() {
  const {engine} = createTestEngine({userId: 'artist'}, {width: 64, height: 64})
  await paperReady(engine)
  engine.appendOperation(makeLayerAdd('artist', 'paint'), 'remote')
  engine.setActiveLayer('paint')
  let drying = true
  const finishDrying = vi.fn(() => { drying = false })
  const controller = {get state() {return {drying}}, finishDrying,
    close: vi.fn(), has: () => false, owns: () => false, presentAll: vi.fn()}
  const internal = engine as unknown as {_puddle: unknown; _strokeId: string | null; _opQueue: unknown[]}
  internal._puddle = controller
  return {engine, internal, finishDrying, controller}
}

it('accepts a real DOWN after Dry, records the stroke, and leaves peer operations queued', async () => {
  const {engine, internal, finishDrying, controller} = await setup()
  const sentinel = {notAppliedDuringDown: true}
  internal._opQueue.push(sentinel)
  try {
    simulateStrokeStart(engine, 10, 20)
    expect(finishDrying).toHaveBeenCalledTimes(1)
    expect(controller.state.drying).toBe(false)
    expect(internal._strokeId).toBeTruthy()
    expect(internal._opQueue).toEqual([sentinel])
    // Sentinel is not an actual remote op. Its survival above proves no flush;
    // remove it before UP's ordinary operation drain.
    internal._opQueue.length = 0
    simulateStrokeMove(engine, 25, 20)
    simulateStrokeEnd(engine, 35, 20)
    expect(engine.getOperations().filter(op => op.type === 'stroke')).toHaveLength(1)
  } finally { internal._opQueue.length = 0; internal._puddle = null }
})

it('does not materialize Dry for a locked touch', async () => {
  const {engine, internal, finishDrying, controller} = await setup()
  try {
    engine.setLocked(true)
    simulateStrokeStart(engine, 10, 20)
    expect(finishDrying).not.toHaveBeenCalled()
    expect(controller.state.drying).toBe(true)
    expect(internal._strokeId).toBeNull()
    expect(engine.getOperations().filter(op => op.type === 'stroke')).toEqual([])
  } finally { internal._puddle = null }
})
