import { describe, expect, it, vi } from 'vitest'
import type { ILayerBuffer } from '../../buffers/ILayerBuffer'
import { PuddleRoomController, type PuddleRoomHost } from './PuddleRoomController'

vi.mock('../../buffers/AccumulationBuffer', () => ({ AccumulationBuffer: class {
  copyTo = vi.fn()
  destroy = vi.fn()
} }))
vi.mock('../../buffers/RibbonStrokeScratch', () => ({ RibbonStrokeScratch: class {
  releaseFilm = vi.fn()
  beginStroke = vi.fn()
  destroy = vi.fn()
  peek = vi.fn()
} }))
vi.mock('./PuddleTarget', () => ({ createNativePuddleTarget: () => ({ cancel: vi.fn(), destroy: vi.fn(), resetFromScratch: vi.fn(), state: {done: true}, dry: vi.fn(), buffers: () => ({p: {}, c: {}, coverage: {}}) }) }))
vi.mock('./PuddlePresentation', () => ({ createPuddlePresentation: () => ({ invalidate: vi.fn(), destroy: vi.fn(), reset: vi.fn(), setTarget: vi.fn(), acceptInput: vi.fn(), tick: vi.fn(() => ({copyTo: vi.fn()})) }) }))

// No raster assertions: exercise layer lifecycle ownership, the part which
// would make drying one participant's layer unexpectedly remove another wash.
describe('room puddle layer-scoped closure', () => {
  it('dry(target) releases only that empty layer and preserves the other source', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const released = vi.fn()
    const controller = new PuddleRoomController({
      gl: {}, pool: {}, size: 16, settlePlan: {prepare: vi.fn()}, released,
    } as unknown as PuddleRoomHost)
    const a = {} as ILayerBuffer, b = {} as ILayerBuffer
    const profile = {ink: {}, normalizeDeposit: false} as Parameters<typeof controller.source>[2]
    controller.source(a, 'a', profile, 1)
    controller.source(b, 'b', profile, 1)
    controller.dry(a)
    expect(controller.has(a)).toBe(false)
    expect(controller.has(b)).toBe(true)
    expect(controller.state.drying).toBe(false)
    expect(released).toHaveBeenCalledTimes(1)
    controller.dry()
    expect(controller.state.layers).toBe(0)
    controller.destroy()
    vi.unstubAllGlobals()
  })
})

it('erases the dry baseline while retaining wet material buffers for target recomputation', () => {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const render = vi.fn()
  const controller = new PuddleRoomController({
    gl: {}, pool: {}, size: 16, settlePlan: {prepare: vi.fn()},
    released: vi.fn(), changed: vi.fn(), render,
  } as unknown as PuddleRoomHost)
  const target = {} as ILayerBuffer
  const profile = {ink: {}, normalizeDeposit: false} as Parameters<typeof controller.source>[2]
  const {scratch} = controller.source(target, 'a', profile, 1)
  const tile = {originX: 0, originY: 0, buffer: {width: 16, height: 16}}
  const entry = {original: {copyTo: vi.fn()}, inkLoad: {}, inkColor: {}, coverage: {}}
  Object.defineProperty(scratch, 'finishContext', {value: {target: {allResident: () => [tile]}}})
  vi.mocked(scratch.peek).mockReturnValue(entry as unknown as ReturnType<typeof scratch.peek>)
  controller.accept(scratch)
  render.mockClear()
  const paint = vi.fn()
  expect(controller.eraseDryBase(target, paint)).toBe(true)
  expect(paint).toHaveBeenCalledExactlyOnceWith(entry.original)
  expect(render.mock.calls[0][4]).toEqual({p: entry.inkLoad, c: entry.inkColor, coverage: entry.coverage})
  expect(controller.state.pending).toBe(true)
  expect(controller.has(target)).toBe(true)
  controller.destroy()
  vi.unstubAllGlobals()
})

function wetController(timestamp: number) {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const render = vi.fn(), changed = vi.fn()
  const controller = new PuddleRoomController({
    gl: {}, pool: {}, size: 16, settlePlan: {prepare: vi.fn()},
    released: vi.fn(), changed, render,
  } as unknown as PuddleRoomHost)
  const target = {} as ILayerBuffer
  const profile = {ink: {}, normalizeDeposit: false} as Parameters<typeof controller.source>[2]
  const {scratch} = controller.source(target, 'a', profile, timestamp)
  const tile = {originX: 0, originY: 0, buffer: {width: 16, height: 16}}
  const entry = {original: {copyTo: vi.fn()}, inkLoad: {}, inkColor: {}, coverage: {}}
  Object.defineProperty(scratch, 'finishContext', {value: {target: {allResident: () => [tile]}}})
  vi.mocked(scratch.peek).mockReturnValue(entry as unknown as ReturnType<typeof scratch.peek>)
  controller.accept(scratch)
  return {controller, target, changed}
}

it('keeps old replay wet before logical expiry and commits it exactly at expiry before erasing', () => {
  const {controller, target, changed} = wetController(1)
  const paint = vi.fn()
  expect(controller.eraseDryBase(target, paint, 120000)).toBe(true)
  expect(paint).toHaveBeenCalledTimes(1)
  expect(controller.has(target)).toBe(true)
  paint.mockClear(); changed.mockClear()
  expect(controller.eraseDryBase(target, paint, 120001)).toBe(false)
  expect(controller.has(target)).toBe(false)
  // Caller now erases the committed dry tile through its normal stamp path.
  expect(paint).not.toHaveBeenCalled()
  expect(changed).toHaveBeenCalledTimes(1)
  controller.destroy()
  vi.unstubAllGlobals()
})

it('pure-water/empty source can close with no rendered goal and leaves other layers alone', () => {
  const {controller, target} = wetController(1)
  const other = {} as ILayerBuffer
  const profile = {ink: {}, normalizeDeposit: false} as Parameters<typeof controller.source>[2]
  controller.source(other, 'water-only', profile, 1)
  expect(controller.closeIfDry(other, 120001)).toBe(true)
  expect(controller.has(other)).toBe(false)
  expect(controller.has(target)).toBe(true)
  expect(controller.closeIfDry(target, NaN)).toBe(false)
  controller.destroy()
  vi.unstubAllGlobals()
})

it('exposes the calculated target without overwriting shown pixels or releasing source water', () => {
  const {controller,target}=wetController(1)
  const canonical=controller.canonicalTiles(target)
  expect(canonical).toHaveLength(1)
  expect(controller.has(target)).toBe(true)
  expect(controller.state.drying).toBe(false)
  expect(controller.state.revisions[0].ready).toBe(true)
  // Reading the target texture does not copy it over the displayed layer.
  expect(canonical[0].buffer.copyTo).not.toHaveBeenCalled()
  expect(controller.canonicalTiles(target)[0].buffer).toBe(canonical[0].buffer)
  controller.destroy();vi.unstubAllGlobals()
})
