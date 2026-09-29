import { describe, expect, it } from 'vitest'
import type { Dab } from '@grafetto/shared'

import { applyMatrix, invertMatrix } from './matrix'
import { Camera, translateDabs, type CanvasRect } from './Camera'

function makeCamera(opts: { width: number; height: number; infinite?: boolean; pageWidth?: number; pageHeight?: number; rect?: CanvasRect }) {
  const canvas = { width: opts.width, height: opts.height }
  let measured = 0
  const rect = opts.rect ?? { left: 0, top: 0, width: opts.width, height: opts.height }
  const camera = new Camera({
    canvas,
    infinite: opts.infinite ?? true,
    pageWidth: opts.pageWidth,
    pageHeight: opts.pageHeight,
    measureRect: () => { measured++; return rect },
  })
  return { camera, canvas, measures: () => measured }
}

describe('Camera', () => {
  it('starts on the canvas centre for an infinite room and on the sheet centre for a bounded one', () => {
    expect(makeCamera({ width: 800, height: 600 }).camera.pose).toEqual({ wx: 400, wy: 300, zoom: 1, angle: 0 })
    expect(makeCamera({ width: 800, height: 600, infinite: false, pageWidth: 2480, pageHeight: 3508 }).camera.pose)
      .toEqual({ wx: 1240, wy: 1754, zoom: 1, angle: 0 })
  })

  it('pads the render buffers to the doubled half-diagonal, with an integer assembly pad', () => {
    const { camera } = makeCamera({ width: 50, height: 50 })
    expect(camera.renderBufferExtent()).toEqual({ w: 71, h: 71 })
    // (71 - 50) / 2 = 10.5 -> 11: the frame centre stays an integer offset from canvas centre.
    expect(camera.assemblyPad()).toEqual({ padX: 11, padY: 11 })
    const frame = camera.liveFrame()
    expect(frame.centerX - 25).toBe(11)
  })

  it('caps the composite scale at 1 and leaves the rest to the final pass', () => {
    const { camera } = makeCamera({ width: 800, height: 600 })
    camera.set(0, 0, 0.5, 0)
    expect([camera.compositeScale(), camera.residualScale()]).toEqual([0.5, 1])
    camera.set(0, 0, 3, 0)
    expect([camera.compositeScale(), camera.residualScale()]).toEqual([1, 3])
  })

  it('maps a pointer onto the world point the screen matrix says is under it', () => {
    const { camera } = makeCamera({ width: 800, height: 600, rect: { left: 20, top: 40, width: 400, height: 300 } })
    camera.set(1234.5, -987.25, 1.7, 0.6)
    const toWorld = camera.pointerTransform()
    // Client (220, 190) is canvas pixel (400, 300) — the canvas is shown at half size.
    const p = toWorld(20 + 123 / 2, 40 + 77 / 2)
    const [wx, wy] = applyMatrix(camera.screenToWorldMatrix(), 123, 77)
    expect(p.x).toBeCloseTo(wx, 9)
    expect(p.y).toBeCloseTo(wy, 9)
    const [sx, sy] = applyMatrix(invertMatrix(camera.screenToWorldMatrix()), p.x, p.y)
    expect(sx).toBeCloseTo(123, 9)
    expect(sy).toBeCloseTo(77, 9)
  })

  it('reads the canvas rect once until invalidated', () => {
    const { camera, measures } = makeCamera({ width: 800, height: 600 })
    const toWorld = camera.pointerTransform()
    toWorld(1, 1); toWorld(2, 2)
    expect(measures()).toBe(1)
    camera.invalidateRect()
    toWorld(3, 3)
    expect(measures()).toBe(2)
  })

  it('takes a bounded pointer back through the caller viewport about the canvas centre', () => {
    const { camera } = makeCamera({ width: 800, height: 600, infinite: false })
    const toCanvas = camera.boundedPointerTransform(500, 400, 2, 0)
    expect(toCanvas(500, 400)).toEqual({ x: 400, y: 300 })
    expect(toCanvas(520, 400)).toEqual({ x: 410, y: 300 })
  })

  it('centres preview buffers on the camera and translates dabs without touching the input', () => {
    const { camera } = makeCamera({ width: 800, height: 600 })
    expect(camera.centeredOrigin()).toEqual({ x: 0, y: 0 })
    camera.set(10_400, 5_300, 1, 0)
    const origin = camera.centeredOrigin()
    expect(origin).toEqual({ x: 10_000, y: 5_000 })
    const dabs: Dab[] = [{ x: 10_010, y: 5_020, pressure: 1, tiltX: 0, tiltY: 0, size: 4, aspectRatio: 1, angle: 0, opacity: 1, t: 0 }]
    const moved = translateDabs(dabs, origin)
    expect([moved[0].x, moved[0].y]).toEqual([10, 20])
    expect(dabs[0].x).toBe(10_010)
    expect(translateDabs(dabs, { x: 0, y: 0 })).toBe(dabs)
  })
})
