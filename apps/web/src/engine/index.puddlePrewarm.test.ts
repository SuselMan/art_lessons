import { afterEach, expect, it, vi } from 'vitest'
import { createTestEngine, makeLayerAdd, paperReady, simulateStroke } from './testing/engineTestUtils'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

for (const geometry of [
  {name: 'infinite', pageWidth: 64, pageHeight: 64, infinite: true},
]) it(`does not prewarm M70 when a pencil layer is selected on ${geometry.name} geometry`, async () => {
  const {engine} = createTestEngine({userId: 'artist', watercolorModel: 'm70-r2-v1',
    pageWidth: geometry.pageWidth, pageHeight: geometry.pageHeight, infinite: geometry.infinite}, {width: 64, height: 64})
  await paperReady(engine)
  const internal = engine as unknown as {_puddleFor(): unknown; _tileSize(): {w: number; h: number}}
  const prewarm = vi.spyOn(internal, '_puddleFor').mockImplementation(() => {throw Error('Unsupported prewarm')})
  vi.useFakeTimers()
  engine.appendOperation(makeLayerAdd('artist', 'paint'), 'remote')
  engine.setActiveLayer('paint')
  expect(() => vi.advanceTimersByTime(51)).not.toThrow()
  expect(prewarm).not.toHaveBeenCalled()
  simulateStroke(engine, [{x: 10, y: 12}, {x: 25, y: 12}])
  expect(engine.getOperations().filter(op => op.type === 'stroke')).toHaveLength(1)
})

it.each([[64,64],[2480,3508]])('prewarms a finite %ix%i free layer, but does not allocate a third wet source', async (pageWidth,pageHeight) => {
  const {engine} = createTestEngine({userId: 'artist', watercolorModel: 'm70-r2-v1',
    pageWidth, pageHeight}, {width: 64, height: 64})
  await paperReady(engine)
  const internal = engine as unknown as {_puddleFor(): unknown; _puddle: unknown}
  const source = vi.fn()
  const prewarm = vi.spyOn(internal, '_puddleFor').mockReturnValue({source})
  vi.useFakeTimers()
  engine.appendOperation(makeLayerAdd('artist', 'paint'), 'remote')
  engine.setActiveLayer('paint')
  vi.advanceTimersByTime(51)
  expect(prewarm).toHaveBeenCalledTimes(1)
  expect(source.mock.calls[0][1]).toBe('prewarm')
  const occupied = {state: {layers: 2}, has: () => false, owns: () => false, presentAll: vi.fn()}
  internal._puddle = occupied
  try {
    engine.appendOperation(makeLayerAdd('artist', 'third'), 'remote')
    engine.setActiveLayer('third')
    vi.advanceTimersByTime(51)
    expect(prewarm).toHaveBeenCalledTimes(1)
    expect(source).toHaveBeenCalledTimes(1)
  } finally { internal._puddle = null }
})

it('does not let an empty prewarm block an otherwise publishable layer', async () => {
  const {engine} = createTestEngine({userId: 'artist', watercolorModel: 'm70-r2-v1',
    pageWidth: 64, pageHeight: 64}, {width: 64, height: 64})
  await paperReady(engine)
  vi.useFakeTimers()
  try {
    engine.appendOperation(makeLayerAdd('artist', 'paint'), 'remote')
    engine.setActiveLayer('paint')
    expect(engine['_snapshotQuiet']('paint')).toBe(true)
    vi.advanceTimersByTime(51)
    expect(engine['_puddle']?.state.layers).toBe(1)
    expect(engine['_snapshotQuiet']('paint')).toBe(true)
  } finally {engine.destroy()}
})
