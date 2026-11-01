import { afterEach, expect, it, vi } from 'vitest'
import { Camera } from '../../engine/src/raster/Camera'
import type { PencilEngineAPI } from '../../engine'
import { useCanvasViewport, type CanvasViewportInput } from './useCanvasViewport'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as { deps: unknown[]; cleanup?: () => void }[], effects: [] as (() => void)[] }))
vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const i = hooks.cursor++, old = hooks.slots[i]
    if (!old || deps.some((d, j) => !Object.is(d, old.deps[j]))) {
      hooks.slots[i] = { deps }
      hooks.effects.push(() => { old?.cleanup?.(); hooks.slots[i].cleanup = effect() || undefined })
    }
  },
}))
afterEach(() => { for (const s of hooks.slots) s.cleanup?.(); hooks.slots = []; hooks.effects = []; vi.unstubAllGlobals(); vi.useRealTimers() })

it.each([false, true])('reapplies the same camera and backing size to a replacement engine (infinite=%s)', infinite => {
  vi.useFakeTimers()
  const observers: { disconnect: ReturnType<typeof vi.fn> }[] = []
  vi.stubGlobal('ResizeObserver', class {
    disconnect = vi.fn()
    constructor() { observers.push(this) }
    observe() {}
  })
  vi.stubGlobal('window', { devicePixelRatio: 2.125, setInterval, clearInterval })
  const element = { clientWidth: 800, clientHeight: 1100, getBoundingClientRect: () => ({ width: 800, height: 1100 }) } as HTMLDivElement
  const makeEngine = () => {
    const canvas = { width: 300, height: 150 }
    const camera = new Camera({ canvas, infinite, pageWidth: propsPage(), pageHeight: propsPage(), measureRect: () => ({ left: 0, top: 0, width: 800, height: 1100 }) })
    function propsPage() { return infinite ? undefined : 512 }
    return {
      camera,
      setInfiniteCamera: vi.fn((x: number, y: number, zoom: number, angle: number, _cssZoom?: number) => camera.set(x, y, zoom, angle)),
      resizeCanvas: vi.fn((width: number, height: number) => { canvas.width = width; canvas.height = height }),
    }
  }
  const a = makeEngine(), b = makeEngine()
  const props: CanvasViewportInput & { engineEpoch: number } = {
    engineRef: { current: a as unknown as PencilEngineAPI }, engineEpoch: 1,
    vp: { cx: 180, cy: 240, zoom: 1.25, angle: 0.2 }, vpRef: { current: element }, vpEl: element,
    infinite, pageW: infinite ? undefined : 512, pageH: infinite ? undefined : 512,
  }
  const useRender = () => { hooks.cursor = 0; useCanvasViewport(props); for (const run of hooks.effects.splice(0)) run() }
  useRender(); vi.advanceTimersByTime(50)
  const camera = a.setInfiniteCamera.mock.calls[0], backing = a.resizeCanvas.mock.calls[0]
  const originalWorldPoint = a.camera.pointerTransform()(340, 480)
  expect(camera).toHaveLength(5); expect(backing).toHaveLength(2)
  props.engineRef.current = b as unknown as PencilEngineAPI; props.engineEpoch++
  useRender()
  expect(b.setInfiniteCamera.mock.calls).toEqual([camera])
  expect(b.resizeCanvas.mock.calls).toEqual([backing])
  expect(b.camera.pointerTransform()(340, 480)).toEqual(originalWorldPoint)
  expect(observers[0].disconnect).toHaveBeenCalledOnce()
  useRender(); vi.advanceTimersByTime(100)
  expect(b.setInfiniteCamera).toHaveBeenCalledOnce(); expect(b.resizeCanvas).toHaveBeenCalledOnce()
  expect(observers).toHaveLength(2)
})
